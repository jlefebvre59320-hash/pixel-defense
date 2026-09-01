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
        return existing, False
    created = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, MATERIAL_PATH, unreal.Material, unreal.MaterialFactoryNew())
    return created, True


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
    mat, created = material(name)
    if not created:
        return mat
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


def make_pbr(name, asset_token, tint, tiling=6.0):
    mat, created = material(name)
    if not created:
        return mat
    diffuse = find_asset("Texture2D", asset_token, "diffuse")
    normal = find_asset("Texture2D", asset_token, "normal")
    rough = find_asset("Texture2D", asset_token, "roughness")
    uv = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionTextureCoordinate, -900, 20)
    safe_set(uv, "u_tiling", tiling)
    safe_set(uv, "v_tiling", tiling)
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


def make_translucent_unlit(name, color_value, opacity_value):
    mat, created = material(name)
    if not created:
        return mat
    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    safe_set(mat, "two_sided", True)
    color = constant_color(mat, color_value)
    opacity = constant(mat, opacity_value, -420, 200)
    unreal.MaterialEditingLibrary.connect_material_property(
        color, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.connect_material_property(
        opacity, "", unreal.MaterialProperty.MP_OPACITY)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def make_water():
    mat, created = material("M_Water_ValleyV2")
    if not created:
        return mat
    safe_set(mat, "shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    safe_set(mat, "blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    safe_set(mat, "two_sided", True)
    deep = constant_color(mat, (.018, .16, .24, 1), -720, -80)
    shimmer = constant_color(mat, (.04, .42, .55, 1), -720, 100)
    time_node = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionTime, -900, 260)
    sine = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionSine, -680, 260)
    safe_set(sine, "period", 4.5)
    unreal.MaterialEditingLibrary.connect_material_expressions(
        time_node, "", sine, "Input")
    lerp = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionLinearInterpolate, -340, 20)
    unreal.MaterialEditingLibrary.connect_material_expressions(deep, "", lerp, "A")
    unreal.MaterialEditingLibrary.connect_material_expressions(shimmer, "", lerp, "B")
    unreal.MaterialEditingLibrary.connect_material_expressions(sine, "", lerp, "Alpha")
    opacity = constant(mat, .72, -420, 330)
    unreal.MaterialEditingLibrary.connect_material_property(
        lerp, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.connect_material_property(
        opacity, "", unreal.MaterialProperty.MP_OPACITY)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def build_materials():
    unreal.EditorAssetLibrary.make_directory(MATERIAL_PATH)
    make_pbr("M_Ground_ValleyV2", "leafy_grass", (.42, .58, .30, 1), 7.5)
    make_pbr("M_Path_ValleyV3", "grass_path_2", (.92, .72, .46, 1), 4.8)
    make_pbr("M_Ground_MeadowV3", "leafy_grass", (.58, .70, .42, 1), 8.5)
    make_pbr("M_Ground_ForestV3", "forrest_ground_01", (.48, .58, .34, 1), 6.0)
    make_pbr("M_Path_CobbleV4", "grass_path_3", (.78, .66, .50, 1), 5.4)
    make_pbr("M_Path_WarmV5", "grass_path_2", (1.35, 1.12, .82, 1), 4.2)
    make_pbr("M_Path_ClayV6", "__solid_clay__", (.34, .16, .065, 1), 5.0)
    # Versioned name guarantees creation even when an older setup left a stale
    # gray material package in Content.
    make_pbr("M_Path_ClayV7", "__solid_clay_v7__", (.30, .105, .028, 1), 5.0)
    make_pbr("M_Path_ClayV8", "__solid_clay_v8__", (.42, .16, .045, 1), 5.0)
    # Guaranteed fallback palette for FBX packs whose source materials are not
    # translated by Unreal on macOS.
    make_pbr("M_PD_LeafDeepV1", "__pd_leaf_deep__", (.025, .24, .075, 1), 1.0)
    make_pbr("M_PD_LeafFreshV1", "__pd_leaf_fresh__", (.055, .40, .11, 1), 1.0)
    make_pbr("M_PD_LeafGoldV1", "__pd_leaf_gold__", (.30, .48, .075, 1), 1.0)
    make_pbr("M_PD_BarkWarmV1", "__pd_bark__", (.20, .065, .025, 1), 1.0)
    make_pbr("M_PD_GrassV1", "__pd_grass__", (.10, .46, .12, 1), 1.0)
    make_pbr("M_PD_StoneWarmV1", "__pd_stone__", (.31, .34, .36, 1), 1.0)
    make_pbr("M_PD_CliffV1", "__pd_cliff__", (.22, .25, .27, 1), 1.0)
    make_pbr("M_PD_PlasterWarmV1", "__pd_plaster__", (.72, .50, .27, 1), 1.0)
    make_pbr("M_PD_WoodDarkV1", "__pd_wood__", (.16, .045, .018, 1), 1.0)
    make_pbr("M_PD_RoofRedV1", "__pd_roof_red__", (.48, .035, .018, 1), 1.0)
    make_pbr("M_PD_RoofBlueV1", "__pd_roof_blue__", (.025, .20, .42, 1), 1.0)
    make_pbr("M_PD_RoofOchreV1", "__pd_roof_ochre__", (.56, .25, .025, 1), 1.0)
    make_water()
    make_translucent_unlit("M_Cloud", (1.0, .97, .91, 1), .42)
    make_translucent_unlit("M_Cloud_SoftV2", (1.0, .985, .94, 1), .76)
    make_unlit("M_Bird", (.012, .016, .022, 1), .35)
    make_unlit("M_FX_Dust", (1.0, .55, .18, 1), 2.2, True)
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
        safe_set(sun_component, "intensity", 3.55)
        safe_set(sun_component, "light_color", unreal.Color(255, 236, 211))
        safe_set(sun_component, "cast_shadows", True)
        safe_set(sun_component, "mobility", unreal.ComponentMobility.MOVABLE)
        safe_set(sun_component, "atmosphere_sun_light", True)
        safe_set(sun_component, "atmosphere_sun_light_index", 0)

    sky = spawn(actor_subsystem, unreal.SkyAtmosphere, "PD_SkyAtmosphere")
    clouds = spawn(actor_subsystem, unreal.VolumetricCloud, "PD_VolumetricClouds")
    cloud_component = actor_component(clouds, unreal.VolumetricCloudComponent)
    if cloud_component:
        safe_set(cloud_component, "layer_bottom_altitude", 1.2)
        safe_set(cloud_component, "layer_height", 5.5)
        safe_set(cloud_component, "tracing_start_max_distance", 350.0)

    skylight = spawn(actor_subsystem, unreal.SkyLight, "PD_SkyLight")
    sky_component = actor_component(skylight, unreal.SkyLightComponent)
    if sky_component:
        safe_set(sky_component, "intensity", .88)
        safe_set(sky_component, "mobility", unreal.ComponentMobility.MOVABLE)
        hdri = find_asset("TextureCube", "kloofendal_48d_partly_cloudy_puresky")
        if hdri:
            safe_set(sky_component, "source_type",
                     unreal.SkyLightSourceType.SLS_SPECIFIED_CUBEMAP)
            safe_set(sky_component, "cubemap", hdri)
            safe_set(sky_component, "real_time_capture", False)
        else:
            safe_set(sky_component, "real_time_capture", True)

    fog = spawn(actor_subsystem, unreal.ExponentialHeightFog, "PD_HeightFog",
                (0, 0, -100))
    fog_component = actor_component(fog, unreal.ExponentialHeightFogComponent)
    if fog_component:
        safe_set(fog_component, "fog_density", .0016)
        safe_set(fog_component, "fog_height_falloff", .30)
        safe_set(fog_component, "fog_inscattering_color",
                 unreal.LinearColor(.42, .52, .62, 1))
        safe_set(fog_component, "start_distance", 700.0)
        safe_set(fog_component, "volumetric_fog", False)

    wind = spawn(actor_subsystem, unreal.WindDirectionalSource, "PD_ValleyWind",
                 (0, 0, 800), (0, 35, 0))
    wind_component = actor_component(wind, unreal.WindDirectionalSourceComponent)
    if wind_component:
        safe_set(wind_component, "strength", .28)
        safe_set(wind_component, "speed", .42)
        safe_set(wind_component, "radius", 9000.0)

    post = spawn(actor_subsystem, unreal.PostProcessVolume, "PD_ColorGrade")
    safe_set(post, "unbound", True)
    safe_set(post, "blend_weight", 1.0)
    settings = post.get_editor_property("settings")
    for name, value in (
        ("override_bloom_intensity", True),
        ("bloom_intensity", .28),
        ("override_vignette_intensity", True),
        ("vignette_intensity", .22),
        ("override_auto_exposure_min_brightness", True),
        ("auto_exposure_min_brightness", 1.0),
        ("override_auto_exposure_max_brightness", True),
        ("auto_exposure_max_brightness", 1.0),
        ("override_auto_exposure_bias", True),
        ("auto_exposure_bias", .08),
        ("override_color_saturation", True),
        ("color_saturation", unreal.Vector4(1.02, 1.03, .98, 1.0)),
        ("override_color_contrast", True),
        ("color_contrast", unreal.Vector4(1.16, 1.16, 1.16, 1.0)),
    ):
        safe_set(settings, name, value)
    safe_set(post, "settings", settings)

    level_subsystem.save_current_level()
    return {
        "map": MAP_PATH,
        "directional_lights": 1,
        "sky_atmosphere": 1,
        "sky_lights": 1,
        "volumetric_clouds": 1,
        "height_fog": 1,
        "post_process": 1,
        "wind": 1,
    }


build_materials()
summary = build_level()
summary["materials"] = 33
print("ULTIMATE_WORLD_JSON " + json.dumps(summary, ensure_ascii=False))
