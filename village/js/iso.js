/* Village — la vue isométrique et la caméra.
   Une seule idée à retenir : la grille reste carrée en mémoire (colonne,
   ligne), et c'est l'affichage qui la penche en losanges. Toute la géométrie
   du jeu — voisinage, rendements, portées — se calcule donc en cases, comme
   si la carte était vue de dessus. */
(function (V) {
  "use strict";

  var C = V.CONFIG;

  var Iso = {
    /* Caméra : le point de la carte visé au centre de l'écran, en pixels
       d'art, et un grossissement entier. Entier, parce qu'un demi-pixel
       d'agrandissement suffit à transformer du pixel art net en bouillie. */
    cam: { x: 0, y: 0, zoom: 2 },
    ZOOMS: [1, 2, 3],

    dpr: 1,
    w: 0, h: 0,       // taille du canvas, en pixels d'appareil
    cssW: 0, cssH: 0,

    /* Facteur appliqué au dessin : grossissement × densité d'écran. Le
       produit reste entier, donc chaque pixel d'art couvre exactement le même
       nombre de pixels d'appareil. */
    k: function () { return Iso.cam.zoom * Iso.dpr; },

    resize: function (canvas, host) {
      var rect = (host || canvas.parentNode).getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      Iso.dpr = dpr;
      Iso.cssW = rect.width;
      Iso.cssH = rect.height;
      Iso.w = Math.max(1, Math.round(rect.width * dpr));
      Iso.h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = Iso.w;
      canvas.height = Iso.h;
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      return ctx;
    },

    /* Grossissement de départ. On vise la lisibilité plutôt que la vue
       d'ensemble : à l'échelle 1, un villageois fait quatre pixels et une
       maison ressemble à un caillou. Le joueur dézoome s'il veut embrasser
       toute la vallée. */
    fitZoom: function (territory) {
      var tiles = territory * 2 + 3;
      var fits = Math.floor(Iso.cssW / (tiles * C.TW));
      var z = Math.max(2, fits);
      return Math.max(Iso.ZOOMS[0], Math.min(Iso.ZOOMS[Iso.ZOOMS.length - 1], z));
    },

    /* Case → pixels d'art (centre du losange). */
    artX: function (c, r) { return (c - r) * (C.TW / 2); },
    artY: function (c, r) { return (c + r) * (C.TH / 2); },

    /* Case → pixels d'écran. */
    toScreen: function (c, r) {
      var k = Iso.k();
      return {
        x: (Iso.artX(c, r) - Iso.cam.x) * k + Iso.w / 2,
        y: (Iso.artY(c, r) - Iso.cam.y) * k + Iso.h / 2
      };
    },

    /* Pixels d'écran → case. Le losange est exactement la zone la plus proche
       de son centre : un simple arrondi suffit, sans test d'appartenance. */
    toTile: function (sx, sy) {
      var k = Iso.k();
      var ax = (sx - Iso.w / 2) / k + Iso.cam.x;
      var ay = (sy - Iso.h / 2) / k + Iso.cam.y;
      var x = ax / (C.TW / 2);
      var y = ay / (C.TH / 2);
      return { c: Math.round((x + y) / 2), r: Math.round((y - x) / 2) };
    },

    centerOn: function (c, r) {
      Iso.cam.x = Iso.artX(c, r);
      Iso.cam.y = Iso.artY(c, r);
    },

    /* Déplacement au doigt : on convertit le geste (pixels d'écran) en
       pixels de carte, sinon la carte fuirait sous le doigt dès qu'on zoome. */
    pan: function (dxDevice, dyDevice) {
      var k = Iso.k();
      Iso.cam.x -= dxDevice / k;
      Iso.cam.y -= dyDevice / k;
      Iso.clamp();
    },

    setZoom: function (z) {
      var i = Iso.ZOOMS.indexOf(z);
      if (i < 0) return;
      Iso.cam.zoom = z;
      Iso.clamp();
    },

    zoomBy: function (step) {
      var i = Iso.ZOOMS.indexOf(Iso.cam.zoom);
      var next = Iso.ZOOMS[Math.max(0, Math.min(Iso.ZOOMS.length - 1, i + step))];
      Iso.setZoom(next);
      return Iso.cam.zoom;
    },

    /* On garde la carte à portée : la caméra ne s'échappe jamais au-delà des
       bords du losange, quelle que soit la vigueur du geste. */
    clamp: function () {
      var minX = -(C.ROWS - 1) * (C.TW / 2) - C.TW;
      var maxX = (C.COLS - 1) * (C.TW / 2) + C.TW;
      var minY = -C.TH * 2;
      var maxY = (C.COLS + C.ROWS - 2) * (C.TH / 2) + C.TH * 2;
      Iso.cam.x = Math.max(minX, Math.min(maxX, Iso.cam.x));
      Iso.cam.y = Math.max(minY, Math.min(maxY, Iso.cam.y));
    },

    /* Les quatre sommets d'un losange, pour le remplir ou le border. */
    diamond: function (sx, sy, k) {
      var hw = (C.TW / 2) * k, hh = (C.TH / 2) * k;
      return [
        [sx, sy - hh],       // haut
        [sx + hw, sy],       // droite
        [sx, sy + hh],       // bas
        [sx - hw, sy]        // gauche
      ];
    },

    path: function (ctx, points) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
    }
  };

  V.Iso = Iso;
})(window.V);
