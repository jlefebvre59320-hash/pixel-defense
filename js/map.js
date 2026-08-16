/* Pixel Defense — le terrain.
   Le chemin est décrit par une poignée de points de passage ; les cases
   qu'il occupe sont déduites, jamais recopiées à la main : impossible de
   construire une tour sur le chemin par erreur de saisie. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;

  /* Points de passage, en coordonnées de case. Le premier est au-dessus du
     plateau : les ennemis entrent par le haut, hors champ. */
  var WP = [
    [4, -1], [4, 2], [7, 2], [7, 5], [1, 5], [1, 9],
    [6, 9], [6, 12], [2, 12], [2, 15]
  ];

  /* La base à défendre : dernière case du chemin. */
  var CORE = { c: 2, r: 15 };

  /* Décor infranchissable — rochers et arbres. Purement esthétique côté
     règles, mais il resserre les emplacements et donne son relief au plateau. */
  var BLOCKED_LIST = [
    [0, 3], [5, 3], [3, 7], [8, 7], [0, 13], [8, 11], [7, 14], [4, 15]
  ];

  function key(c, r) { return c + "," + r; }

  /* Cases traversées par le chemin, obtenues en marchant d'un point de
     passage au suivant. Les segments sont toujours horizontaux ou verticaux. */
  function buildPath() {
    var set = {};
    for (var i = 0; i < WP.length - 1; i++) {
      var a = WP[i], b = WP[i + 1];
      var dc = Math.sign(b[0] - a[0]);
      var dr = Math.sign(b[1] - a[1]);
      var c = a[0], r = a[1];
      set[key(c, r)] = true;
      while (c !== b[0] || r !== b[1]) {
        c += dc; r += dr;
        set[key(c, r)] = true;
      }
    }
    return set;
  }

  var PATH = buildPath();
  var BLOCKED = {};
  BLOCKED_LIST.forEach(function (t) { BLOCKED[key(t[0], t[1])] = true; });

  /* Points de passage au centre des cases, en unités de case (1 = une case).
     C'est le repère utilisé par tout le jeu : positions, portées, rayons
     d'explosion. Le rendu est seul à connaître les pixels. */
  var WAYPOINTS = WP.map(function (t) { return { x: t[0] + 0.5, y: t[1] + 0.5 }; });

  var LENGTH = 0;
  for (var i = 0; i < WAYPOINTS.length - 1; i++) {
    LENGTH += Math.hypot(WAYPOINTS[i + 1].x - WAYPOINTS[i].x, WAYPOINTS[i + 1].y - WAYPOINTS[i].y);
  }

  var MAP = {
    WAYPOINTS: WAYPOINTS,
    LENGTH: LENGTH,
    CORE: CORE,
    CORE_POINT: { x: CORE.c + 0.5, y: CORE.r + 0.5 },
    SPAWN: WAYPOINTS[0],

    inside: function (c, r) {
      return c >= 0 && r >= 0 && c < C.COLS && r < C.ROWS;
    },
    isPath: function (c, r) { return PATH[key(c, r)] === true; },
    isBlocked: function (c, r) { return BLOCKED[key(c, r)] === true; },

    /* Une case est constructible si elle est sur le plateau, hors chemin et
       hors décor. Rien d'autre : pas de limite de nombre de tours. */
    isBuildable: function (c, r) {
      return MAP.inside(c, r) && !MAP.isPath(c, r) && !MAP.isBlocked(c, r);
    },

    /* Décor pseudo-aléatoire mais stable d'une partie à l'autre : le plateau
       doit être reconnaissable, pas différent à chaque chargement. */
    noise: function (c, r) {
      var n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
  };

  PD.MAP = MAP;
})(window.PD);
