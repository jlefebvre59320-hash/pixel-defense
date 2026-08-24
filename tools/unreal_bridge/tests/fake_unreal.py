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

WORLD = []          # tous les acteurs placés, pour les vérifications
CURRENT_LEVEL = [None]


def reset():
    WORLD.clear()
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


class StaticMesh:
    def __init__(self, path):
        self.path = path

    def __repr__(self):
        return "StaticMesh(%s)" % self.path


class StaticMeshComponent:
    def __init__(self):
        self.mobility = ComponentMobility.STATIC
        self.static_mesh = None

    def set_mobility(self, mobility):
        self.mobility = mobility

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

    def set_actor_label(self, label):
        self.label = label

    def set_actor_scale3d(self, scale):
        self.scale = scale

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
    def engine_dir():
        return "D:/UE_5.4/Engine/"


class EditorAssetLibrary:
    @staticmethod
    def load_asset(path):
        return load_asset(path)


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


_SUBSYSTEMS = {}


def get_editor_subsystem(cls):
    if cls not in (LevelEditorSubsystem, EditorActorSubsystem):
        return None
    return _SUBSYSTEMS.setdefault(cls, cls())


# Les cubes de base du moteur : un chemin inconnu doit échouer, comme chez Epic.
_ASSETS = {
    "/Engine/BasicShapes/Cube.Cube",
    "/Engine/BasicShapes/Sphere.Sphere",
    "/Engine/BasicShapes/Plane.Plane",
}


def load_asset(path):
    if path not in _ASSETS:
        return None
    return StaticMesh(path)


def _spawn(cls, location, rotation):
    if cls is None:
        raise TypeError("classe d'acteur absente")
    actor = cls(location, rotation)
    WORLD.append(actor)
    return actor
