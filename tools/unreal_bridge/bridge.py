#!/usr/bin/env python3
"""Pont local Claude Code / GitHub / Unreal Editor.

Aucune clé API n'est nécessaire : le bridge parle uniquement à l'Unreal Editor
installé sur la machine et au serveur Remote Control local.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
UPROJECT = ROOT / "unreal" / "PixelDefense3D.uproject"
REMOTE_HTTP = os.getenv("UE_REMOTE_HTTP", "http://127.0.0.1:30010")

MAC_CANDIDATES = [
    Path("/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"),
    Path("/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor"),
]


def editor_path() -> Path:
    env = os.getenv("UE_EDITOR")
    if env:
        p = Path(env).expanduser()
        if p.exists():
            return p
        raise SystemExit(f"UE_EDITOR pointe vers un fichier introuvable: {p}")

    for p in MAC_CANDIDATES:
        if p.exists():
            return p

    raise SystemExit(
        "UnrealEditor introuvable. Définis UE_EDITOR vers l'exécutable Unreal 5.8."
    )


def repo_path(value: str) -> Path:
    p = (ROOT / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    try:
        p.relative_to(ROOT)
    except ValueError as exc:
        raise SystemExit("Le script doit rester dans le dépôt Pixel Defense") from exc
    if not p.exists():
        raise SystemExit(f"Fichier introuvable: {p}")
    return p


def remote_info() -> int:
    url = f"{REMOTE_HTTP}/remote/info"
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "url": url, "error": str(exc)}, ensure_ascii=False))
        return 2

    routes = body.get("HttpRoutes", [])
    print(json.dumps({"ok": True, "url": url, "routes": len(routes)}, ensure_ascii=False))
    return 0


def run_script(script: str, headless: bool = False) -> int:
    editor = editor_path()
    script_path = repo_path(script)

    if headless:
        cmd = [
            str(editor),
            str(UPROJECT),
            "-run=pythonscript",
            f"-script={script_path}",
            "-unattended",
            "-nop4",
        ]
    else:
        cmd = [
            str(editor),
            str(UPROJECT),
            f"-ExecutePythonScript={script_path}",
            "-unattended",
            "-nop4",
        ]

    print("+", " ".join(str(x) for x in cmd))
    result = subprocess.run(cmd, cwd=ROOT, check=False)
    return result.returncode


def run_job(job_file: str) -> int:
    path = repo_path(job_file)
    job = json.loads(path.read_text(encoding="utf-8"))
    action = job.get("action")

    if action == "run_script":
        return run_script(job["script"], bool(job.get("headless", False)))
    if action == "remote_info":
        return remote_info()

    raise SystemExit(f"Action de job non supportée: {action!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Pixel Defense Unreal AI bridge")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("remote-info", help="teste le serveur Remote Control de l'éditeur")

    run = sub.add_parser("run-script", help="exécute un script Python dans Unreal")
    run.add_argument("script")
    run.add_argument("--headless", action="store_true")

    job = sub.add_parser("run-job", help="exécute un job JSON versionnable dans GitHub")
    job.add_argument("file")

    args = parser.parse_args()
    if args.command == "remote-info":
        return remote_info()
    if args.command == "run-script":
        return run_script(args.script, args.headless)
    if args.command == "run-job":
        return run_job(args.file)
    return 1


if __name__ == "__main__":
    sys.exit(main())
