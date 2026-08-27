"""Pixel Defense 3D — environment, texture and VFX pass 07.

Run after premium_graphics_pass_06. Adds procedural surface variation, grass,
flowers, atmospheric sky, clouds, water and readable magical ambience.
Actors prefixed ENV07_ are replaced on every run.
"""
from __future__ import annotations
import json, math, random
import unreal

LEVEL="/Game/Maps/MedievalArtDirection"
PREFIX="ENV07_"
RNG=random.Random(707)
WARN=[]
COUNT={"actors":0,"materials":0,"grass":0,"flowers":0,"vfx":0,"sky":0}


def safe(label,fn,*args):
    try:return fn(*args)
    except Exception as exc:
        WARN.append(f"{label}: {exc}")
        unreal.log_warning(f"ENV_VFX_07 {label}: {exc}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name,unreal.get_editor_subsystem,cls) if cls else None


ACTORS=sub("EditorActorSubsystem")
LEVELS=sub("LevelEditorSubsystem")
ASSETS=unreal.EditorAssetLibrary
TOOLS=unreal.AssetToolsHelpers.get_asset_tools()


def ensure(path):
    if not ASSETS.does_directory_exist(path):
        safe("mkdir "+path,ASSETS.make_directory,path)


def clean():
    if not ACTORS:return
    for actor in list(ACTORS.get_all_level_actors()):
        label=safe("label",actor.get_actor_label) or ""
        if label.startswith(PREFIX):
            safe("destroy "+label,ACTORS.destroy_actor,actor)


def textured_material(name,base,dark,rough=.9,metal=.0,emissive=None,noise_scale=4.0):
    folder="/Game/Art/Materials/Environment07"; ensure(folder)
    path=f"{folder}/{name}"; old=unreal.load_asset(path)
    if old:return old
    m=safe("create "+name,TOOLS.create_asset,name,folder,unreal.Material,unreal.MaterialFactoryNew())
    if not m:return None
    mel=unreal.MaterialEditingLibrary
    c1=safe("color1",mel.create_material_expression,m,unreal.MaterialExpressionConstant3Vector,-700,-120)
    c2=safe("color2",mel.create_material_expression,m,unreal.MaterialExpressionConstant3Vector,-700,60)
    noise=safe("noise",mel.create_material_expression,m,unreal.MaterialExpressionNoise,-700,220)
    lerp=safe("lerp",mel.create_material_expression,m,unreal.MaterialExpressionLinearInterpolate,-250,0)
    if c1:c1.set_editor_property("constant",unreal.LinearColor(*base,1))
    if c2:c2.set_editor_property("constant",unreal.LinearColor(*dark,1))
    if noise:
        safe("noise scale",noise.set_editor_property,"scale",noise_scale)
        safe("noise levels",noise.set_editor_property,"levels",4)
    if c1 and lerp:mel.connect_material_expressions(c1,"",lerp,"A")
    if c2 and lerp:mel.connect_material_expressions(c2,"",lerp,"B")
    if noise and lerp:mel.connect_material_expressions(noise,"",lerp,"Alpha")
    if lerp:mel.connect_material_property(lerp,"",unreal.MaterialProperty.MP_BASE_COLOR)
    r=safe("rough",mel.create_material_expression,m,unreal.MaterialExpressionConstant,-250,180)
    if r:
        r.set_editor_property("r",rough); mel.connect_material_property(r,"",unreal.MaterialProperty.MP_ROUGHNESS)
    mt=safe("metal",mel.create_material_expression,m,unreal.MaterialExpressionConstant,-250,300)
    if mt:
        mt.set_editor_property("r",metal); mel.connect_material_property(mt,"",unreal.MaterialProperty.MP_METALLIC)
    if emissive:
        e=safe("emissive",mel.create_material_expression,m,unreal.MaterialExpressionConstant3Vector,-250,430)
        if e:
            e.set_editor_property("constant",unreal.LinearColor(*emissive,1))
            mel.connect_material_property(e,"",unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    safe("compile",mel.recompile_material,m); safe("save",ASSETS.save_loaded_asset,m)
    COUNT["materials"]+=1
    return m


def palette():
    return {
      "grass":textured_material("M_ENV07_Grass",(.10,.31,.055),(.025,.11,.018),.98,noise_scale=2.5),
      "grass_light":textured_material("M_ENV07_GrassLight",(.20,.43,.075),(.055,.19,.028),.97,noise_scale=3.2),
      "dirt":textured_material("M_ENV07_Dirt",(.38,.19,.075),(.14,.065,.025),.97,noise_scale=5.0),
      "stone":textured_material("M_ENV07_Stone",(.42,.40,.36),(.14,.15,.16),.94,noise_scale=7.0),
      "water":textured_material("M_ENV07_Water",(.025,.18,.28),(.005,.055,.10),.18,0,(.01,.07,.10),3.0),
      "flower_blue":textured_material("M_ENV07_FlowerBlue",(.02,.12,.55),(.01,.04,.2),.55,0,(.02,.15,.9),2.0),
      "flower_gold":textured_material("M_ENV07_FlowerGold",(.9,.36,.015),(.32,.08,.005),.6,0,(.8,.18,.005),2.0),
      "magic_blue":textured_material("M_ENV07_MagicBlue",(.01,.10,.55),(.005,.02,.14),.12,0,(.03,2.2,9.0),2.0),
      "magic_violet":textured_material("M_ENV07_MagicViolet",(.25,.005,.55),(.05,.001,.13),.12,0,(3.2,.02,10.0),2.0),
      "fire":textured_material("M_ENV07_Fire",(.95,.10,.005),(.30,.01,.001),.12,0,(10.0,.45,.01),2.0)
    }


def mesh(label,asset,loc,scale=(1,1,1),rot=(0,0,0),mat=None):
    if not ACTORS:return None
    a=safe("spawn "+label,ACTORS.spawn_actor_from_class,unreal.StaticMeshActor,unreal.Vector(*loc),unreal.Rotator(*rot))
    if not a:return None
    a.set_actor_label(PREFIX+label)
    comp=safe("component",a.get_editor_property,"static_mesh_component")
    sm=unreal.load_asset(asset)
    if comp and sm:
        safe("mesh",comp.set_static_mesh,sm)
        if mat:safe("material",comp.set_material,0,mat)
        safe("no collision",comp.set_collision_enabled,unreal.CollisionEnabled.NO_COLLISION)
        safe("no shadow",comp.set_editor_property,"cast_shadow",False)
    safe("scale",a.set_actor_scale3d,unreal.Vector(*scale))
    COUNT["actors"]+=1
    return a


def point_light(label,loc,color,intensity=1600,radius=500):
    if not ACTORS:return
    a=safe("light "+label,ACTORS.spawn_actor_from_class,unreal.PointLight,unreal.Vector(*loc),unreal.Rotator())
    if not a:return
    a.set_actor_label(PREFIX+label)
    c=safe("light comp",a.get_editor_property,"point_light_component")
    if c:
        c.set_editor_property("light_color",unreal.Color(*color,255))
        c.set_editor_property("intensity",float(intensity))
        c.set_editor_property("attenuation_radius",float(radius))
        safe("light no shadows",c.set_editor_property,"cast_shadows",False)
    COUNT["vfx"]+=1


def build_ground(p):
    # Layered ground patches add readable texture without external assets.
    mesh("Terrain_Base","/Engine/BasicShapes/Cube.Cube",(0,400,-55),(36,25,.5),mat=p["grass"])
    for i in range(34):
        x=RNG.uniform(-3200,3200); y=RNG.choice((-1,1))*RNG.uniform(650,2050)
        mesh(f"GroundPatch_{i}","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,2),
             (RNG.uniform(1.3,4.0),RNG.uniform(.7,2.1),.025),(0,RNG.uniform(0,180),0),
             p["grass_light"] if i%3 else p["dirt"])
    # Cobble accents along the lane.
    for i in range(24):
        x=-2850+i*245; y=RNG.uniform(-250,250)
        mesh(f"PathStone_{i}","/Engine/BasicShapes/Cube.Cube",(x,y,14),
             (RNG.uniform(.45,.95),RNG.uniform(.28,.60),.12),(0,RNG.uniform(-25,25),0),p["stone"])


def build_grass(p):
    for i in range(170):
        x=RNG.uniform(-3250,3250); y=RNG.uniform(-2050,2050)
        if abs(y)<430 or math.hypot(x+2700,y+650)<500 or math.hypot(x-2600,y-450)<650:
            continue
        s=RNG.uniform(.25,.62)
        mesh(f"Grass_{i}","/Engine/BasicShapes/Cone.Cone",(x,y,22*s),
             (.12*s,.12*s,.50*s),(RNG.uniform(-8,8),RNG.uniform(0,360),RNG.uniform(-8,8)),
             p["grass_light"] if i%4 else p["grass"])
        COUNT["grass"]+=1
    for i in range(42):
        x=RNG.uniform(-3100,3100); y=RNG.choice((-1,1))*RNG.uniform(520,1900)
        mat=p["flower_blue"] if i%2 else p["flower_gold"]
        mesh(f"FlowerStem_{i}","/Engine/BasicShapes/Cylinder.Cylinder",(x,y,26),
             (.025,.025,.28),mat=p["grass_light"])
        mesh(f"Flower_{i}","/Engine/BasicShapes/Sphere.Sphere",(x,y,58),(.09,.09,.07),mat=mat)
        COUNT["flowers"]+=1


def build_water(p):
    # Decorative stream on the right side with stepping rocks.
    for i in range(9):
        y=-1800+i*430
        x=3300+math.sin(i*.8)*160
        mesh(f"Water_{i}","/Engine/BasicShapes.Cube.Cube",(x,y,-4),(3.0,2.5,.05),(0,8,0),p["water"])
        if i%2==0:
            mesh(f"RiverRock_{i}","/Engine/BasicShapes/Sphere.Sphere",(x-80,y,35),
                 (RNG.uniform(.45,.9),RNG.uniform(.35,.7),RNG.uniform(.22,.42)),
                 (0,RNG.uniform(0,180),0),p["stone"])


def build_vfx(p):
    # Portal energy: concentric rings, orbiting shards and glow motes.
    for i,r in enumerate((2.9,3.55,4.15)):
        mesh(f"PortalRing_{i}","/Engine/BasicShapes/Torus.Torus",(-2700,-650,390),
             (r,r,r),(90,i*22,0),p["magic_violet"])
    for i in range(12):
        a=math.radians(i*30); x=-2700+math.cos(a)*420; z=390+math.sin(a)*420
        mesh(f"PortalShard_{i}","/Engine/BasicShapes.Cone.Cone",(x,-650,z),
             (.16,.16,.75),(0,i*30,0),p["magic_violet"])
    point_light("PortalAura",(-2700,-650,410),(155,35,255),6200,1200)

    # Blue magic floating motes around village and towers.
    centers=[(-350,700,850),(1750,-250,820),(2600,780,540)]
    k=0
    for cx,cy,cz in centers:
        for j in range(9):
            a=RNG.uniform(0,math.tau); r=RNG.uniform(120,390)
            mesh(f"MagicMote_{k}","/Engine/BasicShapes/Sphere.Sphere",
                 (cx+math.cos(a)*r,cy+math.sin(a)*r,cz+RNG.uniform(-180,220)),
                 (.055,.055,.055),mat=p["magic_blue"])
            COUNT["vfx"]+=1;k+=1

    # Warm fireflies and torch embers for environmental motion targets.
    for i in range(28):
        x=RNG.uniform(-2400,2500); y=RNG.choice((-1,1))*RNG.uniform(500,1500); z=RNG.uniform(80,480)
        mesh(f"Firefly_{i}","/Engine/BasicShapes/Sphere.Sphere",(x,y,z),(.035,.035,.035),mat=p["fire"])
        COUNT["vfx"]+=1


def sky():
    if not ACTORS:return
    for cls_name,label in (("SkyAtmosphere","SkyAtmosphere"),("VolumetricCloud","VolumetricCloud")):
        cls=getattr(unreal,cls_name,None)
        if cls:
            a=safe("spawn "+label,ACTORS.spawn_actor_from_class,cls,unreal.Vector(0,0,0),unreal.Rotator())
            if a:a.set_actor_label(PREFIX+label);COUNT["sky"]+=1
    fog=safe("height fog",ACTORS.spawn_actor_from_class,unreal.ExponentialHeightFog,
             unreal.Vector(0,0,-150),unreal.Rotator())
    if fog:
        fog.set_actor_label(PREFIX+"AtmosphericFog")
        c=safe("fog comp",fog.get_editor_property,"component")
        if c:
            safe("fog density",c.set_editor_property,"fog_density",.0045)
            safe("fog falloff",c.set_editor_property,"fog_height_falloff",.16)
            safe("volumetric fog",c.set_editor_property,"volumetric_fog",True)
        COUNT["sky"]+=1
    wind_cls=getattr(unreal,"WindDirectionalSource",None)
    if wind_cls:
        wind=safe("wind",ACTORS.spawn_actor_from_class,wind_cls,unreal.Vector(0,0,700),unreal.Rotator(0,35,0))
        if wind:
            wind.set_actor_label(PREFIX+"Wind")
            c=safe("wind comp",wind.get_editor_property,"component")
            if c:
                safe("wind strength",c.set_editor_property,"strength",.45)
                safe("wind speed",c.set_editor_property,"speed",.30)


def manifest():
    data={
      "pass":"environment-vfx-07",
      "features":["procedural surface variation","grass and flowers","atmospheric sky","volumetric clouds and fog","water","portal and magic ambience"],
      "next_production_assets":["hand-painted texture packs","masked two-sided grass cards","Niagara animated emitters","flow-map water shader","sky HDRI/cloud material"],
      "mobile_note":"current primitive foliage is an art-direction proxy; replace with instanced foliage before shipping"
    }
    try:
        with open(unreal.Paths.project_saved_dir()+"environment_vfx_07.json","w",encoding="utf-8") as f:
            json.dump(data,f,ensure_ascii=False,indent=2)
    except Exception as exc:WARN.append("manifest: "+str(exc))


def main():
    if LEVELS and hasattr(LEVELS,"load_level"):safe("load",LEVELS.load_level,LEVEL)
    clean();p=palette();build_ground(p);build_grass(p);build_water(p);build_vfx(p);sky();manifest()
    if LEVELS and hasattr(LEVELS,"save_current_level"):safe("save",LEVELS.save_current_level)
    print("ENVIRONMENT_VFX_JSON "+json.dumps({"level":LEVEL,"count":COUNT,"warnings":WARN,"status":"environment_vfx_pass_complete"},ensure_ascii=False))


main()
