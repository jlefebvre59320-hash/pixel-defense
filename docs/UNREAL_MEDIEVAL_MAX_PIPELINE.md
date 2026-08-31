# Pixel Defense 3D — pipeline médiéval MAX

## But
Passer du blockout procédural à un rendu mobile premium cohérent, sans sacrifier la lisibilité tower-defense ni les 60 FPS.

## Ordre de production
1. **Blockout + composition** — map `MedievalArtDirection`, chemin ennemi, core, pads, village, remparts.
2. **Passe procédurale MAX** — script `unreal/Content/Python/medieval_max_pass.py` pour densifier immédiatement la scène avec matériaux, props, personnages placeholders, éclairage et atmosphère.
3. **Assets réels** — remplacer chaque groupe `MAX_*` par des meshes de production suivant les slots ci-dessous.
4. **Personnages riggés** — héros, villageois et ennemis avec squelette commun quand possible.
5. **Animation** — locomotion, attaques, impacts, morts, boucles de vie du village.
6. **Niagara** — torches, fumée, braises, portail, core, impacts, poussière, lucioles.
7. **Gameplay art** — télégraphes d'attaque, portée des tours, sélection, surbrillance, feedback dégâts.
8. **Optimisation mobile** — LOD/HLOD, instancing, texture budgets, lumière limitée, overdraw Niagara contrôlé, profile GPU sur iPhone cible.

## Direction artistique
- Stylisé premium médiéval, silhouettes propres, formes lisibles, proportions légèrement exagérées.
- Matériaux: pierre chaude, bois sombre, enduit crème, tuiles terre cuite, fer mat, végétation saturée mais naturelle.
- Contraste gameplay: alliés bleu/or, ennemis rouge/violet, core cyan/bleu, portail violet.
- Éviter le photoréalisme: détails concentrés sur les points de lecture importants.

## Slots d'assets production
### Environnement
- `SM_House_A/B/C`: maisons colombage modulaires.
- `SM_Wall_*`, `SM_Gate_*`, `SM_Tower_*`: remparts, porte, tours.
- `SM_Market_*`: étals, tissus, tables, paniers.
- `SM_Prop_Barrel`, `SM_Prop_Crate`, `SM_Prop_Cart`, `SM_Prop_Well`.
- `SM_Tree_*`, `SM_Rock_*`, `SM_GrassCluster_*`, fleurs et buissons.
- Sols/decals: terre, pavés, boue, mousse, traces de roues.

### Personnages
- `SK_Hero_Melee`.
- `SK_Villager_Male`, `SK_Villager_Female`.
- `SK_Enemy_Grunt`, `SK_Enemy_Brute`, `SK_Enemy_Ranged`, `SK_Enemy_Boss`.

### Animations minimales
- Idle variation x3, walk, run, attack x2, hit x2, death x2.
- Village: carry, hammer, sweep, talk, sit.
- Mage/ranged: cast, recoil.

### VFX Niagara
- `NS_Torch`, `NS_ChimneySmoke`, `NS_Embers`, `NS_Portal`, `NS_CorePulse`, `NS_Impact`, `NS_Dust`, `NS_Fireflies`.

## Budget mobile conseillé
- 60 FPS cible.
- Texture héros: 2K max; environnement principal: 1K; petits props: 512.
- Matériaux maîtres partagés + instances.
- LOD obligatoires sur arbres, bâtiments, personnages.
- Réduire les lumières dynamiques superposées; privilégier statique/baked quand possible.
- Niagara: emitter bounds fixes, spawn counts bas, distance culling.
- Tester régulièrement sur Metal/iOS réel et non uniquement dans l'éditeur.

## Commande directe fiable
Le bridge Remote Execution n'est pas nécessaire pour construire la scène. La méthode validée est:

```bash
cd ~/pixel-defense
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
"/Users/julien/pixel-defense/unreal/PixelDefense3D.uproject" \
-ExecutePythonScript="/Users/julien/pixel-defense/unreal/Content/Python/medieval_max_pass.py" \
-log
```

Validation:

```bash
grep -R "MEDIEVAL_MAX_JSON" "$HOME/Library/Logs/Unreal Engine/PixelDefense3DEditor/" 2>/dev/null
```

Le script écrit aussi `Saved/medieval_asset_manifest.json` comme checklist machine des assets à remplacer.
