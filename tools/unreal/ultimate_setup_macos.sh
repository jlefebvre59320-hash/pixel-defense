#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UPROJECT="$REPO_ROOT/unreal/PixelDefense3D.uproject"
ENGINE_ROOT="${UE_ENGINE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
BUILD_SCRIPT="$ENGINE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh"
EDITOR_CMD="$ENGINE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd"
SETUP_PY="$REPO_ROOT/unreal/Content/Python/ultimate_setup.py"
LOG_DIR="$REPO_ROOT/unreal/Saved/Logs"
LOG_FILE="$LOG_DIR/ultimate_setup.log"
MARKER_FILE="$REPO_ROOT/unreal/Saved/ultimate_setup_complete.json"

if pgrep -f "/UnrealEditor([[:space:]]|$)" >/dev/null 2>&1; then
  echo "Ferme complètement Unreal Editor avant cette installation."
  echo "Epic Games Launcher peut rester ouvert."
  exit 1
fi
if [ ! -x "$BUILD_SCRIPT" ] || [ ! -x "$EDITOR_CMD" ]; then
  echo "Unreal Engine 5.8 introuvable dans: $ENGINE_ROOT"
  echo "Autre chemin: UE_ENGINE_ROOT='/chemin/UE_5.8' bash tools/unreal/ultimate_setup_macos.sh"
  exit 1
fi
if [ ! -f "$UPROJECT" ]; then
  echo "Projet introuvable: $UPROJECT"
  exit 1
fi

echo "[1/4] Téléchargement des packs CC0..."
bash "$REPO_ROOT/tools/assets/fetch_kaykit_cc0.sh"

pack_has_models() {
  local folder="$1"
  [ -d "$folder" ] && find "$folder" -type f -iname "*.fbx" -print -quit | grep -q .
}

NATURE_PACK="$REPO_ROOT/unreal/ExternalAssets/Quaternius/StylizedNatureMegaKit"
VILLAGE_PACK="$REPO_ROOT/unreal/ExternalAssets/Quaternius/MedievalVillageMegaKit"
if pack_has_models "$NATURE_PACK" && pack_has_models "$VILLAGE_PACK"; then
  echo "Packs Quaternius vérifiés: modèles Nature et Village présents."
else
  echo "Les dossiers Quaternius sont absents ou vides."
  echo "L'installation guidée va rechercher les vrais ZIP, puis vérifier leurs modèles."
  bash "$REPO_ROOT/tools/assets/install_quaternius_cc0_macos.sh"
fi

if ! pack_has_models "$NATURE_PACK" || ! pack_has_models "$VILLAGE_PACK"; then
  echo "Échec: les deux packs Quaternius ne contiennent toujours aucun FBX."
  exit 1
fi

echo "[2/4] Compilation PixelDefense3D..."
"$BUILD_SCRIPT" PixelDefense3DEditor Mac Development "$UPROJECT" -WaitMutex

echo "[3/4] Import, matériaux PBR et création de KingdomValley..."
mkdir -p "$LOG_DIR"
rm -f "$MARKER_FILE"
set +e
"$EDITOR_CMD" "$UPROJECT" \
  -ExecutePythonScript="$SETUP_PY" \
  -unattended -nop4 -nosplash -NoSound \
  -stdout -FullStdOutLogOutput 2>&1 | tee "$LOG_FILE"
EDITOR_STATUS=${PIPESTATUS[0]}
set -e

if [ "$EDITOR_STATUS" -ne 0 ] || [ ! -f "$MARKER_FILE" ]; then
  echo
  echo "L'installation Unreal ne s'est pas terminée correctement."
  echo "Code UnrealEditor-Cmd: $EDITOR_STATUS"
  echo "Dernières erreurs utiles:"
  grep -Ei "error|exception|traceback|fatal|ensure condition|PIXEL_DEFENSE_SETUP_STEP" "$LOG_FILE" | tail -n 80 || true
  echo "Journal complet: $LOG_FILE"
  exit 1
fi

QUATERNIUS_ASSET_COUNT="$(find "$REPO_ROOT/unreal/Content/ThirdParty/Quaternius" -type f -name "*.uasset" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$QUATERNIUS_ASSET_COUNT" -lt 5 ]; then
  echo
  echo "Échec visuel: seulement $QUATERNIUS_ASSET_COUNT asset(s) Quaternius importé(s)."
  echo "La carte ne sera pas ouverte avec les anciens modèles."
  echo "Consulte: $REPO_ROOT/unreal/Saved/ultimate_asset_import_report.json"
  exit 1
fi
echo "Validation visuelle: $QUATERNIUS_ASSET_COUNT assets Quaternius disponibles."

echo "[4/4] Terminé. Ouverture du jeu..."
open "$UPROJECT"
echo
echo "Dans Unreal: ouvre /Game/Maps/KingdomValley puis clique sur Play."
