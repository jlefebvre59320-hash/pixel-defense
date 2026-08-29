"""Pixel Defense 3D — cleanup + lighting pass.

Objectif: rendre la scène lisible en attendant les vrais assets.
- supprime une partie du clutter procédural MAX_* le plus envahissant
- conserve les repères gameplay utiles
- réduit les lumières ponctuelles agressives
- ajoute une lumière principale plus douce + skylight + fog léger
- repositionne la caméra tactique
- sauvegarde la map et écrit CLEANUP_LIGHTING_JSON
"""
from __future__ import annotations
import json
import unreal

LEVEL="/Game/Maps/MedievalArtDirection"
WARN=[]
COUNT={"deleted":0,"lights_tuned":0,"camera":0,"kept":0}

KEEP_PREFIXES=(
    "MAX_Portal","MAX_Core","MAX_House","MAX_Tree","MAX_Market","MAX_Crate",
    "MAX_Hero","MAX_Villager","MAX_Enemy","PROD_","TOWER_PAD_","PATH_","WALL_","GATE_",
    "ENV_Terrain_Medieval","CORE_","PORTAL_Enemy"
)
DELETE_PREFIXES=(
    "MAX_Rock","MAX_Torch","MAX_WaterPond","MAX_Fog","MAX_Camera_Tactical"
)


def safe(label,fn,*args):
    try:return fn(*args)
    except Exception as e:
        WARN.append(f"{label}: {e}")
        unreal.log_warning(f"CLEANUP_LIGHTING {label}: {e}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name,unreal.get_editor_subsystem,cls) if cls else None


def actors():
    s=sub("EditorActorSubsystem")
    return list(s.get_all_level_actors()) if s else []


def label(a): return safe("label",a.get_actor_label) or ""


def cleanup():
    s=sub("EditorActorSubsystem")
    if not s:return
    for a in list(s.get_all_level_actors()):
        l=label(a)
        if l.startswith(DELETE_PREFIXES):
            safe("delete "+l,s.destroy_actor,a); COUNT["deleted"]+=1
        elif l.startswith(KEEP_PREFIXES):
            COUNT["kept"]+=1


def tune_existing_lights():
    for a in actors():
        l=label(a)
        if isinstance(a,unreal.PointLight):
            c=safe("point comp",a.get_editor_property,"point_light_component")
            if c:
                safe("point intensity",c.set_editor_property,"intensity",1200.0)
                safe("point radius",c.set_editor_property,"attenuation_radius",450.0)
                COUNT["lights_tuned"]+=1
        elif isinstance(a,unreal.DirectionalLight):
            c=safe("dir comp",a.get_editor_property,"directional_light_component")
            if c:
                safe("dir intensity",c.set_editor_property,"intensity",3.2)
                safe("dir temp",c.set_editor_property,"temperature",5600.0)
                COUNT["lights_tuned"]+=1
        elif isinstance(a,unreal.SkyLight):
            c=safe("sky comp",a.get_editor_property,"light_component")
            if c:
                safe("sky intensity",c.set_editor_property,"intensity",0.75)
                COUNT["lights_tuned"]+=1


def spawn_or_replace_environment():
    s=sub("EditorActorSubsystem")
    if not s:return
    # nouvelle key light douce
    sun=safe("spawn sun",s.spawn_actor_from_class,unreal.DirectionalLight,unreal.Vector(0,0,1600),unreal.Rotator(-42,-28,0))
    if sun:
        sun.set_actor_label("CLEAN_KeyLight")
        c=safe("sun comp",sun.get_editor_property,"directional_light_component")
        if c:
            safe("sun intensity",c.set_editor_property,"intensity",4.0)
            safe("sun temp",c.set_editor_property,"temperature",5400.0)
    sky=safe("spawn sky",s.spawn_actor_from_class,unreal.SkyLight,unreal.Vector(0,0,900),unreal.Rotator())
    if sky:
        sky.set_actor_label("CLEAN_SkyLight")
        c=safe("sky comp",sky.get_editor_property,"light_component")
        if c:safe("sky intensity",c.set_editor_property,"intensity",1.0)
    fog=safe("spawn fog",s.spawn_actor_from_class,unreal.ExponentialHeightFog,unreal.Vector(0,0,0),unreal.Rotator())
    if fog:
        fog.set_actor_label("CLEAN_Fog")
        c=safe("fog comp",fog.get_editor_property,"component")
        if c:
            safe("fog density",c.set_editor_property,"fog_density",0.006)
            safe("fog falloff",c.set_editor_property,"fog_height_falloff",0.18)
    cam=safe("spawn camera",s.spawn_actor_from_class,unreal.CameraActor,unreal.Vector(0,-6100,5200),unreal.Rotator(-41,0,0))
    if cam:
        cam.set_actor_label("CLEAN_Camera_Tactical")
        c=safe("cam comp",cam.get_editor_property,"camera_component")
        if c:safe("cam fov",c.set_editor_property,"field_of_view",38.0)
        COUNT["camera"]+=1


def main():
    ls=sub("LevelEditorSubsystem")
    if ls and hasattr(ls,"load_level"): safe("load",ls.load_level,LEVEL)
    cleanup(); tune_existing_lights(); spawn_or_replace_environment()
    if ls and hasattr(ls,"save_current_level"): safe("save",ls.save_current_level)
    print("CLEANUP_LIGHTING_JSON "+json.dumps({"level":LEVEL,"count":COUNT,"warnings":WARN,"status":"clean_preview_ready"},ensure_ascii=False))

main()
