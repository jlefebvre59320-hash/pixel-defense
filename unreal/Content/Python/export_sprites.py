"""Capture des sprites depuis un pack — s'exécute *dans* l'éditeur Unreal.

    python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/export_sprites.json

Place chaque maillage demandé devant une caméra orthographique inclinée, le
photographie sur un fond plat, et écrit un PNG par figure. L'atlas, le
détourage et le rognage viennent ensuite, hors du moteur :

    node tools/import-textures.mjs <dossier de captures> --name mon-pack

Pourquoi un fond plat plutôt que de la transparence : exporter un alpha propre
depuis un SceneCapture demande des réglages qui changent d'une version d'Unreal
à l'autre. Un fond franc se détoure de façon sûre et *vérifiable* côté Node,
là où le résultat peut être testé. Le moteur fait ce qu'il sait faire — de
belles images — et rien de plus.

Le cadrage est le même pour toutes les figures : une boîte de `frame_cm`
centimètres de côté. C'est ce qui garde les tailles relatives — un troll sort
plus gros qu'un gobelin sans réglage supplémentaire, et l'import n'a rien à
deviner.

AVERTISSEMENT — ce script n'a jamais tourné dans un vrai éditeur : Unreal n'est
pas installable là où il a été écrit. Il est vérifié contre un doublon qui
rejoue la forme de l'API. Chaque opération est isolée : une API absente donne
un avertissement nommé, avec l'étape exacte, plutôt qu'un script mort à
mi-chemin. Les avertissements sont récapitulés à la fin.
"""

import json
import math
import os

try:
    import unreal
except ImportError:
    unreal = None

DEFAULTS = {
    # Où chercher les maillages quand une figure est décrite par mots-clés
    # plutôt que par un chemin. C'est là qu'atterrissent les packs importés
    # par import_kaykit_cc0.py.
    "search_paths": ["/Game/ThirdParty", "/Game/Art"],
    "out_dir": "",                    # vide = <projet>/Saved/Sprites
    "size": 512,                      # côté du PNG, en pixels
    "frame_cm": 300.0,                # côté de la boîte de cadrage, en centimètres
    "pitch": -32.0,                   # inclinaison : ce qui fait la vue 3/4
    "yaw": 45.0,                      # azimut
    "distance_cm": 1200.0,            # recul de la caméra (orthographique : sans effet sur la taille)
    "background": [1.0, 0.0, 1.0],    # magenta, la couleur que l'import détourera
    "backdrop": True,
    "backdrop_mesh": "/Engine/BasicShapes/Plane.Plane",
    "backdrop_material": "/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial",
    "backdrop_color_param": "Color",
    "light": True,
    "figures": [],
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
    try:
        return fn(*args, **kwargs)
    except Exception as err:
        _warn("%s : %s" % (label, err))
        return None


def _enum(name, member):
    holder = getattr(unreal, name, None)
    return getattr(holder, member, None) if holder else None


def _subsystem(name):
    getter = getattr(unreal, "get_editor_subsystem", None)
    cls = getattr(unreal, name, None)
    if getter is None or cls is None:
        return None
    try:
        return getter(cls)
    except Exception:
        return None


def editor_world():
    sub = _subsystem("UnrealEditorSubsystem")
    if sub is not None and hasattr(sub, "get_editor_world"):
        return _safe("monde de l'éditeur", sub.get_editor_world)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "get_editor_world"):
        return _safe("monde de l'éditeur", lib.get_editor_world)
    _warn("monde de l'éditeur introuvable : aucune capture possible.")
    return None


def spawn(cls, location, rotation=None):
    if cls is None:
        _warn("classe d'acteur absente de cette version d'Unreal.")
        return None
    rotation = rotation or unreal.Rotator(0.0, 0.0, 0.0)
    sub = _subsystem("EditorActorSubsystem")
    if sub is not None and hasattr(sub, "spawn_actor_from_class"):
        return _safe("placement d'acteur", sub.spawn_actor_from_class, cls, location, rotation)
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "spawn_actor_from_class"):
        return _safe("placement d'acteur", lib.spawn_actor_from_class, cls, location, rotation)
    _warn("aucune API de placement disponible.")
    return None


