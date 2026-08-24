import unreal

MAP_PATH = "/Game/Maps/AI_TestArena"
CELL = 200.0

level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
    if not level.load_level(MAP_PATH):
        raise RuntimeError(f"Impossible de charger {MAP_PATH}")
else:
    if not level.new_level(MAP_PATH, False):
        raise RuntimeError(f"Impossible de créer {MAP_PATH}")

# Nettoyage : le script est idempotent.
for actor in actors.get_all_level_actors():
    if actor.get_actor_label().startswith("AI_"):
        actors.destroy_actor(actor)

cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
if cube is None:
    raise RuntimeError("Mesh Cube de l'Engine introuvable")


def spawn_cube(label, location, scale):
    actor = actors.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(*location),
        unreal.Rotator(0.0, 0.0, 0.0),
        False,
    )
    actor.set_actor_label(label)
    actor.static_mesh_component.set_static_mesh(cube)
    actor.set_actor_scale3d(unreal.Vector(*scale))
    return actor


# Sol : 12 x 18 cases, proportions proches du prototype mobile portrait.
spawn_cube("AI_Ground", (0.0, 0.0, -25.0), (12.0, 18.0, 0.5))

# Chemin de test en S. Les cubes sont légèrement surélevés pour bien lire le tracé.
path_cells = []
for y in range(-7, -2):
    path_cells.append((0, y))
for x in range(0, 4):
    path_cells.append((x, -2))
for y in range(-2, 4):
    path_cells.append((3, y))
for x in range(3, -3, -1):
    path_cells.append((x, 3))
for y in range(3, 8):
    path_cells.append((-2, y))

for i, (gx, gy) in enumerate(path_cells):
    spawn_cube(
        f"AI_Path_{i:02d}",
        (gx * CELL, gy * CELL, 15.0),
        (0.92, 0.92, 0.18),
    )

# Pads de tours : utilisés plus tard pour tester sélection, portée et placement.
pads = [
    (-2, -5), (2, -5), (-2, -1), (1, 0),
    (5, 0), (0, 5), (-5, 4), (2, 6),
]
for i, (gx, gy) in enumerate(pads):
    spawn_cube(
        f"AI_TowerPad_{i:02d}",
        (gx * CELL, gy * CELL, 35.0),
        (0.72, 0.72, 0.35),
    )

# Repères spawn/base.
spawn_cube("AI_SpawnMarker", (0.0, -8.0 * CELL, 90.0), (0.55, 0.55, 1.8))
spawn_cube("AI_BaseMarker", (-2.0 * CELL, 8.0 * CELL, 110.0), (1.4, 1.4, 2.2))

if not level.save_current_level():
    raise RuntimeError("La map a été générée mais sa sauvegarde a échoué")

unreal.log(f"PIXEL_DEFENSE_BRIDGE arena_ready map={MAP_PATH} path={len(path_cells)} pads={len(pads)}")
print(f"arena_ready map={MAP_PATH} path={len(path_cells)} pads={len(pads)}")
