/* Village — les dessins.
   Deux techniques, chacune là où elle est la meilleure :
   — les volumes (sol, murs, toits) sont tracés en polygones, parce qu'un
     losange isométrique dessiné à la main a toujours un bord en escalier ;
   — la végétation et les habitants sont des sprites en pixels, écrits en
     toutes lettres ici.
   Aucune image n'est chargée depuis le réseau.

   Trois règles de dessin, qui font toute la différence entre un tas de cubes
   et un village :
   1. chaque volume porte un contour sombre — c'est lui qui détache les
      bâtiments du sol ;
   2. un toit est en pente, jamais plat : quatre pans qui montent vers un
      faîte, comme une vraie toiture ;
   3. le métier se lit à la silhouette — ailes du moulin, tas de rondins,
      auvent rayé du marché — jamais à une étiquette posée par-dessus. */
(function (V) {
  "use strict";

  var C = V.CONFIG;

  var PAL = {
    ".": null,
    k: "#20180f", // contour
    w: "#f2efe4", // blanc cassé
    y: "#ffd15c", // lumière
    r: "#c2503f", // rouge
    g: "#5fa34a", // feuillage clair
    G: "#3f7a38", // feuillage moyen
    E: "#2c5a2b", // feuillage sombre
    d: "#7a5433", // tronc
    D: "#4e3520", // tronc sombre
    s: "#a5adb8", // pierre claire
    S: "#727b88", // pierre sombre
    n: "#e8d7ae", // paille
    f: "#f0cfa0", // peau
    b: "#3d5a8a", // vêtement bleu
    c: "#8f4b3a"  // vêtement brun
  };

  var ART = {
    /* Trois végétaux plutôt qu'un : une forêt d'exemplaires identiques se
       repère immédiatement et sent le décor collé. */
    tree1: [
      "......kkk.......",
      "....kkgggkk.....",
      "...kgggggggk....",
      "..kggggGggggk...",
      "..kgggggggGgk...",
      ".kggGgggggggGk..",
      ".kgggggGgggggk..",
      "..kgggggggGgk...",
      "..kkgggGggggk...",
      "....kkgggggk....",
      "......kkdk......",
      ".......kdk......",
      "......kDDDk.....",
      "................"
    ],
    tree2: [
      ".......kk.......",
      "......kGGk......",
      ".....kGggGk.....",
      "....kGgggggk....",
      ".....kGgggk.....",
      "....kGgggggk....",
      "...kGgggggggk...",
      "....kGgggggk....",
      "...kGgggggggk...",
      "..kGgggggggggk..",
      "....kkkdkkk.....",
      ".......kdk......",
      "......kDDDk.....",
      "................"
    ],
    bush: [
      "................",
      "................",
      "................",
      "......kkk.......",
      "....kkgEgkk.....",
      "...kgggggggk....",
      "..kggEgggggEk...",
      "..kgggggEgggk...",
      "...kkgggggkk....",
      ".....kkkkk......",
      "................",
      "................",
      "................",
      "................"
    ],

    rock1: [
      "................",
      "......kkkk......",
      "....kkssssk.....",
      "...kssssSSSk....",
      "..ksssssSSSSk...",
      "..kssssSSSSSk...",
      "...kSSSSSSSk....",
      "....kkSSSkk.....",
      "......kkk.......",
      "................"
    ],
    rock2: [
      "................",
      "................",
      ".......kkk......",
      "....kkkssskk....",
      "...ksssssSSSk...",
      "..kssskssSSSSk..",
      "..kSSSSSSSSSk...",
      "...kkSSSSkk.....",
      ".....kkk........",
      "................"
    ],

    /* Un villageois : quatre pixels de large, mais c'est lui qui fait qu'un
       village a l'air habité plutôt que construit. */
    villager1: [
      ".kk.",
      "kffk",
      "kffk",
      "kbbk",
      "kbbk",
      "kbbk",
      ".kk.",
      ".k.k"
    ],
    villager2: [
      ".kk.",
      "kffk",
      "kffk",
      "kcck",
      "kcck",
      "kcck",
      ".kk.",
      "k.k."
    ]
  };

  var baked = {};

  function bake(name) {
    var rows = ART[name];
    var w = 0;
    rows.forEach(function (row) { w = Math.max(w, row.length); });

    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = rows.length;
    var g = cv.getContext("2d");

    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var col = PAL[rows[y][x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    baked[name] = { canvas: cv, w: w, h: rows.length };
    return baked[name];
  }

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = function (v) {
      return Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
    };
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  }

  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  var OUTLINE = "rgba(24,18,10,0.85)";

  var Art = {
    PAL: PAL,
    ART: ART,
    shade: shade,
    poly: poly,

    get: function (name) { return baked[name] || bake(name); },

    /* Les objets d'un monde isométrique sont posés par les pieds, jamais par
       le milieu. */
    drawFoot: function (ctx, name, x, y, k) {
      var s = Art.get(name);
      ctx.drawImage(s.canvas, Math.round(x - (s.w * k) / 2), Math.round(y - s.h * k), s.w * k, s.h * k);
    },

    /* ---- Sol ------------------------------------------------------------ */

    /* Une tuile d'herbe n'est pas un aplat : deux tons mouchetés et une arête
       claire au nord. Sans ce grain, le sol fait carrelage de salle de bain. */
    tile: function (ctx, sx, sy, k, opts) {
      var pts = V.Iso.diamond(sx, sy, k);
      var color = opts.dim ? shade(opts.color, -0.34) : opts.color;

      poly(ctx, pts, color, null);

      /* Arête éclairée sur les deux bords nord : la lumière vient d'en haut à
         gauche, comme partout ailleurs dans le jeu. Hors territoire, on s'en
         passe — le liseré y dessinait un quadrillage de tableur. */
      if (!opts.dim) {
        ctx.beginPath();
        ctx.moveTo(pts[3][0], pts[3][1]);
        ctx.lineTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.strokeStyle = shade(color, 0.12);
        ctx.lineWidth = Math.max(1, k * 0.8);
        ctx.stroke();
      }

      /* Mouchetis : quelques pixels plus clairs et plus sombres, toujours aux
         mêmes endroits, et jamais hors du losange. */
      if (opts.speckle && k >= 1.5) {
        var px = Math.max(1, Math.round(k));
        var hw = (C.TW / 2) * k, hh = (C.TH / 2) * k;
        for (var i = 0; i < 5; i++) {
          var a = opts.speckle(i), b = opts.speckle(i + 7);
          if (a < 0.42) continue;
          var dx = (a - 0.5) * C.TW * 0.7 * k;
          var dy = (b - 0.5) * C.TH * 0.7 * k;
          if (Math.abs(dx) / hw + Math.abs(dy) / hh > 0.78) continue;
          ctx.fillStyle = a > 0.75 ? shade(color, 0.15) : shade(color, -0.12);
          ctx.fillRect(Math.round(sx + dx), Math.round(sy + dy), px, px);
        }
      }
    },

    tileOutline: function (ctx, sx, sy, k, color, width) {
      poly(ctx, V.Iso.diamond(sx, sy, k), null, color, width || Math.max(1, k));
    },

    /* Écume : le liseré clair là où l'eau touche la terre. Trois pixels qui
       transforment une flaque bleue en rivage. */
    shore: function (ctx, sx, sy, k, sides) {
      var pts = V.Iso.diamond(sx, sy, k);
      var edges = [[3, 0], [0, 1], [1, 2], [2, 3]];   // nord-ouest, nord-est, sud-est, sud-ouest
      ctx.strokeStyle = "rgba(226,240,246,0.5)";
      ctx.lineWidth = Math.max(1, k);
      for (var i = 0; i < 4; i++) {
        if (!sides[i]) continue;
        ctx.beginPath();
        ctx.moveTo(pts[edges[i][0]][0], pts[edges[i][0]][1]);
        ctx.lineTo(pts[edges[i][1]][0], pts[edges[i][1]][1]);
        ctx.stroke();
      }
    },

    /* ---- Bâtiments ------------------------------------------------------- */

    /* Corps d'un bâtiment : deux faces visibles, dans deux nuances du même
       mur, contour compris. Renvoie sa hauteur en pixels d'écran. */
    box: function (ctx, sx, sy, k, height, wall, w, lw) {
      var h = height * k;
      var hw = (C.TW / 2) * k * w;
      var hh = (C.TH / 2) * k * w;

      var right = [[sx, sy + hh], [sx + hw, sy], [sx + hw, sy - h], [sx, sy + hh - h]];
      var left = [[sx, sy + hh], [sx - hw, sy], [sx - hw, sy - h], [sx, sy + hh - h]];

      poly(ctx, right, shade(wall, -0.06), OUTLINE, lw);
      poly(ctx, left, shade(wall, -0.36), OUTLINE, lw);

      /* Montants de colombage : trois traits par face. Un mur parfaitement
         lisse fait carton, pas maison. */
      ctx.lineWidth = Math.max(1, k * 0.45);
      for (var i = 1; i <= 3; i++) {
        var t = i / 4;
        ctx.strokeStyle = shade(wall, -0.24);
        ctx.beginPath();
        ctx.moveTo(sx + hw * t, sy + hh - hh * t);
        ctx.lineTo(sx + hw * t, sy + hh - hh * t - h);
        ctx.stroke();
        ctx.strokeStyle = shade(wall, -0.5);
        ctx.beginPath();
        ctx.moveTo(sx - hw * t, sy + hh - hh * t);
        ctx.lineTo(sx - hw * t, sy + hh - hh * t - h);
        ctx.stroke();
      }

      /* Sablière : le bandeau clair sous la toiture. */
      ctx.strokeStyle = shade(wall, 0.2);
      ctx.lineWidth = Math.max(1, k * 0.6);
      ctx.beginPath();
      ctx.moveTo(sx - hw, sy - h);
      ctx.lineTo(sx, sy + hh - h);
      ctx.lineTo(sx + hw, sy - h);
      ctx.stroke();

      return h;
    },

    /* Toiture : quatre pans qui montent vers un faîte, avec un léger débord.
       C'est ce détail, plus que tout autre, qui distingue une maison d'une
       caisse. */
    roof: function (ctx, sx, sy, k, height, color, w, lw, overhang) {
      var over = overhang === undefined ? 1.06 : overhang;
      var hw = (C.TW / 2) * k * w * over;
      var hh = (C.TH / 2) * k * w * over;
      var apex = [sx, sy - height * k];
      var N = [sx, sy - hh], E = [sx + hw, sy], S = [sx, sy + hh], W = [sx - hw, sy];

      Art.roofFace(ctx, [W, N, apex], shade(color, 0.08), lw, k);
      Art.roofFace(ctx, [N, E, apex], shade(color, 0.24), lw, k);
      Art.roofFace(ctx, [W, S, apex], shade(color, -0.30), lw, k);
      Art.roofFace(ctx, [E, S, apex], shade(color, -0.10), lw, k);

      /* Faîtage : la ligne de crête attrape la lumière et referme la
         toiture. */
      ctx.beginPath();
      ctx.moveTo(W[0], W[1]);
      ctx.lineTo(apex[0], apex[1]);
      ctx.lineTo(E[0], E[1]);
      ctx.strokeStyle = shade(color, 0.35);
      ctx.lineWidth = Math.max(1, k * 0.7);
      ctx.stroke();

      return apex;
    },

    /* Un pan de toiture : l'aplat, puis quatre rangs de tuiles parallèles à
       l'égout. C'est ce qui distingue une toiture d'un triangle de couleur —
       et ça ne coûte que quatre traits. */
    roofFace: function (ctx, tri, color, lw, k) {
      poly(ctx, tri, color, OUTLINE, lw);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]);
      ctx.lineTo(tri[2][0], tri[2][1]);
      ctx.closePath();
      ctx.clip();

      ctx.strokeStyle = shade(color, -0.22);
      ctx.lineWidth = Math.max(1, k * 0.5);
      for (var i = 1; i <= 4; i++) {
        var t = i / 5;
        ctx.beginPath();
        ctx.moveTo(tri[0][0] + (tri[2][0] - tri[0][0]) * t, tri[0][1] + (tri[2][1] - tri[0][1]) * t);
        ctx.lineTo(tri[1][0] + (tri[2][0] - tri[1][0]) * t, tri[1][1] + (tri[2][1] - tri[1][1]) * t);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* Ouvertures : une porte sur l'arête sud, une fenêtre allumée sur la face
       éclairée. Une façade aveugle n'a l'air habitée par personne. */
    openings: function (ctx, sx, sy, k, h, w) {
      var hw = (C.TW / 2) * k * w;
      var hh = (C.TH / 2) * k * w;
      var u = k;

      poly(ctx, [
        [sx + u * 1.2, sy + hh - u * 1.0], [sx + u * 4.2, sy + hh - u * 2.5],
        [sx + u * 4.2, sy + hh - u * 2.5 - h * 0.55], [sx + u * 1.2, sy + hh - u * 1.0 - h * 0.55]
      ], "#4a3018", OUTLINE, u * 0.55);

      if (h > u * 8) {
        poly(ctx, [
          [sx - hw * 0.75, sy - hh * 0.35 - h * 0.62], [sx - hw * 0.35, sy - hh * 0.15 - h * 0.62],
          [sx - hw * 0.35, sy - hh * 0.15 - h * 0.86], [sx - hw * 0.75, sy - hh * 0.35 - h * 0.86]
        ], "#ffd15c", OUTLINE, u * 0.5);
      }
    },

    /* Un bâtiment complet. Le style vient de sa fiche : c'est lui qui décide
       de la silhouette et des accessoires. */
    building: function (ctx, sx, sy, k, d, opts) {
      opts = opts || {};
      var alpha = opts.alpha === undefined ? 1 : opts.alpha;
      var u = k;
      var lw = Math.max(1, k * 0.7);
      var hh = (C.TH / 2) * k;

      ctx.save();
      ctx.globalAlpha = alpha;

      var wall = opts.color || d.color;
      var roofColor = opts.roof || d.roof;
      var style = d.style || "hut";
      var w = d.width || 0.82;

      /* Ombre portée vers le sud-est, comme toutes les ombres du jeu. */
      ctx.save();
      ctx.translate(u * 1.6, u * 0.9);
      poly(ctx, V.Iso.diamond(sx, sy, k * w * 1.05), "rgba(18,28,18,0.3)", null);
      ctx.restore();

      if (style === "field") {
        Art.field(ctx, sx, sy, k, d);
        ctx.restore();
        return;
      }

      /* Assise de pierre : un bâtiment ne pousse pas dans l'herbe. */
      poly(ctx, V.Iso.diamond(sx, sy + u * 0.7, k * w * 1.08), "#7c7362", OUTLINE, lw);

      var h = Art.box(ctx, sx, sy, k, d.height, wall, w, lw);
      Art.openings(ctx, sx, sy, k, h, w);

      var apex;
      if (style === "tower") {
        /* Moulin : une tour étroite, un toit conique, et les ailes. */
        var h2 = Art.box(ctx, sx, sy - h, k, d.height * 0.5, shade(wall, -0.04), w * 0.7, lw);
        apex = Art.roof(ctx, sx, sy - h - h2, k, d.roofH || 8, roofColor, w * 0.7, lw, 1.25);
        if (opts.spin !== undefined) {
          var arm = (C.TW / 2) * k * w * 0.95;
          var cx = sx, cy = sy - h - h2 * 0.4;
          ctx.lineCap = "round";
          for (var i = 0; i < 4; i++) {
            var a = opts.spin + i * Math.PI / 2;
            var ex = cx + Math.cos(a) * arm, ey = cy + Math.sin(a) * arm * 0.6;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
            ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1.5, k * 1.6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
            ctx.strokeStyle = "#f4ead2"; ctx.lineWidth = Math.max(1, k * 0.8); ctx.stroke();
          }
        }
      } else {
        apex = Art.roof(ctx, sx, sy - h, k, d.roofH || 9, roofColor, w, lw);
      }

      /* Accessoires : c'est à eux qu'on reconnaît le métier d'un coup d'œil. */
      switch (style) {
        case "house":
          Art.chimney(ctx, sx - u * 3.5, sy - h - u * 1.5, k);
          if (opts.now !== undefined) Art.smoke(ctx, sx - u * 2.3, sy - h - u * 7, k, opts.seed || 0, opts.now);
          break;
        case "lumber": Art.logs(ctx, sx - u * 9, sy + hh * 0.75, k); break;
        case "quarry": Art.stones(ctx, sx - u * 9, sy + hh * 0.75, k); break;
        case "market": Art.awning(ctx, sx, sy, k, h, w); break;
        case "store": Art.doors(ctx, sx, sy, k, h, w); break;
        case "hall": Art.flag(ctx, apex[0], apex[1], k); break;
      }

      ctx.restore();
    },

    /* Champ : pas de volume, des sillons. Un champ en cube aurait l'air d'un
       entrepôt peint en jaune. */
    field: function (ctx, sx, sy, k, d) {
      var lw = Math.max(1, k * 0.6);
      var hw = (C.TW / 2) * k * 0.92, hh = (C.TH / 2) * k * 0.92;

      poly(ctx, V.Iso.diamond(sx, sy, k * 0.96), "#9c7c46", OUTLINE, lw);
      poly(ctx, V.Iso.diamond(sx, sy - k * 0.9, k * 0.92), d.color, null);

      for (var i = 1; i <= 4; i++) {
        var t = i / 5;
        ctx.beginPath();
        ctx.moveTo(sx - hw + hw * t, sy - k * 0.9 + hh - hh * t);
        ctx.lineTo(sx + hw * t, sy - k * 0.9 - hh + hh * t);
        ctx.strokeStyle = shade(d.color, -0.24);
        ctx.lineWidth = Math.max(1, k * 0.7);
        ctx.stroke();
      }

      /* Quelques épis qui dépassent, sinon le champ reste une nappe. */
      for (var j = 0; j < 7; j++) {
        var a = (j * 0.37) % 1, b = (j * 0.61) % 1;
        var dx = (a - 0.5) * hw * 1.3, dy = (b - 0.5) * hh * 1.3;
        if (Math.abs(dx) / hw + Math.abs(dy) / hh > 0.7) continue;
        ctx.fillStyle = "#ffd15c";
        ctx.fillRect(Math.round(sx + dx), Math.round(sy - k * 2.2 + dy), Math.max(1, k * 0.8), Math.max(1, k * 1.8));
      }
    },

    /* Fumée : trois bouffées qui montent et s'effacent. Un village où
       personne ne fait de feu a l'air abandonné. */
    smoke: function (ctx, x, y, k, seed, now) {
      for (var i = 0; i < 3; i++) {
        var t = ((now / 2600) + seed * 0.37 + i * 0.33) % 1;
        var r = k * (1.1 + t * 2.6);
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 5 + seed) * k * 2.2, y - t * k * 13, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232,230,222," + (0.42 * (1 - t)).toFixed(3) + ")";
        ctx.fill();
      }
    },

    chimney: function (ctx, x, y, k) {
      var u = k;
      poly(ctx, [[x, y], [x + u * 2.4, y - u * 1.2], [x + u * 2.4, y - u * 5.2], [x, y - u * 4]], "#8a5b40", OUTLINE, u * 0.55);
      poly(ctx, [[x, y - u * 4], [x + u * 2.4, y - u * 5.2], [x + u * 1.2, y - u * 5.9], [x - u * 1.2, y - u * 4.7]], "#5e3d2a", OUTLINE, u * 0.55);
    },

    /* Tas de rondins, devant la bûcheronnerie. */
    logs: function (ctx, x, y, k) {
      var r = k * 1.7;
      [[0, 0], [r * 1.9, -r * 0.45], [r * 0.95, -r * 1.45]].forEach(function (p) {
        ctx.beginPath();
        ctx.ellipse(x + p[0], y + p[1], r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#8a6237";
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = Math.max(1, k * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + p[0], y + p[1], r * 0.42, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#c39a63";
        ctx.fill();
      });
    },

    /* Blocs taillés, devant la carrière. */
    stones: function (ctx, x, y, k) {
      var u = k * 1.6;
      [[0, 0], [u * 2.2, -u * 0.4], [u * 1.1, -u * 1.7]].forEach(function (p) {
        poly(ctx, [
          [x + p[0], y + p[1]], [x + p[0] + u, y + p[1] - u * 0.5],
          [x + p[0] + u, y + p[1] - u * 1.6], [x + p[0], y + p[1] - u * 1.1]
        ], "#98a1ac", OUTLINE, k * 0.5);
        poly(ctx, [
          [x + p[0], y + p[1] - u * 1.1], [x + p[0] + u, y + p[1] - u * 1.6],
          [x + p[0], y + p[1] - u * 2.1], [x + p[0] - u, y + p[1] - u * 1.6]
        ], "#c2c9d2", OUTLINE, k * 0.5);
      });
    },

    /* Auvent rayé du marché, tendu au-dessus de l'étal. */
    awning: function (ctx, sx, sy, k, h, w) {
      var hw = (C.TW / 2) * k * w, hh = (C.TH / 2) * k * w;
      var x0 = sx - hw * 0.15, y0 = sy + hh * 0.9 - h * 0.55;
      var dx = hw * 1.15, dy = -hh * 0.6, th = k * 3.2;

      poly(ctx, [[x0, y0], [x0 + dx, y0 + dy], [x0 + dx, y0 + dy + th], [x0, y0 + th]], "#efe7d6", OUTLINE, k * 0.6);
      for (var i = 0; i < 3; i++) {
        var t0 = 0.16 + i * 0.28, t1 = t0 + 0.14;
        poly(ctx, [
          [x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1, y0 + dy * t1],
          [x0 + dx * t1, y0 + dy * t1 + th], [x0 + dx * t0, y0 + dy * t0 + th]
        ], "#c2503f", null);
      }
    },

    /* Grandes portes de grange, sur la face éclairée de l'entrepôt. */
    doors: function (ctx, sx, sy, k, h, w) {
      var hw = (C.TW / 2) * k * w, hh = (C.TH / 2) * k * w;
      poly(ctx, [
        [sx + hw * 0.25, sy + hh * 0.6], [sx + hw * 0.85, sy + hh * 0.3],
        [sx + hw * 0.85, sy + hh * 0.3 - h * 0.62], [sx + hw * 0.25, sy + hh * 0.6 - h * 0.62]
      ], "#6b4a2c", OUTLINE, k * 0.6);
      ctx.beginPath();
      ctx.moveTo(sx + hw * 0.55, sy + hh * 0.45);
      ctx.lineTo(sx + hw * 0.55, sy + hh * 0.45 - h * 0.62);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = Math.max(1, k * 0.6);
      ctx.stroke();
    },

    /* Bannière au faîte de l'hôtel de ville : le repère du village. */
    flag: function (ctx, x, y, k) {
      var u = Math.max(1, k);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(Math.round(x - u * 0.5), Math.round(y - u * 9), Math.max(1, u), u * 9);
      poly(ctx, [[x + u * 0.5, y - u * 9], [x + u * 6, y - u * 7.6], [x + u * 0.5, y - u * 6.2]], "#c2503f", OUTLINE, u * 0.6);
    },

    /* Contrôle de cohérence des sprites : une ligne trop courte est une faute
       de frappe, pas un effet de style. */
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
    }
  };

  V.Art = Art;
})(window.V);
