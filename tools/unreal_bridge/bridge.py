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

    def discover(self, timeout: float = 2.0, trace: list | None = None) -> list[dict]:
        """Renvoie la liste des éditeurs qui répondent, sans doublon.

        `trace`, s'il est fourni, reçoit tout ce qui passe sur le groupe — y
        compris nos propres messages. Voir notre ping revenir prouve que la
        boucle multicast fonctionne ; ne pas le voir désigne le coupable
        (pare-feu, autorisation « réseau local » sur macOS).
        """
        self._udp.sendto(_message(TYPE_PING, self.node_id), self.group)
        if trace is not None:
            trace.append(("envoyé", "%s:%d" % self.group, TYPE_PING, self.node_id, True))

        found: dict[str, dict] = {}
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                payload, addr = self._udp.recvfrom(65535)
            except socket.timeout:
                continue
            msg = _parse(payload)
            if trace is not None:
                source = (msg or {}).get("source", "?")
                trace.append(("reçu", "%s:%d" % addr,
                              msg.get("type") if msg else "<hors protocole>",
                              source, source == self.node_id))
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


# Là où Epic installe le moteur, par système. Le Mac d'abord : c'est le poste
# depuis lequel ce pont est utilisé.
ENGINE_ROOT_GLOBS = {
    "darwin": [
        "/Users/Shared/Epic Games/UE_*",
        "/Applications/Epic Games/UE_*",
        "~/Epic Games/UE_*",
        "~/UnrealEngine",
    ],
    "win32": [
        "C:/Program Files/Epic Games/UE_*",
        "D:/Epic Games/UE_*",
    ],
    "linux": [
        "/opt/UnrealEngine",
        "/opt/unreal-engine",
        "~/UnrealEngine",
    ],
}

# Le greffon Python a déménagé d'une version à l'autre : on essaie les endroits
# connus, puis on balaie `Engine/Plugins` sur deux niveaux. Pas de balayage
# récursif complet : une installation d'Unreal, c'est des centaines de milliers
# de fichiers.
_MODULE_PATHS = [
    "Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python/remote_execution.py",
    "Engine/Plugins/PythonScriptPlugin/Content/Python/remote_execution.py",
    "Plugins/Experimental/PythonScriptPlugin/Content/Python/remote_execution.py",
]
_MODULE_GLOBS = [
    "Engine/Plugins/*/PythonScriptPlugin/Content/Python/remote_execution.py",
    "Engine/Plugins/*/*/PythonScriptPlugin/Content/Python/remote_execution.py",
]


def engine_roots(engine_dir: str | None) -> list[Path]:
    """Racines d'Unreal à essayer, de la plus explicite à la plus devinée."""
    roots: list[Path] = []

    def add(path: Path):
        if path not in roots:
            roots.append(path)

    if engine_dir:
        add(Path(engine_dir).expanduser())
    for var in ("UE_ENGINE_DIR", "UNREAL_ENGINE_DIR", "UE_ROOT"):
        if os.environ.get(var):
            add(Path(os.environ[var]).expanduser())

    # Une racine désignée à la main fait autorité, même si elle est fausse :
    # retomber en douce sur un autre moteur ferait exécuter le script ailleurs
    # que là où on l'a demandé.
    if roots:
        return roots

    patterns = ENGINE_ROOT_GLOBS.get(sys.platform)
    if patterns is None:
        patterns = ENGINE_ROOT_GLOBS["linux"]
    found = []
    for pattern in patterns:
        expanded = os.path.expanduser(pattern)
        base, _, tail = expanded.partition("*")
        if tail or "*" in expanded:
            parent = Path(base).parent
            try:
                found.extend(parent.glob(Path(expanded).name))
            except OSError:
                pass
        elif Path(expanded).exists():
            found.append(Path(expanded))
    # UE_5.4 avant UE_5.1 : la version la plus récente d'abord.
    for path in sorted(set(found), reverse=True):
        add(path)
    return roots


def find_engine_module(engine_dir: str | None) -> Path | None:
    """Chemin de `remote_execution.py` livré par Epic, s'il est trouvable."""
    for root in engine_roots(engine_dir):
        if not root.exists():
            continue
        for rel in _MODULE_PATHS:
            module = root / rel
            if module.exists():
                return module
        for pattern in _MODULE_GLOBS:
            try:
                for module in sorted(root.glob(pattern)):
                    return module
            except OSError:
                continue
    return None


def _engine_remote_execution(engine_dir: str | None):
    """Charge `remote_execution.py` livré avec Unreal, s'il est trouvable.

    Renvoie le module, ou None. On préfère toujours le module d'Epic : c'est la
    définition du protocole, pas une interprétation.
    """
    module = find_engine_module(engine_dir)
    if module is None:
        return None
    sys.path.insert(0, str(module.parent))
    try:
        import remote_execution  # type: ignore
        return remote_execution
    except ImportError:
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


