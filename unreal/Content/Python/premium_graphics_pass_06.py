"""Pixel Defense 3D — premium graphics pass 06 (UE 5.8).

Run inside an open Unreal Editor:
python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/premium_graphics_pass_06.json

Builds a cohesive original medieval-fantasy presentation layer:
- four readable tower silhouettes
- portal and village core landmarks
- tactical lighting, atmosphere and post-process
- stylized material palette
- mobile performance manifest

The pass is idempotent: actors prefixed PREMIUM_ are replaced on every run.
"""
from __future__ import annotations
import json, math
import unreal

LEVEL = "/Game/Maps/MedievalArtDirection"
PREFIX = "PREMIUM_"
WARN = []
COUNT = {"actors": 0, "materials": 0, "towers": 0, "lights": 0, "landmarks": 0}


def safe(label, fn, *args):
    try:
        return fn(*args)
    except Exception as exc:
        WARN.append(f"{label}: {exc}")
        unreal.log_warning(f"PREMIUM_GRAPHICS {label}: {exc}")
        return None


def subsystem(name):
    cls = getattr(unreal, name, None)
    return safe(name, unreal.get_editor_subsystem, cls) if cls else None


ACTORS = subsystem("EditorActorSubsystem")
LEVELS = subsystem("LevelEditorSubsystem")
ASSETS = unreal.EditorAssetLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()


def ensure_dir(path):
    if not ASSETS.does_directory_exist(path):
        safe("mkdir " + path, ASSETS.make_directory, path)


def clean():
    if not ACTORS:
        return
    for actor in list(ACTORS.get_all_level_actors()):
        label = safe("actor label", actor.get_actor_label) or ""
        if label.startswith(PREFIX):
            safe("destroy " + label, ACTORS.destroy_actor, actor)


