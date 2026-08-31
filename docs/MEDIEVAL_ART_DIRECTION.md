# Pixel Defense — Direction artistique médiévale premium

## Intention

Direction cible : médiéval stylisé semi-réaliste, lisible en vue 3/4/isométrique, chaleureux, détaillé sans photoréalisme, conçu pour mobile 60 FPS. Le gameplay doit rester lisible au premier coup d’œil : ennemis, chemin, pads de tours, base et portail doivent se détacher du décor.

## Références visuelles à appliquer

Trois planches de référence ont été préparées dans le brief ChatGPT :

1. **Matériaux & textures — univers médiéval** : pierre irrégulière, gros blocs de château, colombages, enduit blanc, tuiles/ardoises, pavés, terre, herbe, mousse, tissu, corde, fer, planches, eau, paille.
2. **Kit décor modulaire — village & défense** : maisons à colombages, variantes de toits, étal de marché, tour de guet, palissades, murs, portail fortifié, arches, pont, puits, charrette, barils/caisses, lampes, clôtures, arbres, rochers, bannières, portail ennemi et cœur/base magique.
3. **Mouvements & animations — vie médiévale** : drapeaux, torches, herbes, enseignes, fumée, roue à eau, eau, oiseaux, villageois, forgeron, charrette, portes, portail ennemi, cristal pulsant, poussière, lucioles, braises et impacts stylisés.

## Bibliothèque de matériaux

Créer en priorité des matériaux maîtres + instances :

- `M_Master_Stone` → `MI_Stone_Wall`, `MI_Stone_Castle`, `MI_Stone_Mossy`
- `M_Master_Wood` → `MI_Wood_Beams`, `MI_Wood_Planks`, `MI_Wood_Dark`
- `M_Master_Plaster` → `MI_Plaster_Warm`, `MI_Plaster_Dirty`
- `M_Master_Roof` → `MI_Roof_Terracotta`, `MI_Roof_Slate`, `MI_Roof_Green`
- `M_Master_Ground` → `MI_Ground_Dirt`, `MI_Ground_Cobble`, `MI_Ground_Grass`
- `M_Master_Cloth` → bannières rouge/bleu/vert
- `M_Master_Metal` → fer sombre / acier usé
- `M_Master_Water`
- `M_Master_Emissive` → portail ennemi violet, cœur magique bleu

Principes : textures carrelables, trim sheets pour poutres/bordures, roughness variée, normales douces, arêtes biseautées, vertex paint pour terre/herbe/boue/mousse, decals d’humidité/saleté pour casser la répétition. Préférer les Material Instances aux duplications.

## Kit modulaire

Nommage recommandé :

- `SM_House_Wall_A/B/C`, `SM_House_Gable_A/B`, `SM_Roof_A/B/C`
- `SM_Palisade_A/B/Gate`, `SM_StoneWall_A/B/Corner`
- `SM_Gatehouse_A`, `SM_StoneArch_A`, `SM_Bridge_A`
- `SM_WatchTower_A`, `SM_MarketStall_A`
- `SM_Prop_Barrel_A`, `SM_Prop_Crate_A`, `SM_Prop_Cart_A`, `SM_Prop_Well_A`
- `SM_Fence_A`, `SM_Lamp_A`, `SM_Banner_A`
- `SM_Tree_A/B/C`, `SM_Rock_A/B/C`
- `BP_EnemyPortal`, `BP_MagicCore`, `BP_TowerPad`

Tout doit viser : silhouette lisible, pivot propre, snapping cohérent, collision simple, LOD simples, matériaux partagés, dimensions compatibles grille.

## Mouvement et animation

- Drapeaux/herbes/feuillage : World Position Offset léger ; éviter les simulations tissu coûteuses pour le décor distant.
- Torches : Niagara + petite variation lumineuse lente.
- Fumée/braises/poussière/lucioles : Niagara, spawn rate faible, cull distance stricte.
- Enseignes : oscillation subtile Blueprint ou animation simple.
- Roue à eau/moulin : rotation lente continue.
- Eau : petites ondulations et reflets, pas de simulation lourde.
- Villageois : plusieurs idles aléatoires + marche + port de caisse ; boucles 2–4 s quand possible.
- Forgeron : marteau + étincelles synchronisées.
- Portes/portails : Blueprint Timeline avec poids visuel et son.
- Portail ennemi : ouverture violette + pulse + particules avant spawn.
- Cœur/base : pulsation bleue lente, intensité liée à l’état de la base.
- Combat : impacts courts et lisibles, étincelles/éclats/débris, pas de bruit visuel permanent.

## Rendu et performance mobile

- Mobile Deferred si la cible le permet, sinon fallback propre.
- LOD/HLOD pour décors lourds ; cull distance sur petits props et Niagara.
- Éviter les matériaux transparents volumineux en masse.
- Prioriser 1K/2K, atlas/trim sheets, instances et meshes réutilisés.
- Tester tôt avec 100 ennemis + effets + décor complet.
- La lisibilité gameplay passe avant la fidélité matière.

## Séquence de production

1. Créer structure des dossiers et scène `MedievalArtDirection`.
2. Poser terrain, chemin, mur, portail ennemi, base magique, pads de tours.
3. Mettre en place les matériaux maîtres et variantes.
4. Remplacer progressivement les placeholders par le kit modulaire.
5. Ajouter WPO, Niagara et animations ambiantes.
6. Faire une passe lumière/couleur cohérente.
7. Profiler sur mobile et réduire ce qui n’améliore pas la lecture.

## Critère de validation

Une capture de gameplay doit immédiatement communiquer : **village médiéval vivant + défense magique + chemin d’invasion lisible + base à protéger**, avec suffisamment de micro-mouvements pour que la scène paraisse vivante même lorsqu’aucun ennemi n’est à l’écran.