def destroy(actor):
    if actor is None:
        return
    sub = _subsystem("EditorActorSubsystem")
    if sub is not None and hasattr(sub, "destroy_actor"):
        _safe("retrait d'acteur", sub.destroy_actor, actor)
    elif hasattr(actor, "destroy_actor"):
        _safe("retrait d'acteur", actor.destroy_actor)


def forward(pitch, yaw):
    """Vecteur de visée, depuis inclinaison et azimut, en degrés."""
    p = math.radians(pitch)
    y = math.radians(yaw)
    return (math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p))


# --- Le plateau de prise de vue ---------------------------------------------


def build_stage(p, world):
    """Caméra, lumière et fond : montés une fois, réutilisés pour chaque figure.

    Tout est posé loin de l'origine pour ne pas se mélanger au niveau ouvert,
    et la capture n'est autorisée à voir que ces acteurs-là — sans quoi le
    décor du projet passerait derrière chaque sprite.
    """
    stage = {"actors": [], "component": None, "target": None, "origin": None}

    origin = unreal.Vector(100000.0, 100000.0, 100000.0)
    stage["origin"] = origin

    size = int(p["size"])
    target = _safe("cible de rendu", unreal.RenderingLibrary.create_render_target2_d,
                   world, size, size, _enum("TextureRenderTargetFormat", "RTF_RGBA8"))
    if target is None:
        _warn("pas de cible de rendu : rien ne pourra être écrit.")
        return stage
    stage["target"] = target

    fx, fy, fz = forward(p["pitch"], p["yaw"])
    d = float(p["distance_cm"])
    cam_pos = unreal.Vector(origin.x - fx * d, origin.y - fy * d, origin.z - fz * d)
    cam_rot = unreal.Rotator(0.0, float(p["pitch"]), float(p["yaw"]))

    capture = spawn(getattr(unreal, "SceneCapture2D", None), cam_pos, cam_rot)
    if capture is None:
        _warn("SceneCapture2D indisponible : rien ne pourra être écrit.")
        return stage
    stage["actors"].append(capture)

    comp = _safe("composant de capture", capture.get_editor_property, "capture_component2d")
    if comp is None:
        _warn("composant de capture introuvable.")
        return stage
    stage["component"] = comp

    _safe("cible de la capture", comp.set_editor_property, "texture_target", target)
    _safe("projection orthographique", comp.set_editor_property,
          "projection_type", _enum("CameraProjectionMode", "ORTHOGRAPHIC"))
    _safe("largeur de cadrage", comp.set_editor_property, "ortho_width", float(p["frame_cm"]))
    _safe("source de capture", comp.set_editor_property,
          "capture_source", _enum("SceneCaptureSource", "SCS_FINAL_COLOR_LDR"))
    _safe("capture à la demande", comp.set_editor_property, "capture_every_frame", False)

    if p["light"]:
        sun = spawn(getattr(unreal, "DirectionalLight", None),
                    unreal.Vector(origin.x, origin.y, origin.z + 500.0),
                    unreal.Rotator(0.0, -45.0, float(p["yaw"]) + 30.0))
        if sun is not None:
            stage["actors"].append(sun)
        sky = spawn(getattr(unreal, "SkyLight", None), origin)
        if sky is not None:
            stage["actors"].append(sky)

    if p["backdrop"]:
        backdrop = make_backdrop(p, origin, (fx, fy, fz))
        if backdrop is not None:
            stage["actors"].append(backdrop)

    return stage


