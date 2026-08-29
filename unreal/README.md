# Pixel Defense 3D — Unreal Engine 5.8

Cette version combine les règles testées du jeu Godot/web avec une présentation
3D médiévale mobile. Le module C++ contient déjà les 20 vagues, les ennemis,
l'économie, quatre tours, le ciblage, le ralentissement, les dégâts de zone,
le blindage, les boss, la souris, le tactile et le HUD.

## Première installation sur macOS

Depuis le dépôt :

```bash
cd ~/pixel-defense
git fetch origin
git checkout chatgpt/production-gameplay-10
git pull --ff-only origin chatgpt/production-gameplay-10

brew install git-lfs
git lfs install
bash tools/assets/fetch_kaykit_cc0.sh
bash tools/unreal/build_macos.sh
```

Après l'ouverture d'Unreal, attendre la fin de la découverte des assets puis :

```bash
cd ~/pixel-defense
python3 tools/unreal_bridge/bridge.py ping
python3 tools/unreal_bridge/bridge.py run-job \
  tools/unreal_bridge/jobs/import_kaykit_cc0_10.json
```

Le résultat attendu contient `KAYKIT_IMPORT_JSON`, puis un inventaire avec des
`static_meshes`, `skeletal_meshes`, `textures` et `animations`.
Relancer ensuite le jeu avec le bouton **Play** dans Unreal.

## Commandes

- **1–4** : archers, givre, bombarde, mages
- **clic/toucher un socle** : construire
- **N** : lancer la prochaine vague
- **S** : vitesse ×1, ×2, ×3

Les modèles Unreal importés sont reconstruisibles et volontairement ignorés
par Git. Les sources et licences CC0 sont listées dans
[`THIRD_PARTY_ASSETS.md`](../THIRD_PARTY_ASSETS.md).

Les packs Fab/Epic que tu possèdes restent utilisables. Ajoute-les au projet
depuis **Fenêtre → Fab → Ma bibliothèque → Ajouter au projet**, puis relance
`production_asset_inventory_09.json`. Le décor pourra ensuite être assemblé
avec leurs chemins exacts sans remplacer les règles du jeu.
