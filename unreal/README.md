# Pixel Defense 3D — Unreal Engine 5.8

Version 3D jouable de Pixel Defense, pensée comme un tower defense mobile
médiéval stylisé proche de l'esprit Kingdom Rush. Les règles restent alignées
sur la simulation web/Godot testée : 20 vagues, quatre tours, blindage,
ralentissement, dégâts de zone, boss et économie.

## Passe visuelle Ultimate

La carte `/Game/Maps/KingdomValley` est reconstruite proprement avec :

- forêt dense instanciée, rochers, village, château, remparts et torches ;
- sol et chemin PBR, rivière translucide, ciel atmosphérique et brouillard ;
- un seul soleil directionnel, skylight et post-traitement maîtrisé ;
- squelettes riggés avec marche/course et animation de mort ;
- projectiles réellement animés : flèches, glace, catapultes et magie ;
- impacts lumineux, explosions, ralentissement visible et lucioles animées ;
- barres de vie 3D ;
- HISM, textures 1K et réglages mobile pour viser 60 FPS.

Les modèles proviennent de quatre packs KayKit CC0. Le terrain et le chemin
utilisent une petite sélection Poly Haven CC0 téléchargée en 1K.

## Vallée vivante — accord avec le rendu web

La version web (`js/world.js`) tient sur un principe : **une seule source de
vérité pour la lumière**. Le soleil est déclaré une fois ; ombres portées,
reflets de l'eau et ombres de nuages en découlent tous. Deux écarts restaient
ici, et ils venaient tous deux du pipeline choisi.

**Le projet rend sur le chemin mobile** (`r.Mobile.ShadingPath=1`). C'est le bon
choix pour la cible, mais il a deux conséquences directes sur ce rendu :

| Effet | Sur le chemin mobile |
| --- | --- |
| Ombres de nuages volumétriques | n'existent pas |
| Réflexions d'écran (SSR) | n'existent pas |
| Réflexions par sonde | disponibles, et peu coûteuses |
| Réflexion planaire | possible, mais demande `r.AllowGlobalClipPlane` |

D'où les deux corrections :

- **Les nuages portent leur ombre**, fabriquée comme dans la version web : un
  quad sombre au sol par nuage, projeté depuis le soleil. `APDEnvironment`
  (C++) le déplace dans `Tick`, et comme le soleil tourne, les ombres
  s'allongent et glissent avec lui. Cela marche sur n'importe quel pipeline.
- **L'eau peut enfin refléter.** `M_Water_ValleyV2` est en mode *non éclairé* :
  un matériau unlit ignore les réflexions par construction. `M_Water_Reflective`
  le remplace — éclairé, lisse, spéculaire — et une sonde de réflexion est
  posée au-dessus de la vallée pour qu'il ait quelque chose à réfléchir.

S'y ajoute un habitant au sol : des chevreuils qui traversent lentement la
vallée et broutent. Oiseaux et lucioles vivaient dans le ciel ; il manquait
quelque chose qui touche le décor du joueur.

```
python3 tools/unreal_bridge/run_local.py tools/unreal_bridge/jobs/living_valley_pass.json
bash tools/unreal/build_macos.sh     # les ombres de nuages sont en C++
```

La passe **ne pose pas** de réflexion planaire — le vrai miroir. Elle demande
`r.AllowGlobalClipPlane`, dont le coût sur cible mobile n'est pas anodin :
c'est un arbitrage qui vous revient, pas à un script.

### Ce qui est vérifié, et ce qui ne l'est pas

Aucun de ces scripts n'a tourné dans un vrai éditeur — Unreal n'est pas
installable là où ils sont écrits. Ce qui *est* vérifié, au banc :

- chaque script d'éditeur survit à un **moteur hostile**, où toutes les API
  sont absentes : il énumère ce qui manque, à l'étape près, au lieu de mourir
  à la première ligne. Ce banc a trouvé deux vrais défauts — les constructeurs
  passés en argument (`unreal.Vector`, `unreal.LinearColor`,
  `get_asset_tools()`) s'exécutaient *avant* d'entrer dans la protection ;
- chaque script tourne aussi contre un moteur coopératif factice et rend son
  compte rendu machine.

Le C++ (ombres de nuages, chevreuils) n'est ni compilé ni exécuté ici : il suit
le patron des oiseaux et des lucioles, déjà en place dans le même fichier.
`bash tools/unreal/build_macos.sh` est le premier vrai test.

## Installation complète sur macOS

Ferme Unreal Editor, puis copie-colle :

```bash
cd ~/pixel-defense
git fetch origin
git switch main
git pull --ff-only origin main

git lfs version || brew install git-lfs
git lfs install

bash tools/unreal/ultimate_setup_macos.sh
```

Le script télécharge les packs, compile le module C++, importe les assets,
fabrique les matériaux, crée `KingdomValley`, vérifie l'inventaire puis ouvre
Unreal. Le premier passage peut être long : les personnages contiennent de
nombreuses animations.

Une fois Unreal ouvert :

1. ouvre `Content/Maps/KingdomValley` ;
2. attends la fin des shaders ;
3. clique sur **Play**.

## Commandes

- **1–4** : archers, givre, bombarde, mages
- **clic/toucher un socle** : construire
- **N** : lancer la prochaine vague
- **S** : vitesse ×1, ×2, ×3

## Alternative avec l'éditeur déjà ouvert

Si Remote Execution répond :

```bash
python3 tools/unreal_bridge/bridge.py run-job \
  tools/unreal_bridge/jobs/ultimate_visual_production_12.json
```

L'installation directe `ultimate_setup_macos.sh` reste la méthode recommandée
sur ce Mac, car elle ne dépend pas du multicast du pont.

Sources et licences : [`THIRD_PARTY_ASSETS.md`](../THIRD_PARTY_ASSETS.md).
Powered by Poly Haven.