def make_backdrop(p, origin, fwd):
    """Un plan derrière le sujet, peint de la couleur à détourer.

    Le plan du moteur regarde vers le haut ; on le bascule d'un quart de tour
    pour qu'il fasse face à la caméra. S'il n'accepte pas la couleur, on
    prévient : le pack sortira sur fond gris, et il faudra régler `--key` en
    conséquence à l'import — ce n'est pas bloquant.
    """
    mesh = _safe("plan de fond", unreal.load_asset, p["backdrop_mesh"])
    if mesh is None:
        _warn("plan de fond introuvable (%s) : capture sans fond." % p["backdrop_mesh"])
        return None

    fx, fy, fz = fwd
    back = float(p["frame_cm"]) * 1.5
    pos = unreal.Vector(origin.x + fx * back, origin.y + fy * back, origin.z + fz * back)
    rot = unreal.Rotator(0.0, float(p["pitch"]) + 90.0, float(p["yaw"]))

    actor = spawn(getattr(unreal, "StaticMeshActor", None), pos, rot)
    if actor is None:
        return None
    _safe("nom du fond", actor.set_actor_label, "SpriteBackdrop")

    comp = _safe("composant du fond", actor.get_editor_property, "static_mesh_component")
    if comp is None:
        return actor
    _safe("mobilité du fond", comp.set_mobility, _enum("ComponentMobility", "MOVABLE"))
    _safe("maillage du fond", comp.set_static_mesh, mesh)

    # Le plan du moteur fait 100 cm de côté.
    span = float(p["frame_cm"]) * 4.0 / 100.0
    _safe("échelle du fond", actor.set_actor_scale3d, unreal.Vector(span, span, 1.0))

    base = _safe("matériau du fond", unreal.load_asset, p["backdrop_material"])
    if base is None:
        _warn("matériau de fond introuvable : le fond gardera sa couleur d'origine.")
        return actor

    mid = _safe("instance dynamique", comp.create_dynamic_material_instance, 0, base)
    if mid is None:
        _warn("couleur du fond non applicable : réglez --key sur la couleur obtenue.")
        return actor

    bg = p["background"]
    color = unreal.LinearColor(float(bg[0]), float(bg[1]), float(bg[2]), 1.0)
    if _safe("couleur du fond", mid.set_vector_parameter_value,
             p["backdrop_color_param"], color) is None:
        _warn("le matériau de fond n'a pas de paramètre « %s » : "
              "réglez --key sur la couleur obtenue." % p["backdrop_color_param"])
    return actor


# --- Trouver le bon maillage dans les packs ----------------------------------

_CATALOGUE = {"paths": None}

# Maillage déjà retenu -> figure qui l'a pris. Sert à écarter *doucement* un
# maillage d'une autre figure : deux tours différentes qui se retrouvent avec
# le même modèle est le défaut le plus facile à ne pas voir, et le plus laid
# une fois en jeu. La pénalité reste faible pour qu'un pack pauvre puisse
# quand même réutiliser un modèle plutôt que de ne rien rendre.
_TAKEN = {}


def catalogue(p):
    """Tous les maillages sous les dossiers de recherche, une fois pour toutes.

    Le registre d'assets d'abord — c'est lui qui connaît les classes sans
    charger les objets — et EditorAssetLibrary en repli.
    """
    if _CATALOGUE["paths"] is not None:
        return _CATALOGUE["paths"]

    found = []
    helpers = getattr(unreal, "AssetRegistryHelpers", None)
    registry = _safe("registre des assets", helpers.get_asset_registry) if helpers else None

    for root in p["search_paths"]:
        if registry is not None and hasattr(registry, "get_assets_by_path"):
            for data in _safe("parcours de %s" % root,
                              registry.get_assets_by_path, root, True, False) or []:
                cls = getattr(data, "asset_class_path", None)
                name = str(getattr(cls, "asset_name", "") or getattr(data, "asset_class", ""))
                if name in ("StaticMesh", "SkeletalMesh"):
                    found.append(str(getattr(data, "package_name", "")))
            continue

        lib = getattr(unreal, "EditorAssetLibrary", None)
        if lib is not None and hasattr(lib, "list_assets"):
            found.extend(str(r) for r in
                         (_safe("parcours de %s" % root, lib.list_assets, root, True, False) or []))

    _CATALOGUE["paths"] = sorted(set(found))
    return _CATALOGUE["paths"]


