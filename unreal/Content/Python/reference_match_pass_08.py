"""Pixel Defense 3D — screenshot-driven reference match pass 08.

Corrects issues visible in the 2026-08-26 Unreal captures:
- removes stacked legacy presentation actors
- guarantees one directional sun and one atmosphere stack
- clamps local light energy and fixes exposure
- restores a high tactical viewport camera
- preserves gameplay markers plus PREMIUM_ and ENV07_ layers
"""
from __future__ import annotations
import json
import unreal

LEVEL="/Game/Maps/MedievalArtDirection"
PREFIX="REF08_"
WARN=[]
COUNT={"deleted_legacy":0,"deleted_directional":0,"deleted_atmosphere":0,
       "local_lights_tuned":0,"hidden_debug":0,"camera":0}


def safe(label,fn,*args):
    try:return fn(*args)
    except Exception as exc:
        WARN.append(f"{label}: {exc}")
        unreal.log_warning(f"REFERENCE_MATCH_08 {label}: {exc}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name,unreal.get_editor_subsystem,cls) if cls else None


ACTORS=sub("EditorActorSubsystem")
LEVELS=sub("LevelEditorSubsystem")

# Old procedural art layers seen piled together in the supplied screenshots.
LEGACY_PREFIXES=("MAX_","PROD_","CLEAN_","ARTDIR_","VIS25D_","MOBILE_")
# Preserve these gameplay anchors even if future art passes replace their visuals.
GAMEPLAY_PREFIXES=("PATH_","TOWER_PAD_","CORE_","PORTAL_","SPAWN_","WAYPOINT_")


def actor_label(actor):
    return safe("label",actor.get_actor_label) or ""


def destroy(actor,label):
    if ACTORS and safe("destroy "+label,ACTORS.destroy_actor,actor):
        return True
    return False


def cleanup_scene():
    if not ACTORS:return
    for actor in list(ACTORS.get_all_level_actors()):
        label=actor_label(actor)
        if label.startswith(PREFIX):
            destroy(actor,label)
            continue
        if label.startswith(GAMEPLAY_PREFIXES):
            continue
        if label.startswith(LEGACY_PREFIXES):
            if destroy(actor,label):COUNT["deleted_legacy"]+=1


def reset_environment():
    if not ACTORS:return
    # Remove every competing global environment actor, including those created
    # by earlier passes. Local VFX point lights remain and are tuned separately.
    global_classes=tuple(c for c in (
        getattr(unreal,"DirectionalLight",None),
        getattr(unreal,"SkyLight",None),
        getattr(unreal,"SkyAtmosphere",None),
        getattr(unreal,"VolumetricCloud",None),
        getattr(unreal,"ExponentialHeightFog",None),
        getattr(unreal,"PostProcessVolume",None),
    ) if c)
    for actor in list(ACTORS.get_all_level_actors()):
        if isinstance(actor,global_classes):
            label=actor_label(actor)
            if isinstance(actor,getattr(unreal,"DirectionalLight")):
                COUNT["deleted_directional"]+=1
            else:
                COUNT["deleted_atmosphere"]+=1
            destroy(actor,label)


def tune_local_lights():
    if not ACTORS:return
    point_cls=getattr(unreal,"PointLight",None)
    spot_cls=getattr(unreal,"SpotLight",None)
    for actor in ACTORS.get_all_level_actors():
        if (point_cls and isinstance(actor,point_cls)) or (spot_cls and isinstance(actor,spot_cls)):
            comp=safe("local light comp",actor.get_editor_property,
                      "point_light_component" if point_cls and isinstance(actor,point_cls) else "spot_light_component")
            if not comp:continue
            label=actor_label(actor).lower()
            intensity=900.0
            radius=480.0
            if "portal" in label:intensity,radius=1800.0,850.0
            elif "core" in label or "magic" in label:intensity,radius=1350.0,650.0
            elif "torch" in label:intensity,radius=650.0,380.0
            safe("set local intensity",comp.set_editor_property,"intensity",intensity)
            safe("set local radius",comp.set_editor_property,"attenuation_radius",radius)
            safe("disable local shadows",comp.set_editor_property,"cast_shadows",False)
            COUNT["local_lights_tuned"]+=1


def spawn_environment():
    if not ACTORS:return
    # One and only one atmospheric sun.
    sun=safe("spawn sun",ACTORS.spawn_actor_from_class,unreal.DirectionalLight,
             unreal.Vector(0,0,2800),unreal.Rotator(-42,-32,-8))
    if sun:
        sun.set_actor_label(PREFIX+"Sun")
        c=safe("sun component",sun.get_editor_property,"directional_light_component")
        if c:
            safe("sun intensity",c.set_editor_property,"intensity",2.6)
            safe("sun temperature",c.set_editor_property,"temperature",5450.0)
            safe("sun atmosphere",c.set_editor_property,"atmosphere_sun_light",True)
            safe("sun index",c.set_editor_property,"atmosphere_sun_light_index",0)
            safe("sun shadows",c.set_editor_property,"cast_shadows",True)
            safe("sun shafts",c.set_editor_property,"enable_light_shaft_bloom",False)

    sky_cls=getattr(unreal,"SkyAtmosphere",None)
    if sky_cls:
        sky=safe("spawn atmosphere",ACTORS.spawn_actor_from_class,sky_cls,
                 unreal.Vector(0,0,0),unreal.Rotator())
        if sky:sky.set_actor_label(PREFIX+"SkyAtmosphere")

    cloud_cls=getattr(unreal,"VolumetricCloud",None)
    if cloud_cls:
        cloud=safe("spawn clouds",ACTORS.spawn_actor_from_class,cloud_cls,
                   unreal.Vector(0,0,0),unreal.Rotator())
        if cloud:cloud.set_actor_label(PREFIX+"Clouds")

    skylight=safe("spawn skylight",ACTORS.spawn_actor_from_class,unreal.SkyLight,
                  unreal.Vector(0,0,1200),unreal.Rotator())
    if skylight:
        skylight.set_actor_label(PREFIX+"SkyLight")
        c=safe("skylight component",skylight.get_editor_property,"light_component")
        if c:
            safe("sky intensity",c.set_editor_property,"intensity",.55)
            safe("sky realtime",c.set_editor_property,"real_time_capture",True)

    fog=safe("spawn fog",ACTORS.spawn_actor_from_class,unreal.ExponentialHeightFog,
             unreal.Vector(0,0,-200),unreal.Rotator())
    if fog:
        fog.set_actor_label(PREFIX+"Fog")
        c=safe("fog component",fog.get_editor_property,"component")
        if c:
            safe("fog density",c.set_editor_property,"fog_density",.0028)
            safe("fog falloff",c.set_editor_property,"fog_height_falloff",.18)
            safe("volumetric fog",c.set_editor_property,"volumetric_fog",True)
            safe("volumetric distance",c.set_editor_property,"volumetric_fog_view_distance",9000.0)

    pp=safe("spawn post process",ACTORS.spawn_actor_from_class,unreal.PostProcessVolume,
            unreal.Vector(0,0,0),unreal.Rotator())
    if pp:
        pp.set_actor_label(PREFIX+"PostProcess")
        safe("unbound",pp.set_editor_property,"unbound",True)
        settings=safe("pp settings",pp.get_editor_property,"settings")
        if settings:
            values=(
                ("b_override_bloom_intensity",True),("bloom_intensity",.15),
                ("b_override_vignette_intensity",True),("vignette_intensity",.12),
                ("b_override_auto_exposure_bias",True),("auto_exposure_bias",-1.15),
                ("b_override_auto_exposure_min_brightness",True),("auto_exposure_min_brightness",1.0),
                ("b_override_auto_exposure_max_brightness",True),("auto_exposure_max_brightness",1.0),
                ("b_override_color_saturation",True),
                ("color_saturation",unreal.Vector4(.92,.92,.92,1.0)),
                ("b_override_color_contrast",True),
                ("color_contrast",unreal.Vector4(1.08,1.08,1.08,1.0)),
            )
            for prop,value in values:safe("pp "+prop,settings.set_editor_property,prop,value)
            safe("apply pp",pp.set_editor_property,"settings",settings)


def tactical_camera():
    if not ACTORS:return
    # Remove presentation cameras only; gameplay cameras are preserved.
    camera_cls=getattr(unreal,"CameraActor",None)
    if camera_cls:
        for actor in list(ACTORS.get_all_level_actors()):
            if isinstance(actor,camera_cls):
                label=actor_label(actor)
                if label.startswith(("MAX_","CLEAN_","PREMIUM_","ENV07_",PREFIX)):
                    destroy(actor,label)
    loc=unreal.Vector(150,-7200,6100)
    rot=unreal.Rotator(-42,1,0)
    cam=safe("spawn tactical camera",ACTORS.spawn_actor_from_class,unreal.CameraActor,loc,rot)
    if cam:
        cam.set_actor_label(PREFIX+"Camera_Tactical")
        c=safe("camera component",cam.get_editor_property,"camera_component")
        if c:
            safe("fov",c.set_editor_property,"field_of_view",34.0)
            safe("motion blur",c.set_editor_property,"post_process_blend_weight",0.0)
        COUNT["camera"]+=1
    # Move the actual editor viewport to the same clean composition.
    lib=getattr(unreal,"EditorLevelLibrary",None)
    if lib and hasattr(lib,"set_level_viewport_camera_info"):
        safe("set viewport",lib.set_level_viewport_camera_info,loc,rot)


def hide_debug_helpers():
    if not ACTORS:return
    for actor in ACTORS.get_all_level_actors():
        label=actor_label(actor)
        low=label.lower()
        if any(token in low for token in ("debug","preview_range","range_preview","helper","gizmo")):
            safe("hide debug",actor.set_is_temporarily_hidden_in_editor,True)
            COUNT["hidden_debug"]+=1


def main():
    if LEVELS and hasattr(LEVELS,"load_level"):safe("load",LEVELS.load_level,LEVEL)
    cleanup_scene()
    reset_environment()
    tune_local_lights()
    spawn_environment()
    tactical_camera()
    hide_debug_helpers()
    if LEVELS and hasattr(LEVELS,"save_current_level"):safe("save",LEVELS.save_current_level)
    print("REFERENCE_MATCH_JSON "+json.dumps({
        "level":LEVEL,"count":COUNT,"warnings":WARN,
        "status":"reference_match_complete",
        "visual_target":"purple cliff portal, winding lane, four readable towers, fortified village, river, forest, warm sun and restrained blue magic"
    },ensure_ascii=False))


main()
