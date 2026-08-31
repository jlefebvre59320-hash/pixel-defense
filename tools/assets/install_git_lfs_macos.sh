#!/usr/bin/env bash
set -euo pipefail

VERSION="3.7.1"
INSTALL_DIR="${HOME}/.local/bin"
BASE_URL="https://github.com/git-lfs/git-lfs/releases/download/v${VERSION}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Erreur: cet installateur local est réservé à macOS."
  exit 1
fi

case "$(uname -m)" in
  arm64)
    ARCHIVE="git-lfs-darwin-arm64-v${VERSION}.zip"
    EXPECTED_SHA256="76260fb34f4ee622ff0a66b857e5954aa49c7e343a92e57a1ec4a760618c94b2"
    ;;
  x86_64)
    ARCHIVE="git-lfs-darwin-amd64-v${VERSION}.zip"
    EXPECTED_SHA256="b5b1b641c0648c83661fa9eda991cd3eff945264dabc2cdf411a80dfe7ec0970"
    ;;
  *)
    echo "Erreur: architecture macOS non prise en charge: $(uname -m)"
    exit 1
    ;;
esac

for command_name in curl unzip shasum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Erreur: commande requise introuvable: $command_name"
    exit 1
  fi
done

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pixel-defense-git-lfs.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Téléchargement officiel de Git LFS v${VERSION}..."
curl --fail --location --retry 3 --output "$TEMP_DIR/$ARCHIVE" "$BASE_URL/$ARCHIVE"

ACTUAL_SHA256="$(shasum -a 256 "$TEMP_DIR/$ARCHIVE" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "Erreur: la somme SHA-256 de Git LFS ne correspond pas."
  echo "Attendu: $EXPECTED_SHA256"
  echo "Reçu:   $ACTUAL_SHA256"
  exit 1
fi

unzip -q "$TEMP_DIR/$ARCHIVE" -d "$TEMP_DIR/unpacked"
GIT_LFS_BINARY="$(find "$TEMP_DIR/unpacked" -type f -name git-lfs -perm -111 -print -quit)"
if [ -z "$GIT_LFS_BINARY" ]; then
  echo "Erreur: binaire git-lfs introuvable dans l'archive officielle."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cp "$GIT_LFS_BINARY" "$INSTALL_DIR/git-lfs"
chmod 755 "$INSTALL_DIR/git-lfs"

export PATH="$INSTALL_DIR:$PATH"
git lfs install

echo
echo "Git LFS installé sans Homebrew:"
git lfs version
echo "Emplacement: $INSTALL_DIR/git-lfs"