def best_match(p, words, avoid=(), figure=None):
    """Le maillage dont le nom colle le mieux aux mots-clés.

    Les chemins exacts d'un pack ne se devinent pas depuis l'extérieur — ils
    dépendent de l'arborescence du pack et de sa version. Une figure se décrit
    donc par ce qu'on cherche (« building », « tower »), et c'est le moteur,
    qui a les packs sous la main, qui tranche.

    À score égal, **le nom le plus court gagne** : sans ce départage,
    « building_tower » et « building_mage_tower » valaient pareil pour
    ["building", "tower"], et deux tours différentes du jeu se retrouvaient
    avec le même maillage. Un nom court porte moins de mots non demandés,
    donc colle mieux.
    """
    best, best_score, best_len = None, 0, 0
    for path in catalogue(p):
        low = path.lower()
        leaf = low.rsplit("/", 1)[-1]

        score = 0
        for w in words:
            w = w.lower()
            if w in leaf:
                score += 2          # dans le nom du fichier : le signal fort
            elif w in low:
                score += 1          # ailleurs dans le chemin
        for w in avoid:
            if w.lower() in leaf:
                score -= 3          # écarter explicitement
        holder = _TAKEN.get(path)
        if holder is not None and holder != figure:
            score -= 1              # déjà pris par une autre figure

        if score <= 0:
            continue
        if score > best_score or (score == best_score and len(leaf) < best_len):
            best, best_score, best_len = path, score, len(leaf)
    return best, best_score


def resolve(p, fig):
    """Chemin du maillage d'une figure : explicite, ou trouvé par mots-clés."""
    if fig.get("asset"):
        return fig["asset"], "chemin donné"
    words = fig.get("match")
    if not words:
        return None, "ni « asset » ni « match »"
    path, score = best_match(p, words, fig.get("avoid", ()), fig.get("name"))
    if path is None:
        return None, "aucun maillage ne correspond à %s" % (", ".join(words))
    _TAKEN.setdefault(path, fig.get("name"))
    return path, "trouvé (%d pts) : %s" % (score, path)


def actor_class_for(asset):
    """Les décors sont statiques, les personnages ont un squelette."""
    if type(asset).__name__ == "SkeletalMesh":
        return getattr(unreal, "SkeletalMeshActor", None), "skeletal_mesh_component"
    return getattr(unreal, "StaticMeshActor", None), "static_mesh_component"


# --- Une figure --------------------------------------------------------------