def _local_addresses() -> list[str]:
    """Adresses IPv4 de la machine, pour le compte rendu détaillé."""
    addresses = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 9))       # adresse de documentation : rien n'est envoyé
        addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()
    return sorted(addresses)


def _diagnose(args, trace: list) -> None:
    """Ce que le pont a vu — à lire quand rien ne répond."""
    print("", file=sys.stderr)
    print("--- diagnostic ---", file=sys.stderr)
    print("système           : %s (python %s)"
          % (sys.platform, sys.version.split()[0]), file=sys.stderr)
    print("groupe multicast  : %s:%d (TTL %d, écoute sur %s)"
          % (args.group_host, args.group_port, args.ttl, args.bind), file=sys.stderr)
    print("retour attendu    : %s:%d" % (args.host, args.port), file=sys.stderr)
    print("adresses locales  : %s" % ", ".join(_local_addresses()), file=sys.stderr)

    module = find_engine_module(args.engine_dir)
    if module:
        print("moteur trouvé     : %s" % module, file=sys.stderr)
    elif args.engine_dir:
        print("moteur trouvé     : non — %s ne contient pas remote_execution.py ;\n"
              "                    implémentation embarquée" % args.engine_dir,
              file=sys.stderr)
    else:
        print("moteur trouvé     : non — implémentation embarquée", file=sys.stderr)
    roots = engine_roots(args.engine_dir)
    if roots:
        print("racines essayées  : %s" % ", ".join(str(r) for r in roots), file=sys.stderr)

    print("", file=sys.stderr)
    if not trace:
        print("Aucun paquet, pas même le nôtre.", file=sys.stderr)
    for kind, addr, msg_type, source, mine in trace:
        print("  %-7s %-22s %-16s %s%s"
              % (kind, addr, msg_type, source, " (nous)" if mine else ""),
              file=sys.stderr)

    echo = any(kind == "reçu" and mine for kind, _, _, _, mine in trace)
    print("", file=sys.stderr)
    if echo:
        print("La boucle multicast fonctionne : notre propre ping nous revient.\n"
              "Le multicast n'est donc pas en cause — c'est l'éditeur qui ne répond pas.",
              file=sys.stderr)
    else:
        print("Notre propre ping ne nous revient pas : le multicast est bloqué\n"
              "avant même de sortir. Sur macOS, c'est presque toujours\n"
              "l'autorisation « Réseau local » — voir plus haut.", file=sys.stderr)


def cmd_ping(args) -> int:
    trace: list = []
    with Bridge(group=(args.group_host, args.group_port), bind=args.bind, ttl=args.ttl,
                command_endpoint=(args.host, args.port)) as bridge:
        nodes = bridge.discover(timeout=args.timeout, trace=trace)

    if nodes and args.verbose:
        _diagnose(args, trace)

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
        if sys.platform == "darwin":
            print(
                "\nSur macOS, un cinquième point, et c'est le plus fréquent :\n"
                "  5. le terminal doit avoir l'autorisation « Réseau local ».\n"
                "     Réglages Système → Confidentialité et sécurité → Réseau local\n"
                "     → activez Terminal (ou iTerm, ou votre éditeur de code).\n"
                "     Sans elle, macOS jette les paquets multicast sans rien dire.\n"
                "     L'autorisation est demandée à la première tentative : si vous\n"
                "     avez répondu « Refuser », il faut la rétablir à la main.",
                file=sys.stderr,
            )
        if args.verbose:
            _diagnose(args, trace)
        else:
            print("\nPour voir ce que le pont a réellement reçu : ajoutez --verbose.",
                  file=sys.stderr)
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

    with Bridge(group=(args.group_host, args.group_port), bind=args.bind,
                ttl=args.ttl, command_endpoint=(args.host, args.port)) as bridge:
        node = _pick_node(bridge, args.node, args.discover_timeout)
        result = bridge.run(code, node, MODE_EXEC_FILE, args.timeout)
    return _report(result, args.json)


def cmd_run(args) -> int:
    with Bridge(group=(args.group_host, args.group_port), bind=args.bind,
                ttl=args.ttl, command_endpoint=(args.host, args.port)) as bridge:
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
    with Bridge(group=(args.group_host, args.group_port), bind=args.bind,
                ttl=args.ttl, command_endpoint=(args.host, args.port)) as bridge:
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
    parser.add_argument("--group-host", default=DEFAULT_MULTICAST_GROUP[0],
                        help="groupe multicast d'Unreal (défaut : 239.0.0.1)")
    parser.add_argument("--group-port", type=int, default=DEFAULT_MULTICAST_GROUP[1],
                        help="port multicast d'Unreal (défaut : 6766)")
    parser.add_argument("--bind", default=DEFAULT_MULTICAST_BIND,
                        help="interface d'écoute du multicast (défaut : 0.0.0.0)")
    parser.add_argument("--ttl", type=int, default=DEFAULT_MULTICAST_TTL,
                        help="TTL multicast ; 0 = ne sort pas de la machine")
    parser.add_argument("--verbose", action="store_true",
                        help="détaille ce que le pont envoie et reçoit")
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
