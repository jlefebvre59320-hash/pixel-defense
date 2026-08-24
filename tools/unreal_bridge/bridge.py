#!/usr/bin/env python3
"""Pont vers l'éditeur Unreal — exécute du Python à l'intérieur d'Unreal Engine.

    python3 tools/unreal_bridge/bridge.py ping
    python3 tools/unreal_bridge/bridge.py run-script unreal/Content/Python/healthcheck.py
    python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/build_test_arena.json
    python3 tools/unreal_bridge/bridge.py run "import unreal; print(unreal.SystemLibrary.get_engine_version())"

Comment ça marche
-----------------
Unreal expose, depuis la 4.23, un service d'« exécution distante » : l'éditeur
écoute un groupe multicast, annonce sa présence, puis ouvre une connexion TCP
vers le client pour recevoir du code Python et renvoyer son résultat. Ce script
parle ce protocole (version 1).

Deux implémentations, dans cet ordre :

1. **celle d'Epic**, `remote_execution.py`, livrée avec le moteur dans
   `Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python/`. Si on la
   trouve, on l'utilise : c'est la référence, elle ne peut pas diverger.
2. **la nôtre**, embarquée plus bas, pour les machines où le moteur n'est pas
   à portée (poste sans Unreal installé, intégration continue).

Avant de s'en servir, côté éditeur
----------------------------------
* Extensions → activer **Python Editor Script Plugin** (et *Editor Scripting
  Utilities* si vous voulez piloter les assets).
* Paramètres du projet → Plugins → Python → cocher **Enable Remote Execution**.
* Laisser l'éditeur ouvert : le pont parle à un éditeur vivant, pas à un
  projet sur disque.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import struct
import sys
import time
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# --- Protocole (version 1) --------------------------------------------------

PROTOCOL_VERSION = 1
PROTOCOL_MAGIC = "ue_py"

TYPE_PING = "ping"
TYPE_PONG = "pong"
TYPE_OPEN_CONNECTION = "open_connection"
TYPE_CLOSE_CONNECTION = "close_connection"
TYPE_COMMAND = "command"
TYPE_COMMAND_RESULT = "command_result"

MODE_EXEC_FILE = "ExecuteFile"
MODE_EXEC_STATEMENT = "ExecuteStatement"
MODE_EVAL_STATEMENT = "EvaluateStatement"

# Valeurs par défaut d'Unreal (Paramètres du projet → Plugins → Python).
DEFAULT_MULTICAST_GROUP = ("239.0.0.1", 6766)
DEFAULT_MULTICAST_BIND = "0.0.0.0"
DEFAULT_MULTICAST_TTL = 0          # 0 = ne sort pas de la machine
DEFAULT_COMMAND_ENDPOINT = ("127.0.0.1", 6776)

_DECODER = json.JSONDecoder()


class BridgeError(RuntimeError):
    """Erreur attendue : on l'affiche proprement, sans pile d'appels."""


# --- Messages ---------------------------------------------------------------


def _message(msg_type: str, source: str, dest: str | None = None, data=None) -> bytes:
    msg = {
        "version": PROTOCOL_VERSION,
        "magic": PROTOCOL_MAGIC,
        "source": source,
        "type": msg_type,
    }
    if dest is not None:
        msg["dest"] = dest
    if data is not None:
        msg["data"] = data
    return json.dumps(msg).encode("utf-8")


def _valid(msg) -> bool:
    return (isinstance(msg, dict)
            and msg.get("magic") == PROTOCOL_MAGIC
            and msg.get("version") == PROTOCOL_VERSION)


def _parse(payload: bytes):
    """Un datagramme = un message complet."""
    try:
        msg = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return msg if _valid(msg) else None


def _parse_stream(buffer: bytes):
    """Extrait le premier message d'un flux TCP.

    Le protocole ne préfixe pas les messages par leur longueur : ils arrivent
    collés ou coupés. On décode donc au fil de l'eau et on rend le reste.
    Renvoie `(message, reste)`, ou `(None, buffer)` si rien de complet.
    """
    try:
        text = buffer.decode("utf-8")
    except UnicodeDecodeError:
        return None, buffer          # un caractère multi-octets est coupé en deux
    text = text.lstrip()
    if not text:
        return None, b""
    try:
        msg, end = _DECODER.raw_decode(text)
    except json.JSONDecodeError:
        return None, buffer
    rest = text[end:].encode("utf-8")
    return (msg if _valid(msg) else None), rest


# --- Session : une connexion, plusieurs commandes ----------------------------


class Session:
    """Connexion ouverte vers un éditeur. Réutilisable d'une commande à l'autre."""

    def __init__(self, bridge: "Bridge", node_id: str, conn: socket.socket):
        self.bridge = bridge
        self.node_id = node_id
        self._conn = conn
        self._buffer = b""

    def run(self, code: str, exec_mode: str = MODE_EXEC_FILE, timeout: float = 60.0) -> dict:
        self._conn.settimeout(timeout)
        self._conn.sendall(_message(TYPE_COMMAND, self.bridge.node_id, self.node_id, {
            "command": code,
            "unattended": True,
            "exec_mode": exec_mode,
        }))

        deadline = time.monotonic() + timeout
        while True:
            msg, self._buffer = _parse_stream(self._buffer)
            if msg and msg.get("type") == TYPE_COMMAND_RESULT:
                return msg.get("data") or {}
            if msg is None and self._buffer and _parse_stream(self._buffer)[0]:
                continue                       # message ignoré, on enchaîne
            if time.monotonic() >= deadline:
                raise BridgeError("l'éditeur n'a pas rendu de compte rendu à temps "
                                  "(%.0f s). Une opération longue ? Augmentez --timeout."
                                  % timeout)
            try:
                chunk = self._conn.recv(65536)
            except socket.timeout:
                raise BridgeError("l'éditeur ne répond plus (délai de %.0f s dépassé)."
                                  % timeout)
            if not chunk:
                raise BridgeError("l'éditeur a fermé la connexion sans rendre de compte.")
            self._buffer += chunk

    def close(self):
        try:
            self._conn.close()
        finally:
            self.bridge._notify_close(self.node_id)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class Bridge:
    """Client d'exécution distante : découverte, puis envoi de commandes."""

    def __init__(self, group=DEFAULT_MULTICAST_GROUP, bind=DEFAULT_MULTICAST_BIND,
                 ttl=DEFAULT_MULTICAST_TTL, command_endpoint=DEFAULT_COMMAND_ENDPOINT):
        self.group = group
        self.bind = bind
        self.ttl = ttl
        self.command_endpoint = command_endpoint
        self.node_id = str(uuid.uuid4())
        self._udp = None

    # -- socket multicast ---------------------------------------------------

    def open(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass  # certains noyaux refusent : sans importance ici
        sock.bind((self.bind, self.group[1]))

        # On s'abonne au groupe et on garde l'écho local : sans IP_MULTICAST_LOOP,
        # un éditeur tournant sur la même machine ne serait jamais découvert.
        mreq = struct.pack("4s4s", socket.inet_aton(self.group[0]), socket.inet_aton(self.bind))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, self.ttl)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        sock.settimeout(0.2)
        self._udp = sock
        return self

    def close(self):
        if self._udp:
            try:
                self._udp.close()
            finally:
                self._udp = None

    def __enter__(self):
        return self.open()

    def __exit__(self, *exc):
        self.close()

    # -- découverte ---------------------------------------------------------

    def discover(self, timeout: float = 2.0) -> list[dict]:
        """Renvoie la liste des éditeurs qui répondent, sans doublon."""
        self._udp.sendto(_message(TYPE_PING, self.node_id), self.group)

        found: dict[str, dict] = {}
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                payload, _addr = self._udp.recvfrom(65535)
            except socket.timeout:
                continue
            msg = _parse(payload)
            if not msg or msg.get("type") != TYPE_PONG:
                continue
            source = msg.get("source")
            if source and source != self.node_id:
                found[source] = msg.get("data") or {}
        return [{"node_id": k, **v} for k, v in found.items()]

    # -- connexion ----------------------------------------------------------

    def connect(self, node_id: str, timeout: float = 30.0) -> Session:
        """Ouvre une session vers un éditeur.

        C'est l'éditeur qui se connecte à nous : on ouvre donc d'abord une
        écoute TCP, puis on lui demande par multicast de venir s'y brancher.
        """
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(self.command_endpoint)
        listener.listen(1)
        listener.settimeout(timeout)
        host, port = listener.getsockname()

        try:
            self._udp.sendto(
                _message(TYPE_OPEN_CONNECTION, self.node_id, node_id,
                         {"command_ip": host, "command_port": port}),
                self.group,
            )
            try:
                conn, _ = listener.accept()
            except socket.timeout:
                raise BridgeError(
                    "l'éditeur a été découvert mais ne s'est pas connecté en retour.\n"
                    "Vérifiez « Enable Remote Execution » dans Paramètres du projet → "
                    "Plugins → Python, et qu'aucun pare-feu ne bloque le port "
                    f"{port} en local."
                )
        finally:
            listener.close()

        return Session(self, node_id, conn)

    def _notify_close(self, node_id: str):
        if self._udp:
            try:
                self._udp.sendto(_message(TYPE_CLOSE_CONNECTION, self.node_id, node_id),
                                 self.group)
            except OSError:
                pass

    def run(self, code: str, node_id: str, exec_mode: str = MODE_EXEC_FILE,
            timeout: float = 30.0) -> dict:
        with self.connect(node_id, timeout) as session:
            return session.run(code, exec_mode, timeout)


