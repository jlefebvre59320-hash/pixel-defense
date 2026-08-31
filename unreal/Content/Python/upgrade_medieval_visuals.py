"""Pixel Defense 3D - passe visuelle médiévale directe.
Crée une scène jouable/lisible à partir du blockout existant sans asset externe :
matériaux stylisés, village, arbres, props, personnages placeholders, portail,
coeur magique, éclairage, fog et caméra tower-defense.
"""
from __future__ import annotations
import json
import unreal

LEVEL = "/Game/Maps/MedievalArtDirection"
WARNINGS=[]
COUNT={"materials":0,"actors":0,"characters":0,"lights":0}


def safe(label, fn, *args):
    try: return fn(*args)
    except Exception as e:
        WARNINGS.append(f"{label}: {e}")
        unreal.log_warning(f"MEDIEVAL_UPGRADE {label}: {e}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name, unreal.get_editor_subsystem, cls) if cls else None


def ensure_dir(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        safe("mkdir "+path, unreal.EditorAssetLibrary.make_directory, path)


def material(name, rgb, rough=.75, metal=0.0, emissive=None):
    folder="/Game/Art/Materials/Generated"; ensure_dir(folder)
    p=f"{folder}/{name}"; old=unreal.load_asset(p)
    if old: return old
    tools=unreal.AssetToolsHelpers.get_asset_tools()
    m=safe("mat "+name, tools.create_asset, name, folder, unreal.Material, unreal.MaterialFactoryNew())
    if not m: return None
    mel=unreal.MaterialEditingLibrary
    c=safe("base expr", mel.create_material_expression, m, unreal.MaterialExpressionConstant3Vector, -350, 0)
    if c:
        c.set_editor_property("constant", unreal.LinearColor(*rgb,1)); mel.connect_material_property(c,"",unreal.MaterialProperty.MP_BASE_COLOR)
    r=safe("rough expr", mel.create_material_expression, m, unreal.MaterialExpressionConstant, -350,180)
    if r:
        r.set_editor_property("r",rough); mel.connect_material_property(r,"",unreal.MaterialProperty.MP_ROUGHNESS)
    mt=safe("metal expr", mel.create_material_expression, m, unreal.MaterialExpressionConstant, -350,320)
    if mt:
        mt.set_editor_property("r",metal); mel.connect_material_property(mt,"",unreal.MaterialProperty.MP_METALLIC)
    if emissive:
        e=safe("emit expr", mel.create_material_expression, m, unreal.MaterialExpressionConstant3Vector, -350,460)
        if e:
            e.set_editor_property("constant", unreal.LinearColor(*emissive,1)); mel.connect_material_property(e,"",unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    safe("compile", mel.recompile_material, m); safe("save mat", unreal.EditorAssetLibrary.save_loaded_asset, m)
    COUNT["materials"]+=1; return m


def actor_sub(): return sub("EditorActorSubsystem")
def all_actors():
    s=actor_sub(); return list(s.get_all_level_actors()) if s else []
def label(a): return safe("label",a.get_actor_label) or ""

def setmat(a,m):
    c=safe("comp",a.get_editor_property,"static_mesh_component")
    if c and m: safe("setmat",c.set_material,0,m)


def spawn_mesh(lbl, mesh_path, loc, scale=(1,1,1), rot=(0,0,0), mat=None):
    s=actor_sub();
    a=safe("spawn "+lbl,s.spawn_actor_from_class,unreal.StaticMeshActor,unreal.Vector(*loc),unreal.Rotator(*rot)) if s else None
    if not a: return None
    safe("label "+lbl,a.set_actor_label,lbl)
    c=safe("comp "+lbl,a.get_editor_property,"static_mesh_component")
    if c:
        safe("mesh "+lbl,c.set_static_mesh,unreal.load_asset(mesh_path))
        if mat: safe("mat "+lbl,c.set_material,0,mat)
    safe("scale "+lbl,a.set_actor_scale3d,unreal.Vector(*scale)); COUNT["actors"]+=1; return a


def point_light(lbl,loc,color,intensity=3500,radius=700):
    s=actor_sub(); a=safe("light",s.spawn_actor_from_class,unreal.PointLight,unreal.Vector(*loc),unreal.Rotator()) if s else None
    if not a:return
    safe("label light",a.set_actor_label,lbl)
    c=safe("light comp",a.get_editor_property,"point_light_component")
    if c:
        c.set_editor_property("light_color",unreal.Color(*color,255)); c.set_editor_property("intensity",float(intensity)); c.set_editor_property("attenuation_radius",float(radius))
    COUNT["lights"]+=1


def recolor(m):
    for a in all_actors():
        l=label(a)
        if l=="ENV_Terrain_Medieval": setmat(a,m["grass"])
        elif l.startswith("PATH_"): setmat(a,m["path"])
        elif l.startswith("WALL_") or l.startswith("GATE_"): setmat(a,m["stone"])
        elif l.startswith("TOWER_PAD_"): setmat(a,m["pad"])
        elif l.startswith("PORTAL_Enemy"): setmat(a,m["portal"])
        elif l.startswith("CORE_"): setmat(a,m["core"])
        elif l.startswith("VILLAGE_PROP_"): setmat(a,m["wood"])


def house(i,x,y,yaw,m):
    spawn_mesh(f"ENV_House_{i}_Body","/Engine/BasicShapes/Cube.Cube",(x,y,180),(3,2.4,3.2),(0,yaw,0),m["plaster"])
    spawn_mesh(f"ENV_House_{i}_Roof","/Engine/BasicShapes/Cone.Cone",(x,y,500),(3.7,3.0,2.2),(0,yaw,0),m["roof"])
    for dy in (-215,215): spawn_mesh(f"ENV_House_{i}_Beam_{dy}","/Engine/BasicShapes/Cube.Cube",(x,y+dy,220),(3.1,.16,.2),(0,yaw,0),m["wood"])
    spawn_mesh(f"ENV_House_{i}_Door","/Engine/BasicShapes/Cube.Cube",(x,y-250,130),(.7,.1,1.5),(0,yaw,0),m["wood_dark"])


def tree(i,x,y,s,m):
    spawn_mesh(f"ENV_Tree_{i}_Trunk","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,150*s),(.45*s,.45*s,3*s),mat=m["wood_dark"])
    spawn_mesh(f"ENV_Tree_{i}_CrownA","/Engine/BasicShapes/Cone.Cone",(x,y,430*s),(2.2*s,2.2*s,2.7*s),mat=m["foliage"])
    spawn_mesh(f"ENV_Tree_{i}_CrownB","/Engine/BasicShapes/Cone.Cone",(x,y,620*s),(1.5*s,1.5*s,2.1*s),mat=m["foliage_dark"])


def character(prefix,x,y,yaw,body,skin,accent,m,enemy=False):
    for dx in (-22,22): spawn_mesh(prefix+f"_Leg{dx}","/Engine/BasicShapes/Cylinder.Cylinder",(x+dx,y,85),(.22,.22,.9),(0,yaw,0),body)
    spawn_mesh(prefix+"_Torso","/Engine/BasicShapes/Cube.Cube",(x,y,210),(.65,.42,1.15),(0,yaw,0),body)
    spawn_mesh(prefix+"_Head","/Engine/BasicShapes/Sphere.Sphere",(x,y,350),(.52,.52,.52),(0,yaw,0),skin)
    spawn_mesh(prefix+"_Accent","/Engine/BasicShapes/Cube.Cube",(x,y-45,235),(.72,.08,.30),(0,yaw,0),accent)
    if enemy: spawn_mesh(prefix+"_Weapon","/Engine/BasicShapes/Cylinder.Cylinder",(x+75,y,220),(.07,.07,1.5),(0,yaw,10),m["metal"])
    COUNT["characters"]+=1


def add_scene(m):
    for i,p in enumerate([(-2050,1100,15),(-1450,1250,-12),(1300,1250,8),(1900,900,-18)]): house(i,*p,m)
    for i,p in enumerate([(-2900,-1700,1),(-2400,-1550,.8),(-1750,-1800,1.15),(-800,-1800,.9),(850,-1800,1),(1550,-1600,.85),(2450,-1500,1.1),(2900,1200,.9)]): tree(i,*p,m)
    for i,(x,y) in enumerate([(-2250,650),(-1800,650),(1500,650),(2050,450)]):
        spawn_mesh(f"PROP_Crate_{i}","/Engine/BasicShapes/Cube.Cube",(x,y,65),(.65,.65,.65),mat=m["wood"])
    for i,(x,y) in enumerate([(-2500,200),(-1200,650),(700,700),(2100,-600)]):
        spawn_mesh(f"PROP_Torch_{i}","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,120),(.12,.12,2.2),mat=m["metal"])
        spawn_mesh(f"PROP_Flame_{i}","/Engine/BasicShapes/Sphere.Sphere",(x,y,260),(.28,.28,.4),mat=m["fire"])
        point_light(f"LIGHT_Torch_{i}",(x,y,285),(255,135,55),3000,550)
    villagers=[(-2050,600,0),(-1600,850,20),(1450,700,-10),(1800,500,15)]
    for i,(x,y,r) in enumerate(villagers): character(f"CHAR_Villager_{i}",x,y,r,m["cloth"],m["skin"],m["cloth_accent"],m)
    enemies=[(-2350,-650,0),(-1900,-600,0),(-1450,-520,0)]
    for i,(x,y,r) in enumerate(enemies): character(f"CHAR_Enemy_{i}",x,y,r,m["enemy"],m["enemy_skin"],m["portal"],m,True)
    # portail et coeur renforcés
    spawn_mesh("FX_PortalRing","/Engine/BasicShapes/Torus.Torus",(-2600,-700,280),(3.3,3.3,3.3),(90,0,0),m["portal"])
    point_light("LIGHT_Portal",(-2600,-700,330),(150,70,255),7000,1000)
    point_light("LIGHT_Core",(2600,200,420),(65,170,255),6500,1000)


def atmosphere():
    s=actor_sub()
    # fog léger
    fog=safe("fog",s.spawn_actor_from_class,unreal.ExponentialHeightFog,unreal.Vector(0,0,0),unreal.Rotator()) if s else None
    if fog:
        safe("fog label",fog.set_actor_label,"FX_Atmosphere_Fog")
        c=safe("fog comp",fog.get_editor_property,"component")
        if c:
            safe("fog density",c.set_editor_property,"fog_density",0.012)
    # caméra tactique
    cam=safe("camera",s.spawn_actor_from_class,unreal.CameraActor,unreal.Vector(0,-5200,4200),unreal.Rotator(-38,0,0)) if s else None
    if cam:
        safe("cam label",cam.set_actor_label,"CAM_TowerDefense")
        cc=safe("cam comp",cam.get_editor_property,"camera_component")
        if cc: safe("fov",cc.set_editor_property,"field_of_view",42.0)


def main():
    ls=sub("LevelEditorSubsystem")
    if ls and hasattr(ls,"load_level"): safe("load level",ls.load_level,LEVEL)
    m={
      "grass":material("M_GrassStylized",(.12,.32,.10),.95),
      "foliage":material("M_Foliage",(.16,.42,.13),.9),
      "foliage_dark":material("M_FoliageDark",(.07,.22,.08),.92),
      "path":material("M_PathEarth",(.30,.20,.12),.95),
      "stone":material("M_StoneWarm",(.34,.32,.30),.88),
      "pad":material("M_TowerPad",(.26,.25,.23),.82),
      "wood":material("M_Wood",(.25,.11,.045),.85),
      "wood_dark":material("M_WoodDark",(.10,.045,.025),.9),
      "plaster":material("M_Plaster",(.62,.52,.38),.95),
      "roof":material("M_RoofTile",(.38,.09,.05),.9),
      "metal":material("M_Iron",(.10,.11,.12),.45,.7),
      "cloth":material("M_Cloth",(.12,.20,.34),.95),
      "cloth_accent":material("M_ClothAccent",(.62,.32,.07),.92),
      "skin":material("M_Skin",(.62,.42,.29),.82),
      "enemy":material("M_EnemyCloth",(.18,.05,.05),.93),
      "enemy_skin":material("M_EnemySkin",(.30,.33,.26),.86),
      "portal":material("M_Portal",(.18,.03,.34),.35,0,(1.8,.2,4.0)),
      "core":material("M_Core",(.04,.22,.40),.28,0,(.15,1.5,4.0)),
      "fire":material("M_Fire",(.7,.16,.02),.2,0,(4.0,.55,.05)),
    }
    recolor(m); add_scene(m); atmosphere()
    if ls and hasattr(ls,"save_current_level"): safe("save level",ls.save_current_level)
    print("MEDIEVAL_VISUAL_UPGRADE_JSON "+json.dumps({"level":LEVEL,"counts":COUNT,"warnings":WARNINGS,"status":"ready_for_real_assets_and_animation"},ensure_ascii=False))

main()
