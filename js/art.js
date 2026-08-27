/* Pixel Defense — la couche d'art.
   Style « Kingdom Rush » : du dessin peint, pas du pixel. Chaque figure est
   tracée en courbes, cernée d'un contour brun épais et remplie de dégradés —
   c'est ce trio (silhouette lisible / contour / volume) qui fait le rendu
   dessiné à la main des tower defense d'Ironhide.

   Rien n'est chargé depuis le réseau : tout est tracé au premier appel dans un
   canvas hors écran, à une résolution de référence confortable, puis recopié
   à l'échelle de l'écran. Le jeu démarre donc instantanément et reste net sur
   un téléphone comme sur un grand écran.

   Repère : chaque dessin vit dans une boîte (`box`) et porte son point
   d'ancrage (`anchor`) — les pieds pour ce qui marche, la base pour ce qui est
   posé au sol, le centre pour ce qui vole. Le rendu place l'ancrage, pas le
   coin : c'est ce qui fait qu'une tour de trois étages reste plantée sur sa
   case au lieu de flotter. */
(function (PD) {
  "use strict";

  /* Contour commun à tout le jeu. Un brun très sombre plutôt qu'un noir :
     le noir pur découpe les figures du décor au lieu de les y poser. */
  var INK = "#2b1d14";
  var LW = 5;

  var PAL = {
    ink: INK,
    /* Peaux et poils */
    goblin: "#87b23c", goblinDark: "#4f6d1f", goblinLight: "#a9cf5c",
    orcSkin: "#6f8f3a", orcSkinDark: "#47601f",
    trollSkin: "#7a9a5e", trollDark: "#4d6739", trollBelly: "#b9c795",
    fur: "#7d838f", furDark: "#4f5460", furLight: "#a5abb6",
    harpy: "#7a6ce0", harpyDark: "#443a97", harpyLight: "#a99bf5",
    /* Matières */
    stone: "#9d9a91", stoneDark: "#6b695f", stoneLight: "#c0bcaf",
    iron: "#8e95a3", ironDark: "#565d6d", ironLight: "#bcc2cd",
    wood: "#8b5a30", woodDark: "#57371c", woodLight: "#b07a45",
    roof: "#b4453a", roofDark: "#7c2a24", roofLight: "#d96a58",
    cloth: "#3f6fb5", clothDark: "#27467a",
    gold: "#f5c542", goldDark: "#b98a12",
    ice: "#7fdcea", iceDark: "#2f8fa8", iceLight: "#c9f4fb",
    arcane: "#a55bd6", arcaneDark: "#6a2f96", arcaneLight: "#dda6f5",
    bone: "#e8dcc0", boneDark: "#b09b74",
    white: "#f4f1e6", eye: "#fdfaf0"
  };

  /* --- Petits outils de tracé ------------------------------------------- */

  /* Cerner puis remplir : le contour est tracé d'abord, la moitié intérieure
     du trait est ensuite recouverte par le remplissage. On obtient un cerne
     régulier, à l'extérieur de la forme — impossible à obtenir en remplissant
     d'abord. */
  function fs(g, fill, lw) {
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = lw || LW;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  }

  function fill(g, color) {
    g.fillStyle = color;
    g.fill();
  }

  function ell(g, x, y, rx, ry, rot) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  }

  function ball(g, x, y, r, color, lw) {
    ell(g, x, y, r, r);
    fs(g, color, lw);
  }

  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }

  /* Membre : un trait épais arrondi, cerné. Deux passes — le contour large,
     puis la couleur — plutôt qu'un chemin fermé : c'est plus court à écrire et
     le rendu est identique. */
  function limb(g, x1, y1, x2, y2, w, color) {
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineWidth = w + LW;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = w;
    g.strokeStyle = color;
    g.stroke();
  }

  /* Dégradé vertical : le haut prend la lumière, le bas garde l'ombre. Une
     seule direction pour tout le jeu — une lumière cohérente vaut mieux que
     des dégradés savants qui se contredisent d'une figure à l'autre. */
  function shade(g, y0, y1, light, dark) {
    var gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, light);
    gr.addColorStop(1, dark);
    return gr;
  }

  /* Reflet posé sur le haut d'une masse : ce qui donne le fini « peint ». */
  function gloss(g, x, y, rx, ry, alpha) {
    g.save();
    g.globalAlpha = alpha === undefined ? 0.28 : alpha;
    ell(g, x, y, rx, ry);
    fill(g, PAL.white);
    g.restore();
  }

  function eyes(g, x, y, r, spread, pupil) {
    ball(g, x - spread, y, r, PAL.eye, 3);
    ball(g, x + spread, y, r, PAL.eye, 3);
    ell(g, x - spread + r * 0.25, y, r * 0.42, r * 0.55);
    fill(g, pupil || INK);
    ell(g, x + spread + r * 0.25, y, r * 0.42, r * 0.55);
    fill(g, pupil || INK);
  }

  /* Sourcils froncés : deux traits, et la créature passe de gentille à
     menaçante. C'est le détail le moins cher du jeu. */
  function brows(g, x, y, spread, tilt) {
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - spread - 7, y - tilt);
    g.lineTo(x - spread + 6, y + 2);
    g.moveTo(x + spread + 7, y - tilt);
    g.lineTo(x + spread - 6, y + 2);
    g.stroke();
  }

  /* --- Ennemis ----------------------------------------------------------- */
  /* Tous dessinés tournés vers la droite ; le rendu retourne l'image quand
     l'ennemi va vers la gauche. `f` est la trame de marche (0 ou 1). */

  var DRAW = {};

  DRAW.crawler = {
    box: [128, 128], anchor: [64, 116],
    draw: function (g, f) {
      var swing = f ? 1 : -1;

      /* Jambes — l'alternance suffit à donner la marche. */
      limb(g, 56, 84, 46 + swing * 8, 114, 11, PAL.goblinDark);
      limb(g, 70, 84, 78 - swing * 8, 114, 11, PAL.goblinDark);
      poly(g, [[40 + swing * 8, 116], [56 + swing * 8, 116], [54 + swing * 8, 108], [42 + swing * 8, 108]]);
      fs(g, PAL.woodDark, 4);

      /* Bras arrière, tenu au corps */
      limb(g, 52, 62, 38, 82, 9, PAL.goblinDark);

      /* Torse : une poire, plus large en bas — silhouette de gobelin. */
      g.beginPath();
      g.moveTo(44, 88);
      g.bezierCurveTo(40, 62, 48, 48, 62, 48);
      g.bezierCurveTo(78, 48, 86, 62, 82, 88);
      g.bezierCurveTo(74, 96, 52, 96, 44, 88);
      fs(g, shade(g, 44, 96, PAL.goblinLight, PAL.goblinDark));

      /* Pagne */
      poly(g, [[46, 82], [82, 82], [78, 98], [50, 98]]);
      fs(g, PAL.woodDark, 4);

      /* Tête, disproportionnée : c'est elle qu'on reconnaît de loin. */
      ell(g, 66, 38, 27, 24);
      fs(g, shade(g, 14, 62, PAL.goblinLight, PAL.goblin));

      /* Oreilles pointues */
      poly(g, [[42, 32], [16, 20], [40, 44]]);
      fs(g, PAL.goblin, 4);
      poly(g, [[90, 32], [114, 22], [90, 44]]);
      fs(g, PAL.goblin, 4);

      /* Museau et dents */
      ell(g, 76, 46, 15, 10);
      fs(g, PAL.goblinLight, 4);
      g.beginPath();
      g.moveTo(66, 48);
      g.quadraticCurveTo(78, 54, 88, 46);
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.stroke();
      poly(g, [[72, 49], [77, 49], [74, 57]]);
      fs(g, PAL.white, 2);
      poly(g, [[80, 48], [85, 47], [83, 55]]);
      fs(g, PAL.white, 2);

      eyes(g, 62, 32, 8, 12, INK);
      brows(g, 62, 21, 12, 6);

      /* Gourdin, bras avant. Il part vers l'extérieur, jamais en travers de la
         tête : une arme qui masque le visage vole à la créature ce qui la rend
         reconnaissable. */
      limb(g, 74, 66, 90, 74, 9, PAL.goblin);
      g.save();
      /* Tenu presque à l'horizontale, à hauteur de poitrine : plus haut, la
         massue venait mordre l'oreille et paraissait pousser sur le crâne. */
      g.translate(88, 76);
      g.rotate(1.18 + (f ? 0.16 : 0));
      poly(g, [[-5, 0], [5, 0], [9, -32], [-9, -32]]);
      fs(g, shade(g, -32, 0, PAL.woodLight, PAL.woodDark));
      ball(g, 0, -34, 11, PAL.wood, 4);
      g.restore();
    }
  };

  DRAW.swarm = {
    box: [128, 128], anchor: [64, 116],
    draw: function (g, f) {
      var swing = f ? 1 : -1;

      /* Loup : long, bas sur pattes, tête lourde tendue vers l'avant. Le
         premier jet était rond et haut sur pattes — il lisait « chat ». Ce qui
         fait le loup, c'est l'horizontale : museau, échine et queue sur une
         même ligne, et une collerette qui alourdit les épaules. */

      /* Pattes arrière, puis avant : les diagonales opposées disent la course. */
      limb(g, 36, 84, 22 + swing * 14, 112, 9, PAL.furDark);
      limb(g, 84, 84, 98 - swing * 14, 112, 9, PAL.furDark);
      limb(g, 46, 86, 36 - swing * 12, 112, 10, PAL.fur);
      limb(g, 92, 86, 88 + swing * 12, 112, 10, PAL.fur);

      /* Queue épaisse, en panache */
      g.beginPath();
      g.moveTo(30, 74);
      g.quadraticCurveTo(2, 66, 8, 34);
      g.lineWidth = 20;
      g.strokeStyle = INK;
      g.lineCap = "round";
      g.stroke();
      g.lineWidth = 14;
      g.strokeStyle = PAL.furDark;
      g.stroke();

      /* Échine : un corps allongé, presque plat sur le dessus. */
      g.beginPath();
      g.moveTo(30, 78);
      g.bezierCurveTo(30, 58, 52, 52, 76, 54);
      g.bezierCurveTo(96, 56, 100, 70, 96, 84);
      g.bezierCurveTo(74, 96, 46, 94, 30, 78);
      fs(g, shade(g, 50, 96, PAL.furLight, PAL.furDark), 6);

      /* Ventre plus clair */
      g.save();
      g.globalAlpha = 0.45;
      ell(g, 64, 84, 26, 9);
      fill(g, PAL.furLight);
      g.restore();

      /* Collerette : la masse d'épaules qui distingue le loup du chien. */
      g.beginPath();
      g.moveTo(72, 46);
      g.quadraticCurveTo(94, 48, 98, 70);
      g.quadraticCurveTo(94, 88, 74, 88);
      g.quadraticCurveTo(78, 66, 72, 46);
      fs(g, shade(g, 46, 88, PAL.fur, PAL.furDark), 5);

      /* Tête basse, tendue en avant */
      ell(g, 100, 60, 21, 17, -0.12);
      fs(g, shade(g, 42, 78, PAL.furLight, PAL.fur));

      /* Museau long : c'est lui qui fait le loup. */
      g.beginPath();
      g.moveTo(108, 48);
      g.lineTo(126, 56);
      g.lineTo(126, 66);
      g.lineTo(106, 72);
      g.closePath();
      fs(g, shade(g, 48, 72, PAL.fur, PAL.furDark), 5);
      ball(g, 125, 58, 5, INK, 0);

      /* Gueule entrouverte et crocs */
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(106, 66);
      g.lineTo(124, 64);
      g.stroke();
      poly(g, [[112, 65], [116, 65], [114, 74]]);
      fs(g, PAL.white, 2);
      poly(g, [[119, 64], [123, 64], [121, 72]]);
      fs(g, PAL.white, 2);

      /* Oreilles dressées, en arrière */
      poly(g, [[88, 48], [82, 24], [100, 42]]);
      fs(g, PAL.fur, 4);
      poly(g, [[100, 44], [106, 22], [114, 44]]);
      fs(g, PAL.furDark, 4);

      /* Œil rouge : le seul point chaud sur une bête grise. */
      ball(g, 104, 56, 5, "#e5484d", 3);
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(96, 46);
      g.lineTo(110, 50);
      g.stroke();
    }
  };

  DRAW.armored = {
    box: [128, 128], anchor: [64, 116],
    draw: function (g, f) {
      var swing = f ? 1 : -1;

      limb(g, 52, 90, 44 + swing * 7, 114, 15, PAL.ironDark);
      limb(g, 76, 90, 84 - swing * 7, 114, 15, PAL.ironDark);
      poly(g, [[34 + swing * 7, 116], [58 + swing * 7, 116], [56 + swing * 7, 104], [38 + swing * 7, 104]]);
      fs(g, PAL.woodDark, 4);

      /* Cuirasse : large, plate, rivetée. Le blindage doit se voir de loin —
         c'est l'information de jeu la plus importante sur cet ennemi. */
      /* Cuirasse : large, plate, en trois bandes rivetées. Le blindage est
         l'information de jeu la plus importante sur cet ennemi — il doit se
         voir de loin, sans qu'on ait besoin de reconnaître la créature. */
      g.beginPath();
      g.moveTo(34, 94);
      g.lineTo(30, 52);
      g.quadraticCurveTo(64, 38, 98, 52);
      g.lineTo(94, 94);
      g.quadraticCurveTo(64, 104, 34, 94);
      fs(g, shade(g, 40, 104, PAL.ironLight, PAL.ironDark), 6);

      g.lineWidth = 3.5;
      g.strokeStyle = PAL.ironDark;
      for (var b = 1; b < 3; b++) {
        g.beginPath();
        g.moveTo(32, 52 + b * 16);
        g.lineTo(96, 52 + b * 16);
        g.stroke();
      }
      g.save();
      g.globalAlpha = 0.7;
      for (var i = 0; i < 4; i++) {
        ball(g, 40 + i * 16, 60, 3.5, PAL.ironLight, 0);
        ball(g, 40 + i * 16, 92, 3.5, PAL.ironLight, 0);
      }
      g.restore();

      /* Épaulières, posées bas et écartées : au ras du casque, elles
         ressemblaient à deux boules flottant de part et d'autre de la tête. */
      ell(g, 26, 60, 19, 15);
      fs(g, shade(g, 46, 76, PAL.ironLight, PAL.iron));
      ell(g, 102, 60, 19, 15);
      fs(g, shade(g, 46, 76, PAL.ironLight, PAL.iron));

      /* Tête verte, bien visible sous le casque : sans elle, l'ennemi n'est
         qu'un tas de ferraille. */
      ell(g, 64, 28, 23, 21);
      fs(g, shade(g, 8, 48, PAL.orcSkin, PAL.orcSkinDark));

      /* Casque, posé haut pour dégager le visage */
      g.beginPath();
      g.moveTo(41, 24);
      g.quadraticCurveTo(64, -4, 87, 24);
      g.lineTo(87, 30);
      g.lineTo(41, 30);
      g.closePath();
      fs(g, shade(g, 0, 32, PAL.ironLight, PAL.ironDark));
      poly(g, [[59, 28], [69, 28], [67, 44], [61, 44]]);
      fs(g, PAL.iron, 3);

      eyes(g, 64, 34, 6, 12, INK);

      /* Défenses, sorties de la mâchoire */
      poly(g, [[54, 42], [59, 42], [55, 54]]);
      fs(g, PAL.bone, 2.5);
      poly(g, [[69, 42], [74, 42], [73, 54]]);
      fs(g, PAL.bone, 2.5);

      /* Bouclier rond, côté avant */
      limb(g, 92, 62, 104, 74, 11, PAL.orcSkin);
      ball(g, 104, 78, 24, shade(g, 54, 102, PAL.woodLight, PAL.woodDark), 6);
      ball(g, 104, 78, 9, PAL.iron, 4);
      g.save();
      g.globalAlpha = 0.35;
      ell(g, 96, 66, 12, 6, -0.5);
      fill(g, PAL.white);
      g.restore();
    }
  };

  DRAW.flyer = {
    box: [128, 128], anchor: [64, 64],
    draw: function (g, f) {
      var up = f ? 1 : 0;

      /* Ailes : la seule chose qui bouge, mais elle change tout. Elles sont
         dessinées avant le corps pour passer derrière. */
      function wing(dir) {
        g.save();
        g.translate(64, 56);
        g.scale(dir, 1);
        g.rotate(up ? -0.75 : 0.28);
        g.beginPath();
        g.moveTo(4, -4);
        g.bezierCurveTo(30, -34, 62, -30, 66, -6);
        g.bezierCurveTo(52, -2, 46, 10, 40, 22);
        g.bezierCurveTo(28, 12, 14, 8, 4, -4);
        fs(g, shade(g, -32, 22, PAL.harpyLight, PAL.harpyDark));
        g.lineWidth = 3;
        g.strokeStyle = PAL.harpyDark;
        g.beginPath();
        g.moveTo(14, -4); g.lineTo(44, -14);
        g.moveTo(20, 6); g.lineTo(48, -2);
        g.stroke();
        g.restore();
      }
      wing(-1);
      wing(1);

      /* Corps fuselé */
      ell(g, 64, 62, 18, 24);
      fs(g, shade(g, 40, 88, PAL.harpyLight, PAL.harpy));

      /* Serres */
      limb(g, 58, 80, 54, 96, 6, PAL.gold);
      limb(g, 70, 80, 74, 96, 6, PAL.gold);
      poly(g, [[48, 96], [60, 94], [54, 102]]);
      fs(g, PAL.goldDark, 3);
      poly(g, [[68, 94], [80, 96], [74, 102]]);
      fs(g, PAL.goldDark, 3);

      /* Tête et bec */
      ell(g, 64, 38, 16, 15);
      fs(g, shade(g, 22, 54, PAL.harpyLight, PAL.harpy));
      poly(g, [[64, 40], [86, 46], [64, 52]]);
      fs(g, PAL.gold, 4);

      /* Crête de plumes */
      poly(g, [[54, 26], [48, 8], [64, 22]]);
      fs(g, PAL.harpyDark, 3);
      poly(g, [[62, 22], [64, 4], [74, 22]]);
      fs(g, PAL.harpyLight, 3);
      poly(g, [[72, 24], [86, 12], [80, 30]]);
      fs(g, PAL.harpyDark, 3);

      eyes(g, 62, 36, 6, 9, INK);
      brows(g, 62, 27, 9, 5);
    }
  };

  DRAW.boss = {
    box: [128, 128], anchor: [64, 118],
    draw: function (g, f) {
      var swing = f ? 1 : -1;

      /* Le colosse remplit sa boîte : sa masse est son argument. */
      limb(g, 48, 88, 40 + swing * 5, 112, 20, PAL.trollDark);
      limb(g, 82, 88, 90 - swing * 5, 112, 20, PAL.trollDark);
      ell(g, 38 + swing * 5, 114, 15, 8);
      fs(g, PAL.trollDark, 4);
      ell(g, 92 - swing * 5, 114, 15, 8);
      fs(g, PAL.trollDark, 4);

      /* Bras arrière */
      limb(g, 40, 54, 20, 92, 15, PAL.trollDark);
      ball(g, 18, 96, 12, PAL.trollDark, 4);

      /* Torse massif, épaules hautes */
      g.beginPath();
      g.moveTo(34, 96);
      g.bezierCurveTo(24, 62, 34, 38, 64, 38);
      g.bezierCurveTo(94, 38, 104, 62, 94, 96);
      g.bezierCurveTo(78, 104, 50, 104, 34, 96);
      fs(g, shade(g, 36, 104, PAL.trollSkin, PAL.trollDark), 6);

      /* Ventre plus clair : c'est ce contraste qui donne le volume. */
      ell(g, 64, 80, 24, 18);
      fs(g, PAL.trollBelly, 4);

      /* Épines dorsales */
      for (var i = 0; i < 3; i++) {
        poly(g, [[30 - i * 2, 74 - i * 16], [16 - i * 4, 62 - i * 16], [32 - i * 2, 60 - i * 16]]);
        fs(g, PAL.boneDark, 3);
      }

      /* Tête enfoncée dans les épaules */
      ell(g, 66, 30, 25, 22);
      fs(g, shade(g, 8, 50, PAL.trollSkin, PAL.trollDark));

      /* Crête */
      for (var j = 0; j < 4; j++) {
        poly(g, [[52 + j * 9, 12], [56 + j * 9, -4], [60 + j * 9, 12]]);
        fs(g, "#c0432f", 3);
      }

      /* Mâchoire et défenses */
      ell(g, 70, 42, 18, 11);
      fs(g, PAL.trollBelly, 4);
      poly(g, [[58, 40], [64, 40], [60, 54]]);
      fs(g, PAL.bone, 3);
      poly(g, [[76, 39], [82, 39], [80, 53]]);
      fs(g, PAL.bone, 3);

      eyes(g, 64, 24, 7, 12, "#e5484d");
      brows(g, 64, 13, 12, 7);

      /* Massue : bras avant, levé et écarté. Ramenée vers l'intérieur, elle
         passait devant la face et le colosse perdait son regard. */
      limb(g, 92, 56, 114, 46, 15, PAL.trollSkin);
      g.save();
      g.translate(118, 42);
      g.rotate(0.28 + (f ? 0.18 : 0));
      poly(g, [[-7, 6], [7, 6], [12, -30], [-12, -30]]);
      fs(g, shade(g, -30, 6, PAL.woodLight, PAL.woodDark), 6);
      ball(g, 0, -34, 15, PAL.wood, 5);
      for (var k = 0; k < 3; k++) {
        poly(g, [[-12 + k * 12, -40], [-8 + k * 12, -52], [-4 + k * 12, -40]]);
        fs(g, PAL.boneDark, 3);
      }
      g.restore();
    }
  };

  /* --- Tours ------------------------------------------------------------- */
  /* Trois niveaux par tour, dessinés par la même fonction : le niveau ajoute
     de la pierre, de la hauteur et un fanion. On lit la puissance d'une
     défense d'un coup d'œil sur le plateau, sans rien sélectionner. */

  function stoneBase(g, w) {
    /* Socle commun : un rocher taillé, posé au sol. */
    g.beginPath();
    g.moveTo(64 - w, 152);
    g.lineTo(64 - w + 6, 130);
    g.lineTo(64 + w - 6, 130);
    g.lineTo(64 + w, 152);
    g.closePath();
    fs(g, shade(g, 128, 154, PAL.stone, PAL.stoneDark), 6);
    ell(g, 64, 130, w - 6, 8);
    fs(g, PAL.stoneLight, 5);
  }

  /* Créneaux. Ils démarrent quatre points *sous* la ligne du mur : dessinés
     pile dessus, le cerne les détachait et ils flottaient comme des cubes
     posés en l'air. */
  function battlements(g, y, halfW, n, color) {
    var step = (halfW * 2) / (n * 2 - 1);
    for (var i = 0; i < n; i++) {
      var x = 64 - halfW + i * step * 2;
      poly(g, [[x, y + 4], [x + step, y + 4], [x + step, y - 12], [x, y - 12]]);
      fs(g, color, 4);
    }
  }

  function flag(g, x, y, h, color) {
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - h);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + 26, y - h + 8);
    g.lineTo(x, y - h + 17);
    g.closePath();
    fs(g, color, 4);
  }

  DRAW.tower_gun = {
    box: [128, 214], anchor: [64, 204], pad: 54,
    draw: function (g, level) {
      var h = [46, 66, 88][level - 1];
      var half = [26, 29, 32][level - 1];
      stoneBase(g, 36);

      /* Fût de pierre appareillée */
      var top = 130 - h;
      g.beginPath();
      g.moveTo(64 - half, 132);
      g.lineTo(64 - half + 3, top);
      g.lineTo(64 + half - 3, top);
      g.lineTo(64 + half, 132);
      g.closePath();
      fs(g, shade(g, top, 132, PAL.stoneLight, PAL.stoneDark), 6);

      /* Appareillage : quelques joints suffisent à dire « pierre ». */
      g.lineWidth = 2.5;
      g.strokeStyle = PAL.stoneDark;
      for (var i = 1; i * 20 < h; i++) {
        var yy = 132 - i * 20;
        g.beginPath();
        g.moveTo(64 - half + 4, yy);
        g.lineTo(64 + half - 4, yy);
        g.stroke();
      }

      /* Meurtrières */
      for (var m = 0; m < level; m++) {
        var my = 118 - m * 22;
        poly(g, [[62, my], [66, my], [66, my - 12], [62, my - 12]]);
        fs(g, "#20160f", 3);
      }

      /* Galerie crénelée */
      g.beginPath();
      g.moveTo(64 - half - 7, top + 6);
      g.lineTo(64 + half + 7, top + 6);
      g.lineTo(64 + half + 4, top - 6);
      g.lineTo(64 - half - 4, top - 6);
      g.closePath();
      fs(g, shade(g, top - 8, top + 8, PAL.stoneLight, PAL.stone), 5);
      battlements(g, top - 6, half + 4, level + 2, PAL.stone);

      /* Toit de bois dès le niveau 2 : la tour se couvre en montant. */
      if (level >= 2) {
        poly(g, [[64 - half - 6, top - 18], [64 + half + 6, top - 18], [64, top - 18 - (level === 3 ? 44 : 30)]]);
        fs(g, shade(g, top - 60, top - 18, PAL.roofLight, PAL.roofDark), 6);
      }
      if (level === 3) flag(g, 64, top - 62, 22, PAL.cloth);

      /* L'archer : une silhouette suffit, mais elle rend la tour vivante. */
      var ay = top - 14;
      ball(g, 64, ay - 10, 7, PAL.boneDark, 4);
      poly(g, [[58, ay - 3], [70, ay - 3], [72, ay + 10], [56, ay + 10]]);
      fs(g, PAL.cloth, 4);
      g.lineWidth = 3.5;
      g.strokeStyle = PAL.woodDark;
      g.beginPath();
      g.arc(76, ay, 11, -1.1, 1.1);
      g.stroke();
    }
  };

  DRAW.tower_cannon = {
    box: [128, 214], anchor: [64, 204], pad: 54,
    draw: function (g, level) {
      stoneBase(g, 38);

      /* Redoute : un mur de pierre en fer à cheval, ouvert vers l'avant. Une
         simple plateforme plate ne se lisait pas — l'engin avait l'air posé
         sur un caillou. Il lui fallait de la hauteur et un abri. */
      var half = [30, 34, 38][level - 1];
      var wallTop = [86, 78, 70][level - 1];

      /* Le sol de la redoute est posé en premier : la muraille passera devant,
         et l'affût se retrouvera dans l'enceinte plutôt que dessus. */
      ell(g, 64, wallTop + 4, half - 6, 11);
      fs(g, shade(g, wallTop - 8, wallTop + 16, PAL.stoneLight, PAL.stone), 5);

      /* Muraille : un parapet droit, à sommet plat. La première version fermait
         le haut par une courbe — l'ensemble lisait « tonneau », pas « redoute ». */
      g.beginPath();
      g.moveTo(64 - half, 132);
      g.lineTo(64 - half + 3, wallTop + 8);
      g.lineTo(64 + half - 3, wallTop + 8);
      g.lineTo(64 + half, 132);
      g.closePath();
      fs(g, shade(g, wallTop, 132, PAL.stoneLight, PAL.stoneDark), 6);

      /* Appareillage : quelques joints, et l'on voit de la pierre taillée. */
      g.lineWidth = 2.5;
      g.strokeStyle = PAL.stoneDark;
      for (var j = 1; j * 16 < 124 - wallTop; j++) {
        g.beginPath();
        g.moveTo(64 - half + 5, 132 - j * 16);
        g.lineTo(64 + half - 5, 132 - j * 16);
        g.stroke();
      }

      /* Créneaux sur le parapet : deux au niveau 1, cinq au niveau 3. */
      battlements(g, wallTop + 8, half - 2, level + 1, shade(g, wallTop - 6, wallTop + 8, PAL.stoneLight, PAL.stone));

      /* Tonneaux de poudre, un par niveau, calés contre le mur. */
      for (var i = 0; i < level; i++) {
        var bx = 64 - half + 12 + i * 20;
        ell(g, bx, 122, 9, 11);
        fs(g, shade(g, 111, 133, PAL.woodLight, PAL.woodDark), 4);
        g.lineWidth = 2.5;
        g.strokeStyle = PAL.ironDark;
        g.beginPath();
        g.moveTo(bx - 8, 118); g.lineTo(bx + 8, 118);
        g.moveTo(bx - 8, 126); g.lineTo(bx + 8, 126);
        g.stroke();
      }

      /* Boulets empilés dès le niveau 2 : l'engin a des munitions. */
      if (level >= 2) {
        ball(g, 96, 124, 8, PAL.ironDark, 4);
        ball(g, 108, 124, 8, PAL.ironDark, 4);
        ball(g, 102, 112, 8, PAL.iron, 4);
      }
    },
    /* Sol de la redoute, où repose l'affût : le rendu y pose le fût et
       l'éclair de bouche. Déclaré ici, à côté du tracé, plutôt que recopié en
       fractions de case dans le rendu — les deux dérivaient dès qu'on
       retouchait la hauteur d'un mur. */
    mark: function (level) {
      return { x: 64, y: [90, 82, 74][level - 1] };
    },
    /* La bouche du canon est dessinée à part : c'est la seule pièce qui
       tourne, et elle tourne vers la cible à chaque tir. */
    barrel: {
      box: [96, 96], anchor: [30, 48],
      draw: function (g, level) {
        var len = [30, 36, 42][level - 1];
        var rad = [14, 17, 20][level - 1];

        /* Affût */
        ell(g, 30, 48, 16, 14);
        fs(g, shade(g, 34, 62, PAL.ironLight, PAL.ironDark), 5);

        /* Fût, tourné vers la droite (0 rad) */
        g.beginPath();
        g.moveTo(26, 48 - rad);
        g.lineTo(26 + len, 48 - rad - 2);
        g.lineTo(26 + len, 48 + rad + 2);
        g.lineTo(26, 48 + rad);
        g.closePath();
        fs(g, shade(g, 48 - rad, 48 + rad, PAL.ironLight, PAL.ironDark), 5);

        /* Bourrelet de bouche */
        ell(g, 26 + len, 48, 5, rad + 4);
        fs(g, PAL.iron, 5);
        ell(g, 26 + len + 1, 48, 3, rad - 1);
        fill(g, "#1a1410");

        if (level === 3) {
          /* Anneaux de laiton : la marque du dernier niveau. */
          for (var i = 0; i < 2; i++) {
            ell(g, 34 + i * 16, 48, 4, rad + 2);
            fs(g, PAL.gold, 4);
          }
        }
      }
    }
  };

  DRAW.tower_frost = {
    box: [128, 214], anchor: [64, 204], pad: 54,
    draw: function (g, level) {
      stoneBase(g, 34);

      /* Socle glacé */
      var half = [24, 27, 30][level - 1];
      var h = [40, 58, 74][level - 1];
      var top = 130 - h;

      g.beginPath();
      g.moveTo(64 - half, 132);
      g.lineTo(64 - half + 4, top + 10);
      g.lineTo(64 + half - 4, top + 10);
      g.lineTo(64 + half, 132);
      g.closePath();
      fs(g, shade(g, top, 132, PAL.stoneLight, PAL.stoneDark), 6);

      /* Givre qui remonte la pierre */
      g.save();
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(64 - half + 2, 132);
      g.quadraticCurveTo(64, 112, 64 + half - 2, 132);
      fill(g, PAL.iceLight);
      g.restore();

      /* Cristal principal */
      poly(g, [[64, top - 34], [64 + half - 4, top + 12], [64, top + 22], [64 - half + 4, top + 12]]);
      fs(g, shade(g, top - 34, top + 22, PAL.iceLight, PAL.iceDark), 6);
      g.save();
      g.globalAlpha = 0.55;
      poly(g, [[64, top - 30], [64 + 8, top + 6], [64, top + 12]]);
      fill(g, PAL.white);
      g.restore();

      /* Éclats satellites, un par niveau */
      for (var i = 0; i < level; i++) {
        var sx = 64 + (i % 2 ? 1 : -1) * (half + 6);
        var sy = top + 20 + Math.floor(i / 2) * 14;
        poly(g, [[sx, sy - 18], [sx + 7, sy], [sx, sy + 6], [sx - 7, sy]]);
        fs(g, shade(g, sy - 18, sy + 6, PAL.ice, PAL.iceDark), 4);
      }

      if (level === 3) {
        /* Halo de froid : lisible même quand la tour ne tire pas. */
        g.save();
        g.globalAlpha = 0.25;
        ball(g, 64, top - 6, 30, PAL.ice, 0);
        g.restore();
      }
    }
  };

  DRAW.tower_tesla = {
    box: [128, 214], anchor: [64, 204], pad: 54,
    /* Position de l'orbe, que le rendu embrase au tir. */
    mark: function (level) {
      var h = [44, 64, 84][level - 1];
      return { x: 64, y: 130 - h - (level === 3 ? 58 : 42) };
    },
    draw: function (g, level) {
      var h = [44, 64, 84][level - 1];
      var half = [24, 26, 28][level - 1];
      var top = 130 - h;
      stoneBase(g, 34);

      /* Fût de mage, légèrement conique */
      g.beginPath();
      g.moveTo(64 - half, 132);
      g.lineTo(64 - half + 6, top);
      g.lineTo(64 + half - 6, top);
      g.lineTo(64 + half, 132);
      g.closePath();
      fs(g, shade(g, top, 132, "#6f6a86", "#403c56"), 6);

      /* Runes gravées, une par niveau */
      g.save();
      g.globalAlpha = 0.85;
      for (var i = 0; i < level; i++) {
        var ry = 118 - i * 22;
        poly(g, [[64, ry - 10], [70, ry], [64, ry + 10], [58, ry]]);
        fs(g, PAL.arcaneLight, 2.5);
      }
      g.restore();

      /* Toit conique de sorcier */
      poly(g, [[64 - half - 8, top + 4], [64 + half + 8, top + 4], [64, top - (level === 3 ? 52 : 36)]]);
      fs(g, shade(g, top - 52, top + 4, PAL.arcane, PAL.arcaneDark), 6);
      g.save();
      g.globalAlpha = 0.3;
      poly(g, [[64 - half - 4, top + 2], [64 - 4, top + 2], [64 - 2, top - 30]]);
      fill(g, PAL.white);
      g.restore();

      /* Orbe : la source de la magie, et le repère visuel de la tour. */
      var oy = top - (level === 3 ? 58 : 42);
      ball(g, 64, oy, 10 + level * 2, shade(g, oy - 14, oy + 14, PAL.arcaneLight, PAL.arcane), 5);
      gloss(g, 60, oy - 5, 5, 3, 0.6);
      g.save();
      g.globalAlpha = 0.28;
      ball(g, 64, oy, 20 + level * 3, PAL.arcaneLight, 0);
      g.restore();
    }
  };

  /* --- Décor et bâtiments ------------------------------------------------ */

  DRAW.tree = {
    box: [128, 140], anchor: [64, 132],
    draw: function (g) {
      /* Tronc */
      g.beginPath();
      g.moveTo(54, 132);
      g.quadraticCurveTo(58, 106, 56, 86);
      g.lineTo(72, 86);
      g.quadraticCurveTo(70, 106, 74, 132);
      g.closePath();
      fs(g, shade(g, 86, 132, PAL.woodLight, PAL.woodDark), 6);

      /* Feuillage : trois masses, la plus claire en haut à gauche — la
         lumière vient toujours du même côté dans tout le jeu. */
      ell(g, 44, 62, 28, 24);
      fs(g, "#4c8a3a", 6);
      ell(g, 84, 58, 26, 23);
      fs(g, "#437c33", 6);
      ell(g, 64, 40, 34, 30);
      fs(g, shade(g, 10, 70, "#6fb04a", "#3f7530"), 6);
      g.save();
      g.globalAlpha = 0.35;
      ell(g, 54, 28, 16, 10, -0.4);
      fill(g, "#b6e07a");
      g.restore();
    }
  };

  DRAW.rock = {
    box: [128, 120], anchor: [64, 112],
    draw: function (g) {
      g.beginPath();
      g.moveTo(20, 112);
      g.lineTo(32, 62);
      g.lineTo(58, 40);
      g.lineTo(92, 52);
      g.lineTo(108, 112);
      g.closePath();
      fs(g, shade(g, 40, 112, PAL.stoneLight, PAL.stoneDark), 6);

      /* Facettes : deux traits, et le caillou devient un rocher taillé. */
      g.lineWidth = 4;
      g.strokeStyle = PAL.stoneDark;
      g.beginPath();
      g.moveTo(58, 40); g.lineTo(66, 76); g.lineTo(108, 108);
      g.moveTo(66, 76); g.lineTo(24, 100);
      g.stroke();

      g.save();
      g.globalAlpha = 0.3;
      poly(g, [[58, 42], [88, 52], [66, 74]]);
      fill(g, PAL.white);
      g.restore();

      /* Herbe au pied, sur les côtés seulement : tracée en travers, elle
         zébrait la pierre au lieu de la poser au sol. */
      [14, 22, 104, 112].forEach(function (x, i) {
        g.beginPath();
        g.moveTo(x, 112);
        g.quadraticCurveTo(x + (i < 2 ? -3 : 3), 100, x + (i < 2 ? -9 : 9), 94);
        g.lineWidth = 5;
        g.strokeStyle = "#3f7530";
        g.lineCap = "round";
        g.stroke();
      });
    }
  };

  DRAW.core = {
    box: [176, 160], anchor: [88, 148],
    draw: function (g) {
      /* La forteresse à défendre. Elle doit être le point le plus riche du
         plateau : c'est ce qu'on protège. */

      /* Corps de garde */
      g.beginPath();
      g.moveTo(38, 148);
      g.lineTo(38, 74);
      g.lineTo(138, 74);
      g.lineTo(138, 148);
      g.closePath();
      fs(g, shade(g, 74, 148, PAL.stoneLight, PAL.stoneDark), 6);

      g.lineWidth = 2.5;
      g.strokeStyle = PAL.stoneDark;
      for (var i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(40, 74 + i * 18);
        g.lineTo(136, 74 + i * 18);
        g.stroke();
      }

      /* Porte cintrée et herse */
      g.beginPath();
      g.moveTo(68, 148);
      g.lineTo(68, 112);
      g.quadraticCurveTo(88, 92, 108, 112);
      g.lineTo(108, 148);
      g.closePath();
      fs(g, "#2c2016", 5);
      g.lineWidth = 3;
      g.strokeStyle = PAL.iron;
      for (var v = 1; v < 4; v++) {
        g.beginPath();
        g.moveTo(68 + v * 10, 148);
        g.lineTo(68 + v * 10, 104);
        g.stroke();
      }
      for (var hh = 1; hh < 3; hh++) {
        g.beginPath();
        g.moveTo(70, 148 - hh * 14);
        g.lineTo(106, 148 - hh * 14);
        g.stroke();
      }

      /* Tours d'angle */
      [30, 146].forEach(function (x) {
        g.beginPath();
        g.moveTo(x - 20, 148);
        g.lineTo(x - 16, 52);
        g.lineTo(x + 16, 52);
        g.lineTo(x + 20, 148);
        g.closePath();
        fs(g, shade(g, 52, 148, PAL.stoneLight, PAL.stone), 6);
        battlements(g, 52, 18, 3, PAL.stoneLight);
        g.save();
        g.translate(x - 64, 0);
        poly(g, [[64 - 24, 40], [64 + 24, 40], [64, 4]]);
        fs(g, shade(g, 4, 40, PAL.roofLight, PAL.roofDark), 6);
        g.restore();
      });

      battlements(g, 74, 44, 5, PAL.stoneLight);
      flag(g, 88, 62, 34, PAL.cloth);
    }
  };

  DRAW.cave = {
    box: [128, 96], anchor: [64, 88],
    draw: function (g) {
      /* Bouche de caverne : d'ici sortent les vagues. */
      g.beginPath();
      g.moveTo(10, 88);
      g.lineTo(20, 44);
      g.lineTo(50, 18);
      g.lineTo(88, 20);
      g.lineTo(112, 50);
      g.lineTo(118, 88);
      g.closePath();
      fs(g, shade(g, 18, 88, PAL.stoneLight, PAL.stoneDark), 6);

      g.beginPath();
      g.moveTo(40, 88);
      g.quadraticCurveTo(42, 44, 64, 42);
      g.quadraticCurveTo(86, 44, 88, 88);
      g.closePath();
      fs(g, "#171019", 5);

      /* Deux yeux dans le noir : le décor annonce la menace. */
      g.save();
      g.globalAlpha = 0.8;
      ball(g, 57, 66, 4, "#e5484d", 0);
      ball(g, 72, 66, 4, "#e5484d", 0);
      g.restore();

      /* Piquets plantés de part et d'autre */
      [22, 104].forEach(function (x, i) {
        g.save();
        g.translate(x, 86);
        g.rotate(i ? 0.2 : -0.2);
        poly(g, [[-4, 0], [4, 0], [2, -34], [-2, -34]]);
        fs(g, PAL.woodDark, 4);
        ball(g, 0, -38, 7, PAL.bone, 3);
        g.restore();
      });
    }
  };

  /* --- Cuisson et cache -------------------------------------------------- */

  /* Chaque figure n'est tracée qu'une fois, à la résolution de référence, puis
     recopiée à l'échelle. Tracer une centaine de courbes soixante fois par
     seconde pour trente ennemis serait le seul vrai gouffre de ce jeu. */
  var baked = {};
  var tints = {};

  function spec(name) {
    if (DRAW[name]) return DRAW[name];
    /* `tower_cannon.barrel` et consorts */
    var dot = name.indexOf(".");
    if (dot > 0) {
      var head = DRAW[name.slice(0, dot)];
      return head ? head[name.slice(dot + 1)] : null;
    }
    return null;
  }

  function bake(name, frame) {
    var s = spec(name);
    if (!s) throw new Error("dessin inconnu : " + name);
    var key = name + "#" + frame;
    if (baked[key]) return baked[key];

    var cv = document.createElement("canvas");
    cv.width = s.box[0];
    cv.height = s.box[1];
    var g = cv.getContext("2d");
    g.lineJoin = "round";
    g.lineCap = "round";
    /* `pad` : marge en haut de la boîte. Les tours sont tracées dans un repère
       où le sol est à y = 152 ; au niveau 3, toit et fanion montaient plus haut
       que la boîte et se faisaient couper. Plutôt que de renuméroter chaque
       coordonnée, on décale le tracé et on ajoute la marge à l'ancrage. */
    if (s.pad) g.translate(0, s.pad);
    s.draw(g, frame);

    baked[key] = { canvas: cv, spec: s };
    return baked[key];
  }

  function tinted(name, frame, color) {
    var key = name + "#" + frame + "|" + color;
    if (tints[key]) return tints[key];

    var src = bake(name, frame);
    var cv = document.createElement("canvas");
    cv.width = src.canvas.width;
    cv.height = src.canvas.height;
    var g = cv.getContext("2d");
    g.drawImage(src.canvas, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, cv.width, cv.height);

    tints[key] = { canvas: cv, spec: src.spec };
    return tints[key];
  }

  var Art = {
    PAL: PAL,
    INK: INK,
    DRAW: DRAW,

    /* Dessine une figure. `x, y` est la position de son *ancrage* — les pieds,
       la base, ou le centre selon la figure. `w` est la largeur voulue à
       l'écran ; la hauteur suit, le dessin n'est jamais déformé. */
    draw: function (ctx, name, opts) {
      var img = opts.tint
        ? tinted(name, opts.frame || 0, opts.tint)
        : bake(name, opts.frame || 0);
      var box = img.spec.box, anchor = img.spec.anchor;
      var s = opts.w / box[0];

      ctx.save();
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      ctx.translate(opts.x, opts.y);
      if (opts.angle) ctx.rotate(opts.angle);
      if (opts.flip) ctx.scale(-1, 1);
      ctx.drawImage(img.canvas, -anchor[0] * s, -anchor[1] * s, box[0] * s, box[1] * s);
      ctx.restore();
    },

    /* Hauteur qu'occupera une figure dessinée à la largeur `w`. */
    heightAt: function (name, w) {
      var s = spec(name);
      return s ? s.box[1] * (w / s.box[0]) : 0;
    },

    /* Hauteur du sommet de la figure au-dessus de son ancrage, à la largeur
       `w`. Une créature qui marche est ancrée aux pieds, une qui vole l'est au
       centre : sans cette mesure, une barre de vie calée sur la hauteur totale
       flotterait très au-dessus des harpies. */
    topAt: function (name, w) {
      var s = spec(name);
      return s ? s.anchor[1] * (w / s.box[0]) : 0;
    },

    /* Repère nommé d'une figure — la bouche d'un canon, l'orbe d'un mage —
       rendu en décalage écran par rapport à son ancrage. Le rendu n'a ainsi
       aucune coordonnée d'art recopiée à la main : retoucher un dessin ne peut
       plus décaler en silence ce qu'on pose dessus. */
    markAt: function (name, frame, w) {
      var s = spec(name);
      if (!s || !s.mark) return { x: 0, y: 0 };
      var m = s.mark(frame);
      var k = w / s.box[0];
      return {
        x: (m.x - s.anchor[0]) * k,
        y: (m.y + (s.pad || 0) - s.anchor[1]) * k
      };
    },

    /* Vérification au chargement : une figure qui n'est ni déclarée ni
       dessinable est une faute de frappe, pas un effet de style. */
    validate: function () {
      var bad = [];
      var needed = ["crawler", "swarm", "armored", "flyer", "boss",
        "tower_gun", "tower_cannon", "tower_frost", "tower_tesla",
        "tower_cannon.barrel", "tree", "rock", "core", "cave"];
      needed.forEach(function (name) {
        var s = spec(name);
        if (!s) { bad.push("figure manquante : " + name); return; }
        if (!s.box || !s.anchor) { bad.push(name + " : boîte ou ancrage absent"); return; }
        try {
          bake(name, 1);
        } catch (err) {
          bad.push(name + " : " + err.message);
        }
      });
      return bad;
    }
  };

  PD.Art = Art;
})(window.PD = window.PD || {});
