"""Faux module `unreal` — juste assez pour valider les scripts du dépôt.

Unreal n'est pas installable ici (ni en intégration continue) : sans ce
doublon, les scripts de `unreal/Content/Python/` ne seraient jamais exécutés
avant de partir chez quelqu'un. Il reproduit la *forme* de l'API — les noms,
les signatures, les valeurs de retour — pas le moteur.

Ce qu'il prouve : les scripts s'exécutent de bout en bout, placent le bon
nombre d'acteurs, aux bonnes positions, et n'appellent que des symboles qui
existent vraiment dans l'API d'Unreal.

Ce qu'il ne prouve pas : qu'Unreal se comporte comme ici. Le vrai moteur reste
seul juge.
"""

import os
import struct
import zlib

WORLD = []          # tous les acteurs placés, pour les vérifications
CURRENT_LEVEL = [None]
EXPORTED = []       # PNG écrits par export_render_target


def reset():
    WORLD.clear()
    EXPORTED.clear()
    CURRENT_LEVEL[0] = None


# --- Types de base -----------------------------------------------------------


class Vector:
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = float(x), float(y), float(z)

    def __repr__(self):
        return "Vector(%g, %g, %g)" % (self.x, self.y, self.z)


class Rotator:
    def __init__(self, roll=0.0, pitch=0.0, yaw=0.0):
        self.roll, self.pitch, self.yaw = float(roll), float(pitch), float(yaw)


class ComponentMobility:
    STATIC = "Static"
    STATIONARY = "Stationary"
    MOVABLE = "Movable"


class Bounds:
    def __init__(self, extent):
        self.origin = Vector(0.0, 0.0, extent.z)
        self.box_extent = extent


class StaticMesh:
    def __init__(self, path):
        self.path = path

    def get_bounds(self):
        # Taille tirée du chemin : deux maillages différents ne doivent pas
        # mesurer pareil, sinon l'inventaire ne prouverait rien.
        seed = sum(ord(c) for c in self.path)
        return Bounds(Vector(40 + seed % 60, 40 + seed % 45, 60 + seed % 140))

    def get_editor_property(self, name):
        if name == "static_materials":
            return [None] * (1 + sum(ord(c) for c in self.path) % 3)
        raise AttributeError("pas de propriété « %s » sur StaticMesh" % name)

    def __repr__(self):
        return "StaticMesh(%s)" % self.path


class StaticMeshComponent:
    def __init__(self):
        self.mobility = ComponentMobility.STATIC
        self.static_mesh = None
        self.material = None

    def set_mobility(self, mobility):
        self.mobility = mobility

    def create_dynamic_material_instance(self, element_index, parent, name=None):
        if parent is None:
            raise ValueError("matériau parent absent")
        self.material = MaterialInstanceDynamic(parent)
        return self.material

    def set_static_mesh(self, mesh):
        if not isinstance(mesh, StaticMesh):
            raise TypeError("set_static_mesh attend un StaticMesh")
        self.static_mesh = mesh


class Actor:
    kind = "Actor"

    def __init__(self, location, rotation):
        self.location = location
        self.rotation = rotation
        self.label = self.kind
        self.scale = Vector(1.0, 1.0, 1.0)
        self.destroyed = False

    def set_actor_label(self, label):
        self.label = label

    def set_actor_scale3d(self, scale):
        self.scale = scale

    def set_actor_location(self, location, sweep=False, teleport=False):
        self.location = location
        return True

    def get_actor_bounds(self, only_colliding_components=False):
        # Origine décalée du pivot : c'est justement ce décalage que le script
        # d'export doit rattraper pour cadrer le sujet.
        origin = Vector(self.location.x, self.location.y, self.location.z + 50.0)
        return origin, Vector(50.0, 50.0, 100.0)

    def get_editor_property(self, name):
        if not hasattr(self, name):
            raise AttributeError("pas de propriété « %s » sur %s" % (name, self.kind))
        return getattr(self, name)

    def __repr__(self):
        return "%s(%s)" % (self.kind, self.label)


class StaticMeshActor(Actor):
    kind = "StaticMeshActor"

    def __init__(self, location, rotation):
        super().__init__(location, rotation)
        self.static_mesh_component = StaticMeshComponent()


class PlayerStart(Actor):
    kind = "PlayerStart"


class DirectionalLight(Actor):
    kind = "DirectionalLight"


