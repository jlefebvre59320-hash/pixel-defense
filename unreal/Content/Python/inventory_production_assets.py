"""Inventory production assets imported into PixelDefense3D.

Scans /Game through the Unreal Asset Registry and reports useful real assets
for environment assembly. It never modifies or deletes project content.
"""
from __future__ import annotations
import collections
import json
import os
import unreal

LIMIT_PER_TYPE=120
GENERATED_MARKERS=(
    "/Generated", "/GeneratedMax", "/Premium", "/Environment07",
    "/Maps/", "/Blueprints/", "/Data/"
)


def class_name(data):
    value=getattr(data,"asset_class_path",None)
    if value:
        return str(value.asset_name)
    value=getattr(data,"asset_class",None)
    return str(value or "Unknown")


def package_name(data):
    return str(getattr(data,"package_name",""))


def object_path(data):
    path=getattr(data,"object_path",None)
    if path:return str(path)
    package=package_name(data)
    asset=str(getattr(data,"asset_name",""))
    return f"{package}.{asset}" if package and asset else package


def root_folder(package):
    parts=[p for p in package.split("/") if p]
    return parts[1] if len(parts)>1 else "GameRoot"


registry=unreal.AssetRegistryHelpers.get_asset_registry()
assets=list(registry.get_assets_by_path("/Game",recursive=True))
by_class=collections.Counter()
by_root=collections.Counter()
selected=collections.defaultdict(list)

wanted={
    "StaticMesh":"static_meshes",
    "SkeletalMesh":"skeletal_meshes",
    "Material":"materials",
    "MaterialInstanceConstant":"material_instances",
    "Texture2D":"textures",
    "NiagaraSystem":"niagara",
    "AnimSequence":"animations",
    "AnimMontage":"animations",
    "Skeleton":"skeletons",
    "SoundWave":"audio",
    "Blueprint":"blueprints",
    "World":"maps",
}

for data in assets:
    cls=class_name(data)
    package=package_name(data)
    by_class[cls]+=1
    by_root[root_folder(package)]+=1
    bucket=wanted.get(cls)
    if not bucket:continue
    # Keep generated folders visible in totals but prefer real imported packs in
    # candidate lists.
    generated=any(marker.lower() in package.lower() for marker in GENERATED_MARKERS)
    item={"name":str(getattr(data,"asset_name","")),
          "package":package,
          "object_path":object_path(data),
          "generated":generated}
    selected[bucket].append(item)

for bucket,items in selected.items():
    items.sort(key=lambda x:(x["generated"],x["package"].lower()))
    selected[bucket]=items[:LIMIT_PER_TYPE]

summary={
    "total_assets":len(assets),
    "root_folders":dict(by_root.most_common()),
    "classes":dict(by_class.most_common()),
    "candidates":dict(selected),
}
saved=os.path.join(unreal.Paths.project_saved_dir(),"production_asset_inventory.json")
with open(saved,"w",encoding="utf-8") as handle:
    json.dump(summary,handle,ensure_ascii=False,indent=2)

compact={
    "total_assets":summary["total_assets"],
    "root_folders":summary["root_folders"],
    "counts":{key:len(value) for key,value in selected.items()},
    "sample_real_assets":{
        key:[item["object_path"] for item in value if not item["generated"]][:25]
        for key,value in selected.items()
    },
    "saved":saved,
}
print("PRODUCTION_ASSET_INVENTORY_JSON "+json.dumps(compact,ensure_ascii=False))
