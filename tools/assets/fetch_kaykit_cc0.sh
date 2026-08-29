#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST_ROOT="$REPO_ROOT/unreal/ExternalAssets/KayKit"

if ! command -v git >/dev/null 2>&1; then
  echo "Erreur: git est requis."
  exit 1
fi
if ! git lfs version >/dev/null 2>&1; then
  echo "Erreur: Git LFS est requis pour les modèles KayKit."
  echo "Sur macOS: brew install git-lfs && git lfs install"
  exit 1
fi

mkdir -p "$DEST_ROOT"
git lfs install --local >/dev/null 2>&1 || git lfs install >/dev/null

sync_pack() {
  local folder="$1"
  local url="$2"
  local target="$DEST_ROOT/$folder"

  if [ -d "$target/.git" ]; then
    echo "Mise à jour: $folder"
    git -C "$target" fetch --depth=1 origin main
    git -C "$target" checkout main
    git -C "$target" pull --ff-only origin main
  elif [ -e "$target" ]; then
    echo "Erreur: $target existe mais n'est pas un dépôt Git."
    echo "Déplace ce dossier, puis relance le script."
    exit 1
  else
    echo "Téléchargement: $folder"
    git clone --depth=1 "$url" "$target"
  fi

  git -C "$target" lfs pull
}

sync_pack "MedievalHexagon"   "https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0.git"
sync_pack "Adventurers"   "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0.git"
sync_pack "Skeletons"   "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0.git"

echo
echo "Packs prêts dans: $DEST_ROOT"
echo "Étape suivante:"
echo "python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/import_kaykit_cc0_10.json"
