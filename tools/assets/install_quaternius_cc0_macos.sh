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
echo "Puis télécharge le ZIP Standard gratuit."
echo

open "https://quaternius.itch.io/stylized-nature-megakit/purchase"
open "https://quaternius.itch.io/medieval-village-megakit/purchase"

read -r -p "Quand les deux ZIP sont dans Téléchargements, appuie sur Entrée..."

find_zip() {
  local first_token="$1"
  local second_token="$2"
  local newest=""
  while IFS= read -r -d '' candidate; do
    local normalized_name
    normalized_name="$(basename "$candidate" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
    if [[ "$normalized_name" == *"$first_token"* && "$normalized_name" == *"$second_token"* ]]; then
      if [ -z "$newest" ] || [ "$candidate" -nt "$newest" ]; then
        newest="$candidate"
      fi
    fi
  done < <(find "$DOWNLOADS_DIR" -maxdepth 2 -type f -iname "*.zip" -print0)
  printf '%s' "$newest"
}

has_models() {
  local folder="$1"
  [ -d "$folder" ] && find "$folder" -type f \( -iname "*.fbx" -o -iname "*.obj" -o -iname "*.gltf" -o -iname "*.glb" \) -print -quit | grep -q .
}

install_pack() {
  local label="$1"
  local folder="$2"
  local first_token="$3"
  local second_token="$4"
  local target="$DEST_ROOT/$folder"

  if has_models "$target"; then
    echo "Déjà installé et vérifié: $folder"
    return
  fi

  local archive
  archive="$(find_zip "$first_token" "$second_token")"
  if [ -z "$archive" ]; then
    echo
    echo "Archive introuvable pour: $label"
    echo "Dossier vérifié: $DOWNLOADS_DIR (et ses sous-dossiers)"
    echo "ZIP recherchés avec les mots: $first_token + $second_token"
    echo "Fichiers ZIP actuellement présents:"
    find "$DOWNLOADS_DIR" -maxdepth 2 -type f -iname "*.zip" -print | sed 's#^.*/#  - #' || true
    exit 1
  fi

  echo "Archive détectée: $(basename "$archive")"
  local staging
  staging="$(mktemp -d)"
  ditto -x -k "$archive" "$staging"
  mkdir -p "$target"
  ditto "$staging" "$target"
  rm -rf "$staging"

  if ! has_models "$target"; then
    echo "Le ZIP a été extrait, mais aucun modèle 3D n'a été trouvé dans: $target"
    echo "Vérifie que tu as téléchargé l'édition Standard, pas seulement des images."
    exit 1
  fi
  local model_count
  model_count="$(find "$target" -type f \( -iname "*.fbx" -o -iname "*.obj" -o -iname "*.gltf" -o -iname "*.glb" \) | wc -l | tr -d ' ')"
  echo "Installé: $label ($model_count modèles sources)"
}

install_pack "Stylized Nature MegaKit" "StylizedNatureMegaKit" "stylized" "nature"
install_pack "Medieval Village MegaKit" "MedievalVillageMegaKit" "medieval" "village"

printf '%s\n' \
  "Quaternius Stylized Nature MegaKit — CC0" \
  "https://quaternius.itch.io/stylized-nature-megakit" \
  "Quaternius Medieval Village MegaKit — CC0" \
  "https://quaternius.itch.io/medieval-village-megakit" \
  > "$DEST_ROOT/LICENSES_AND_SOURCES.txt"

echo
echo "Packs vérifiés dans: $DEST_ROOT"
echo "Relance maintenant: bash tools/unreal/ultimate_setup_macos.sh"
