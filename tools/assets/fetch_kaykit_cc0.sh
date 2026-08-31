#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST_ROOT="$REPO_ROOT/unreal/ExternalAssets/KayKit"
LOCAL_BIN="${HOME}/.local/bin"

if ! command -v git >/dev/null 2>&1; then
  echo "Erreur: git est requis."
  exit 1
fi

export PATH="$LOCAL_BIN:$PATH"
if ! git lfs version >/dev/null 2>&1; then
  echo "Git LFS absent: installation locale automatique (sans Homebrew)..."
  bash "$SCRIPT_DIR/install_git_lfs_macos.sh"
  export PATH="$LOCAL_BIN:$PATH"
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

sync_pack "MedievalHexagon" "https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0.git"
sync_pack "Adventurers" "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0.git"
sync_pack "Skeletons" "https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0.git"
sync_pack "DungeonRemastered" "https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0.git"

echo
echo "Textures et ciel Poly Haven CC0 (1K mobile)..."
python3 "$SCRIPT_DIR/fetch_polyhaven_cc0.py"

echo
echo "Interface fantasy Kenney CC0..."
bash "$SCRIPT_DIR/fetch_kenney_ui_cc0.sh"

echo
echo "Packs prêts dans: $DEST_ROOT"
