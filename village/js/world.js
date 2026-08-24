/* Village — le terrain.
   La carte est tirée d'un bruit déterministe : même graine, même vallée. On
   peut donc en parler (« la forêt au nord-est »), la rejouer, et régler
   l'équilibrage sans que le hasard fausse la mesure. */
(function (V) {
  "use strict";

  var C = V.CONFIG;

  var GRASS = 0, SAND = 1, WATER = 2;
  var NONE = 0, TREE = 1, ROCK = 2;

  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function lerp(a, b, k) { return a + (b - a) * k; }

  /* Bruit lissé : sans l'interpolation, on obtient une purée de points isolés
     au lieu de forêts et de collines. */
  function noise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    return lerp(
      lerp(hash(xi, yi), hash(xi + 1, yi), u),
      lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u),
      v
    );
  }

  var World = {
    GRASS: GRASS, SAND: SAND, WATER: WATER,
    NONE: NONE, TREE: TREE, ROCK: ROCK,

    tiles: null,      // type de sol
    res: null,        // ressource naturelle posée dessus
    occ: null,        // id du bâtiment occupant la case, 0 sinon
    hall: { c: 0, r: 0 },
    territory: C.TERRITORY,
    seed: 1,

    index: function (c, r) { return r * C.COLS + c; },

    inBounds: function (c, r) {
      return c >= 0 && r >= 0 && c < C.COLS && r < C.ROWS;
    },

    generate: function (seed) {
      World.seed = seed || 1;
      var n = C.COLS * C.ROWS;
      World.tiles = new Uint8Array(n);
      World.res = new Uint8Array(n);
      World.occ = new Int32Array(n);
      World.territory = C.TERRITORY;
      World.hall = { c: Math.floor(C.COLS / 2), r: Math.floor(C.ROWS / 2) };  // recalculé plus bas

      var s = World.seed * 13.37;

      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          var i = World.index(c, r);
          var height = noise(c / 7 + s, r / 7 + s);
          var wet = noise(c / 4.5 + s + 31, r / 4.5 + s + 17);

          if (height < 0.30) World.tiles[i] = WATER;
          else if (height < 0.36) World.tiles[i] = SAND;
          else World.tiles[i] = GRASS;

          World.res[i] = NONE;
          if (World.tiles[i] === GRASS) {
            /* Forêts : là où c'est humide. Rochers : sur les hauteurs. Les
               deux se serrent en bosquets plutôt que de se disperser, pour
               qu'un bon emplacement se voie à l'œil nu. */
            if (wet > 0.62 && hash(c * 3, r * 5) > 0.25) World.res[i] = TREE;
            else if (height > 0.72 && hash(c * 7, r * 11) > 0.45) World.res[i] = ROCK;
          }
        }
      }

      World.hall = World.pickHall();

      /* La place du village : on dégage un carré autour de l'hôtel de ville,
         sinon la première partie commence par un déblaiement pénible. */
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          var cc = World.hall.c + dc, rr = World.hall.r + dr;
          if (!World.inBounds(cc, rr)) continue;
          var j = World.index(cc, rr);
          World.tiles[j] = GRASS;
          World.res[j] = NONE;
        }
      }

      World.ensureStart();
    },

    /* Où poser l'hôtel de ville. Pas au centre de la carte les yeux fermés :
       sur une graine où le centre tombe dans le lac, la partie serait finie
       avant de commencer. On essaie plusieurs points et on garde celui qui
       offre le plus de terre ferme autour de lui. */
    pickHall: function () {
      var best = null;
      var margin = C.TERRITORY + 1;
      for (var r = margin; r < C.ROWS - margin; r += 2) {
        for (var c = margin; c < C.COLS - margin; c += 2) {
          var land = 0;
          for (var dr = -C.TERRITORY; dr <= C.TERRITORY; dr++) {
            for (var dc = -C.TERRITORY; dc <= C.TERRITORY; dc++) {
              if (World.tiles[World.index(c + dc, r + dr)] === GRASS) land++;
            }
          }
          /* À qualité de terrain égale, on préfère le centre de la carte :
             le village a de la place pour s'étendre dans toutes les directions. */
          var pull = Math.abs(c - C.COLS / 2) + Math.abs(r - C.ROWS / 2);
          var score = land - pull * 0.5;
          if (!best || score > best.score) best = { c: c, r: r, score: score };
        }
      }
      return { c: best.c, r: best.r };
    },

    /* Toute vallée n'est pas jouable : sur certaines graines, le territoire de
       départ ne contient ni arbre ni rocher, et la partie est perdue avant
       d'avoir commencé — sans bois, on ne bâtit rien du tout. On garantit donc
       un bosquet et un affleurement à portée, plantés en grappes plutôt qu'en
       semis : une bûcheronnerie a besoin de six arbres serrés, pas de six
       arbres éparpillés aux quatre coins. */
    ensureStart: function () {
      var counts = { tree: 0, rock: 0 };
      var free = [];

      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          if (Math.abs(c - World.hall.c) > C.TERRITORY || Math.abs(r - World.hall.r) > C.TERRITORY) continue;
          var i = World.index(c, r);
          if (World.tiles[i] === WATER) continue;
          if (World.res[i] === TREE) counts.tree++;
          else if (World.res[i] === ROCK) counts.rock++;
          else if (Math.abs(c - World.hall.c) > 2 || Math.abs(r - World.hall.r) > 2) {
            free.push({ c: c, r: r, s: hash(c * 5.5, r * 9.5) });
          }
        }
      }

      free.sort(function (a, b) { return b.s - a.s; });

      var plant = function (kind, want, blob) {
        var placed = 0;
        for (var f = 0; f < free.length && placed < want; f++) {
          var seed = free[f];
          if (World.res[World.index(seed.c, seed.r)] !== NONE) continue;
          /* Une grappe : la case tirée, puis ses voisines libres. */
          for (var b = 0; b < blob.length && placed < want; b++) {
            var cc = seed.c + blob[b][0], rr = seed.r + blob[b][1];
            if (!World.inBounds(cc, rr)) continue;
            if (Math.abs(cc - World.hall.c) <= 2 && Math.abs(rr - World.hall.r) <= 2) continue;
            var j = World.index(cc, rr);
            if (World.tiles[j] !== GRASS || World.res[j] !== NONE) continue;
            World.res[j] = kind;
            placed++;
          }
        }
      };

      var BLOB = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 1], [1, 2]];
      if (counts.tree < 10) plant(TREE, 10 - counts.tree, BLOB);
      if (counts.rock < 5) plant(ROCK, 5 - counts.rock, BLOB);
    },

    tile: function (c, r) { return World.inBounds(c, r) ? World.tiles[World.index(c, r)] : WATER; },
    resource: function (c, r) { return World.inBounds(c, r) ? World.res[World.index(c, r)] : NONE; },
    building: function (c, r) { return World.inBounds(c, r) ? World.occ[World.index(c, r)] : -1; },

    setOccupied: function (c, r, id) {
      if (World.inBounds(c, r)) World.occ[World.index(c, r)] = id;
    },

    /* Territoire : un carré autour de l'hôtel de ville. Hors de ses limites,
       le terrain est visible mais inconstructible — on voit ce qu'on pourra
       s'offrir. */
    inTerritory: function (c, r) {
      return Math.abs(c - World.hall.c) <= World.territory
        && Math.abs(r - World.hall.r) <= World.territory;
    },

    expand: function () { World.territory += 1; },

    /* Constructible : dans le territoire, sur l'herbe ou le sable, libre de
       tout arbre, rocher ou bâtiment. */
    canBuild: function (c, r) {
      if (!World.inBounds(c, r) || !World.inTerritory(c, r)) return false;
      var t = World.tile(c, r);
      if (t === WATER) return false;
      if (World.resource(c, r) !== NONE) return false;
      return World.building(c, r) === 0;
    },

    /* Ce qui entoure une case : arbres, rochers, herbe libre. C'est la mesure
       qui décide du rendement d'un bâtiment posé ici. */
    countAround: function (c, r, radius) {
      var trees = 0, rocks = 0, freeGrass = 0;
      for (var dr = -radius; dr <= radius; dr++) {
        for (var dc = -radius; dc <= radius; dc++) {
          if (dc === 0 && dr === 0) continue;
          var cc = c + dc, rr = r + dr;
          if (!World.inBounds(cc, rr)) continue;
          var res = World.resource(cc, rr);
          if (res === TREE) trees++;
          else if (res === ROCK) rocks++;
          else if (World.tile(cc, rr) === GRASS && World.building(cc, rr) === 0) freeGrass++;
        }
      }
      return { trees: trees, rocks: rocks, freeGrass: freeGrass };
    },

    /* Qualité d'un emplacement pour un type de bâtiment donné, entre 0 et 1. */
    quality: function (kind, c, r) {
      var radius = C.YIELD_RADIUS[kind];
      if (!radius) return 1;
      return C.yieldFactor(kind, World.countAround(c, r, radius));
    },

    /* Petit bruit stable, pour la décoration (touffes d'herbe, cailloux). */
    speck: function (c, r, i) { return hash(c * 17 + i * 3, r * 23 + i * 7); }
  };

  V.World = World;
})(window.V);
