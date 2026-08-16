# Pixel Defense

Un **tower defense en pixel art**, pensé pour le téléphone : on y joue au
doigt, d'une seule main, sans rien installer et sans réseau.

Pas de moteur de jeu, pas de framework, pas de `npm install` : du HTML, du CSS
et du JavaScript, un `<canvas>`, et des sprites dessinés directement dans le
code. Le jeu entier pèse une centaine de kilo-octets, images comprises.

![Le plateau en cours de partie](docs/screenshot.png)

## Jouer

- **En ligne** : https://jlefebvre59320-hash.github.io/pixel-defense/
  (à activer une fois : *Settings → Pages → Source : GitHub Actions*).
- **Sur le téléphone** : ouvrir cette adresse, puis *Ajouter à l'écran
  d'accueil*. Le jeu s'installe comme une application et fonctionne ensuite
  **hors ligne**, en avion comme dans le métro.
- **En local, sans rien installer** : ouvrir `index.html` dans un navigateur.
  (Le mode hors ligne, lui, demande un vrai serveur : `python3 -m http.server`
  puis http://localhost:8000 — un service worker ne s'installe pas depuis un
  fichier local.)

## Les règles

Vingt vagues arrivent par le haut de la carte et descendent le chemin jusqu'à
votre base. Chaque ennemi qui l'atteint coûte des vies. À zéro, c'est fini.

- **Appuyez sur une case d'herbe** pour bâtir, **sur une tour** pour l'améliorer
  (trois niveaux) ou la revendre à 60 % du prix payé.
- **Appuyez sur une carte de tour et gardez le doigt** : la portée s'affiche
  avant l'achat. Relâchez pour construire.
- **Appelez la vague en avance** : chaque seconde d'avance rapporte 3 ◈.
  C'est là que se gagnent les parties serrées.
- **×1 / ×2 / ×3** accélère le jeu ; la difficulté ne change pas.

| Tour | Prix | Ce qu'elle fait |
| --- | --- | --- |
| **Tourelle** | 40 ◈ | Tir rapide sur une cible. Le premier rempart. |
| **Cryo** | 60 ◈ | Peu de dégâts, mais ralentit de 45 % : double le temps passé sous le feu des autres. |
| **Canon** | 80 ◈ | Lent, explosion de zone. La réponse aux nuées serrées. |
| **Tesla** | 130 ◈ | Éclair instantané qui **ignore le blindage**. |

Quatre ennemis, et chacun punit une défense mal pensée :

| Ennemi | Particularité |
| --- | --- |
| **Rôdeur** | L'ennemi de base, sans surprise. |
| **Essaim** | Rapide et nombreux — un canon, ou ils passent. |
| **Blindé** | Encaisse 4 dégâts sur **chaque** coup : les tirs rapides ne le griffent pas. Tesla ou canon. |
| **Drone** | **Vole en ligne droite** vers la base, ignore le chemin. Une défense massée le long du chemin ne le voit jamais passer. |
| **Colosse** | Boss des vagues 10, 15 et 20. Cinq vies s'il passe. |

Clavier (sur ordinateur) : **Espace** pause · **N** vague suivante ·
**1–4** construire sur la case choisie · **S** vitesse · **Échap** fermer.

## Comment c'est fait

```
index.html          Structure : bandeau, plateau, panneau, barre de commandes
styles.css          Habillage sombre, mobile d'abord, zones tactiles ≥ 44 px
js/config.js        Tout l'équilibrage : tours, ennemis, 20 vagues, économie
js/map.js           Grille 9×16, chemin déduit des points de passage, décor
js/sprites.js       Sprites en pixels (des chaînes de caractères), teintes
js/storage.js       Record et préférences (localStorage, panne sans douleur)
js/audio.js         Bruitages de synthèse — aucun fichier son
js/render.js        Rendu canvas : terrain mis en cache, sprites, effets
js/game.js          La simulation : vagues, déplacements, tirs, dégâts, or
js/ui.js            Interface DOM : compteurs, panneaux, écrans
js/main.js          Boucle, entrées, écrans, service worker
sw.js               Mise en cache hors ligne
tools/simulate.mjs  Robot d'équilibrage (Node, sans navigateur)
tools/make-icons.mjs Génère les icônes PNG (encodeur PNG maison)
```

Trois partis pris qui expliquent le reste :

1. **Le moteur ne connaît que des cases et des secondes.** Aucune position en
   pixels, aucune vitesse « par image » : le jeu se comporte pareil sur un
   téléphone à 60 Hz et sur un écran à 120 Hz, et le mode ×3 se résume à
   multiplier le temps écoulé.
2. **Le rendu est seul à parler en pixels.** L'échelle du pixel d'art est
   calculée à chaque redimensionnement pour tomber juste : des pixels carrés,
   nets, sans lissage, quelle que soit la densité de l'écran.
3. **L'interface est du DOM, pas du canvas.** Les boutons sont de vrais
   boutons : lisibles au lecteur d'écran, utilisables au clavier, et le doigt
   tombe sur des cibles d'au moins 44 px.

### Régler l'équilibrage

Tout est dans `js/config.js` (prix, dégâts, portées, cadences, composition des
vagues, économie). Pour vérifier un réglage sans jouer trois heures :

```
node tools/simulate.mjs 3
```

Le moteur se charge dans Node sans navigateur et fait jouer trois profils. Un
réglage sain se lit ainsi : le profil « novice » (des tourelles au hasard,
jamais d'amélioration) tombe avant la fin, le profil « correct » gagne en
gardant des vies.

```
novice   {"issue":"perdu","vague":16,"vies":0,"score":22270,"tours":82}
correct  {"issue":"gagné","vague":20,"vies":15,"score":47599,"tours":21}
```

### Changer les dessins

Les sprites sont des tableaux de chaînes dans `js/sprites.js` : une lettre =
un pixel, `.` = transparent, la palette est en haut du fichier. Un contrôle au
chargement signale toute ligne de mauvaise longueur dans la console. Les
icônes de l'application se régénèrent avec `node tools/make-icons.mjs`.

## Mise en ligne

Chaque `push` sur `main` déclenche `.github/workflows/pages.yml`, qui publie le
dépôt tel quel sur GitHub Pages (il n'y a rien à compiler). La première fois,
il faut activer Pages : **Settings → Pages → Source : GitHub Actions**.

Après une modification, penser à changer le numéro de version en tête de
`sw.js` (`pixel-defense-v1` → `v2`) : c'est ce qui remplace le cache des
joueurs qui ont déjà installé le jeu.

## Licence

MIT — voir [LICENSE](LICENSE).