class SkyLight(Actor):
    kind = "SkyLight"


class LinearColor:
    def __init__(self, r=0.0, g=0.0, b=0.0, a=1.0):
        self.r, self.g, self.b, self.a = float(r), float(g), float(b), float(a)

    def bytes(self):
        return (int(self.r * 255), int(self.g * 255), int(self.b * 255))


class TextureRenderTargetFormat:
    RTF_RGBA8 = "RTF_RGBA8"


class CameraProjectionMode:
    PERSPECTIVE = "Perspective"
    ORTHOGRAPHIC = "Orthographic"


class SceneCaptureSource:
    SCS_FINAL_COLOR_LDR = "SCS_FinalColorLDR"
    SCS_SCENE_COLOR_HDR = "SCS_SceneColorHDR"


class SceneCapturePrimitiveRenderMode:
    LEGACY_SCENE_CAPTURE = "Legacy"
    USE_SHOW_ONLY_LIST = "UseShowOnlyList"


class MaterialInstanceDynamic:
    def __init__(self, parent):
        self.parent = parent
        self.vectors = {}

    def set_vector_parameter_value(self, name, value):
        # Le vrai matériau refuse un paramètre qu'il n'expose pas ; le doublon
        # accepte tout : ce qu'on teste ici, c'est que le script *demande* la
        # bonne chose, pas la table des paramètres d'un matériau d'Epic.
        self.vectors[name] = value
        return True


class TextureRenderTarget2D:
    def __init__(self, width, height, fmt):
        self.width, self.height, self.format = width, height, fmt


class SceneCaptureComponent2D:
    def __init__(self):
        self.texture_target = None
        self.projection_type = CameraProjectionMode.PERSPECTIVE
        self.ortho_width = 512.0
        self.capture_source = SceneCaptureSource.SCS_FINAL_COLOR_LDR
        self.capture_every_frame = True
        self.primitive_render_mode = SceneCapturePrimitiveRenderMode.LEGACY_SCENE_CAPTURE
        self.show_only_actors = []
        self.captures = 0

    def set_editor_property(self, name, value):
        if not hasattr(self, name):
            raise AttributeError("pas de propriété « %s » sur SceneCaptureComponent2D" % name)
        setattr(self, name, value)

    def get_editor_property(self, name):
        if not hasattr(self, name):
            raise AttributeError("pas de propriété « %s »" % name)
        return getattr(self, name)

    def capture_scene(self):
        if self.texture_target is None:
            raise RuntimeError("aucune cible de rendu")
        self.captures += 1
        return True


class SceneCapture2D(Actor):
    kind = "SceneCapture2D"

    def __init__(self, location, rotation):
        super().__init__(location, rotation)
        self.capture_component2d = SceneCaptureComponent2D()


# --- Écriture d'images -------------------------------------------------------
# Le doublon écrit de *vrais* PNG. C'est ce qui permet de vérifier la chaîne
# entière sans moteur : capture → détourage → atlas → jeu. Une silhouette
# reconnaissable suffit ; ce qu'on teste est la plomberie, pas le rendu d'Unreal.


def _png(width, height, pixels):
    def chunk(tag, data):
        body = tag + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * width * 4:(y + 1) * width * 4])
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
            + chunk(b"IEND", b""))


def _silhouette(name, size, background):
    """Une forme pleine sur fond plat, dont la couleur et la taille dépendent
    du nom : deux figures différentes ne doivent pas produire la même image,
    sinon un test qui les confond passerait."""
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(name))
    color = ((seed * 37) % 200 + 40, (seed * 61) % 200 + 40, (seed * 89) % 200 + 40)
    half = size // 2
    rw = size // 5 + (seed % 5) * size // 40          # demi-largeur
    top = size // 6 + (seed % 3) * size // 20
    bottom = size - size // 8

    px = bytearray()
    for y in range(size):
        for x in range(size):
            inside = (abs(x - half) <= rw and top <= y <= bottom)
            r, g, b = color if inside else background
            px += bytes((r, g, b, 255))
    return bytes(px)