# --- Implémentation d'Epic, si le moteur est là ------------------------------


def _engine_remote_execution(engine_dir: str | None):
    """Charge `remote_execution.py` livré avec Unreal, s'il est trouvable.

    Renvoie le module, ou None. On préfère toujours le module d'Epic : c'est la
    définition du protocole, pas une interprétation.
    """
    candidates = []
    if engine_dir:
        candidates.append(Path(engine_dir))
    for var in ("UE_ENGINE_DIR", "UNREAL_ENGINE_DIR", "UE_ROOT"):
        if os.environ.get(var):
            candidates.append(Path(os.environ[var]))

    for root in candidates:
        module = root / "Engine" / "Plugins" / "Experimental" / "PythonScriptPlugin" / "Content" / "Python" / "remote_execution.py"
        if not module.exists():
            module = root / "Plugins" / "Experimental" / "PythonScriptPlugin" / "Content" / "Python" / "remote_execution.py"
        if module.exists():
            sys.path.insert(0, str(module.parent))
            try:
                import remote_execution  # type: ignore
                return remote_execution
            except ImportError:
                continue
    return None


# --- Travaux (« jobs ») ------------------------------------------------------


def load_job(path: Path) -> dict:
    if not path.exists():
        raise BridgeError(f"travail introuvable : {path}")
    try:
        job = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise BridgeError(f"{path} : JSON invalide, {err}")
    if not isinstance(job, dict):
        raise BridgeError(f"{path} : un travail doit être un objet JSON.")

    steps = job.get("steps")
    if not isinstance(steps, list) or not steps:
        raise BridgeError(f"{path} : il faut une liste « steps » non vide.")

    for i, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            raise BridgeError(f"{path} : l'étape {i} doit être un objet JSON.")
        if not (step.get("script") or step.get("code")):
            raise BridgeError(
                f"{path} : l'étape {i} ({step.get('name', 'sans nom')}) n'a ni "
                "« script » ni « code »."
            )
        if step.get("script") and step.get("code"):
            raise BridgeError(
                f"{path} : l'étape {i} a « script » *et* « code » ; choisissez."
            )
    return job


