"""Prépare une scène de direction artistique médiévale dans Unreal Editor.

Ce script crée les dossiers de production et une scène placeholder lisible :
terrain, route, murailles, portail ennemi, base magique, pads de tours et props.
Il ne prétend pas remplacer les vrais assets 3D/textures : il prépare le moteur
pour les recevoir et fixe l'échelle, les zones et le langage visuel.
"""

import json

try:
    import unreal
except ImportError:
    unreal = None

DEFAULTS = {
    "level_path": "/Game/Maps/MedievalArtDirection",
    "save": True,
    "new_level": True,
}

WARNINGS = []


def _params():
    p = dict(DEFAULTS)
    p.update(globals().get("JOB_PARAMS") or {})
    return p


def _warn(msg):
    WARNINGS.append(msg)
    print("  ! %s" % msg)


def _safe(label, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as err:
        _warn("%s : %s" % (label, err))
        return None


def _subsystem(name):
    getter = getattr(unreal, "get_editor_subsystem", None)
    cls = getattr(unreal, name, None)
    if getter is None or cls is None:
        return None
    try:
        return getter(cls)
    except Exception:
        return None


def new_level(path):
    sub = _subsystem("LevelEditorSubsystem")
    if sub is not None and hasattr(sub, "new_level"):
        return _safe("création du niveau", sub.new_level, path)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "new_level"):
        return _safe("création du niveau", lib.new_level, path)
    _warn("API de création de niveau indisponible")
    return None


def save_level():
    sub = _subsystem("LevelEditorSubsystem")
    if sub is not None and hasattr(sub, "save_current_level"):
        return _safe("enregistrement du niveau", sub.save_current_level)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "save_current_level"):
        return _safe("enregistrement du niveau", lib.save_current_level)
    _warn("API d'enregistrement du niveau indisponible")
    return None


def spawn(cls, location, rotation=None):
    if cls is None:
        return None
    rotation = rotation or unreal.Rotator(0.0, 0.0, 0.0)
    sub = _subsystem("EditorActorSubsystem")
    if sub is not None and hasattr(sub, "spawn_actor_from_class"):
        return _safe("spawn acteur", sub.spawn_actor_from_class, cls, location, rotation)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "spawn_actor_from_class"):
        return _safe("spawn acteur", lib.spawn_actor_from_class, cls, location, rotation)
    _warn("API de spawn indisponible")
    return None


def ensure_content_dirs():
    folders = [
        "/Game/Art",
        "/Game/Art/Environment",
        "/Game/Art/Environment/Architecture",
        "/Game/Art/Environment/Nature",
        "/Game/Art/Materials",
        "/Game/Art/Materials/Masters",
        "/Game/Art/Materials/Instances",
        "/Game/Art/Props",
        "/Game/Art/FX",
        "/Game/Art/Animations",
        "/Game/Blueprints/Environment",
        "/Game/Blueprints/Gameplay",
    ]
    eal = getattr(unreal, "EditorAssetLibrary", None)
    if eal is None or not hasattr(eal, "make_directory"):
        _warn("EditorAssetLibrary.make_directory indisponible")
        return 0
    made = 0
    for folder in folders:
        result = _safe("dossier %s" % folder, eal.make_directory, folder)
        if result is not None:
            made += 1
    return made


def place_mesh(mesh_path, label, loc, scale, rot=None):
    mesh = _safe("chargement %s" % mesh_path, unreal.load_asset, mesh_path)
    actor = spawn(getattr(unreal, "StaticMeshActor", None), unreal.Vector(*loc), rot)
    if actor is None:
        return None
    _safe("label %s" % label, actor.set_actor_label, label)
    comp = _safe("composant %s" % label, actor.get_editor_property, "static_mesh_component")
    if comp is not None and mesh is not None:
        _safe("mesh %s" % label, comp.set_static_mesh, mesh)
    _safe("échelle %s" % label, actor.set_actor_scale3d, unreal.Vector(*scale))
    return actor


