#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST="$REPO_ROOT/unreal/ExternalAssets/Kenney/UIAdventure"
ARCHIVE="$REPO_ROOT/unreal/ExternalAssets/Kenney/kenney_ui-pack-adventure.zip"
URL="https://kenney.nl/media/pages/assets/ui-pack-adventure/9a877376bc-1723597274/kenney_ui-pack-adventure.zip"

if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  echo "Erreur: curl et unzip sont requis."
  exit 1
fi

mkdir -p "$(dirname "$ARCHIVE")"
if [ ! -f "$ARCHIVE" ]; then
  echo "Téléchargement: Kenney UI Pack Adventure (CC0)"
  curl --fail --location --retry 3 --connect-timeout 30 --max-time 180 \
    --output "$ARCHIVE.part" "$URL"
  mv "$ARCHIVE.part" "$ARCHIVE"
else
  echo "Déjà présent: Kenney UI Pack Adventure"
fi

if [ ! -d "$DEST" ]; then
  mkdir -p "$DEST"
  unzip -q "$ARCHIVE" -d "$DEST"
fi

printf '%s\n' \
  "Pack: Kenney UI Pack Adventure" \
  "Source: https://kenney.nl/assets/ui-pack-adventure" \
  "License: Creative Commons CC0 1.0 Universal" \
  > "$DEST/PIXEL_DEFENSE_LICENSE.txt"

echo "Interface Kenney prête dans: $DEST"