def _resolve(ref: str, job_path: Path) -> Path:
    """Un chemin de script se lit depuis la racine du dépôt, ou depuis le travail."""
    for base in (REPO_ROOT, job_path.parent, Path.cwd()):
        candidate = (base / ref)
        if candidate.exists():
            return candidate
    raise BridgeError(
        f"script introuvable : {ref}\n"
        f"cherché depuis {REPO_ROOT}, {job_path.parent} et {Path.cwd()}."
    )


def step_code(step: dict, job_path: Path) -> tuple[str, str]:
    """Renvoie `(code, mode)` pour une étape, paramètres compris."""
    if step.get("code"):
        mode = MODE_EVAL_STATEMENT if step.get("eval") else MODE_EXEC_STATEMENT
        return step["code"], mode

    source = _resolve(step["script"], job_path).read_text(encoding="utf-8")
    params = step.get("params")
    if params:
        # `repr` et non `json.dumps` : le JSON écrit `true`/`false`/`null`, que
        # Python ne connaît pas. Une seule ligne d'en-tête, pour que les numéros
        # de ligne des traces d'erreur soient décalés de 1, et pas davantage.
        header = "JOB_PARAMS = " + repr(params) + "\n"
        source = header + source
    return source, MODE_EXEC_FILE


# --- Comptes rendus ----------------------------------------------------------


