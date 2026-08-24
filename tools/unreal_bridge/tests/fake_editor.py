"""Faux éditeur Unreal — parle le protocole d'exécution distante, en local.

    python3 tools/unreal_bridge/tests/fake_editor.py        # puis, ailleurs :
    python3 tools/unreal_bridge/bridge.py ping

À quoi ça sert : Unreal ne s'installe pas dans cet environnement, ni dans une
intégration continue. Sans ce doublon, le pont ne serait jamais exécuté avant
d'arriver chez quelqu'un — on livrerait du code jamais lancé.

Il implémente le protocole côté éditeur : annonce par multicast, connexion TCP
en retour, exécution du code reçu, compte rendu. Le code s'exécute pour de
vrai, avec `fake_unreal` en guise de module `unreal`.

Limite à garder en tête : il valide *notre* moitié du dialogue. Que le vrai
éditeur d'Epic réponde exactement pareil reste à vérifier sur une machine avec
Unreal.
"""

from __future__ import annotations

import io
import json
import socket
import struct
import sys
import threading
import traceback
import uuid
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bridge as B          # noqa: E402  — protocole partagé, une seule définition
import fake_unreal          # noqa: E402


class FakeEditor:
    def __init__(self, group=B.DEFAULT_MULTICAST_GROUP, bind=B.DEFAULT_MULTICAST_BIND,
                 project_name="PixelDefense"):
        self.group = group
        self.bind = bind
        self.node_id = str(uuid.uuid4())
        self.project_name = project_name
        self.commands = []          # tout ce qui a été exécuté, pour les tests
        self._udp = None
        self._thread = None
        self._stop = threading.Event()
        self._conn_threads = []

    # -- cycle de vie -------------------------------------------------------

    def start(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        sock.bind((self.bind, self.group[1]))
        mreq = struct.pack("4s4s", socket.inet_aton(self.group[0]), socket.inet_aton(self.bind))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 0)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        sock.settimeout(0.2)
        self._udp = sock

        self._thread = threading.Thread(target=self._listen, daemon=True)
        self._thread.start()
        return self

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        for t in self._conn_threads:
            t.join(timeout=2.0)
        if self._udp:
            self._udp.close()
            self._udp = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()

    # -- multicast ----------------------------------------------------------

    def _listen(self):
        while not self._stop.is_set():
            try:
                payload, _addr = self._udp.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError:
                break
            msg = B._parse(payload)
            if not msg or msg.get("source") == self.node_id:
                continue                     # notre propre écho multicast
            dest = msg.get("dest")
            if dest is not None and dest != self.node_id:
                continue                     # adressé à un autre éditeur

            kind = msg.get("type")
            if kind == B.TYPE_PING:
                self._pong()
            elif kind == B.TYPE_OPEN_CONNECTION:
                self._open(msg)
            # close_connection : la fermeture vient du client, rien à faire.

    def _pong(self):
        self._udp.sendto(B._message(B.TYPE_PONG, self.node_id, None, {
            "engine_version": fake_unreal.SystemLibrary.get_engine_version(),
            "engine_root": fake_unreal.Paths.engine_dir(),
            "machine": "poste-de-test",
            "project_name": self.project_name,
            "project_root": fake_unreal.Paths.project_dir(),
            "user": "test",
        }), self.group)

    def _open(self, msg):
        data = msg.get("data") or {}
        host = data.get("command_ip")
        port = data.get("command_port")
        if not host or not port:
            return
        client = msg.get("source")
        thread = threading.Thread(target=self._serve, args=(host, port, client), daemon=True)
        self._conn_threads.append(thread)
        thread.start()

    # -- connexion TCP ------------------------------------------------------

    def _serve(self, host, port, client):
        try:
            conn = socket.create_connection((host, port), timeout=5.0)
        except OSError:
            return
        buffer = b""
        with conn:
            conn.settimeout(0.5)
            while not self._stop.is_set():
                msg, buffer = B._parse_stream(buffer)
                if msg is not None:
                    if msg.get("type") == B.TYPE_COMMAND:
                        result = self.execute(msg.get("data") or {})
                        conn.sendall(B._message(B.TYPE_COMMAND_RESULT, self.node_id,
                                                client, result))
                    continue
                try:
                    chunk = conn.recv(65536)
                except socket.timeout:
                    continue
                except OSError:
                    break
                if not chunk:
                    break
                buffer += chunk

    # -- exécution ----------------------------------------------------------

    def execute(self, data: dict) -> dict:
        """Exécute le code reçu et rend le compte rendu, au format d'Epic."""
        code = data.get("command", "")
        mode = data.get("exec_mode", B.MODE_EXEC_FILE)
        self.commands.append((mode, code))

        sys.modules["unreal"] = fake_unreal
        scope = {"__name__": "__main__", "__builtins__": __builtins__}
        out, err = io.StringIO(), io.StringIO()
        value = None
        success = True

        try:
            with redirect_stdout(out), redirect_stderr(err):
                if mode == B.MODE_EVAL_STATEMENT:
                    value = eval(compile(code, "<string>", "eval"), scope)
                else:
                    exec(compile(code, "<string>", "exec"), scope)
        except BaseException:
            success = False
            err.write(traceback.format_exc())

        output = []
        for line in out.getvalue().splitlines():
            output.append({"type": "Info", "output": line})
        for line in err.getvalue().splitlines():
            output.append({"type": "Error", "output": line})

        return {
            "success": success,
            "command": code,
            "result": repr(value) if value is not None else "None",
            "output": output,
        }


def main():
    editor = FakeEditor().start()
    print("Faux éditeur en écoute (identifiant %s)." % editor.node_id)
    print("Essayez : python3 tools/unreal_bridge/bridge.py ping")
    print("Ctrl-C pour arrêter.")
    try:
        while True:
            editor._thread.join(timeout=1.0)
    except KeyboardInterrupt:
        pass
    finally:
        editor.stop()


if __name__ == "__main__":
    main()
