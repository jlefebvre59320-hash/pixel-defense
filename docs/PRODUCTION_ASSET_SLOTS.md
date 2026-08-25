# Pixel Defense 3D — slots d'assets production

Cette étape transforme la map `MedievalArtDirection` en cible d'intégration pour de vrais assets 3D.

## Objectif
Les acteurs `MAX_*` restent utilisables comme fallback. Le script `production_asset_pipeline.py` cherche les assets de production attendus sous `/Game/Art/...` et remplace automatiquement les meshes quand ils existent. En leur absence, il crée des anchors `PROD_*` pour personnages, VFX et tours.

## Assets statiques attendus
- `/Game/Art/Environment/Buildings/SM_House_A`
- `/Game/Art/Environment/Buildings/SM_House_B`
- `/Game/Art/Environment/Buildings/SM_House_C`
- `/Game/Art/Environment/Foliage/SM_Tree_A`
- `/Game/Art/Environment/Foliage/SM_Tree_B`
- `/Game/Art/Environment/Props/SM_Rock_A`
- `/Game/Art/Environment/Props/SM_Rock_B`
- `/Game/Art/Environment/Props/SM_Prop_Crate`
- `/Game/Art/Environment/Props/SM_Market_Stall`
- `/Game/Art/Environment/Props/SM_Portal_Pedestal`
- `/Game/Art/Environment/Props/SM_Core_Pedestal`

## Personnages attendus
- `SK_Hero_Melee`
- `SK_Villager`
- `SK_Enemy_Grunt`
- `SK_Enemy_Brute`
- `SK_Enemy_Ranged`
- `SK_Enemy_Boss`

Animations minimales: Idle A/B, Walk, Run, Attack A/B, Hit A/B, Death A/B, Cast, Carry, Hammer.

## VFX Niagara attendus
`NS_Torch`, `NS_ChimneySmoke`, `NS_Embers`, `NS_Portal`, `NS_CorePulse`, `NS_Impact`, `NS_Dust`, `NS_Fireflies`.

## Tours attendues
`BP_Tower_Archer`, `BP_Tower_Mage`, `BP_Tower_Cannon`, `BP_Tower_Slow`.

## Validation
Après exécution, chercher `PRODUCTION_ASSET_PIPELINE_JSON` dans le log Unreal. Le champ `missing` indique exactement quels assets réels restent à importer.

## Commande locale
```bash
cd ~/pixel-defense
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
"/Users/julien/pixel-defense/unreal/PixelDefense3D.uproject" \
-ExecutePythonScript="/Users/julien/pixel-defense/unreal/Content/Python/production_asset_pipeline.py" \
-log
```
