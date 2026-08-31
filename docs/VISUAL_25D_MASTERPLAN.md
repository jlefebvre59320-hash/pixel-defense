# Pixel Defense — Masterplan visuel 2.5D mobile

## Direction

Objectif : faire paraître Pixel Defense beaucoup plus premium et « 3D » sans sacrifier la lisibilité du tower defense ni les performances des téléphones moyens.

Le gameplay reste dans un plan 2D. Le volume vient de la lumière, des ombres, de la hauteur visuelle, de la profondeur des couches, des animations et du game feel.

## Cible visuelle

- Pixel art moderne / 2.5D.
- Caméra portrait, lecture immédiate à une main.
- Silhouettes très distinctes pour chaque ennemi et chaque tour.
- Ombres orientées de façon cohérente.
- Highlights chauds sur les surfaces hautes, ombres froides sous les volumes.
- Effets spectaculaires mais courts : aucun FX ne doit masquer le chemin.
- 60 FPS comme cible sur un téléphone milieu de gamme.

## Passe 1 — déjà engagée

- Ombres de silhouette aplaties sous ennemis, tours et base.
- Flottement séparé du sol pour les unités volantes.
- Profondeur visuelle via z-index selon la position verticale.
- Idle très léger des tours et ennemis.
- Halo discret lié au type de tour.
- Tour visuellement un peu plus imposante à chaque niveau.
- Portée en projection multi-couches.
- Sélection par coins plutôt que gros cadre plat.
- Projectiles avec noyau + aura.
- Explosions en noyau + doubles anneaux.
- Tesla en 3 couches (ombre, couleur, coeur clair).
- Textes volants avec ombre.

## Passe 2 — terrain et environnement

Priorité haute.

1. Donner du relief au chemin :
   - bord supérieur légèrement éclairé ;
   - bord inférieur plus sombre ;
   - petites pierres et fissures ;
   - variation contrôlée sans bruit visuel.
2. Herbe : touffes, fleurs rares, micro-ombres.
3. Rochers : face supérieure claire, face basse sombre.
4. Arbres : couronne + tronc séparés, ombre décalée.
5. Base : pulsation d'énergie et état visuel selon les vies restantes.
6. Entrée des ennemis : portail/spawn clairement identifiable.

## Passe 3 — animations

- Spawn : scale 0.85 -> 1.0 + poussière.
- Mort : hit-stop visuel très court, flash puis dispersion.
- Construction : socle apparaît, tête monte de 2-3 pixels.
- Upgrade : pulse + anneau + étincelles.
- Vente : aspiration vers le compteur d'or.
- Boss : intro 0.5-0.8 s avec flash de bord d'écran.

Les animations ne doivent jamais ralentir ou bloquer la simulation.

## Passe 4 — UI premium mobile

- Respect des safe areas iPhone / Android.
- Cartes de tours plus visuelles, avec couleur propre à chaque famille.
- Boutons principaux plus gros et hiérarchie claire.
- Transitions 120-180 ms maximum.
- Compteurs animés lors des gains/pertes.
- Feedback haptique : build, upgrade, boss, refus.
- Overlay de pause avec fond assombri / légère profondeur.

## Passe 5 — vraie 3D optionnelle

Ne pas convertir tout le jeu avant validation du vertical slice 2.5D.

Si la direction est validée, migrer progressivement :

- terrain -> MeshInstance3D / GridMap léger ;
- tours -> modèles low-poly très simples ;
- ennemis -> modèles stylisés 300-800 triangles ;
- caméra orthographique inclinée ;
- gameplay et simulation restent inchangés ;
- rendu 3D doit être une vue de la même simulation, pas un nouveau moteur.

## Budget mobile

Cibles de test :

- 100 ennemis simultanés ;
- 25 tours ;
- 60 projectiles/FX simultanés ;
- 60 FPS cible, 30 FPS minimum acceptable sur entrée de gamme ;
- limiter les lumières dynamiques et shaders plein écran ;
- préférer caches, sprites et dessin groupé ;
- aucune allocation importante à chaque frame.

## Règle d'or

Chaque amélioration visuelle doit satisfaire au moins deux critères :

1. meilleure lisibilité ;
2. meilleur impact visuel ;
3. coût GPU/CPU faible ;
4. réutilisable pour plusieurs unités.

Sinon elle est supprimée.
