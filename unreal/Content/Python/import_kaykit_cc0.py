"""Curated, repeatable production import for Pixel Defense 3D.

Imports only the useful mobile-sized subset of four KayKit CC0 packs and the
selected Poly Haven CC0 PBR maps. Character FBXs import their embedded
animations; duplicate FBX/GLTF/OBJ representations are deliberately skipped.
"""
from __future__ import annotations
import collections
import json
import os
import re
import unreal

PACKS = ("MedievalHexagon", "DungeonRemastered", "Adventurers", "Skeletons")
MODEL_EXTENSIONS = {".fbx"}
TEXTURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tga", ".hdr", ".exr"}
SKIP_PARTS = {".git", ".github", "screenshots", "samples", "documentation"}
SKIP_IMAGE_WORDS = ("icon", "preview", "screenshot", "cover", "banner", "logo", "contents")
MEDIEVAL_KEYWORDS = (
    "building_", "wall_", "fence_", "bridge_", "projectile_",
    "hex_grass", "hex_water", "hex_road", "tree_", "trees_",
    "rock_", "hills_", "mountain_", "waterlily", "waterplant",
    "barrel", "bucket", "crate", "cart", "bench", "sign", "cloud",
)
DUNGEON_KEYWORDS = (
    "torch", "barrel", "crate", "chest", "banner", "candle",
    "bones", "skull", "wall_", "pillar", "arch", "rubble",
    "floor_dirt", "floor_tile", "door", "gate",
)


def clean_segment(value):
    value = re.sub(r"[^A-Za-z0-9_]+", "_", value).strip("_")
    return value or "Assets"


def destination_for(base, source_file, source_root):
    relative_dir = os.path.relpath(os.path.dirname(source_file), source_root)
    pieces = [] if relative_dir == "." else relative_dir.split(os.sep)
    pieces = [clean_segment(piece) for piece in pieces
              if piece.lower() not in SKIP_PARTS]
    suffix = "/".join(pieces[:7])
    return f"{base}/{suffix}" if suffix else base


def normalized(path):
    return path.replace("\\", "/").lower()


def preferred_model(pack, path):
    low = normalized(path)
    name = os.path.basename(low)
    if pack == "MedievalHexagon":
        return "/assets/fbx(unity)/" in low and any(key in name for key in MEDIEVAL_KEYWORDS)
    if pack == "DungeonRemastered":
        return "/assets/fbx/" in low and any(key in name for key in DUNGEON_KEYWORDS)
    if pack in {"Adventurers", "Skeletons"}:
        return ("/assets/fbx/" in low or "/characters/fbx/" in low)
    return False


def wanted_texture(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    return not any(word in stem for word in SKIP_IMAGE_WORDS)


def is_character(path):
    return "/characters/fbx/" in normalized(path)


def fbx_options(character):
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_materials", True)
    options.set_editor_property("import_textures", True)
    if character:
        options.set_editor_property("import_as_skeletal", True)
        options.set_editor_property("import_animations", True)
        options.set_editor_property(
            "mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    else:
        options.set_editor_property("import_as_skeletal", False)
        options.set_editor_property("import_animations", False)
        options.set_editor_property(
            "mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
        static_data = options.get_editor_property("static_mesh_import_data")
        if static_data:
            static_data.set_editor_property("combine_meshes", False)
            static_data.set_editor_property("generate_lightmap_u_vs", True)
    return options


project_dir = os.path.abspath(unreal.Paths.project_dir())
external_root = os.path.abspath(os.path.join(project_dir, "..", "ExternalAssets"))
kaykit_root = os.path.join(external_root, "KayKit")
poly_root = os.path.join(external_root, "PolyHaven")
if not os.path.isdir(kaykit_root):
    raise RuntimeError("Packs absents: lance bash tools/assets/fetch_kaykit_cc0.sh")

sources = []
missing = []
for pack in PACKS:
    pack_root = os.path.join(kaykit_root, pack)
    if not os.path.isdir(pack_root):
        missing.append(pack)
        continue
    seen_textures = set()
    for root, directories, filenames in os.walk(pack_root):
        directories[:] = [item for item in directories
                           if item.lower() not in SKIP_PARTS]
        for filename in sorted(filenames):
            source = os.path.join(root, filename)
            extension = os.path.splitext(filename)[1].lower()
            if extension in MODEL_EXTENSIONS and preferred_model(pack, source):
                sources.append(("model", pack, pack_root, source))
            elif extension in TEXTURE_EXTENSIONS and wanted_texture(source):
                key = filename.lower()
                if key not in seen_textures:
                    sources.append(("texture", pack, pack_root, source))
                    seen_textures.add(key)

if missing:
    raise RuntimeError("Packs KayKit incomplets: " + ", ".join(missing))

if os.path.isdir(poly_root):
    for root, directories, filenames in os.walk(poly_root):
        directories[:] = [item for item in directories if not item.startswith(".")]
        for filename in sorted(filenames):
            source = os.path.join(root, filename)
            if os.path.splitext(filename)[1].lower() in TEXTURE_EXTENSIONS:
                sources.append(("texture", "PolyHaven", poly_root, source))
else:
    unreal.log_warning("Poly Haven absent: matériaux PBR de secours utilisés.")

# Textures first, then props, then animated characters.
sources.sort(key=lambda item: (
    0 if item[0] == "texture" else (2 if is_character(item[3]) else 1),
    item[1], item[3].lower()))

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
tasks = []
task_meta = []
for source_type, pack, pack_root, source in sources:
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source)
    base = ("/Game/ThirdParty/PolyHaven" if pack == "PolyHaven"
            else f"/Game/ThirdParty/KayKit/{pack}")
    task.set_editor_property("destination_path",
                             destination_for(base, source, pack_root))
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    task.set_editor_property("replace_existing", is_character(source))
    if source_type == "model":
        task.set_editor_property("options", fbx_options(is_character(source)))
    tasks.append(task)
    task_meta.append((pack, source))

BATCH_SIZE = 24
imported_paths = []
failed_files = []
for start in range(0, len(tasks), BATCH_SIZE):
    batch = tasks[start:start+BATCH_SIZE]
    try:
        asset_tools.import_asset_tasks(batch)
    except Exception as exc:
        unreal.log_error(f"Import batch {start // BATCH_SIZE + 1}: {exc}")
    for offset, task in enumerate(batch):
        paths = [str(value) for value in
                 task.get_editor_property("imported_object_paths")]
        if paths:
            imported_paths.extend(paths)
        else:
            failed_files.append(task_meta[start+offset][1])
    unreal.log(f"PIXEL_DEFENSE_IMPORT_PROGRESS {min(start+BATCH_SIZE,len(tasks))}/{len(tasks)}")

unreal.EditorAssetLibrary.save_directory(
    "/Game/ThirdParty", only_if_is_dirty=False, recursive=True)

counts = collections.Counter()
for path in imported_paths:
    for pack in PACKS + ("PolyHaven",):
        if f"/{pack}/" in path:
            counts[pack] += 1
            break

report = {
    "source_root": external_root,
    "curated_source_files": len(sources),
    "imported_objects": len(imported_paths),
    "failed_or_already_present": len(failed_files),
    "by_pack": dict(counts),
    "destination": "/Game/ThirdParty",
    "failed_sample": failed_files[:30],
}
saved = os.path.join(unreal.Paths.project_saved_dir(),
                     "ultimate_asset_import_report.json")
with open(saved, "w", encoding="utf-8") as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
report["saved"] = saved
print("ULTIMATE_ASSET_IMPORT_JSON " + json.dumps(report, ensure_ascii=False))