def capture_figure(p, world, stage, fig, out_dir):
    """Place le maillage, cadre, photographie, retire. Renvoie le nom du PNG."""
    name = fig.get("name") or "sans-nom"
    frame = fig.get("frame", 0)

    ref, how = resolve(p, fig)
    if ref is None:
        _warn("%s : %s" % (name, how))
        return None, how

    mesh = _safe("chargement de %s" % ref, unreal.load_asset, ref)
    if mesh is None:
        _warn("%s : maillage introuvable (%s)" % (name, ref))
        return None, "introuvable : %s" % ref

    cls, comp_prop = actor_class_for(mesh)
    origin = stage["origin"]
    actor = spawn(cls, origin, unreal.Rotator(0.0, 0.0, float(fig.get("yaw", 0.0))))
    if actor is None:
        return None, "placement impossible"

    try:
        _safe("nom du sujet", actor.set_actor_label, "Sprite_%s_%s" % (name, frame))
        comp = _safe("composant du sujet", actor.get_editor_property, comp_prop)
        if comp is not None:
            _safe("mobilité du sujet", comp.set_mobility, _enum("ComponentMobility", "MOVABLE"))
            setter = getattr(comp, "set_static_mesh", None) or getattr(comp, "set_skeletal_mesh", None)
            if setter is None:
                _warn("%s : ce composant n'accepte pas de maillage." % name)
            else:
                _safe("maillage du sujet", setter, mesh)

        scale = float(fig.get("scale", 1.0))
        _safe("échelle du sujet", actor.set_actor_scale3d,
              unreal.Vector(scale, scale, scale))

        # Recentrer : la caméra vise l'origine du plateau, pas le pivot du
        # maillage. Sans ce recalage, un modèle dont le pivot est aux pieds
        # sortirait à moitié hors du cadre.
        bounds = _safe("dimensions du sujet", actor.get_actor_bounds, False)
        if bounds is not None:
            try:
                center, _extent = bounds
                _safe("recentrage", actor.set_actor_location,
                      unreal.Vector(origin.x * 2 - center.x,
                                    origin.y * 2 - center.y,
                                    origin.z * 2 - center.z),
                      False, False)
            except (TypeError, ValueError):
                pass

        comp_cap = stage["component"]
        if comp_cap is None:
            return None, "pas de composant de capture"

        # La capture ne voit que le plateau : le niveau ouvert n'a pas à
        # apparaître derrière les sprites.
        visible = [actor] + [a for a in stage["actors"]
                             if type(a).__name__ == "StaticMeshActor"]
        _safe("liste de visibilité", comp_cap.set_editor_property,
              "primitive_render_mode",
              _enum("SceneCapturePrimitiveRenderMode", "USE_SHOW_ONLY_LIST"))
        _safe("acteurs visibles", comp_cap.set_editor_property, "show_only_actors", visible)

        if _safe("prise de vue", comp_cap.capture_scene) is None:
            return None, "prise de vue refusée"

        filename = "%s@%s" % (name, frame)
        if _safe("écriture du PNG", unreal.RenderingLibrary.export_render_target,
                 world, stage["target"], out_dir, filename + ".png") is None:
            return None, "écriture refusée"
        return filename + ".png", how
    finally:
        destroy(actor)


def main():
    if unreal is None:
        print("module `unreal` absent : ce script doit tourner dans l'éditeur.")
        return 1

    p = _params()
    figures = p["figures"]
    if not figures:
        print("Aucune figure demandée : rien à faire.")
        print("Renseignez « figures » dans le travail — une entrée par sprite.")
        return 1

    out_dir = p["out_dir"]
    if not out_dir:
        project = _safe("dossier du projet", unreal.Paths.project_saved_dir) or ""
        out_dir = os.path.join(project, "Sprites")

    print("--- Capture de sprites ---")
    print("Sortie   : %s" % out_dir)
    print("Recherche: %s" % ", ".join(p["search_paths"]))
    print("Cadrage  : %g cm, %d px, vue %g° / %g°"
          % (p["frame_cm"], p["size"], p["pitch"], p["yaw"]))
    print("Figures  : %d" % len(figures))
    print("")

    world = editor_world()
    if world is None:
        return 1

    stage = build_stage(p, world)
    written = []
    try:
        for fig in figures:
            name = fig.get("name", "?")
            out, how = capture_figure(p, world, stage, fig, out_dir)
            print("  %-22s %-14s %s" % (name, out or "— non capturé", how))
            if out:
                written.append(out)
    finally:
        for actor in stage["actors"]:
            destroy(actor)

    print("")
    print("%d image(s) écrite(s) sur %d." % (len(written), len(figures)))
    if WARNINGS:
        print("%d avertissement(s)." % len(WARNINGS))
    print("")
    print("Étape suivante, hors du moteur :")
    print("  node tools/import-textures.mjs %s --name mon-pack" % out_dir)
    print("EXPORT_SPRITES_JSON " + json.dumps(
        {"out_dir": out_dir, "written": written, "warnings": WARNINGS},
        ensure_ascii=False))
    return 1 if WARNINGS else 0


main()