def _print_output(result: dict):
    for line in result.get("output") or []:
        stream = sys.stderr if line.get("type") == "Error" else sys.stdout
        print(line.get("output", "").rstrip(), file=stream)
    value = result.get("result")
    if value not in (None, "", "None"):
        print(value)


def _report(result: dict, as_json: bool) -> int:
    if as_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        _print_output(result)
    return 0 if result.get("success") else 1


# --- Sous-commandes ----------------------------------------------------------


def cmd_ping(args) -> int:
    with Bridge(command_endpoint=(args.host, args.port)) as bridge:
        nodes = bridge.discover(timeout=args.timeout)

    if not nodes:
        print("Aucun éditeur Unreal ne répond.", file=sys.stderr)
        print(
            "\nÀ vérifier, dans l'ordre :\n"
            "  1. l'éditeur est ouvert (le pont parle à un éditeur vivant) ;\n"
            "  2. Extensions → « Python Editor Script Plugin » est activé ;\n"
            "  3. Paramètres du projet → Plugins → Python → « Enable Remote\n"
            "     Execution » est coché ;\n"
            "  4. le pont tourne sur la même machine que l'éditeur (le multicast\n"
            "     par défaut a un TTL de 0 et ne sort pas de la machine).",
            file=sys.stderr,
        )
        return 2

    if args.json:
        print(json.dumps(nodes, indent=2, ensure_ascii=False))
        return 0

    for node in nodes:
        print(f"{node.get('node_id')}  {node.get('project_name', '?')}  "
              f"{node.get('engine_version', 'version inconnue')}  "
              f"({node.get('user', '?')}@{node.get('machine', '?')})")
    return 0


def _pick_node(bridge: Bridge, wanted: str | None, timeout: float) -> str:
    nodes = bridge.discover(timeout=timeout)
    if not nodes:
        raise BridgeError(
            "aucun éditeur Unreal ne répond. Lancez « bridge.py ping » pour le détail."
        )
    if wanted:
        for node in nodes:
            if node["node_id"] == wanted:
                return wanted
        raise BridgeError(f"aucun éditeur ne porte l'identifiant {wanted}.")
    if len(nodes) > 1:
        names = ", ".join(f"{n['node_id']} ({n.get('project_name', '?')})" for n in nodes)
        raise BridgeError(
            f"plusieurs éditeurs répondent : {names}.\n"
            "Choisissez-en un avec --node."
        )
    return nodes[0]["node_id"]


def cmd_run_script(args) -> int:
    path = Path(args.script)
    if not path.exists():
        path = _resolve(args.script, REPO_ROOT)
    code = path.read_text(encoding="utf-8")

    engine = _engine_remote_execution(args.engine_dir)
    if engine:
        # Chemin royal : le module d'Epic, tel qu'il est livré avec le moteur.
        conn = engine.RemoteExecution()
        conn.start()
        try:
            deadline = time.monotonic() + args.timeout
            while not conn.remote_nodes and time.monotonic() < deadline:
                time.sleep(0.1)
            if not conn.remote_nodes:
                raise BridgeError("aucun éditeur Unreal ne répond (module d'Epic).")
            conn.open_command_connection(conn.remote_nodes[0])
            result = conn.run_command(code, unattended=True, exec_mode=engine.MODE_EXEC_FILE)
            return _report(result, args.json)
        finally:
            conn.stop()

    with Bridge(command_endpoint=(args.host, args.port)) as bridge:
        node = _pick_node(bridge, args.node, args.discover_timeout)
        result = bridge.run(code, node, MODE_EXEC_FILE, args.timeout)
    return _report(result, args.json)


