"""Accorde le rendu Unreal à celui de la version web — s'exécute dans l'éditeur.

    python3 tools/unreal_bridge/run_local.py tools/unreal_bridge/jobs/living_valley_pass.json

La version web (`js/world.js`) tient sur un principe : **une seule source de
vérité pour la lumière**. Le soleil est déclaré une fois ; ombres portées,
reflets de l'eau et ombres de nuages en découlent tous. Cette passe applique le
même principe ici, et comble les deux écarts qui restaient.

Écart 1 — l'eau ne pouvait rien refléter. `M_Water_ValleyV2` est en mode
**non éclairé** : un matériau unlit ignore par construction les réflexions. On
en construit un éclairé, lisse et spéculaire, et on pose une sonde de réflexion
au-dessus de la vallée pour qu'il ait quelque chose à réfléchir.

Écart 2 — les nuages ne portaient pas d'ombre au sol. Le projet rend sur le
**chemin mobile** (`r.Mobile.ShadingPath=1` dans DefaultEngine.ini), où les
ombres de nuages volumétriques n'existent pas. On fabrique donc le matériau
d'ombre que `APDEnvironment` (C++) pose au sol sous chaque nuage, comme la
version web le fait sur son canvas. Cela marche sur n'importe quel pipeline.

Ce que cette passe ne fait *pas* : poser une réflexion planaire, le vrai
miroir. Elle demande `r.AllowGlobalClipPlane`, dont le coût sur cible mobile
n'est pas anodin. C'est un arbitrage qui vous revient, pas à un script.

AVERTISSEMENT — comme tout le Python de ce dossier, ce fichier n'a jamais
tourné dans un vrai éditeur : Unreal n'est pas installable là où il est écrit.
Chaque opération est isolée et nommée : ce qui manque est dit à l'étape près.
"""

import json

try:
    import unreal
except ImportError:
    unreal = None

# --- Direction artistique, partagée avec js/world.js -------------------------
# Le soleil vient du haut à gauche, chaud ; l'ombre est froide. Changer ces
# valeurs ici sans les changer là-bas fait diverger les deux rendus.
SUN_COLOR = (255, 236, 211)
SUN_INTENSITY = 3.55
WARM = (1.00, 0.84, 0.55)
COOL = (0.24, 0.35, 0.59)

WATER_MATERIAL = "M_Water_Reflective"
SHADOW_MATERIAL = "M_CloudShadow"
MATERIAL_DIR = "/Game/Art/Materials"

WARNINGS = []
DONE = []


def _warn(message):
    WARNINGS.append(message)
    print("  ! %s" % message)


