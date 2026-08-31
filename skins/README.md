# Habillages

Un habillage remplace les figures tracées par `js/art.js` par des images — une
planche de sprites sortie d'un pack de textures Unreal, ou n'importe quel PNG.

Ce dossier est vide par défaut, et son contenu n'est pas versionné : une
planche de sprites est un produit dérivé d'un pack, et les packs ne se
redistribuent pas. Chacun engendre le sien.

## Fabriquer un habillage

```
# 1. dans l'éditeur Unreal — voir tools/unreal_bridge/README.md
python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/export_sprites.json

# 2. hors du moteur
node tools/import-textures.mjs <dossier de captures> --name mon-pack
```

Puis déclarez la planche dans `index.html`, avant `js/main.js` :

```html
<script src="skins/mon-pack/atlas.js"></script>
```

Et ajoutez les deux fichiers à la liste `ASSETS` de `sw.js` pour qu'ils soient
disponibles hors ligne.

## Les figures que le jeu connaît

| Nom | Trames | Ancrage par défaut |
| --- | --- | --- |
| `crawler` `swarm` `armored` `boss` | `0` `1` (marche) | pieds |
| `flyer` | `0` `1` (ailes) | centre |
| `tower_gun` `tower_cannon` `tower_frost` `tower_tesla` | `1` `2` `3` (niveau) | base |
| `tower_cannon.barrel` | `1` `2` `3` | axe de rotation |
| `tree` `rock` `core` `cave` | `0` | base |

Une figure absente reste tracée par le code : on peut habiller le jeu par
morceaux, et rien ne casse entre-temps. Une trame absente retombe sur `0` —
une seule image de gobelin sert les deux trames de marche plutôt que de
clignoter une image sur deux.

`tower_cannon.barrel` est la seule pièce qui pivote. Si votre habillage fournit
`tower_cannon` sans elle, aucune bouche n'est ajoutée : le sprite est supposé
complet.

## Ancrages

Le jeu pose une figure par son **ancrage**, jamais par son coin : les pieds
pour ce qui marche, la base pour ce qui est posé au sol, le centre pour ce qui
vole. L'import applique les valeurs par défaut du tableau ci-dessus ; pour en
changer, posez un `anchors.json` dans le dossier de captures :

```json
{ "core": [0.5, 0.92], "flyer": [0.5, 0.45] }
```

Les deux nombres sont des fractions de l'image **avant rognage** : `[0.5, 1]`
signifie « milieu du bord bas ».

## Licence des packs

Les packs du projet Unreal — KayKit et Poly Haven, listés dans
[`THIRD_PARTY_ASSETS.md`](../THIRD_PARTY_ASSETS.md) — sont **en CC0**. Rien
n'interdit d'en tirer des sprites pour le jeu web ; le crédit à Kay Lousberg
et la mention « Powered by Poly Haven » restent de mise.

Pour tout autre pack, vérifiez la licence **avant** de publier. Beaucoup de
packs Unreal sont vendus pour un usage *dans le moteur* ; en sortir des sprites
pour un jeu HTML n'est pas toujours permis, et cela varie d'un vendeur à
l'autre.
