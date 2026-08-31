#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOWNLOADS_DIR="${PD_DOWNLOADS_DIR:-$HOME/Downloads}"
DEST_ROOT="$REPO_ROOT/unreal/ExternalAssets/Quaternius"

mkdir -p "$DEST_ROOT"

echo "Packs Quaternius sélectionnés pour Pixel Defense:"
echo "  1. Stylized Nature MegaKit Standard — 116 modèles — CC0"
echo "  2. Medieval Village MegaKit Standard — 300+ pièces — CC0"
echo
echo "Les pages officielles vont s'ouvrir."
echo "Pour chaque page: Download Now > No thanks, just take me to the downloads"
echo "Puis télécharge uniquement le fichier [Standard].zip gratuit."
echo

open "https://quaternius.itch.io/stylized-nature-megakit/purchase"
open "https://quaternius.itch.io/medieval-village-megakit/purchase"

read -r -p "Quand les deux ZIP sont dans Téléchargements, appuie sur Entrée..."

find_zip() {
  local pattern="$1"
  find "$DOWNLOADS_DIR" -maxdepth 1 -type f -iname "$pattern" -print -quit
}

install_pack() {
  local label="$1"
  local pattern="$2"
  local folder="$3"
  local archive
  archive="$(find_zip "$pattern")"
  if [ -z "$archive" ]; then
    echo "Archive introuvable pour: $label"
    echo "Dossier vérifié: $DOWNLOADS_DIR"
    exit 1
  fi
  local target="$DEST_ROOT/$folder"
  if [ -d "$target" ]; then
    echo "Déjà installé: $folder"
    return
  fi
  local staging
  staging="$(mktemp -d)"
  ditto -x -k "$archive" "$staging"
  mkdir -p "$target"
  ditto "$staging" "$target"
  echo "Installé: $label"
}

install_pack "Stylized Nature MegaKit" "*Stylized Nature MegaKit*Standard*.zip" "StylizedNatureMegaKit"
install_pack "Medieval Village MegaKit" "*Medieval Village MegaKit*Standard*.zip" "MedievalVillageMegaKit"

printf '%s\n' \
  "Quaternius Stylized Nature MegaKit — CC0" \
  "https://quaternius.itch.io/stylized-nature-megakit" \
  "Quaternius Medieval Village MegaKit — CC0" \
  "https://quaternius.itch.io/medieval-village-megakit" \
  > "$DEST_ROOT/LICENSES_AND_SOURCES.txt"

echo
echo "Packs prêts dans: $DEST_ROOT"
echo "Relance maintenant: bash tools/unreal/ultimate_setup_macos.sh"
