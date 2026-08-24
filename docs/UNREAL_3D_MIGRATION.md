# Pixel Defense 3D — trajectoire Unreal Engine 5.8

## Décision

Le prototype Godot reste la référence de gameplay et d'équilibrage. La nouvelle
branche Unreal vise la version mobile 3D premium : rendu stylisé, vue 3/4,
Android + iOS, objectif 60 FPS sur appareil milieu/haut de gamme.

## Renderer cible

- Unreal Engine 5.8 ;
- Mobile Deferred (`r.Mobile.ShadingPath=1`) ;
- Mobile HDR ;
- Vulkan côté Android, Metal côté iOS au moment de configurer les plateformes ;
- pas de dépendance au ray tracing/Nanite pour le gameplay principal ;
- LOD et budgets de matériaux stricts ;
- upscaling mobile/FSR à valider sur appareils réels.

## Architecture du jeu

- `Game/Simulation` : règles déterministes, vagues, économie, dégâts ;
- `Game/Actors` : ennemis, tours, projectiles ;
- `Game/UI` : HUD tactile et safe areas ;
- `Art/Environment` : terrain, végétation, props ;
- `Art/VFX` : Niagara, impacts, explosions ;
- `Content/Python` : automatisation éditeur ;
- `tools/unreal_bridge` : orchestration locale IA/éditeur.

La simulation doit rester indépendante du renderer autant que possible afin de
conserver le robot d'équilibrage et de pouvoir comparer Unreal au prototype.

## Vertical slice

1. Arène 3D générée par script.
2. Caméra isométrique/3-4 mobile.
3. Une tour canon 3D + une cible.
4. Un crawler 3D suivant un spline/path.
5. Placement tactile d'une tour.
6. Tir + impact Niagara + dégâts.
7. HUD minimal : vie, or, vague.
8. Test 100 ennemis simultanés et capture des temps CPU/GPU.

## Direction artistique

3D stylisée lisible plutôt que photoréaliste : silhouettes fortes, volumes
simples, matériaux propres, ombres lisibles, couleurs par famille de tour et
effets lumineux courts. Le terrain doit rester lisible sur un écran de 6 pouces.

## Budgets initiaux

- 60 FPS cible ; 30 FPS fallback configurable ;
- matériaux simples, peu de transparence pleine surface ;
- VFX courts et poolés ;
- meshes avec LOD ;
- pas de tick inutile sur les acteurs ;
- logique de ciblage optimisée avant d'augmenter la densité d'ennemis.

## IA / automatisation

Les scripts sous `unreal/Content/Python` sont des outils d'éditeur, jamais du
gameplay de production. Ils servent à générer les niveaux de test, importer et
préparer les assets, auditer les LOD/matériaux, lancer des captures ou produire
des rapports. Les jobs JSON du bridge rendent ces opérations faciles à demander
à Claude Code et simples à relire dans GitHub.

## Prochaines tâches

- créer la caméra et le cadre portrait ;
- produire les premières meshes stylisées ;
- porter une vague minimale du prototype ;
- ajouter profiling automatisé ;
- configurer exports Android puis iOS ;
- tester sur téléphone réel avant d'augmenter la qualité graphique.
