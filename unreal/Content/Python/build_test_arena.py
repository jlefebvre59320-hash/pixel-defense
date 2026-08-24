"""Construit une arène de test — s'exécute *dans* l'éditeur Unreal.

    python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/build_test_arena.json

Une dalle, quatre murs, quelques obstacles, un point de départ, deux lumières.
Rien de joli : de quoi lancer une partie en trois secondes et vérifier qu'une
mécanique tient debout.

Paramètres : le pont dépose un dictionnaire `JOB_PARAMS` dans les globales
avant d'exécuter ce fichier. Lancé sans lui, les valeurs par défaut ci-dessous
s'appliquent.
"""

import json

try:
    import unreal
except ImportError:
    unreal = None

DEFAULTS = {
    "level_path": "/Game/Maps/TestArena",
    "tiles_x": 16,
    "tiles_y": 16,
    "tile_size": 200.0,       # centimètres, l'unité d'Unreal
    "floor_thickness": 20.0,
    "wall_height": 400.0,
    "wall_thickness": 50.0,
    "cube": "/Engine/BasicShapes/Cube.Cube",
    "obstacles": [],           # coordonnées en tuiles, origine au coin
    "spawn": [1, 1],
    "new_level": True,
    "save": True,
}

WARNINGS = []


def _params():
    p = dict(DEFAULTS)
    p.update(globals().get("JOB_PARAMS") or {})
    return p


def _warn(message):
    WARNINGS.append(message)
    print("  ! %s" % message)


def _safe(label, fn, *args, **kwargs):
    """Exécute une opération d'édition sans faire tomber tout le travail.

    L'API bouge d'une version d'Unreal à l'autre ; mieux vaut une arène avec un
    détail manquant, et le détail nommé, qu'un script mort à mi-chemin.
    """
    try:
        return fn(*args, **kwargs)
    except Exception as err:
        _warn("%s : %s" % (label, err))
        return None


# --- Compatibilité UE4 / UE5 -------------------------------------------------
# UE5 déplace le pilotage de l'éditeur dans des sous-systèmes ; UE4 (et UE5 en
# héritage) l'expose via EditorLevelLibrary. On prend ce qui répond.

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
    _warn("impossible de créer un niveau : ni LevelEditorSubsystem ni EditorLevelLibrary.")
    return None


def save_level():
    sub = _subsystem("LevelEditorSubsystem")
    if sub is not None and hasattr(sub, "save_current_level"):
        return _safe("enregistrement du niveau", sub.save_current_level)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "save_current_level"):
        return _safe("enregistrement du niveau", lib.save_current_level)
    _warn("niveau non enregistré : aucune API d'enregistrement disponible.")
    return None


def spawn(cls, location, rotation=None):
    rotation = rotation or unreal.Rotator(0.0, 0.0, 0.0)
    sub = _subsystem("EditorActorSubsystem")
    if sub is not None and hasattr(sub, "spawn_actor_from_class"):
        return _safe("placement d'acteur", sub.spawn_actor_from_class, cls, location, rotation)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "spawn_actor_from_class"):
        return _safe("placement d'acteur", lib.spawn_actor_from_class, cls, location, rotation)
    _warn("placement impossible : aucune API de spawn disponible.")
    return None


# --- Briques -----------------------------------------------------------------


def block(mesh, label, center, size):
    """Un pavé : un cube du moteur (100 cm de côté) mis à l'échelle voulue."""
    actor = spawn(unreal.StaticMeshActor, unreal.Vector(*center))
    if actor is None:
        return None

    _safe("nom de l'acteur", actor.set_actor_label, label)

    # Redimensionner exige une mobilité non statique ; on la rend au moteur
    # ensuite, pour que l'éclairage précalculé reste possible.
    comp = _safe("composant de maillage", actor.get_editor_property, "static_mesh_component")
    if comp is not None:
        _safe("mobilité (montage)", comp.set_mobility, unreal.ComponentMobility.MOVABLE)
        _safe("assignation du maillage", comp.set_static_mesh, mesh)

    _safe("mise à l'échelle", actor.set_actor_scale3d,
          unreal.Vector(size[0] / 100.0, size[1] / 100.0, size[2] / 100.0))

    if comp is not None:
        _safe("mobilité (final)", comp.set_mobility, unreal.ComponentMobility.STATIC)
    return actor


