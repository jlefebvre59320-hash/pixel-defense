"""Pixel Defense 3D — pipeline d'intégration assets production.

Cette passe ne télécharge aucun asset externe. Elle prépare le projet pour recevoir
les vrais meshes/textures/animations/VFX puis remplace automatiquement les acteurs
MAX_* quand les assets attendus existent dans /Game.

Elle produit :
- dossiers de production normalisés
- DataAsset-like JSON de slots attendus dans Saved/
- remplacement automatique des placeholders environnement par StaticMesh
- points d'ancrage personnages/ennemis/tours pour futurs SkeletalMesh/Blueprint
- balises VFX et gameplay
- rapport JSON détaillé
"""
from __future__ import annotations
import json, os, re
import unreal

LEVEL = "/Game/Maps/MedievalArtDirection"
WARN=[]
REPORT={"folders":0,"static_replaced":0,"character_slots":0,"vfx_slots":0,"tower_slots":0,"missing":[]}

STATIC_MAP = {
    "MAX_House": ["/Game/Art/Environment/Buildings/SM_House_A.SM_House_A","/Game/Art/Environment/Buildings/SM_House_B.SM_House_B","/Game/Art/Environment/Buildings/SM_House_C.SM_House_C"],
    "MAX_Tree": ["/Game/Art/Environment/Foliage/SM_Tree_A.SM_Tree_A","/Game/Art/Environment/Foliage/SM_Tree_B.SM_Tree_B"],
    "MAX_Rock": ["/Game/Art/Environment/Props/SM_Rock_A.SM_Rock_A","/Game/Art/Environment/Props/SM_Rock_B.SM_Rock_B"],
    "MAX_Crate": ["/Game/Art/Environment/Props/SM_Prop_Crate.SM_Prop_Crate"],
    "MAX_Market": ["/Game/Art/Environment/Props/SM_Market_Stall.SM_Market_Stall"],
    "MAX_PortalPedestal": ["/Game/Art/Environment/Props/SM_Portal_Pedestal.SM_Portal_Pedestal"],
    "MAX_CorePedestal": ["/Game/Art/Environment/Props/SM_Core_Pedestal.SM_Core_Pedestal"],
}

CHARACTER_SLOTS = {
    "Hero": "/Game/Art/Characters/Heroes/SK_Hero_Melee.SK_Hero_Melee",
    "Villager": "/Game/Art/Characters/Villagers/SK_Villager.SK_Villager",
    "Enemy_Grunt": "/Game/Art/Characters/Enemies/SK_Enemy_Grunt.SK_Enemy_Grunt",
    "Enemy_Brute": "/Game/Art/Characters/Enemies/SK_Enemy_Brute.SK_Enemy_Brute",
    "Enemy_Ranged": "/Game/Art/Characters/Enemies/SK_Enemy_Ranged.SK_Enemy_Ranged",
    "Enemy_Boss": "/Game/Art/Characters/Enemies/SK_Enemy_Boss.SK_Enemy_Boss",
}

ANIMATION_SLOTS = ["Idle_A","Idle_B","Walk","Run","Attack_A","Attack_B","Hit_A","Hit_B","Death_A","Death_B","Cast","Carry","Hammer"]
VFX_SLOTS = ["NS_Torch","NS_ChimneySmoke","NS_Embers","NS_Portal","NS_CorePulse","NS_Impact","NS_Dust","NS_Fireflies"]
TOWER_SLOTS = ["BP_Tower_Archer","BP_Tower_Mage","BP_Tower_Cannon","BP_Tower_Slow"]


def safe(label, fn, *args):
    try: return fn(*args)
    except Exception as e:
        WARN.append(f"{label}: {e}")
        unreal.log_warning(f"PROD_ASSET_PIPELINE {label}: {e}")
        return None


def sub(name):
    cls=getattr(unreal,name,None)
    return safe(name,unreal.get_editor_subsystem,cls) if cls else None