def build_scene():
    made = []
    cube = "/Engine/BasicShapes/Cube.Cube"
    cyl = "/Engine/BasicShapes/Cylinder.Cylinder"
    cone = "/Engine/BasicShapes/Cone.Cone"

    # Terrain principal
    made.append(place_mesh(cube, "ENV_Terrain_Medieval", (0, 0, -40), (32, 22, 0.8)))

    # Chemin d'invasion très lisible, matérialisé par des dalles placeholders.
    path = [
        (-2200, -600), (-1800, -600), (-1400, -600), (-1000, -300),
        (-600, 0), (-200, 300), (200, 300), (600, 300),
        (1000, 0), (1400, -300), (1800, -300), (2200, 0),
    ]
    for i, (x, y) in enumerate(path):
        made.append(place_mesh(cube, "PATH_%02d" % i, (x, y, 10), (3.2, 2.1, 0.18)))

    # Murailles / entrée médiévale.
    for i, x in enumerate([-3000, -2200, -1400, 1400, 2200, 3000]):
        made.append(place_mesh(cube, "WALL_%02d" % i, (x, 1600, 180), (7, 1.2, 3.6)))
    made.append(place_mesh(cube, "GATE_Pillar_L", (-500, 1600, 260), (2, 2, 5.2)))
    made.append(place_mesh(cube, "GATE_Pillar_R", (500, 1600, 260), (2, 2, 5.2)))
    made.append(place_mesh(cube, "GATE_Lintel", (0, 1600, 600), (8, 2, 1.4)))

    # Portail d'apparition ennemi : anneau/socle placeholder violet à remplacer par BP_EnemyPortal.
    made.append(place_mesh(cyl, "PORTAL_Enemy_Base", (-2600, -700, 60), (4.2, 4.2, 1.2)))
    made.append(place_mesh(cone, "PORTAL_Enemy_Core", (-2600, -700, 220), (1.8, 1.8, 4.5)))

    # Cœur/base magique : silhouette verticale claire à remplacer par BP_MagicCore.
    made.append(place_mesh(cyl, "CORE_Base", (2600, 200, 60), (5.0, 5.0, 1.2)))
    made.append(place_mesh(cone, "CORE_Crystal", (2600, 200, 300), (2.0, 2.0, 5.0)))

    # Pads de tours autour du chemin.
    pads = [(-1500, -1300), (-900, 900), (-200, -700), (500, 1050),
            (1100, -950), (1700, 750), (500, -1200), (1900, 1100)]
    for i, (x, y) in enumerate(pads):
        made.append(place_mesh(cyl, "TOWER_PAD_%02d" % i, (x, y, 25), (2.6, 2.6, 0.5)))

    # Props placeholders : zones village / marché.
    prop_positions = [(-2100, 1100), (-1700, 1150), (-1300, 1050), (1200, 1150), (1600, 1100)]
    for i, (x, y) in enumerate(prop_positions):
        made.append(place_mesh(cube, "VILLAGE_PROP_%02d" % i, (x, y, 120), (2.6, 2.6, 2.4)))

    # Lumière chaude + skylight.
    sun = spawn(getattr(unreal, "DirectionalLight", None), unreal.Vector(0, 0, 1200), unreal.Rotator(-35, -45, 0))
    if sun is not None:
        _safe("label soleil", sun.set_actor_label, "LIGHT_Sun_Warm")
        made.append(sun)
    sky = spawn(getattr(unreal, "SkyLight", None), unreal.Vector(0, 0, 800))
    if sky is not None:
        _safe("label skylight", sky.set_actor_label, "LIGHT_Sky")
        made.append(sky)

    return [a for a in made if a is not None]


def main():
    if unreal is None:
        print("module `unreal` absent : ce script doit tourner dans Unreal Editor.")
        return 1

    p = _params()
    print("--- Setup direction artistique médiévale ---")
    print("Niveau : %s" % p["level_path"])
    dirs = ensure_content_dirs()
    print("Dossiers préparés : %d" % dirs)

    if p["new_level"]:
        new_level(p["level_path"])

    actors = build_scene()
    print("Acteurs placeholders placés : %d" % len(actors))

    if p["save"]:
        save_level()
        print("Niveau enregistré.")

    print("MEDIEVAL_ART_JSON " + json.dumps({
        "level": p["level_path"],
        "folders": dirs,
        "actors": len(actors),
        "warnings": WARNINGS,
        "next": [
            "remplacer les placeholders par le kit modulaire médiéval",
            "créer matériaux maîtres + instances",
            "ajouter Niagara torches/fumée/braises/portail",
            "ajouter WPO vent herbes/drapeaux",
            "profiler mobile 60 FPS"
        ]
    }, ensure_ascii=False))
    return 1 if WARNINGS else 0


main()
