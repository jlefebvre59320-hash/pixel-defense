#!/usr/bin/env python3
"""Exécute un travail en *lançant* l'éditeur, au lieu d'en piloter un ouvert.

    python3 tools/unreal_bridge/run_local.py tools/unreal_bridge/jobs/export_sprites.json

Le pont (`bridge.py`) parle à un éditeur **déjà ouvert**. C'est pratique quand
on travaille dedans, et inutilisable quand l'éditeur est fermé — ce qui est le
cas juste après un `ultimate_setup_macos.sh`, qui compile puis quitte.

Ce lanceur-ci prend le même fichier de travail, prépare le même code — même
lecture, mêmes paramètres, même en-tête `JOB_PARAMS` — et le donne à
`UnrealEditor-Cmd -ExecutePythonScript`, comme le reste des scripts du projet.
Un seul format de travail, deux façons de le faire tourner :

    éditeur ouvert   → bridge.py run-job …
    éditeur fermé    → run_local.py …

Variables d'environnement, mêmes conventions que tools/unreal/*.sh :
    UE_ENGINE_ROOT   racine du moteur (défaut : la plus récente trouvée)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bridge import (BridgeError, REPO_ROOT, engine_roots, load_job,   # noqa: E402
                    step_code, MODE_EXEC_FILE)


def find_editor(engine_root: str | None) -> Path:
    """Le binaire `UnrealEditor-Cmd`, en suivant les conventions du projet."""
    roots = []
    if engine_root:
        roots.append(Path(engine_root).expanduser())
    if os.environ.get("UE_ENGINE_ROOT"):
        roots.append(Path(os.environ["UE_ENGINE_ROOT"]).expanduser())
    roots.extend(engine_roots(None))

    tried = []
    for root in roots:
        for rel in ("Engine/Binaries/Mac/UnrealEditor-Cmd",
                    "Engine/Binaries/Linux/UnrealEditor-Cmd",
                    "Engine/Binaries/Win64/UnrealEditor-Cmd.exe"):
            candidate = root / rel
            tried.append(str(candidate))
            if candidate.exists():
                return candidate

    raise BridgeError(
        "UnrealEditor-Cmd introuvable.\n"
        "Essayé :\n  " + "\n  ".join(tried[:6]) + "\n"
        "Indiquez la racine : UE_ENGINE_ROOT='/Users/Shared/Epic Games/UE_5.8' "
        "python3 tools/unreal_bridge/run_local.py …"
    )


def find_project(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.exists():
            raise BridgeError(f"projet introuvable : {path}")
        return path
    found = sorted((REPO_ROOT / "unreal").glob("*.uproject"))
    if not found:
        raise BridgeError(f"aucun .uproject sous {REPO_ROOT / 'unreal'}")
    if len(found) > 1:
        raise BridgeError("plusieurs projets : " + ", ".join(p.name for p in found)
                          + "\nChoisissez avec --project.")
    return found[0]


def run_step(editor: Path, project: Path, code: str, label: str,
             timeout: float, dry_run: bool) -> int:
    """Écrit le code dans un fichier temporaire et le fait exécuter par l'éditeur.

    Pas de `-nullrhi` : la capture de sprites a besoin d'un vrai rendu, et un
    moteur sans RHI rendrait des images vides sans le dire.
    """
    tmp = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False,
                                      encoding="utf-8", prefix="pd_job_")
    tmp.write(code)
    tmp.close()

    cmd = [
        str(editor), str(project),
        "-ExecutePythonScript=" + tmp.name,
        "-unattended", "-nosplash", "-nopause", "-stdout", "-FullStdOutLogOutput",
    ]

    if dry_run:
        print("  commande : " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
        print("  script   : " + tmp.name + " (%d lignes)" % code.count("\n"))
        return 0

    try:
        proc = subprocess.run(cmd, timeout=timeout)
        return proc.returncode
    except subprocess.TimeoutExpired:
        print(f"  {label} : dépassement du délai ({timeout:.0f} s).", file=sys.stderr)
        return 124
    finally:
        if not dry_run:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="run_local.py",
        description="Exécute un travail en lançant l'éditeur Unreal, sans pont.")
    parser.add_argument("job")
    parser.add_argument("--engine-root", help="racine d'Unreal (défaut : UE_ENGINE_ROOT, puis la plus récente trouvée)")
    parser.add_argument("--project", help="chemin du .uproject (défaut : unreal/*.uproject)")
    parser.add_argument("--timeout", type=float, default=1800.0,
                        help="délai par étape, en secondes")
    parser.add_argument("--dry-run", action="store_true",
                        help="montrer ce qui serait lancé, sans rien lancer")

    args = parser.parse_args(argv)

    try:
        job_path = Path(args.job)
        if not job_path.exists():
            job_path = REPO_ROOT / args.job
        job = load_job(job_path)
        project = find_project(args.project)
        try:
            editor = find_editor(args.engine_root)
        except BridgeError:
            # En répétition, on veut voir la commande même sans moteur sous la
            # main : c'est justement là qu'on relit les arguments.
            if not args.dry_run:
                raise
            editor = Path("<UnrealEditor-Cmd introuvable ici>")

        # Tout est préparé avant de lancer quoi que ce soit : un chemin de
        # script erroné doit se voir tout de suite, pas au milieu d'un travail.
        prepared = [(step, *step_code(step, job_path)) for step in job["steps"]]
    except BridgeError as err:
        print(f"run_local : {err}", file=sys.stderr)
        return 2

    print("== %s ==" % job.get("name", job_path.stem))
    if job.get("description"):
        print(job["description"])
    print("Moteur  : %s" % editor)
    print("Projet  : %s" % project)
    print("")

    failed = 0
    for i, (step, code, mode) in enumerate(prepared, 1):
        label = step.get("name") or step.get("script") or "étape %d" % i
        print("[%d/%d] %s" % (i, len(prepared), label))

        if mode != MODE_EXEC_FILE:
            # `-ExecutePythonScript` ne sait exécuter qu'un fichier ; une étape
            # « code » en ligne est enveloppée pour retomber sur le même chemin.
            code = code if code.endswith("\n") else code + "\n"

        rc = run_step(editor, project, code, label,
                      step.get("timeout", args.timeout), args.dry_run)
        ok = rc == 0
        print("    → %s%s" % ("terminé" if ok else "ÉCHEC",
                              "" if ok else " (code %d)" % rc))
        print("")
        if not ok:
            failed += 1
            if not step.get("continue_on_error"):
                print("Travail interrompu à l'étape %d." % i, file=sys.stderr)
                break

    print("%d étape(s) en échec." % failed if failed else "Toutes les étapes ont abouti.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
