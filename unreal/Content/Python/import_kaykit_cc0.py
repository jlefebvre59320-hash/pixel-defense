"""Import the pinned KayKit CC0 art set into PixelDefense3D.

Source files stay outside Content and are ignored by Git. Unreal-created .uasset
files are saved below /Game/ThirdParty/KayKit. The importer is idempotent:
existing Unreal assets are not replaced.
"""
from __future__ import annotations

import collections
import json
import os
import re
import unreal

PACKS = ("MedievalHexagon", "Adventurers", "Skeletons")
MODEL_EXTENSIONS = {".fbx"}
TEXTURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tga"}
SKIP_PARTS = {".git", ".github", "screenshots", "documentation"}
SKIP_IMAGE_WORDS = ("icon", "preview", "screenshot", "cover", "banner", "logo")


def clean_segment(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_]+", "_", value).strip("_")
    return value or "Assets"


def destination_for(pack: str, source_file: str, pack_root: str) -> str:
    relative_dir = os.path.relpath(os.path.dirname(source_file), pack_root)
    pieces = [] if relative_dir == "." else relative_dir.split(os.sep)
    pieces = [clean_segment(piece) for piece in pieces if piece.lower() not in SKIP_PARTS]
    suffix = "/".join(pieces[:6])
    base = f"/Game/ThirdParty/KayKit/{pack}"
    return f"{base}/{suffix}" if suffix else base


def wanted_file(path: str) -> bool:
    lowered_parts = {part.lower() for part in path.split(os.sep)}
    if lowered_parts & SKIP_PARTS:
        return False
    extension = os.path.splitext(path)[1].lower()
    if extension in MODEL_EXTENSIONS:
        return True
    if extension in TEXTURE_EXTENSIONS:
        stem = os.path.splitext(os.path.basename(path))[0].lower()
        return not any(word in stem for word in SKIP_IMAGE_WORDS)
    return False


project_dir = os.path.abspath(unreal.Paths.project_dir())
source_root = os.path.abspath(os.path.join(project_dir, "..", "ExternalAssets", "KayKit"))
if not os.path.isdir(source_root):
    raise RuntimeError(
        "Packs KayKit absents. Lance d'abord: "
        "bash tools/assets/fetch_kaykit_cc0.sh"
    )

sources = []
missing = []
for pack in PACKS:
    pack_root = os.path.join(source_root, pack)
    if not os.path.isdir(pack_root):
        missing.append(pack)
        continue
    for root, directories, filenames in os.walk(pack_root):
        directories[:] = [
            directory for directory in directories
            if directory.lower() not in SKIP_PARTS
        ]
        for filename in sorted(filenames):
            source = os.path.join(root, filename)
            if wanted_file(source):
                sources.append((pack, pack_root, source))

if missing:
    raise RuntimeError("Packs incomplets: " + ", ".join(missing))
if not sources:
    raise RuntimeError(f"Aucun FBX ou texture importable trouvé dans {source_root}")

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
tasks = []
for pack, pack_root, source in sources:
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source)
    task.set_editor_property("destination_path", destination_for(pack, source, pack_root))
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    task.set_editor_property("replace_existing", False)
    tasks.append(task)

# Small batches keep the editor responsive and make failures easier to identify.
BATCH_SIZE = 40
imported_paths = []
failed_files = []
for start in range(0, len(tasks), BATCH_SIZE):
    batch = tasks[start:start + BATCH_SIZE]
    try:
        asset_tools.import_asset_tasks(batch)
    except Exception as exc:
        unreal.log_error(f"KayKit batch {start // BATCH_SIZE + 1}: {exc}")
    for task in batch:
        paths = [str(value) for value in task.get_editor_property("imported_object_paths")]
        if paths:
            imported_paths.extend(paths)
        else:
            failed_files.append(str(task.get_editor_property("filename")))

unreal.EditorAssetLibrary.save_directory("/Game/ThirdParty/KayKit", only_if_is_dirty=False, recursive=True)

counts = collections.Counter()
for path in imported_paths:
    if "/MedievalHexagon/" in path:
        counts["MedievalHexagon"] += 1
    elif "/Adventurers/" in path:
        counts["Adventurers"] += 1
    elif "/Skeletons/" in path:
        counts["Skeletons"] += 1

report = {
    "source_root": source_root,
    "source_files": len(sources),
    "imported_objects": len(imported_paths),
    "failed_or_already_present": len(failed_files),
    "by_pack": dict(counts),
    "destination": "/Game/ThirdParty/KayKit",
    "failed_sample": failed_files[:20],
}
saved = os.path.join(unreal.Paths.project_saved_dir(), "kaykit_import_report.json")
with open(saved, "w", encoding="utf-8") as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
report["saved"] = saved
print("KAYKIT_IMPORT_JSON " + json.dumps(report, ensure_ascii=False))
