"""Headless production bootstrap: import art, build map, verify inventory."""
from __future__ import annotations
import os
import runpy
import unreal

python_dir = os.path.join(unreal.Paths.project_content_dir(), "Python")
for script in (
    "import_kaykit_cc0.py",
    "build_ultimate_world.py",
    "inventory_production_assets.py",
):
    path = os.path.join(python_dir, script)
    unreal.log(f"PIXEL_DEFENSE_SETUP_STEP {script}")
    runpy.run_path(path, run_name=f"__pixel_defense_{script.replace('.', '_')}__")
print("PIXEL_DEFENSE_ULTIMATE_SETUP_COMPLETE")
