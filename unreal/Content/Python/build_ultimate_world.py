"""Build the clean Kingdom Valley map and production materials."""
from __future__ import annotations
import json
import os
import unreal

MAP_PATH = "/Game/Maps/KingdomValley"
MATERIAL_PATH = "/Game/Art/Production/Materials"


def safe_set(obj, name, value):
    try:
        obj.set_editor_property(name, value)
        return True
    except Exception as exc:
        unreal.log_warning(f"{obj.get_name()}.{name}: {exc}")
        return False


def find_asset(asset_class, *tokens):
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    for data in registry.get_assets_by_path("/Game/ThirdParty", recursive=True):
        class_path = getattr(data, "asset_class_path", None)
        class_name = str(getattr(class_path, "asset_name", ""))
        if class_name != asset_class:
            continue
        name = str(data.asset_name).lower()
        if all(token.lower() in name for token in tokens):
            return data.get_asset()
    return None


def material(name):
    path = f"{MATERIAL_PATH}/{name}"
    existing = unreal.EditorAssetLibrary.load_asset(path)
    if existing:
        unreal.MaterialEditingLibrary.delete_all_material_expressions(existing)
        return existing
    return unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, MATERIAL_PATH, unreal.Material, unreal.MaterialFactoryNew())


def constant_color(mat, color, x=-500, y=0):
    node = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionConstant3Vector, x, y)
    node.set_editor_property("constant", unreal.LinearColor(*color))
    return node


def constant(mat, value, x=-500, y=180):
    node = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