def build(p):
    mesh = _safe("chargement du cube", unreal.load_asset, p["cube"])
    if mesh is None:
        _warn("cube du moteur introuvable (%s) : l'arène sera vide." % p["cube"])

    tile = float(p["tile_size"])
    w = p["tiles_x"] * tile          # largeur totale, en centimètres
    d = p["tiles_y"] * tile
    th = float(p["wall_thickness"])
    hh = float(p["wall_height"])
    ft = float(p["floor_thickness"])

    made = []

    if mesh is not None:
        made.append(block(mesh, "Sol", (w / 2.0, d / 2.0, -ft / 2.0), (w, d, ft)))

        murs = [
            ("Mur_Nord", (w / 2.0, -th / 2.0, hh / 2.0), (w + 2 * th, th, hh)),
            ("Mur_Sud", (w / 2.0, d + th / 2.0, hh / 2.0), (w + 2 * th, th, hh)),
            ("Mur_Ouest", (-th / 2.0, d / 2.0, hh / 2.0), (th, d, hh)),
            ("Mur_Est", (w + th / 2.0, d / 2.0, hh / 2.0), (th, d, hh)),
        ]
        for label, center, size in murs:
            made.append(block(mesh, label, center, size))

        for i, cell in enumerate(p["obstacles"]):
            cx = (cell[0] + 0.5) * tile
            cy = (cell[1] + 0.5) * tile
            made.append(block(mesh, "Obstacle_%02d" % i,
                              (cx, cy, tile / 2.0), (tile * 0.8, tile * 0.8, tile)))

    sx = (p["spawn"][0] + 0.5) * tile
    sy = (p["spawn"][1] + 0.5) * tile
    start = spawn(getattr(unreal, "PlayerStart", None), unreal.Vector(sx, sy, 100.0))
    if start is not None:
        _safe("nom du point de départ", start.set_actor_label, "Depart")
        made.append(start)

    sun = spawn(getattr(unreal, "DirectionalLight", None),
                unreal.Vector(w / 2.0, d / 2.0, hh + 500.0),
                unreal.Rotator(0.0, -50.0, 30.0))
    if sun is not None:
        _safe("nom du soleil", sun.set_actor_label, "Soleil")
        made.append(sun)

    sky = spawn(getattr(unreal, "SkyLight", None), unreal.Vector(w / 2.0, d / 2.0, hh))
    if sky is not None:
        _safe("nom du ciel", sky.set_actor_label, "Ciel")
        made.append(sky)

    return [a for a in made if a is not None]


def main():
    if unreal is None:
        print("module `unreal` absent : ce script doit tourner dans l'éditeur.")
        return 1

    p = _params()
    print("--- Arène de test ---")
    print("Niveau    : %s" % p["level_path"])
    print("Dimensions: %d x %d tuiles de %g cm" % (p["tiles_x"], p["tiles_y"], p["tile_size"]))
    print("Obstacles : %d" % len(p["obstacles"]))
    print("")

    if p["new_level"]:
        new_level(p["level_path"])

    actors = build(p)
    print("")
    print("%d acteurs placés." % len(actors))

    if p["save"]:
        save_level()
        print("Niveau enregistré.")

    if WARNINGS:
        print("")
        print("%d avertissement(s) — l'arène est utilisable mais incomplète." % len(WARNINGS))

    print("BUILD_ARENA_JSON " + json.dumps(
        {"level": p["level_path"], "actors": len(actors), "warnings": WARNINGS},
        ensure_ascii=False))
    return 1 if WARNINGS else 0


main()
