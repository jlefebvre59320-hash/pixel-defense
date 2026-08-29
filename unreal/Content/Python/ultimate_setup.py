"""Headless production bootstrap: import art, build map, verify inventory."""
from __future__ import annotations
import json
import os
import runpy
import time
import unreal

python_dir = os.path.join(unreal.Paths.project_content_dir(), "Python")
marker_path = os.path.join(
    unreal.Paths.project_saved_dir(), "ultimate_setup_complete.json")

for script in (
    "import_kaykit_cc0.py",
    "build_ultimate_world.py",
    "inventory_production_assets.py",
):
    path = os.path.join(python_dir, script)
    unreal.log(f"PIXEL_DEFENSE_SETUP_STEP {script}")
    runpy.run_path(path, run_name=f"__pixel_defense_{script.replace('.', '_')}__")

marker = {
    "project": unreal.Paths.get_project_file_path(),
    "map": "/Game/Maps/KingdomValley",
    "completed_at_unix": int(time.time()),
    "status": "complete",
}
with open(marker_path, "w", encoding="utf-8") as handle:
    json.dump(marker, handle, ensure_ascii=False, indent=2)

unreal.log("PIXEL_DEFENSE_ULTIMATE_SETUP_COMPLETE")
print("PIXEL_DEFENSE_ULTIMATE_SETUP_COMPLETE")
