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
