#!/usr/bin/env bash
# Faux binaire `UnrealEditor-Cmd`, pour vérifier run_local.py.
#
# Il fait la seule chose qui compte ici : lire l'argument
# `-ExecutePythonScript=`, et exécuter ce fichier avec le doublon `unreal` en
# place de la vraie API. Cela vérifie le lanceur de bout en bout — arguments,
# code de sortie, arrêt sur échec — sans moteur.
#
# La variable FAKE_UNREAL_DIR doit pointer sur ce dossier.
set -euo pipefail

SCRIPT=""
for arg in "$@"; do
  case "$arg" in
    -ExecutePythonScript=*) SCRIPT="${arg#-ExecutePythonScript=}" ;;
  esac
done

if [ -z "$SCRIPT" ]; then
  echo "faux éditeur : aucun -ExecutePythonScript= dans la ligne de commande" >&2
  exit 3
fi

exec python3 -c "
import sys, os
sys.path.insert(0, os.environ['FAKE_UNREAL_DIR'])
import fake_unreal
sys.modules['unreal'] = fake_unreal
path = sys.argv[1]
with open(path, encoding='utf-8') as fh:
    source = fh.read()
exec(compile(source, path, 'exec'), {'__name__': '__main__'})
" "$SCRIPT"