def ensure(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        if safe("mkdir "+path,unreal.EditorAssetLibrary.make_directory,path) is not None: REPORT["folders"]+=1


def setup_dirs():
    for p in [
        "/Game/Art/Environment/Buildings","/Game/Art/Environment/Foliage","/Game/Art/Environment/Props",
        "/Game/Art/Characters/Heroes","/Game/Art/Characters/Villagers","/Game/Art/Characters/Enemies",
        "/Game/Art/Textures/Environment","/Game/Art/Textures/Characters",
        "/Game/Art/Materials/Masters","/Game/Art/Materials/Instances",
        "/Game/Art/Animations/Common","/Game/Art/Animations/Hero","/Game/Art/Animations/Enemies","/Game/Art/Animations/Villagers",
        "/Game/Art/FX/Niagara","/Game/Blueprints/Characters","/Game/Blueprints/Enemies","/Game/Blueprints/Towers","/Game/Blueprints/VFX",
        "/Game/Data/Art","/Game/Data/Gameplay"]: ensure(p)


def all_actors():
    s=sub("EditorActorSubsystem"); return list(s.get_all_level_actors()) if s else []


def actor_label(a): return safe("label",a.get_actor_label) or ""


def best_static_asset(label):
    for prefix,candidates in STATIC_MAP.items():
        if label.startswith(prefix):
            for c in candidates:
                asset=unreal.load_asset(c)
                if asset:return asset,c
            REPORT["missing"].extend(candidates)
            return None,None
    return None,None


def replace_static_placeholders():
    for a in all_actors():
        lab=actor_label(a)
        asset,path=best_static_asset(lab)
        if not asset: continue
        comp=safe("static comp "+lab,a.get_editor_property,"static_mesh_component")
        if not comp: continue
        if safe("set mesh "+lab,comp.set_static_mesh,asset) is not None:
            REPORT["static_replaced"]+=1
            unreal.log(f"PROD_ASSET_REPLACED {lab} -> {path}")


def create_anchor(label,location,kind,target_path):
    s=sub("EditorActorSubsystem")
    a=safe("anchor "+label,s.spawn_actor_from_class,unreal.TargetPoint,location,unreal.Rotator()) if s else None
    if not a:return None
    a.set_actor_label("PROD_"+label)
    # Le chemin cible reste encodé dans le label pour inspection sans dépendre d'une classe custom.
    a.set_actor_label("PROD_%s__%s"%(label,target_path.rsplit("/",1)[-1].split(".")[0]))
    return a


def cleanup_anchors():
    s=sub("EditorActorSubsystem")
    if not s:return
    for a in list(s.get_all_level_actors()):
        if actor_label(a).startswith("PROD_"): safe("delete anchor",s.destroy_actor,a)


def build_character_anchors():
    anchors=[
        ("HeroSpawn",unreal.Vector(2200,160,20),"Hero"),
        ("VillagerSpawnA",unreal.Vector(-1800,850,20),"Villager"),
        ("VillagerSpawnB",unreal.Vector(1700,700,20),"Villager"),
        ("EnemySpawn",unreal.Vector(-2600,-700,20),"Enemy_Grunt"),
        ("EnemyBrutePreview",unreal.Vector(-2050,-850,20),"Enemy_Brute"),
        ("EnemyRangedPreview",unreal.Vector(-1750,-950,20),"Enemy_Ranged"),
        ("BossPreview",unreal.Vector(-1400,-1150,20),"Enemy_Boss"),
    ]
    for name,loc,slot in anchors:
        if create_anchor(name,loc,"character",CHARACTER_SLOTS[slot]): REPORT["character_slots"]+=1


def build_vfx_anchors():
    locs={"NS_Portal":(-2600,-700,330),"NS_CorePulse":(2600,200,420),"NS_Impact":(0,0,120),"NS_Dust":(-600,0,40),"NS_Fireflies":(0,1450,180),"NS_Torch":(-1600,500,280),"NS_ChimneySmoke":(-1750,1280,650),"NS_Embers":(1600,500,300)}
    for vfx in VFX_SLOTS:
        path=f"/Game/Art/FX/Niagara/{vfx}.{vfx}"
        if create_anchor("VFX_"+vfx,unreal.Vector(*locs[vfx]),"vfx",path): REPORT["vfx_slots"]+=1


def build_tower_anchors():
    pads=[(-1500,-1300),(-900,900),(-200,-700),(500,1050),(1100,-950),(1700,750),(500,-1200),(1900,1100)]
    for i,(x,y) in enumerate(pads):
        slot=TOWER_SLOTS[i%len(TOWER_SLOTS)]
        path=f"/Game/Blueprints/Towers/{slot}.{slot}"
        if create_anchor(f"TowerSlot_{i:02d}",unreal.Vector(x,y,80),"tower",path): REPORT["tower_slots"]+=1


def write_manifest():
    root=unreal.Paths.project_saved_dir(); os.makedirs(root,exist_ok=True)
    manifest={
      "static_map":STATIC_MAP,"characters":CHARACTER_SLOTS,"animations":ANIMATION_SLOTS,"vfx":VFX_SLOTS,"towers":TOWER_SLOTS,
      "import_rules":{"static_mesh":"FBX/GLTF, centimeters, pivot propre, LOD0-2","skeletal_mesh":"FBX, skeleton partagé par famille","textures":"PNG/TGA; BaseColor sRGB, Normal non-sRGB, ORM packed conseillé","animations":"FBX séparés; root motion uniquement si gameplay le demande"},
      "mobile":{"target_fps":60,"textures":{"hero":2048,"environment":1024,"small_props":512},"lod_required":True,"niagara_distance_cull":True,"dynamic_light_overlap":"minimal"}}
    with open(os.path.join(root,"production_asset_slots.json"),"w",encoding="utf-8") as f: json.dump(manifest,f,ensure_ascii=False,indent=2)


def main():
    ls=sub("LevelEditorSubsystem")
    if ls and hasattr(ls,"load_level"): safe("load",ls.load_level,LEVEL)
    setup_dirs(); cleanup_anchors(); replace_static_placeholders(); build_character_anchors(); build_vfx_anchors(); build_tower_anchors(); write_manifest()
    if ls and hasattr(ls,"save_current_level"): safe("save",ls.save_current_level)
    # dédoublonnage du rapport missing
    REPORT["missing"]=sorted(set(REPORT["missing"]))
    print("PRODUCTION_ASSET_PIPELINE_JSON "+json.dumps({"level":LEVEL,"report":REPORT,"warnings":WARN,"status":"production_slots_ready"},ensure_ascii=False))

main()