class RenderingLibrary:
    @staticmethod
    def create_render_target2_d(world, width=256, height=256, fmt=None):
        if world is None:
            raise RuntimeError("aucun monde")
        return TextureRenderTarget2D(width, height, fmt)

    @staticmethod
    def export_render_target(world, target, directory, name):
        if target is None:
            raise RuntimeError("aucune cible de rendu")
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, name)
        stem = os.path.splitext(name)[0]
        figure = stem.split("@")[0]
        data = _silhouette(figure, target.width, BACKGROUND[0])
        with open(path, "wb") as fh:
            fh.write(_png(target.width, target.height, data))
        EXPORTED.append(path)
        return True


# Couleur de fond des captures du doublon. Le script d'export la fixe via le
# matériau du fond ; ici on la retient simplement pour peindre l'image.
BACKGROUND = [(255, 0, 255)]


# --- Bibliothèques -----------------------------------------------------------


class SystemLibrary:
    @staticmethod
    def get_engine_version():
        return "5.4.4-0+++UE5+Release-5.4 (doublon de test)"

    @staticmethod
    def get_game_name():
        return "PixelDefense"


class Paths:
    @staticmethod
    def get_project_file_path():
        return "D:/Projets/PixelDefense/PixelDefense.uproject"

    @staticmethod
    def project_dir():
        return "D:/Projets/PixelDefense/"

    @staticmethod
    def project_content_dir():
        return "D:/Projets/PixelDefense/Content/"

    @staticmethod
    def project_saved_dir():
        return os.path.join(os.environ.get("FAKE_UNREAL_SAVED", "/tmp"), "Saved")

    @staticmethod
    def engine_dir():
        return "D:/UE_5.4/Engine/"


class EditorAssetLibrary:
    @staticmethod
    def load_asset(path):
        return load_asset(path)

    @staticmethod
    def list_assets(directory, recursive=True, include_folder=False):
        return [p for p in PACK if p.startswith(directory)]


class AutomationLibrary:
    pass


class EditorLevelLibrary:
    """Voie héritée : présente, mais les sous-systèmes passent avant."""

    @staticmethod
    def new_level(path):
        CURRENT_LEVEL[0] = path
        WORLD.clear()
        return True

    @staticmethod
    def save_current_level():
        return True

    @staticmethod
    def spawn_actor_from_class(cls, location, rotation):
        return _spawn(cls, location, rotation)


class LevelEditorSubsystem:
    def new_level(self, path):
        CURRENT_LEVEL[0] = path
        WORLD.clear()
        return True

    def save_current_level(self):
        if CURRENT_LEVEL[0] is None:
            raise RuntimeError("aucun niveau ouvert")
        return True


class EditorActorSubsystem:
    def spawn_actor_from_class(self, cls, location, rotation):
        return _spawn(cls, location, rotation)

    def destroy_actor(self, actor):
        actor.destroyed = True
        if actor in WORLD:
            WORLD.remove(actor)
        return True


class UnrealEditorSubsystem:
    def get_editor_world(self):
        return "FakeWorld"


_SUBSYSTEMS = {}


def get_editor_subsystem(cls):
    if cls not in (LevelEditorSubsystem, EditorActorSubsystem, UnrealEditorSubsystem):
        return None
    return _SUBSYSTEMS.setdefault(cls, cls())


# Les cubes de base du moteur : un chemin inconnu doit échouer, comme chez Epic.
_ASSETS = {
    "/Engine/BasicShapes/Cube.Cube",
    "/Engine/BasicShapes/Sphere.Sphere",
    "/Engine/BasicShapes/Plane.Plane",
}

# Pack factice : de quoi jouer l'inventaire et l'export sans moteur. Les noms
# reprennent la convention d'un pack du commerce.
PACK = ["/Game/Pack/Meshes/SM_" + n for n in (
    "Goblin", "Wolf", "Orc", "Harpy", "Troll",
    "ArcherTower_01", "ArcherTower_02", "ArcherTower_03",
    "Bombard_01", "Bombard_02", "Bombard_03",
    "FrostTower_01", "FrostTower_02", "FrostTower_03",
    "MageTower_01", "MageTower_02", "MageTower_03",
    "Tree", "Rock", "Castle", "CaveEntrance",
)]

_MATERIALS = {"/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"}


class Material:
    def __init__(self, path):
        self.path = path


def load_asset(path):
    if path in _MATERIALS:
        return Material(path)
    if path in _ASSETS or path in PACK:
        return StaticMesh(path)
    return None


def _spawn(cls, location, rotation):
    if cls is None:
        raise TypeError("classe d'acteur absente")
    actor = cls(location, rotation)
    WORLD.append(actor)
    return actor