def cmd_run(args) -> int:
    with Bridge(command_endpoint=(args.host, args.port)) as bridge:
        node = _pick_node(bridge, args.node, args.discover_timeout)
        mode = MODE_EVAL_STATEMENT if args.eval else MODE_EXEC_STATEMENT
        result = bridge.run(args.code, node, mode, args.timeout)
    return _report(result, args.json)


def cmd_run_job(args) -> int:
    job_path = Path(args.job)
    if not job_path.exists():
        job_path = _resolve(args.job, REPO_ROOT)
    job = load_job(job_path)
    steps = job["steps"]

    # On prépare tout le code *avant* d'ouvrir la session : un chemin de script
    # erroné doit se voir tout de suite, pas au milieu d'un travail commencé.
    prepared = [(step, *step_code(step, job_path)) for step in steps]

    if not args.json:
        print("== %s ==" % job.get("name", job_path.stem))
        if job.get("description"):
            print(job["description"])
        print("")

    results = []
    failed = 0
    with Bridge(command_endpoint=(args.host, args.port)) as bridge:
        node = _pick_node(bridge, args.node, args.discover_timeout)
        with bridge.connect(node, args.timeout) as session:
            for i, (step, code, mode) in enumerate(prepared, 1):
                label = step.get("name") or step.get("script") or "étape %d" % i
                if not args.json:
                    print("[%d/%d] %s" % (i, len(prepared), label))

                started = time.monotonic()
                result = session.run(code, mode, step.get("timeout", args.timeout))
                elapsed = time.monotonic() - started
                ok = bool(result.get("success"))

                results.append({"step": label, "success": ok,
                                "seconds": round(elapsed, 2), "result": result})
                if not args.json:
                    _print_output(result)
                    print("    → %s (%.1f s)" % ("terminé" if ok else "ÉCHEC", elapsed))
                    print("")

                if not ok:
                    failed += 1
                    if not step.get("continue_on_error"):
                        if not args.json:
                            print("Travail interrompu à l'étape %d." % i, file=sys.stderr)
                        break

    if args.json:
        print(json.dumps({"job": job.get("name", job_path.stem),
                          "steps": results, "failed": failed},
                         indent=2, ensure_ascii=False))
    else:
        done = len(results)
        print("%d étape(s) exécutée(s) sur %d, %d en échec."
              % (done, len(prepared), failed))
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bridge.py",
        description="Exécute du Python dans un éditeur Unreal ouvert.",
    )
    parser.add_argument("--host", default=DEFAULT_COMMAND_ENDPOINT[0],
                        help="adresse d'écoute pour la connexion retour (défaut : 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_COMMAND_ENDPOINT[1],
                        help="port d'écoute pour la connexion retour (défaut : 6776)")
    parser.add_argument("--node", help="identifiant de l'éditeur visé, si plusieurs répondent")
    parser.add_argument("--discover-timeout", type=float, default=2.0,
                        help="durée d'attente des réponses, en secondes")
    parser.add_argument("--engine-dir", help="racine d'Unreal, pour utiliser le module d'Epic")
    parser.add_argument("--json", action="store_true", help="compte rendu brut, en JSON")

    sub = parser.add_subparsers(dest="command", required=True)

    ping = sub.add_parser("ping", help="liste les éditeurs qui répondent")
    ping.add_argument("--timeout", type=float, default=2.0)
    ping.set_defaults(func=cmd_ping)

    run_script = sub.add_parser("run-script", help="exécute un fichier Python dans l'éditeur")
    run_script.add_argument("script")
    run_script.add_argument("--timeout", type=float, default=60.0)
    run_script.set_defaults(func=cmd_run_script)

    run_job = sub.add_parser("run-job", help="enchaîne les étapes décrites dans un fichier JSON")
    run_job.add_argument("job")
    run_job.add_argument("--timeout", type=float, default=180.0,
                         help="délai par étape, si l'étape n'en fixe pas (défaut : 180 s)")
    run_job.set_defaults(func=cmd_run_job)

    run = sub.add_parser("run", help="exécute une instruction Python dans l'éditeur")
    run.add_argument("code")
    run.add_argument("--eval", action="store_true", help="évalue une expression et renvoie sa valeur")
    run.add_argument("--timeout", type=float, default=60.0)
    run.set_defaults(func=cmd_run)

    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except BridgeError as err:
        print(f"bridge : {err}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
