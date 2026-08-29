#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UPROJECT="$REPO_ROOT/unreal/PixelDefense3D.uproject"
ENGINE_ROOT="${UE_ENGINE_ROOT:-/Users/Shared/Epic Games/UE_5.8}"
BUILD_SCRIPT="$ENGINE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh"

if [ ! -x "$BUILD_SCRIPT" ]; then
  echo "Unreal Engine introuvable: $BUILD_SCRIPT"
  echo "Si UE est ailleurs: UE_ENGINE_ROOT='/chemin/UE_5.8' bash tools/unreal/build_macos.sh"
  exit 1
fi
if [ ! -f "$UPROJECT" ]; then
  echo "Projet introuvable: $UPROJECT"
  exit 1
fi

"$BUILD_SCRIPT" PixelDefense3DEditor Mac Development "$UPROJECT" -WaitMutex
echo
echo "Compilation réussie. Ouverture de PixelDefense3D..."
open "$UPROJECT"