def _safe(label, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as err:
        _warn("%s : %s" % (label, err))
        return None


def safe_set(obj, name, value):
    """Pose une propriété si elle existe dans cette version du moteur."""
    if obj is None:
        return False
    try:
        obj.set_editor_property(name, value)
        return True
    except Exception as err:
        _warn("propriété « %s » : %s" % (name, err))
        return False


def lin(r, g, b, a=1.0):
    """unreal.LinearColor, mais sans faire tomber le script s'il manque.

    Construire une couleur est un appel au moteur comme un autre. Le banc
    « moteur hostile » a montré que ces constructions, passées en argument à
    safe_set, échappaient à la protection et tuaient la passe avant le premier
    avertissement.
    """
    return _safe("unreal.LinearColor", unreal.LinearColor, r, g, b, a)


def col(r, g, b):
    return _safe("unreal.Color", unreal.Color, r, g, b)


def vec(x=0.0, y=0.0, z=0.0):
    return _safe("unreal.Vector", unreal.Vector, x, y, z)


def rot(roll=0.0, pitch=0.0, yaw=0.0):
    return _safe("unreal.Rotator", unreal.Rotator, roll, pitch, yaw)


def vec4(x, y, z, w=1.0):
    return _safe("unreal.Vector4", unreal.Vector4, x, y, z, w)


def subsystem(name):
    getter = getattr(unreal, "get_editor_subsystem", None)
    cls = getattr(unreal, name, None)
    if getter is None or cls is None:
        return None
    try:
        return getter(cls)
    except Exception:
        return None


# --- Matériaux ---------------------------------------------------------------


def material(name):
    """Charge le matériau, ou le crée. Renvoie (matériau, vient d'être créé)."""
    path = "%s/%s" % (MATERIAL_DIR, name)
    existing = _safe("chargement de %s" % name, unreal.load_asset, path)
    if existing is not None:
        return existing, False

    helpers = getattr(unreal, "AssetToolsHelpers", None)
    if helpers is None:
        _warn("AssetToolsHelpers absent : impossible de créer %s." % name)
        return None, False

    # `helpers.get_asset_tools()` et `MaterialFactoryNew()` sont des appels au
    # moteur : écrits en argument, ils s'exécutaient *avant* d'entrer dans
    # _safe, et une version sans eux tuait la passe.
    tools = _safe("outils d'asset", helpers.get_asset_tools)
    factory = _safe("fabrique de matériau", getattr(unreal, "MaterialFactoryNew", None))
    if tools is None or factory is None:
        return None, False

    created = _safe("création de %s" % name, tools.create_asset,
                    name, MATERIAL_DIR, unreal.Material, factory)
    return created, created is not None


def expression(mat, cls, x, y):
    return _safe("nœud de matériau", unreal.MaterialEditingLibrary.create_material_expression,
                 mat, cls, x, y)


def plug(node, prop):
    return _safe("branchement", unreal.MaterialEditingLibrary.connect_material_property,
                 node, "", prop)


def make_cloud_shadow():
    """Un voile sombre, translucide, sans éclairage : l'ombre d'un nuage.

    Non éclairé volontairement — une ombre ne reçoit pas de lumière, et sur le
    chemin mobile c'est aussi le moins cher des matériaux translucides.
    """
    mat, created = material(SHADOW_MATERIAL)
    if mat is None:
        return None
    if not created:
        DONE.append("%s : déjà présent" % SHADOW_MATERIAL)
        return mat

    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    safe_set(mat, "two_sided", True)

    color = expression(mat, unreal.MaterialExpressionConstant3Vector, -520, 0)
    safe_set(color, "constant", lin(0.05, 0.09, 0.05))
    opacity = expression(mat, unreal.MaterialExpressionConstant, -520, 200)
    safe_set(opacity, "r", 0.22)

    plug(color, unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    plug(opacity, unreal.MaterialProperty.MP_OPACITY)

    _safe("compilation", unreal.MaterialEditingLibrary.recompile_material, mat)
    _safe("enregistrement", unreal.EditorAssetLibrary.save_loaded_asset, mat)
    DONE.append("%s : créé" % SHADOW_MATERIAL)
    return mat


def make_reflective_water():
    """Une eau **éclairée**, lisse et spéculaire : elle réfléchit le ciel.

    L'ancienne, non éclairée, ne le pouvait pas — un matériau unlit ignore les
    réflexions par construction. Opaque plutôt que translucide : sur le chemin
    mobile, la translucidité perd les réflexions, et on préfère une eau qui
    reflète à une eau dans laquelle on voit le fond.
    """
    mat, created = material(WATER_MATERIAL)
    if mat is None:
        return None
    if not created:
        DONE.append("%s : déjà présent" % WATER_MATERIAL)
        return mat

    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_OPAQUE)

    base = expression(mat, unreal.MaterialExpressionConstant3Vector, -620, -120)
    safe_set(base, "constant", lin(0.012, 0.055, 0.075))
    rough = expression(mat, unreal.MaterialExpressionConstant, -620, 90)
    safe_set(rough, "r", 0.045)
    spec = expression(mat, unreal.MaterialExpressionConstant, -620, 200)
    safe_set(spec, "r", 1.0)

    plug(base, unreal.MaterialProperty.MP_BASE_COLOR)
    plug(rough, unreal.MaterialProperty.MP_ROUGHNESS)
    plug(spec, unreal.MaterialProperty.MP_SPECULAR)

    _safe("compilation", unreal.MaterialEditingLibrary.recompile_material, mat)
    _safe("enregistrement", unreal.EditorAssetLibrary.save_loaded_asset, mat)
    DONE.append("%s : créé" % WATER_MATERIAL)
    return mat


# --- Acteurs du niveau -------------------------------------------------------


def all_actors():
    sub = subsystem("EditorActorSubsystem")
    if sub is not None and hasattr(sub, "get_all_level_actors"):
        return _safe("acteurs du niveau", sub.get_all_level_actors) or []
    lib = getattr(unreal, "EditorLevelLibrary", None)
    if lib is not None and hasattr(lib, "get_all_level_actors"):
        return _safe("acteurs du niveau", lib.get_all_level_actors) or []
    _warn("impossible de lister les acteurs du niveau.")
    return []


def find_actor(actors, cls_name, label=None):
    cls = getattr(unreal, cls_name, None)
    for actor in actors:
        if cls is not None and not isinstance(actor, cls):
            continue
        if label and label not in str(_safe("nom", actor.get_actor_label) or ""):
            continue
        return actor
    return None


def tune_sun(actors):
    """Le soleil reste celui du projet ; on ne fait que l'accorder.

    Les réglages d'ombre de nuages sont tentés quand même : ils ne coûtent rien
    s'ils n'existent pas sur ce pipeline, et ils serviront le jour où le projet
    quittera le chemin mobile.
    """
    sun = find_actor(actors, "DirectionalLight")
    if sun is None:
        _warn("aucune lumière directionnelle : rien à accorder.")
        return None

    comp = _safe("composant du soleil", sun.get_component_by_class,
                 unreal.DirectionalLightComponent)
    if comp is None:
        return sun

    safe_set(comp, "intensity", SUN_INTENSITY)
    safe_set(comp, "light_color", col(*SUN_COLOR))
    safe_set(comp, "cast_shadows", True)
    safe_set(comp, "contact_shadow_length", 0.06)
    safe_set(comp, "cast_cloud_shadows", True)
    safe_set(comp, "cloud_shadow_strength", 1.0)
    safe_set(comp, "cloud_shadow_on_surface_strength", 1.0)
    DONE.append("soleil accordé (%s, intensité %.2f)" % (str(SUN_COLOR), SUN_INTENSITY))
    return sun


def place_reflection_probe(actors):
    """Sans sonde, une surface lisse n'a rien à réfléchir sur le chemin mobile."""
    if find_actor(actors, "SphereReflectionCapture") is not None:
        DONE.append("sonde de réflexion : déjà présente")
        return
    sub = subsystem("EditorActorSubsystem")
    cls = getattr(unreal, "SphereReflectionCapture", None)
    if sub is None or cls is None:
        _warn("SphereReflectionCapture indisponible.")
        return
    probe = _safe("sonde de réflexion", sub.spawn_actor_from_class, cls,
                  vec(0, 0, 600), rot(0, 0, 0))
    if probe is None:
        return
    _safe("nom de la sonde", probe.set_actor_label, "PD_ValleyReflection")
    comp = _safe("composant de la sonde", probe.get_component_by_class,
                 unreal.SphereReflectionCaptureComponent)
    safe_set(comp, "influence_radius", 6000.0)
    safe_set(comp, "brightness", 1.0)
    DONE.append("sonde de réflexion posée")


def repaint_water(actors, water_mat):
    """Remplace l'ancienne eau non éclairée partout où elle est posée."""
    if water_mat is None:
        return 0
    painted = 0
    for actor in actors:
        comps = _safe("composants", actor.get_components_by_class,
                      unreal.StaticMeshComponent) or []
        for comp in comps:
            names = []
            for slot in range(3):
                mat = _safe("matériau", comp.get_material, slot)
                names.append(str(mat.get_name()) if mat else "")
            if not any("Water" in n for n in names):
                continue
            for slot, name in enumerate(names):
                if "Water" in name:
                    if _safe("peinture de l'eau", comp.set_material, slot, water_mat) is not None:
                        painted += 1
    if painted:
        DONE.append("eau repeinte sur %d emplacement(s)" % painted)
    else:
        _warn("aucune surface d'eau trouvée : le matériau est prêt mais non posé.")
    return painted


def grade(actors):
    """Étalonnage : hautes lumières chaudes, ombres froides — les deux teintes
    que la version web pose en voile sur son canvas."""
    pp = find_actor(actors, "PostProcessVolume")
    if pp is None:
        _warn("aucun volume de post-traitement : étalonnage non appliqué.")
        return
    settings = _safe("réglages de post-traitement", pp.get_editor_property, "settings")
    if settings is None:
        return
    safe_set(settings, "override_color_gain_highlights", True)
    safe_set(settings, "color_gain_highlights", vec4(*WARM))
    safe_set(settings, "override_color_gain_shadows", True)
    safe_set(settings, "color_gain_shadows", vec4(*COOL))
    _safe("application", pp.set_editor_property, "settings", settings)
    DONE.append("étalonnage chaud/froid appliqué")


def main():
    if unreal is None:
        print("module `unreal` absent : ce script doit tourner dans l'éditeur.")
        return 1

    print("--- Vallée vivante : accord avec le rendu web ---")
    print("")

    shadow = make_cloud_shadow()
    water = make_reflective_water()

    actors = all_actors()
    print("%d acteur(s) dans le niveau." % len(actors))
    tune_sun(actors)
    place_reflection_probe(actors)
    repaint_water(actors, water)
    grade(actors)

    sub = subsystem("LevelEditorSubsystem")
    if sub is not None and hasattr(sub, "save_current_level"):
        _safe("enregistrement du niveau", sub.save_current_level)

    print("")
    for line in DONE:
        print("  %s" % line)
    print("")
    if WARNINGS:
        print("%d avertissement(s)." % len(WARNINGS))
    print("")
    print("Le matériau %s est celui que APDEnvironment (C++) pose au sol sous" % SHADOW_MATERIAL)
    print("chaque nuage. Recompilez le module pour que les ombres apparaissent :")
    print("  bash tools/unreal/build_macos.sh")
    print("LIVING_VALLEY_JSON " + json.dumps(
        {"done": DONE, "warnings": WARNINGS,
         "cloud_shadow_material": shadow is not None,
         "water_material": water is not None},
        ensure_ascii=False))
    return 1 if WARNINGS else 0


main()
