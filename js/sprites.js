/* Pixel Defense — les sprites.
   Chaque dessin est un tableau de chaînes : une lettre = un pixel d'art,
   « . » = transparent. Rien n'est chargé depuis le réseau, le jeu démarre
   donc instantanément et fonctionne hors ligne sans rien mettre en cache.
   Chaque sprite est « cuit » une fois dans un canvas hors écran, puis
   redessiné à l'échelle voulue avec le lissage coupé : des pixels carrés,
   nets, à toutes les tailles d'écran. */
(function (PD) {
  "use strict";

  var PAL = {
    ".": null,
    k: "#12131c", // contour
    w: "#eef1f7", // blanc
    s: "#8a93a8", // acier
    S: "#5b6479", // acier sombre
    r: "#e5484d", // rouge
    d: "#9b2f33", // rouge sombre
    o: "#f2a33c", // orange
    O: "#b96a1c", // orange sombre
    y: "#ffd84d", // jaune
    g: "#57c96a", // vert
    G: "#2f8f47", // vert sombre
    b: "#4aa3f0", // bleu
    B: "#2264c4", // bleu sombre
    c: "#5be3e0", // cyan
    C: "#2aa8b5", // cyan sombre
    p: "#a35bd6", // violet
    P: "#6b32a0", // violet sombre
    n: "#6b4a2f", // brun
    N: "#43301f" // brun sombre
  };

  /* --- Ennemis ---------------------------------------------------------- */

  var ART = {
    crawler: [
      "....kkkk....",
      "..kkGGGGkk..",
      ".kGggggggGk.",
      ".kGgwkkwgGk.",
      "kGgggggggGGk",
      "kGggGGGGggGk",
      "kGgggggggGGk",
      ".kGggggggGk.",
      "..kkGGGGkk..",
      "...k.kk.k...",
      "..k..kk..k..",
      "............"
    ],

    swarm: [
      "..kkkk..",
      ".krrrrk.",
      "krwrrwrk",
      "krrrrrrk",
      "krddddrk",
      ".krrrrk.",
      "..kkkk..",
      "..k..k.."
    ],

    armored: [
      "...kkkkkk...",
      "..kSSSSSSk..",
      ".kSssssssSk.",
      "kSssSSSSssSk",
      "kSsSwkkwSsSk",
      "kSssSSSSssSk",
      "kSssssssssSk",
      ".kSssssssSk.",
      ".kSSSSSSSSk.",
      "..kSSSSSSk..",
      "...kkkkkk...",
      "...k....k..."
    ],

    flyer: [
      "kk........kk",
      ".kk......kk.",
      "..k..bb..k..",
      ".....bb.....",
      "...kkbbkk...",
      "..kbBBBBbk..",
      "..kbBccBbk..",
      "..kbBBBBbk..",
      "...kkbbkk...",
      ".....bb.....",
      "..k..bb..k..",
      ".kk......kk."
    ],

    boss: [
      "....kkkkkkkk....",
      "..kkPPPPPPPPkk..",
      ".kPPpppppppPPPk.",
      "kPPppppppppppPPk",
      "kPpppyykkyyppppk",
      "kPppppppppppppPk",
      "kPppkPPPPPPkppPk",
      "kPpppPPPPPPpppPk",
      "kPppppppppppppPk",
      ".kPPppppppppPPk.",
      ".kkPPPPPPPPPPkk.",
      "..kkPPPPPPPPkk..",
      "...k.kkkkkk.k...",
      "..kk..kkkk..kk..",
      "..kk........kk..",
      "................"
    ],

    /* --- Têtes de tours : dessinées vers le haut, tournées au tir ------- */

    head_gun: [
      ".....kk.....",
      ".....ss.....",
      ".....ss.....",
      "....kssk....",
      "...kssssk...",
      "..kSssssSk..",
      ".kSssssssSk.",
      ".kSssssssSk.",
      ".kSSssssSSk.",
      "..kSSSSSSk..",
      "...kkkkkk...",
      "............"
    ],

    head_cannon: [
      "....kkkk....",
      "....kook....",
      "....kook....",
      "....kook....",
      "...kooook...",
      "..kOooooOk..",
      ".kOooooooOk.",
      ".kOooooooOk.",
      ".kOOooooOOk.",
      "..kOOOOOOk..",
      "...kkkkkk...",
      "............"
    ],

    head_frost: [
      ".....kk.....",
      "....kcck....",
      "....kcck....",
      "...kcccck...",
      "..kCccccCk..",
      ".kCccccccCk.",
      ".kCccccccCk.",
      ".kCCccccCCk.",
      "..kCCCCCCk..",
      "...kkkkkk...",
      "............",
      "............"
    ],

    head_tesla: [
      "..k......k..",
      "..kp....pk..",
      "...kp..pk...",
      "....kppk....",
      "....kppk....",
      "..kPppppPk..",
      ".kPppppppPk.",
      ".kPppppppPk.",
      ".kPPppppPPk.",
      "..kPPPPPPk..",
      "...kkkkkk...",
      "............"
    ],

    /* --- Décor et base --------------------------------------------------- */

    core: [
      "................",
      "......kkkk......",
      ".....kcccck.....",
      "....kcccccck....",
      "...kcccccccck...",
      "...kcCccccCck...",
      "...kcCccccCck...",
      "...kcCCccCCck...",
      "...kcCCCCCCck...",
      "....kCCCCCCk....",
      ".....kCCCCk.....",
      "....kkkkkkkk....",
      "...kSSSSSSSSk...",
      "..kSssssssssSk..",
      "..kSSSSSSSSSSk..",
      "..kkkkkkkkkkkk.."
    ],

    rock: [
      "............",
      "....kkkk....",
      "..kkSSSSkk..",
      ".kSSsssSSSk.",
      ".kSsssssSSk.",
      "kSssssssSSSk",
      "kSsssssssSSk",
      "kSSssssssSSk",
      ".kSSSSSSSSk.",
      "..kkkkkkkk..",
      "............",
      "............"
    ],

    tree: [
      "....kkkk....",
      "..kkGGGGkk..",
      ".kGggggggGk.",
      "kGgggggggGGk",
      "kGgggggggGGk",
      "kGggGgggGGGk",
      ".kGgggggGGk.",
      "..kkGGGGkk..",
      "....knnk....",
      "....knnk....",
      "....kNNk....",
      "...kkkkkk..."
    ]
  };

  var baked = {};

  function bake(name) {
    var rows = ART[name];
    var w = 0;
    rows.forEach(function (row) { w = Math.max(w, row.length); });
    var h = rows.length;

    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    var g = cv.getContext("2d");

    for (var y = 0; y < h; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var col = PAL[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    baked[name] = { canvas: cv, w: w, h: h };
    return baked[name];
  }

  var tints = {};

  /* Version colorée d'un sprite : on recopie le dessin puis on repeint tous
     ses pixels opaques d'une seule couleur (`source-in`). C'est ce qui donne
     un éclair blanc à l'impact ou un voile de givre qui épouse la silhouette,
     au lieu d'un vilain carré de couleur posé par-dessus. Chaque teinte n'est
     calculée qu'une fois. */
  function tinted(name, color) {
    var key = name + "|" + color;
    if (tints[key]) return tints[key];

    var s = baked[name] || bake(name);
    var cv = document.createElement("canvas");
    cv.width = s.w;
    cv.height = s.h;
    var g = cv.getContext("2d");
    g.drawImage(s.canvas, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, s.w, s.h);

    tints[key] = { canvas: cv, w: s.w, h: s.h };
    return tints[key];
  }

  var Sprites = {
    PAL: PAL,

    get: function (name) {
      return baked[name] || bake(name);
    },

    /* Dessine la silhouette du sprite dans une couleur, avec transparence. */
    drawTint: function (ctx, name, cx, cy, px, color, alpha) {
      var s = tinted(name, color);
      var w = s.w * px, h = s.h * px;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(s.canvas, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
      ctx.restore();
    },

    /* Dessine un sprite centré sur (cx, cy), un pixel d'art valant `px`
       pixels écran. `angle` (radians, 0 = vers la droite) fait pivoter le
       sprite, dont le dessin pointe vers le haut. */
    draw: function (ctx, name, cx, cy, px, angle) {
      var s = Sprites.get(name);
      var w = s.w * px, h = s.h * px;
      if (angle) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + Math.PI / 2);
        ctx.drawImage(s.canvas, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(s.canvas, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
      }
    },

    /* Vérification au chargement : un sprite dont les lignes n'ont pas toutes
       la même longueur est une faute de frappe, pas un effet de style. */
    validate: function () {
      var bad = [];
      Object.keys(ART).forEach(function (name) {
        var rows = ART[name];
        var w = rows[0].length;
        rows.forEach(function (row, i) {
          if (row.length !== w) bad.push(name + " ligne " + i + " : " + row.length + " ≠ " + w);
          for (var x = 0; x < row.length; x++) {
            if (!(row[x] in PAL)) bad.push(name + " ligne " + i + " : couleur inconnue « " + row[x] + " »");
          }
        });
      });
      return bad;
    },

    ART: ART
  };

  PD.Sprites = Sprites;
})(window.PD);
