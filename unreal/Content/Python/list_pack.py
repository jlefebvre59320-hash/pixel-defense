"""Inventaire d'un pack — s'exécute *dans* l'éditeur Unreal, via le pont.

    python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/list_pack.json

Ne modifie rien. Répond à une question : « qu'y a-t-il dans ce pack, et que
peut-on en tirer comme sprites ? » Pour chaque maillage : son chemin, ses
dimensions, ses matériaux. Pour chaque texture : sa taille.

C'est le préalable à l'export : on ne peut pas décider qu'un rocher du pack
fera le rocher du jeu sans savoir qu'il existe et à quelle échelle.

Paramètres (`JOB_PARAMS`) :
    paths      : dossiers de contenu à parcourir (défaut : tout /Game)
    kinds      : classes retenues (défaut : maillages statiques et textures)
    limit      : nombre maximum d'entrées listées
    with_bounds: mesurer chaque maillage (plus lent, mais c'est ce qui sert
                 à cadrer les captures)
"""

import json

try:
    import unreal
except ImportError:
    unreal = None

DEFAULTS = {
    "paths": ["/Game"],
    "kinds": ["StaticMesh", "Texture2D", "Material", "MaterialInstanceConstant"],
    "limit": 400,
    "with_bounds": True,
}


def _params():
    p = dict(DEFAULTS)
    p.update(globals().get("JOB_PARAMS") or {})
    return p


def _safe(label, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as err:
        print("  ! %s : %s" % (label, err))
        return None


def asset_registry():
    helpers = getattr(unreal, "AssetRegistryHelpers", None)
    if helpers is None:
        return None
    return _safe("registre des assets", helpers.get_asset_registry)


def list_assets(paths):
    """Chemins d'assets sous `paths`. Le registre d'abord, sinon la
    bibliothèque d'assets — les deux existent selon les versions."""
    found = []
    registry = asset_registry()

    if registry is not None and hasattr(registry, "get_assets_by_path"):
        for path in paths:
            data = _safe("parcours de %s" % path, registry.get_assets_by_path,
                         path, True, False) or []
            for entry in data:
                obj = getattr(entry, "package_name", None) or getattr(entry, "object_path", None)
                cls = getattr(entry, "asset_class_path", None)
                cls_name = getattr(cls, "asset_name", None) or getattr(entry, "asset_class", None)
                found.append((str(obj), str(cls_name)))
        if found:
            return found

    lib = getattr(unreal, "EditorAssetLibrary", None)
    if lib is None or not hasattr(lib, "list_assets"):
        print("  ! ni AssetRegistry ni EditorAssetLibrary : rien à lister.")
        return []
    for path in paths:
        for ref in _safe("parcours de %s" % path, lib.list_assets, path, True, False) or []:
            found.append((str(ref), None))
    return found


def describe(ref, kind, with_bounds):
    """Ce qu'on peut dire d'un asset sans le placer dans le niveau."""
    asset = _safe("chargement de %s" % ref, unreal.load_asset, ref)
    if asset is None:
        return None

    cls = type(asset).__name__
    info = {"path": ref, "class": cls}

    if cls == "StaticMesh":
        if with_bounds:
            bounds = _safe("dimensions", asset.get_bounds)
            extent = getattr(getattr(bounds, "box_extent", None), "x", None)
            if extent is not None:
                info["size_cm"] = [
                    round(bounds.box_extent.x * 2, 1),
                    round(bounds.box_extent.y * 2, 1),
                    round(bounds.box_extent.z * 2, 1),
                ]
        materials = _safe("matériaux", asset.get_editor_property, "static_materials")
        if materials is not None:
            try:
                info["materials"] = len(materials)
            except TypeError:
                pass
    elif cls.startswith("Texture"):
        w = _safe("largeur", asset.get_editor_property, "blueprint_get_size_x")
        info["size_px"] = [
            getattr(asset, "blueprint_get_size_x", lambda: w)() if w is None else w,
            None,
        ]
    return info


def main():
    if unreal is None:
        print("module `unreal` absent : ce script doit tourner dans l'éditeur.")
        return 1

    p = _params()
    print("--- Inventaire du pack ---")
    print("Dossiers : %s" % ", ".join(p["paths"]))
    print("")

    refs = list_assets(p["paths"])
    wanted = set(p["kinds"])
    rows = []
    for ref, cls in refs:
        if len(rows) >= p["limit"]:
            break
        if cls and wanted and cls not in wanted:
            continue
        info = describe(ref, cls, p["with_bounds"])
        if info and (not wanted or info["class"] in wanted):
            rows.append(info)

    by_class = {}
    for r in rows:
        by_class.setdefault(r["class"], []).append(r)

    for cls in sorted(by_class):
        print("%s — %d" % (cls, len(by_class[cls])))
        for r in by_class[cls][:40]:
            size = r.get("size_cm")
            print("  %-58s %s" % (r["path"][:58],
                                  ("%.0f×%.0f×%.0f cm" % tuple(size)) if size else ""))
        if len(by_class[cls]) > 40:
            print("  … et %d de plus" % (len(by_class[cls]) - 40))
        print("")

    print("%d asset(s) retenu(s) sur %d parcouru(s)." % (len(rows), len(refs)))
    print("LIST_PACK_JSON " + json.dumps({"assets": rows}, ensure_ascii=False))
    return 0


main()