def material(name, color, roughness=.85, metallic=0.0, emissive=None):
    folder = "/Game/Art/Materials/Premium"
    ensure_dir(folder)
    path = f"{folder}/{name}"
    asset = unreal.load_asset(path)
    if asset:
        return asset
    asset = safe("create " + name, TOOLS.create_asset, name, folder,
                 unreal.Material, unreal.MaterialFactoryNew())
    if not asset:
        return None
    mel = unreal.MaterialEditingLibrary
    base = safe("base " + name, mel.create_material_expression, asset,
                unreal.MaterialExpressionConstant3Vector, -500, 0)
    if base:
        base.set_editor_property("constant", unreal.LinearColor(*color, 1))
        mel.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = safe("rough " + name, mel.create_material_expression, asset,
                 unreal.MaterialExpressionConstant, -500, 160)
    if rough:
        rough.set_editor_property("r", roughness)
        mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    metal = safe("metal " + name, mel.create_material_expression, asset,
                 unreal.MaterialExpressionConstant, -500, 300)
    if metal:
        metal.set_editor_property("r", metallic)
        mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    if emissive:
        glow = safe("emissive " + name, mel.create_material_expression, asset,
                    unreal.MaterialExpressionConstant3Vector, -500, 440)
        if glow:
            glow.set_editor_property("constant", unreal.LinearColor(*emissive, 1))
            mel.connect_material_property(glow, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    safe("compile " + name, mel.recompile_material, asset)
    safe("save " + name, ASSETS.save_loaded_asset, asset)
    COUNT["materials"] += 1
    return asset


def palette():
    return {
        "grass": material("M_P_Grass", (.075, .25, .055), .98),
        "earth": material("M_P_Earth", (.30, .145, .055), .96),
        "stone": material("M_P_Stone", (.36, .35, .32), .93),
        "stone_dark": material("M_P_StoneDark", (.13, .14, .16), .94),
        "wood": material("M_P_Wood", (.24, .09, .025), .91),
        "roof": material("M_P_Roof", (.42, .075, .028), .92),
        "iron": material("M_P_Iron", (.07, .08, .10), .38, .82),
        "gold": material("M_P_Gold", (.60, .31, .035), .42, .65),
        "leaf": material("M_P_Leaf", (.035, .17, .045), .98),
        "blue": material("M_P_BlueMagic", (.01, .12, .45), .18, 0, (.03, 1.8, 7.0)),
        "violet": material("M_P_VioletMagic", (.18, .01, .40), .18, 0, (2.5, .04, 7.5)),
        "fire": material("M_P_Fire", (.85, .08, .005), .16, 0, (7.0, .45, .01)),
    }


def mesh(label, asset, loc, scale=(1,1,1), rot=(0,0,0), mat=None):
    if not ACTORS:
        return None
    actor = safe("spawn " + label, ACTORS.spawn_actor_from_class,
                 unreal.StaticMeshActor, unreal.Vector(*loc), unreal.Rotator(*rot))
    if not actor:
        return None
    actor.set_actor_label(PREFIX + label)
    comp = safe("component " + label, actor.get_editor_property, "static_mesh_component")
    sm = unreal.load_asset(asset)
    if comp and sm:
        safe("set mesh " + label, comp.set_static_mesh, sm)
        if mat:
            safe("set material " + label, comp.set_material, 0, mat)
    safe("scale " + label, actor.set_actor_scale3d, unreal.Vector(*scale))
    COUNT["actors"] += 1
    return actor


def light(label, loc, color, intensity, radius):
    if not ACTORS:
        return
    actor = safe("light " + label, ACTORS.spawn_actor_from_class,
                 unreal.PointLight, unreal.Vector(*loc), unreal.Rotator())
    if not actor:
        return
    actor.set_actor_label(PREFIX + label)
    comp = safe("light comp", actor.get_editor_property, "point_light_component")
    if comp:
        comp.set_editor_property("light_color", unreal.Color(*color, 255))
        comp.set_editor_property("intensity", float(intensity))
        comp.set_editor_property("attenuation_radius", float(radius))
        safe("shadows", comp.set_editor_property, "cast_shadows", True)
    COUNT["lights"] += 1


def ring(label, loc, radius, mat):
    mesh(label, "/Engine/BasicShapes/Torus.Torus", loc,
         (radius, radius, radius), (90,0,0), mat)


def tower_base(name, x, y, p):
    mesh(name+"_Foundation", "/Engine/BasicShapes/Cylinder.Cylinder",
         (x,y,65), (2.55,2.55,.65), mat=p["stone_dark"])
    mesh(name+"_Plinth", "/Engine/BasicShapes/Cylinder.Cylinder",
         (x,y,145), (2.15,2.15,.45), mat=p["stone"])


def archer_tower(x,y,p):
    n="Tower_Archer"; tower_base(n,x,y,p)
    mesh(n+"_Trunk","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,430),(.72,.72,4.8),mat=p["wood"])
    for i,(z,s) in enumerate(((390,2.15),(560,1.75),(710,1.35))):
        mesh(f"{n}_Crown{i}","/Engine/BasicShapes/Cone.Cone",(x,y,z),(s,s,1.8),mat=p["leaf"])
    mesh(n+"_Deck","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,690),(1.65,1.65,.25),mat=p["wood"])
    mesh(n+"_Roof","/Engine/BasicShapes/Cone.Cone",(x,y,880),(1.9,1.9,1.45),mat=p["roof"])
    COUNT["towers"] += 1


def mage_tower(x,y,p):
    n="Tower_Mage"; tower_base(n,x,y,p)
    for i,z in enumerate((250,410,570)):
        mesh(f"{n}_Body{i}","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,z),
             (1.25-i*.12,1.25-i*.12,1.6),mat=p["stone"])
    mesh(n+"_Roof","/Engine/BasicShapes/Cone.Cone",(x,y,775),(1.62,1.62,1.65),mat=p["roof"])
    mesh(n+"_Orb","/Engine/BasicShapes/Sphere.Sphere",(x,y,970),(.62,.62,.62),mat=p["blue"])
    ring(n+"_Rune",(x,y,845),1.35,p["gold"])
    light(n+"_Glow",(x,y,970),(55,145,255),6500,800)
    COUNT["towers"] += 1


def cannon_tower(x,y,p):
    n="Tower_Cannon"; tower_base(n,x,y,p)
    mesh(n+"_Turret","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,330),(1.65,1.65,1.2),mat=p["wood"])
    mesh(n+"_Barrel","/Engine/BasicShapes/Cylinder.Cylinder",(x,y-165,470),(.42,.42,2.25),(90,0,0),p["iron"])
    mesh(n+"_Muzzle","/Engine/BasicShapes/Torus.Torus",(x,y-385,470),(.7,.7,.7),(0,0,0),p["gold"])
    mesh(n+"_Ammo","/Engine/BasicShapes/Sphere.Sphere",(x+135,y+90,235),(.45,.45,.45),mat=p["iron"])
    COUNT["towers"] += 1


def lightning_tower(x,y,p):
    n="Tower_Lightning"; tower_base(n,x,y,p)
    for i,z in enumerate((275,430,585)):
        mesh(f"{n}_Spire{i}","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,z),
             (1.35-i*.18,1.35-i*.18,1.55),mat=p["stone_dark"])
    for i,a in enumerate(range(0,360,60)):
        r=115; px=x+math.cos(math.radians(a))*r; py=y+math.sin(math.radians(a))*r
        mesh(f"{n}_Crystal{i}","/Engine/BasicShapes/Cone.Cone",(px,py,805),
             (.30,.30,1.45),(0,a,0),p["blue"])
    mesh(n+"_Core","/Engine/BasicShapes/Sphere.Sphere",(x,y,790),(.62,.62,.62),mat=p["blue"])
    ring(n+"_Halo",(x,y,790),1.8,p["blue"])
    light(n+"_Glow",(x,y,810),(45,135,255),7800,950)
    COUNT["towers"] += 1


def landmarks(p):
    # Enemy portal
    mesh("Portal_Base","/Engine/BasicShapes/Cylinder.Cylinder",(-2700,-650,75),(4.0,4.0,.75),mat=p["stone_dark"])
    ring("Portal_Ring",(-2700,-650,390),3.65,p["violet"])
    mesh("Portal_Core","/Engine/BasicShapes/Sphere.Sphere",(-2700,-650,390),(2.15,.55,2.15),mat=p["violet"])
    light("Portal_Glow",(-2700,-650,410),(145,45,255),11000,1450)
    # Village gate/core
    for sx in (-1,1):
        mesh(f"Gate_Tower_{sx}","/Engine/BasicShapes/Cylinder.Cylinder",(2600+sx*320,450,390),(1.7,1.7,3.8),mat=p["stone"])
        mesh(f"Gate_Roof_{sx}","/Engine/BasicShapes/Cone.Cone",(2600+sx*320,450,825),(2.0,2.0,1.6),mat=p["roof"])
    mesh("Gate_Arch","/Engine/BasicShapes/Cube.Cube",(2600,450,350),(3.3,1.1,3.3),mat=p["stone"])
    mesh("Village_Core","/Engine/BasicShapes/Cone.Cone",(2600,780,480),(1.45,1.45,4.2),mat=p["blue"])
    light("Village_Core_Glow",(2600,780,520),(55,155,255),9000,1200)
    COUNT["landmarks"] += 2


def atmosphere():
    if not ACTORS:
        return
    sun = safe("sun", ACTORS.spawn_actor_from_class, unreal.DirectionalLight,
               unreal.Vector(0,0,2600), unreal.Rotator(-38,-28,-12))
    if sun:
        sun.set_actor_label(PREFIX+"Key_Sun")
        comp=safe("sun comp",sun.get_editor_property,"directional_light_component")
        if comp:
            comp.set_editor_property("intensity",4.5)
            comp.set_editor_property("temperature",5350.0)
            safe("sun shadows",comp.set_editor_property,"cast_shadows",True)
    sky = safe("sky", ACTORS.spawn_actor_from_class, unreal.SkyLight,
               unreal.Vector(0,0,1200), unreal.Rotator())
    if sky:
        sky.set_actor_label(PREFIX+"Sky")
        comp=safe("sky comp",sky.get_editor_property,"light_component")
        if comp: comp.set_editor_property("intensity",.85)
    fog = safe("fog", ACTORS.spawn_actor_from_class, unreal.ExponentialHeightFog,
               unreal.Vector(0,0,-100), unreal.Rotator())
    if fog:
        fog.set_actor_label(PREFIX+"Fog")
        comp=safe("fog comp",fog.get_editor_property,"component")
        if comp:
            comp.set_editor_property("fog_density",.007)
            comp.set_editor_property("fog_height_falloff",.20)
    pp = safe("post process", ACTORS.spawn_actor_from_class, unreal.PostProcessVolume,
              unreal.Vector(0,0,0), unreal.Rotator())
    if pp:
        pp.set_actor_label(PREFIX+"PostProcess")
        safe("unbound",pp.set_editor_property,"unbound",True)
        settings=safe("pp settings",pp.get_editor_property,"settings")
        if settings:
            for prop,val in (
                ("b_override_bloom_intensity",True),("bloom_intensity",.35),
                ("b_override_vignette_intensity",True),("vignette_intensity",.18),
                ("b_override_auto_exposure_min_brightness",True),("auto_exposure_min_brightness",1.0),
                ("b_override_auto_exposure_max_brightness",True),("auto_exposure_max_brightness",1.0)):
                safe("pp "+prop,settings.set_editor_property,prop,val)
            safe("set pp settings",pp.set_editor_property,"settings",settings)
    cam = safe("camera", ACTORS.spawn_actor_from_class, unreal.CameraActor,
               unreal.Vector(150,-6000,5100), unreal.Rotator(-40,1,0))
    if cam:
        cam.set_actor_label(PREFIX+"Camera_Tactical")
        comp=safe("camera comp",cam.get_editor_property,"camera_component")
        if comp:
            comp.set_editor_property("field_of_view",37.0)


def write_manifest():
    data={
      "visual_target":"original premium stylized medieval fantasy tower defense",
      "target_fps":60,
      "quality_tiers":{"high":"full shadows + medium VFX","medium":"reduced shadows + VFX","low":"static lighting + low VFX"},
      "mobile_limits":{"hero_textures":2048,"environment_textures":1024,"props":512,"dynamic_shadow_lights":1,"local_lights_visible":8},
      "production_replacements":["rigged hero and enemies","hand-painted modular environment","Niagara portal/projectiles/impacts","tower attack animations","LOD chains and texture atlases"],
      "copyright_rule":"original silhouettes, characters, towers, UI and map; no copied Kingdom Rush assets"
    }
    path=unreal.Paths.project_saved_dir()+"premium_graphics_manifest.json"
    try:
        with open(path,"w",encoding="utf-8") as handle:
            json.dump(data,handle,ensure_ascii=False,indent=2)
    except Exception as exc:
        WARN.append("manifest: "+str(exc))


def main():
    for path in ("/Game/Art/Materials/Premium","/Game/Art/FX/Premium",
                 "/Game/Blueprints/Towers/Premium","/Game/Data/Art"):
        ensure_dir(path)
    if LEVELS and hasattr(LEVELS,"load_level"):
        safe("load level",LEVELS.load_level,LEVEL)
    clean()
    p=palette()
    archer_tower(-1500,350,p)
    mage_tower(-350,700,p)
    cannon_tower(900,250,p)
    lightning_tower(1750,-250,p)
    landmarks(p)
    atmosphere()
    write_manifest()
    if LEVELS and hasattr(LEVELS,"save_current_level"):
        safe("save",LEVELS.save_current_level)
    result={"level":LEVEL,"count":COUNT,"warnings":WARN,
            "status":"premium_graphics_pass_complete",
            "next":"replace procedural presentation meshes with production skeletal/static assets"}
    print("PREMIUM_GRAPHICS_JSON "+json.dumps(result,ensure_ascii=False))


main()
