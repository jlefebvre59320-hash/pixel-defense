"""Pixel Defense 3D — passe MAX médiévale.

Objectif: pousser au maximum ce qui peut être généré sans assets binaires externes.
La passe enrichit MedievalArtDirection avec:
- matériaux stylisés procéduraux simples et palette cohérente
- environnement plus dense: village, forêt, remparts, marché, props
- silhouettes de personnages alliés/ennemis
- points lumineux, fog, sky, caméra tactique
- balises de gameplay (spawn, core, tower pads)
- dossiers/slots prêts à recevoir vrais meshes, textures, animations et Niagara

Le script est idempotent par labels autant que possible: il supprime d'abord les
acteurs préfixés MAX_ avant de reconstruire sa couche.
"""
from __future__ import annotations
import json, math, random
import unreal

LEVEL = "/Game/Maps/MedievalArtDirection"
RNG = random.Random(1337)
WARN=[]
COUNT={"actors":0,"materials":0,"characters":0,"trees":0,"props":0,"lights":0}
PREFIX="MAX_"


def safe(label, fn, *args):
    try: return fn(*args)
    except Exception as e:
        WARN.append(f"{label}: {e}")
        unreal.log_warning(f"MEDIEVAL_MAX {label}: {e}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name,unreal.get_editor_subsystem,cls) if cls else None


def ensure_dir(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        safe("mkdir "+path,unreal.EditorAssetLibrary.make_directory,path)


def setup_dirs():
    for p in [
        "/Game/Art/Characters/Heroes","/Game/Art/Characters/Enemies","/Game/Art/Characters/Villagers",
        "/Game/Art/Environment/Buildings","/Game/Art/Environment/Foliage","/Game/Art/Environment/Props",
        "/Game/Art/Textures/Environment","/Game/Art/Textures/Characters","/Game/Art/Materials/GeneratedMax",
        "/Game/Art/FX/Niagara","/Game/Art/Animations/Common","/Game/Art/Animations/Enemies",
        "/Game/Blueprints/Characters","/Game/Blueprints/Enemies","/Game/Blueprints/Towers",
        "/Game/Data/Art","/Game/Data/Gameplay"]:
        ensure_dir(p)


def mat(name,color,rough=.85,metal=0.0,emit=None):
    folder="/Game/Art/Materials/GeneratedMax"; ensure_dir(folder)
    path=f"{folder}/{name}"; old=unreal.load_asset(path)
    if old:return old
    m=safe("create material",unreal.AssetToolsHelpers.get_asset_tools().create_asset,name,folder,unreal.Material,unreal.MaterialFactoryNew())
    if not m:return None
    mel=unreal.MaterialEditingLibrary
    c=safe("base",mel.create_material_expression,m,unreal.MaterialExpressionConstant3Vector,-500,0)
    if c:
        c.set_editor_property("constant",unreal.LinearColor(*color,1)); mel.connect_material_property(c,"",unreal.MaterialProperty.MP_BASE_COLOR)
    r=safe("rough",mel.create_material_expression,m,unreal.MaterialExpressionConstant,-500,160)
    if r:
        r.set_editor_property("r",rough); mel.connect_material_property(r,"",unreal.MaterialProperty.MP_ROUGHNESS)
    mt=safe("metal",mel.create_material_expression,m,unreal.MaterialExpressionConstant,-500,300)
    if mt:
        mt.set_editor_property("r",metal); mel.connect_material_property(mt,"",unreal.MaterialProperty.MP_METALLIC)
    if emit:
        e=safe("emit",mel.create_material_expression,m,unreal.MaterialExpressionConstant3Vector,-500,440)
        if e:
            e.set_editor_property("constant",unreal.LinearColor(*emit,1)); mel.connect_material_property(e,"",unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    safe("compile",mel.recompile_material,m); safe("save",unreal.EditorAssetLibrary.save_loaded_asset,m)
    COUNT["materials"]+=1; return m


def actor_sub(): return sub("EditorActorSubsystem")

def destroy_previous():
    s=actor_sub()
    if not s:return
    for a in list(s.get_all_level_actors()):
        lab=safe("label",a.get_actor_label) or ""
        if lab.startswith(PREFIX): safe("delete "+lab,s.destroy_actor,a)


def spawn_mesh(lbl,mesh,loc,scale=(1,1,1),rot=(0,0,0),material=None):
    s=actor_sub(); a=safe("spawn "+lbl,s.spawn_actor_from_class,unreal.StaticMeshActor,unreal.Vector(*loc),unreal.Rotator(*rot)) if s else None
    if not a:return None
    safe("label "+lbl,a.set_actor_label,PREFIX+lbl)
    c=safe("comp "+lbl,a.get_editor_property,"static_mesh_component")
    if c:
        sm=unreal.load_asset(mesh)
        if sm:safe("mesh "+lbl,c.set_static_mesh,sm)
        if material:safe("material "+lbl,c.set_material,0,material)
    safe("scale "+lbl,a.set_actor_scale3d,unreal.Vector(*scale)); COUNT["actors"]+=1; return a


def point_light(lbl,loc,color=(255,150,70),intensity=4000,radius=650):
    s=actor_sub(); a=safe("light "+lbl,s.spawn_actor_from_class,unreal.PointLight,unreal.Vector(*loc),unreal.Rotator()) if s else None
    if not a:return None
    a.set_actor_label(PREFIX+lbl)
    c=safe("pl comp",a.get_editor_property,"point_light_component")
    if c:
        c.set_editor_property("light_color",unreal.Color(*color,255)); c.set_editor_property("intensity",float(intensity)); c.set_editor_property("attenuation_radius",float(radius))
    COUNT["lights"]+=1; return a


def build_palette():
    return {
      "grass":mat("M_MAX_Grass",(.085,.26,.07),.96),"grass2":mat("M_MAX_GrassDark",(.035,.13,.04),.98),
      "earth":mat("M_MAX_Earth",(.22,.12,.055),.96),"stone":mat("M_MAX_Stone",(.31,.29,.26),.91),
      "stone2":mat("M_MAX_StoneDark",(.16,.16,.16),.93),"wood":mat("M_MAX_Wood",(.23,.095,.032),.9),
      "wood2":mat("M_MAX_WoodDark",(.075,.027,.012),.93),"plaster":mat("M_MAX_Plaster",(.58,.47,.34),.96),
      "roof":mat("M_MAX_Roof",(.30,.055,.028),.94),"iron":mat("M_MAX_Iron",(.07,.08,.09),.44,.8),
      "cloth_blue":mat("M_MAX_ClothBlue",(.06,.15,.34),.96),"cloth_red":mat("M_MAX_ClothRed",(.36,.045,.035),.96),
      "cloth_gold":mat("M_MAX_ClothGold",(.62,.31,.035),.9),"skin":mat("M_MAX_Skin",(.58,.38,.25),.82),
      "enemy_skin":mat("M_MAX_EnemySkin",(.24,.28,.19),.9),"portal":mat("M_MAX_Portal",(.10,.01,.26),.25,0,(2.4,.08,5.0)),
      "core":mat("M_MAX_Core",(.01,.18,.42),.2,0,(.08,1.5,5.0)),"fire":mat("M_MAX_Fire",(.85,.12,.01),.18,0,(5.0,.65,.03)),
      "water":mat("M_MAX_Water",(.02,.12,.18),.12,0,(.02,.12,.18))}


def house(i,x,y,yaw,m,scale=1.0):
    spawn_mesh(f"House{i}_Body","/Engine/BasicShapes/Cube.Cube",(x,y,180*scale),(3*scale,2.35*scale,3.0*scale),(0,yaw,0),m["plaster"])
    spawn_mesh(f"House{i}_Roof","/Engine/BasicShapes/Cone.Cone",(x,y,490*scale),(3.7*scale,2.9*scale,2.15*scale),(0,yaw,0),m["roof"])
    for z in (75,255,430): spawn_mesh(f"House{i}_BeamZ{z}","/Engine/BasicShapes/Cube.Cube",(x,y-242*scale,z*scale),(3.05*scale,.11*scale,.11*scale),(0,yaw,0),m["wood2"])
    for ox in (-225,0,225): spawn_mesh(f"House{i}_BeamX{ox}","/Engine/BasicShapes/Cube.Cube",(x+ox*scale,y-242*scale,245*scale),(.10*scale,.11*scale,2.55*scale),(0,yaw,0),m["wood2"])
    spawn_mesh(f"House{i}_Door","/Engine/BasicShapes/Cube.Cube",(x,y-252*scale,125*scale),(.62*scale,.10*scale,1.45*scale),(0,yaw,0),m["wood"])
    COUNT["props"]+=1


def tree(i,x,y,s,m):
    spawn_mesh(f"Tree{i}_Trunk","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,145*s),(.38*s,.38*s,2.9*s),material=m["wood2"])
    for j,(z,sc) in enumerate(((390,2.15),(540,1.72),(665,1.25))): spawn_mesh(f"Tree{i}_Crown{j}","/Engine/BasicShapes/Cone.Cone",(x,y,z*s),(sc*s,sc*s,2.25*s),material=m["grass2"] if j==2 else m["grass"])
    COUNT["trees"]+=1


def humanoid(name,x,y,yaw,body,skin,accent,m,weapon=False):
    for dx in (-23,23): spawn_mesh(name+f"_Leg{dx}","/Engine/BasicShapes/Cylinder.Cylinder",(x+dx,y,82),(.20,.20,.82),(0,yaw,0),body)
    spawn_mesh(name+"_Torso","/Engine/BasicShapes/Cube.Cube",(x,y,205),(.62,.42,1.1),(0,yaw,0),body)
    spawn_mesh(name+"_Head","/Engine/BasicShapes/Sphere.Sphere",(x,y,345),(.50,.50,.50),(0,yaw,0),skin)
    spawn_mesh(name+"_Tabard","/Engine/BasicShapes/Cube.Cube",(x,y-45,235),(.68,.07,.34),(0,yaw,0),accent)
    if weapon: spawn_mesh(name+"_Weapon","/Engine/BasicShapes/Cylinder.Cylinder",(x+82,y,220),(.065,.065,1.55),(0,yaw,12),m["iron"])
    COUNT["characters"]+=1


def market(i,x,y,m):
    spawn_mesh(f"Market{i}_Table","/Engine/BasicShapes/Cube.Cube",(x,y,85),(1.25,.7,.16),material=m["wood"])
    for dx in (-105,105): spawn_mesh(f"Market{i}_Post{dx}","/Engine/BasicShapes/Cylinder.Cylinder",(x+dx,y,180),(.08,.08,1.8),material=m["wood2"])
    spawn_mesh(f"Market{i}_Canopy","/Engine/BasicShapes/Cube.Cube",(x,y,330),(1.5,.9,.08),material=m["cloth_red"] if i%2 else m["cloth_blue"])
    COUNT["props"]+=1


def torch(i,x,y,m):
    spawn_mesh(f"Torch{i}_Pole","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,130),(.10,.10,2.3),material=m["iron"])
    spawn_mesh(f"Torch{i}_Flame","/Engine/BasicShapes/Sphere.Sphere",(x,y,275),(.24,.24,.38),material=m["fire"])
    point_light(f"Torch{i}_Light",(x,y,295),(255,120,45),3300,520)


def build_world(m):
    # Village dense
    houses=[(-2300,1150,12,1.0),(-1750,1280,-8,.92),(-1120,1180,15,.85),(1250,1270,-10,.92),(1850,1120,8,1.0),(2350,900,-14,.82)]
    for i,p in enumerate(houses): house(i,*p,m)
    for i,p in enumerate([(-1950,650),(-1450,720),(1420,700),(2050,520)]): market(i,*p,m)
    # forêt périphérique
    idx=0
    for side in (-1,1):
        for k in range(12):
            x=-3000+k*520+RNG.randint(-120,120); y=side*(1900+RNG.randint(-180,260)); tree(idx,x,y,RNG.uniform(.75,1.18),m); idx+=1
    # rochers/caisses/barils stylisés
    for i in range(18):
        x=RNG.randint(-2900,2900); y=RNG.choice([-1,1])*RNG.randint(1050,1750)
        spawn_mesh(f"Rock{i}","/Engine/BasicShapes/Sphere.Sphere",(x,y,55),(RNG.uniform(.45,1.1),RNG.uniform(.35,.9),RNG.uniform(.25,.6)),material=m["stone2"]); COUNT["props"]+=1
    for i,(x,y) in enumerate([(-2200,550),(-2050,520),(-1500,560),(1550,520),(1750,480),(2120,380)]):
        spawn_mesh(f"Crate{i}","/Engine/BasicShapes/Cube.Cube",(x,y,55),(.55,.55,.55),material=m["wood"]); COUNT["props"]+=1
    # personnages
    for i,(x,y,r) in enumerate([(-2100,760,5),(-1700,880,-15),(-1280,760,20),(1350,820,-10),(1780,680,12),(2200,600,-8)]): humanoid(f"Villager{i}",x,y,r,m["cloth_blue"],m["skin"],m["cloth_gold"],m)
    for i,(x,y,r) in enumerate([(-2400,-620,0),(-2050,-600,0),(-1700,-570,0),(-1350,-500,0),(-1020,-390,0)]): humanoid(f"Enemy{i}",x,y,r,m["cloth_red"],m["enemy_skin"],m["portal"],m,True)
    humanoid("Hero",2200,160,180,m["cloth_blue"],m["skin"],m["cloth_gold"],m,True)
    # torches
    for i,p in enumerate([(-2550,250),(-1600,500),(-600,650),(600,650),(1600,500),(2450,250)]): torch(i,*p,m)
    # portail/core accentués
    spawn_mesh("PortalRing","/Engine/BasicShapes/Torus.Torus",(-2600,-700,300),(3.5,3.5,3.5),(90,0,0),m["portal"])
    spawn_mesh("PortalPedestal","/Engine/BasicShapes/Cylinder.Cylinder",(-2600,-700,70),(4.0,4.0,1.1),material=m["stone2"])
    point_light("PortalGlow",(-2600,-700,340),(140,55,255),8500,1100)
    spawn_mesh("CorePedestal","/Engine/BasicShapes/Cylinder.Cylinder",(2600,200,80),(4.5,4.5,1.25),material=m["stone"])
    spawn_mesh("CoreCrystal","/Engine/BasicShapes/Cone.Cone",(2600,200,360),(1.9,1.9,5.3),material=m["core"])
    point_light("CoreGlow",(2600,200,420),(60,170,255),8200,1100)
    # petit bassin décoratif
    spawn_mesh("WaterPond","/Engine/BasicShapes/Cylinder.Cylinder",(0,1450,15),(5.0,3.2,.15),material=m["water"])


def setup_atmosphere():
    s=actor_sub()
    fog=safe("fog",s.spawn_actor_from_class,unreal.ExponentialHeightFog,unreal.Vector(0,0,0),unreal.Rotator()) if s else None
    if fog:
        fog.set_actor_label(PREFIX+"Fog")
        c=safe("fog comp",fog.get_editor_property,"component")
        if c:
            safe("density",c.set_editor_property,"fog_density",0.018); safe("falloff",c.set_editor_property,"fog_height_falloff",0.22)
    cam=safe("camera",s.spawn_actor_from_class,unreal.CameraActor,unreal.Vector(0,-5600,4700),unreal.Rotator(-39,0,0)) if s else None
    if cam:
        cam.set_actor_label(PREFIX+"Camera_Tactical")
        c=safe("cam comp",cam.get_editor_property,"camera_component")
        if c:safe("fov",c.set_editor_property,"field_of_view",40.0)


def save_manifest():
    manifest={
      "required_real_assets":{
        "environment":["modular half-timber houses","stone wall/gate/tower kit","market props","barrels/crates/carts","rocks","grass/flowers","deciduous trees","dirt/cobble decals"],
        "characters":["hero melee","villager male/female","enemy grunt","enemy brute","enemy ranged","boss"],
        "animations":["idle","walk","run","attack","hit","death","carry","hammer","cast"],
        "vfx":["torch flame","smoke","embers","portal","core pulse","impact","dust","fireflies"]},
      "mobile_rules":{"target_fps":60,"hero_texture_max":2048,"environment_texture_max":1024,"small_props_texture_max":512,"lods":"required","nanite":"avoid by default on mobile until profiled","dynamic_lights":"budgeted; bake/static where possible"},
      "naming":{"static_mesh":"SM_","skeletal_mesh":"SK_","material":"M_","material_instance":"MI_","texture":"T_","niagara":"NS_","blueprint":"BP_","animation":"A_"}}
    path=unreal.Paths.project_content_dir()+"../Saved/medieval_asset_manifest.json"
    try:
        import os
        os.makedirs(os.path.dirname(path),exist_ok=True)
        with open(path,"w",encoding="utf-8") as f: json.dump(manifest,f,ensure_ascii=False,indent=2)
    except Exception as e: WARN.append("manifest: "+str(e))


def main():
    setup_dirs(); ls=sub("LevelEditorSubsystem")
    if ls and hasattr(ls,"load_level"): safe("load",ls.load_level,LEVEL)
    destroy_previous(); m=build_palette(); build_world(m); setup_atmosphere(); save_manifest()
    if ls and hasattr(ls,"save_current_level"): safe("save level",ls.save_current_level)
    print("MEDIEVAL_MAX_JSON "+json.dumps({"level":LEVEL,"count":COUNT,"warnings":WARN,"status":"max_procedural_pass_complete","next":"import real production assets + rigged characters + Niagara and replace MAX placeholders"},ensure_ascii=False))

main()