def make_unlit(name, color, strength=1.0, additive=False):
    mat = material(name)
    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    if additive:
        safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    color_node = constant_color(mat, color)
    if strength != 1.0:
        multiplier = constant(mat, strength, -500, 140)
        multiply = unreal.MaterialEditingLibrary.create_material_expression(
            mat, unreal.MaterialExpressionMultiply, -220, 20)
        unreal.MaterialEditingLibrary.connect_material_expressions(
            color_node, "", multiply, "A")
        unreal.MaterialEditingLibrary.connect_material_expressions(
            multiplier, "", multiply, "B")
        unreal.MaterialEditingLibrary.connect_material_property(
            multiply, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    else:
        unreal.MaterialEditingLibrary.connect_material_property(
            color_node, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def make_pbr(name, asset_token, tint):
    mat = material(name)
    diffuse = find_asset("Texture2D", asset_token, "diffuse")
    normal = find_asset("Texture2D", asset_token, "normal")
    rough = find_asset("Texture2D", asset_token, "roughness")
    uv = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionTextureCoordinate, -900, 20)
    safe_set(uv, "u_tiling", 10.0)
    safe_set(uv, "v_tiling", 10.0)
    if diffuse:
        sample = unreal.MaterialEditingLibrary.create_material_expression(
            mat, unreal.MaterialExpressionTextureSample, -550, -80)
        safe_set(sample, "texture", diffuse)
        unreal.MaterialEditingLibrary.connect_material_expressions(uv, "", sample, "UVs")
        tint_node = constant_color(mat, tint, -550, -280)
        multiply = unreal.MaterialEditingLibrary.create_material_expression(
            mat, unreal.MaterialExpressionMultiply, -220, -70)
        unreal.MaterialEditingLibrary.connect_material_expressions(sample, "RGB", multiply, "A")
        unreal.MaterialEditingLibrary.connect_material_expressions(tint_node, "", multiply, "B")
        unreal.MaterialEditingLibrary.connect_material_property(
            multiply, "", unreal.MaterialProperty.MP_BASE_COLOR)
    else:
        color = constant_color(mat, tint)
        unreal.MaterialEditingLibrary.connect_material_property(
            color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    if normal:
        sample_n = unreal.MaterialEditingLibrary.create_material_expression(
            mat, unreal.MaterialExpressionTextureSample, -540, 130)
        safe_set(sample_n, "texture", normal)
        safe_set(sample_n, "sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        unreal.MaterialEditingLibrary.connect_material_expressions(uv, "", sample_n, "UVs")
        unreal.MaterialEditingLibrary.connect_material_property(
            sample_n, "RGB", unreal.MaterialProperty.MP_NORMAL)
    if rough:
        sample_r = unreal.MaterialEditingLibrary.create_material_expression(
            mat, unreal.MaterialExpressionTextureSample, -520, 330)
        safe_set(sample_r, "texture", rough)
        unreal.MaterialEditingLibrary.connect_material_expressions(uv, "", sample_r, "UVs")
        unreal.MaterialEditingLibrary.connect_material_property(
            sample_r, "R", unreal.MaterialProperty.MP_ROUGHNESS)
    else:
        roughness = constant(mat, .82)
        unreal.MaterialEditingLibrary.connect_material_property(
            roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def make_water():
    mat = material("M_Water_River")
    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    safe_set(mat, "two_sided", True)
    color = constant_color(mat, (.035, .28, .42, 1))
    opacity = constant(mat, .78, -420, 200)
    unreal.MaterialEditingLibrary.connect_material_property(
        color, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.connect_material_property(
        opacity, "", unreal.MaterialProperty.MP_OPACITY)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def build_materials():
    unreal.EditorAssetLibrary.make_directory(MATERIAL_PATH)
    make_pbr("M_Ground_Forest", "forrest_ground_01", (0.46, .72, .42, 1))
    make_pbr("M_Path_Dirt", "grass_path_2", (.82, .68, .48, 1))
    make_water()
    make_unlit("M_FX_Arrow", (1.0, .42, .05, 1), 5.0, True)
    make_unlit("M_FX_Frost", (.02, .62, 1.0, 1), 12.0, True)
    make_unlit("M_FX_Fire", (1.0, .08, .01, 1), 16.0, True)
    make_unlit("M_FX_Arcane", (.66, .03, 1.0, 1), 14.0, True)
    make_unlit("M_FX_Firefly", (.72, 1.0, .08, 1), 18.0, True)
    make_unlit("M_Health_Back", (.015, .012, .018, 1), .15)
    make_unlit("M_Health_Fill", (.08, 1.0, .14, 1), 2.8)


def actor_component(actor, component_class):
    try:
        return actor.get_component_by_class(component_class)
    except Exception:
        return None


def spawn(actor_subsystem, actor_class, label, location=(0, 0, 0), rotation=(0, 0, 0)):
    actor = actor_subsystem.spawn_actor_from_class(
        actor_class, unreal.Vector(*location), unreal.Rotator(*rotation))
    actor.set_actor_label(label)
    safe_set(actor, "tags", ["PD_Ultimate"])
    return actor


def build_level():
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
        level_subsystem.load_level(MAP_PATH)
        for actor in list(actor_subsystem.get_all_level_actors()):
            try:
                actor_subsystem.destroy_actor(actor)
            except Exception:
                pass
    else:
        level_subsystem.new_level(MAP_PATH)

    sun = spawn(actor_subsystem, unreal.DirectionalLight, "PD_Sun",
                (0, 0, 3800), (-42, -28, -18))
    sun_component = actor_component(sun, unreal.DirectionalLightComponent)
    if sun_component:
        safe_set(sun_component, "intensity", 7.5)
        safe_set(sun_component, "light_color", unreal.Color(255, 226, 190))
        safe_set(sun_component, "cast_shadows", True)
        safe_set(sun_component, "atmosphere_sun_light", True)
        safe_set(sun_component, "atmosphere_sun_light_index", 0)

    sky = spawn(actor_subsystem, unreal.SkyAtmosphere, "PD_SkyAtmosphere")
    skylight = spawn(actor_subsystem, unreal.SkyLight, "PD_SkyLight")
    sky_component = actor_component(skylight, unreal.SkyLightComponent)
    if sky_component:
        safe_set(sky_component, "intensity", 1.15)
        safe_set(sky_component, "real_time_capture", True)
        safe_set(sky_component, "mobility", unreal.ComponentMobility.MOVABLE)

    fog = spawn(actor_subsystem, unreal.ExponentialHeightFog, "PD_HeightFog",
                (0, 0, -100))
    fog_component = actor_component(fog, unreal.ExponentialHeightFogComponent)
    if fog_component:
        safe_set(fog_component, "fog_density", .012)
        safe_set(fog_component, "fog_height_falloff", .22)
        safe_set(fog_component, "fog_inscattering_color",
                 unreal.LinearColor(.38, .55, .64, 1))
        safe_set(fog_component, "start_distance", 1200.0)
        safe_set(fog_component, "volumetric_fog", False)

    post = spawn(actor_subsystem, unreal.PostProcessVolume, "PD_ColorGrade")
    safe_set(post, "unbound", True)
    safe_set(post, "blend_weight", 1.0)
    settings = post.get_editor_property("settings")
    for name, value in (
        ("override_bloom_intensity", True),
        ("bloom_intensity", .45),
        ("override_vignette_intensity", True),
        ("vignette_intensity", .24),
        ("override_auto_exposure_min_brightness", True),
        ("auto_exposure_min_brightness", .85),
        ("override_auto_exposure_max_brightness", True),
        ("auto_exposure_max_brightness", 1.35),
        ("override_color_saturation", True),
        ("color_saturation", unreal.Vector4(1.06, 1.04, 1.0, 1.0)),
        ("override_color_contrast", True),
        ("color_contrast", unreal.Vector4(1.08, 1.08, 1.08, 1.0)),
    ):
        safe_set(settings, name, value)
    safe_set(post, "settings", settings)

    level_subsystem.save_current_level()
    return {
        "map": MAP_PATH,
        "directional_lights": 1,
        "sky_atmosphere": 1,
        "sky_lights": 1,
        "height_fog": 1,
        "post_process": 1,
    }


build_materials()
summary = build_level()
summary["materials"] = 10
print("ULTIMATE_WORLD_JSON " + json.dumps(summary, ensure_ascii=False))
