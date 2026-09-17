/* Pixel Defense — le monde vivant.

   Tout ce qui, sur le plateau, n'appartient ni au jeu ni au décor fixe : la
   lumière, le ciel, l'eau et la faune. Quatre couches, un seul principe —
   **une seule source de vérité pour la lumière**. Le soleil est déclaré une
   fois ici ; les ombres portées, les reflets de l'eau, le voile d'ambiance et
   les ombres de nuages en découlent tous. Une lumière cohérente fait plus
   pour l'illusion de relief que n'importe quel dégradé ajouté au hasard.

   Rien n'est animé par un pas de temps : tout se déduit de l'horloge (`now`).
   Les nuages, les rides, les oiseaux, le balancement des arbres sont des
   fonctions du temps, pas des états à faire avancer. Conséquence utile : le
   monde continue de vivre en pause, il ne dérive jamais, et il se comporte
   pareil à 60 ou 120 images par seconde. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var MAP = PD.MAP;
  var A = PD.Art;   // doit être chargé avant : voir l'ordre des balises dans index.html

  /* --- La lumière --------------------------------------------------------

     `az` : direction vers laquelle les ombres s'allongent, en radians.
     Le soleil est donc en haut à gauche, et tout le jeu — figures peintes
     comprises, dont les dégradés éclairent le haut — s'accorde là-dessus.
     `squash` : les ombres sont écrasées, parce qu'on regarde le sol de biais. */

  var SUN = {
    az: 0.72,
    squash: 0.42,
    length: 0.55,       // longueur d'ombre par unité de hauteur, en cases
    warm: "rgba(255, 214, 140, 0.16)",
    cool: "rgba(60, 90, 150, 0.14)"
  };

  var ambient = null;

  var Light = {
    SUN: SUN,

    /* Décalage de l'ombre d'un objet de hauteur `h` (en cases). */
    offset: function (h, tile) {
      var d = h * SUN.length * tile;
      return { x: Math.cos(SUN.az) * d, y: Math.sin(SUN.az) * d * SUN.squash };
    },

    /* Ombre portée d'un objet posé en (x, y), de rayon `r` et de hauteur `h`.
       Elle part du pied, s'allonge dans l'axe du soleil et pâlit avec la
       distance — une ombre uniforme colle l'objet au sol. */
    shadow: function (ctx, x, y, r, h, tile) {
      var off = Light.offset(h, tile);
      var len = Math.hypot(off.x, off.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(off.y, off.x));

      var grd = ctx.createLinearGradient(0, 0, len + r, 0);
      grd.addColorStop(0, "rgba(24, 40, 18, 0.34)");
      grd.addColorStop(0.55, "rgba(24, 40, 18, 0.22)");
      grd.addColorStop(1, "rgba(24, 40, 18, 0)");
      ctx.fillStyle = grd;

      ctx.beginPath();
      ctx.ellipse((len + r) / 2 - r / 2, 0, (len + r * 2) / 2, r * SUN.squash * 1.5,
        0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /* Voile d'ambiance : chaud du côté du soleil, froid à l'opposé. Deux
       dégradés à peine visibles qui lient tout le plateau sous une même
       lumière — c'est ce qui manque le plus quand une scène a l'air « plate ». */
    ambience: function (ctx, w, h) {
      /* Le voile ne change jamais : on le cuit une fois. Deux dégradés plein
         écran par trame, c'était quatre images par seconde pour une image
         rigoureusement identique à chaque fois. */
      if (!ambient || ambient.width !== w || ambient.height !== h) {
        ambient = document.createElement("canvas");
        ambient.width = w;
        ambient.height = h;
        var g = ambient.getContext("2d");

        var warm = g.createLinearGradient(0, 0, w * 0.8, h * 0.8);
        warm.addColorStop(0, SUN.warm);
        warm.addColorStop(0.55, "rgba(255, 214, 140, 0)");
        g.fillStyle = warm;
        g.fillRect(0, 0, w, h);

        var cool = g.createLinearGradient(w, h, w * 0.3, h * 0.3);
        cool.addColorStop(0, SUN.cool);
        cool.addColorStop(0.6, "rgba(60, 90, 150, 0)");
        g.fillStyle = cool;
        g.fillRect(0, 0, w, h);
      }
      ctx.drawImage(ambient, 0, 0);
    }
  };

  /* --- Le ciel : nuages et leurs ombres -----------------------------------

     Un nuage est dessiné deux fois : son ombre sur le sol, et le nuage
     lui-même décalé vers le soleil. C'est ce décalage qui donne l'altitude —
     sans lui, l'ombre aurait l'air peinte sous le nuage.

     Les ombres passent en `multiply` : elles assombrissent l'herbe, le chemin,
     les tours et les ennemis qu'elles traversent, au lieu de poser un voile
     gris uniforme par-dessus. */

  var CLOUDS = [];
  var cloudCount = 0;
  var cloudTile = 0;
  var placedAt = -1;

  function seedCloud(i, n) {
    var r = function (k) {
      var v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    return {
      lane: (i + 0.5) / n + (r(1) - 0.5) * 0.18,   // position verticale
      speed: 0.006 + r(2) * 0.010,                 // cases par seconde
      phase: r(3),
      size: 1.8 + r(4) * 2.4,                      // rayon, en cases
      puffs: 3 + Math.floor(r(5) * 2),
      alpha: 0.16 + r(6) * 0.12
    };
  }

  /* Un nuage est cuit une fois dans deux petites images — son ombre et
     lui-même — puis recopié à chaque trame. La première version traçait une
     trentaine de dégradés radiaux par image : c'était, de loin, le poste le
     plus cher du rendu, et il faisait tomber la cadence à 41 images par
     seconde sur une machine modeste. Recopier deux images par nuage ne coûte
     rien, et permet d'en garder six partout au lieu d'en couper la moitié. */
  function bakeCloud(c, tile) {
    var r = c.size * tile;
    var size = Math.ceil(r * 3.4);
    var mid = size / 2;

    function paint(stops) {
      var cv = document.createElement("canvas");
      cv.width = size;
      cv.height = Math.ceil(size * 0.72);
      var g = cv.getContext("2d");
      var cy = cv.height / 2;
      for (var p = 0; p < c.puffs; p++) {
        var px = mid + Math.cos(p * 2.1) * r * 0.5;
        var py = cy + Math.sin(p * 3.3) * r * 0.26;
        var rad = r * (0.55 + (p % 3) * 0.16);
        var grd = g.createRadialGradient(px, py - rad * 0.2, 0, px, py, rad);
        stops.forEach(function (st) { grd.addColorStop(st[0], st[1]); });
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2);
        g.fill();
      }
      return cv;
    }

    c.shadowImg = paint([
      [0, "rgba(96, 116, 96, 1)"],
      [0.6, "rgba(150, 165, 150, 0.55)"],
      [1, "rgba(255, 255, 255, 0)"]
    ]);
    c.puffImg = paint([
      [0, "rgba(255, 253, 246, 1)"],
      [0.55, "rgba(238, 240, 232, 0.6)"],
      [1, "rgba(230, 236, 228, 0)"]
    ]);
  }

  var Sky = {
    /* Le nombre de nuages est le seul réglage de qualité. */
    setup: function (n, tile) {
      if (n === cloudCount && tile === cloudTile) return;
      cloudCount = n;
      cloudTile = tile;
      CLOUDS = [];
      for (var i = 0; i < n; i++) {
        var c = seedCloud(i, n);
        bakeCloud(c, tile);
        CLOUDS.push(c);
      }
    },

    each: function (now, geo, fn) {
      var t = now / 1000;
      for (var i = 0; i < CLOUDS.length; i++) {
        var c = CLOUDS[i];
        /* Traversée lente, rebouclage par le bord avec deux rayons de marge :
           un nuage ne doit jamais apparaître d'un coup au milieu du ciel. */
        var span = C.COLS + c.size * 4;
        var x = ((c.phase + t * c.speed) % 1) * span - c.size * 2;
        var y = c.lane * C.ROWS + Math.sin(t * c.speed * 2 + c.phase * 6) * 0.6;
        fn(c, x * geo.tile, y * geo.tile);
      }
    },

    /* Dessin direct, avec élagage. Composer d'abord dans un tampon à
       demi-résolution semblait malin — quatre fois moins de surface à
       remplir — mais l'agrandissement final coûte plus cher que ce qu'il
       économise : 30 images par seconde contre 43. Mesuré, pas supposé.

       Ce qui paie vraiment, c'est de ne pas dessiner ce qui est hors champ :
       à un instant donné, un nuage sur deux est à cheval sur le bord. */
    blit: function (ctx, geo, alphaScale, offX, offY, pick) {
      ctx.save();
      for (var i = 0; i < CLOUDS.length; i++) {
        var c = CLOUDS[i];
        var img = pick(c);
        if (!img) continue;
        var x = c.x - offX, y = c.y - offY;
        var hw = img.width / 2, hh = img.height / 2;
        if (x + hw < 0 || x - hw > geo.w || y + hh < 0 || y - hh > geo.h) continue;
        ctx.globalAlpha = c.alpha * alphaScale;
        ctx.drawImage(img, x - hw, y - hh);
      }
      ctx.restore();
    },

    /* Ombres au sol. Alpha simple, et non `multiply` : le fondu multiplicatif
       garde mieux la texture de l'herbe, mais coûtait huit images par seconde
       pour un écart que l'œil ne relève pas à ces opacités. */
    shadows: function (ctx, now, geo) {
      Sky.place(now, geo);
      Sky.blit(ctx, geo, 1, 0, 0, function (c) { return c.shadowImg; });
    },

    /* Les nuages eux-mêmes, décalés vers le soleil — donc en altitude. C'est
       cet écart avec leur ombre qui donne le ciel. */
    puffs: function (ctx, now, geo) {
      var off = Light.offset(3.2, geo.tile);
      Sky.place(now, geo);
      /* Seuls les petits nuages sont peints. Ce sont les *ombres* qui font le
         ciel sur un plateau vu de dessus ; les bouffées blanches ne sont qu'un
         rappel d'altitude, et les grandes coûtaient quatorze images par
         seconde pour un voile de brume dont personne n'a besoin. */
      Sky.blit(ctx, geo, 0.5, off.x, off.y, function (c) {
        return c.size < 2.9 ? c.puffImg : null;
      });
    },

    /* Position de chaque nuage à cet instant, rangée sur le nuage lui-même :
       ombre et bouffée la partagent, et on ne la calcule qu'une fois. */
    place: function (now, geo) {
      if (placedAt === now) return;
      placedAt = now;
      Sky.each(now, geo, function (c, x, y) { c.x = x; c.y = y; });
    }
  };

  /* --- L'eau --------------------------------------------------------------

     Une mare se lit à trois choses, dans cet ordre : la couleur qui fonce vers
     le centre, les reflets de ce qui est au bord, et le mouvement. Les trois
     sont ici ; le reste (mousse, hauts-fonds) est du détail par-dessus. */

  var waterPath = null;
  var waterVersion = -1;
  var reflection = null;
  var reflectionKey = null;

  /* Contour d'un ensemble de cases. On ne peut pas simplement empiler un
     rectangle par case : le tracé garde alors les arêtes intérieures, et la
     mare se retrouve quadrillée. On marche donc le bord — toute arête dont la
     case voisine n'est pas de l'eau — puis on chaîne ces segments en boucles.
     Les coins sont ensuite adoucis, ce qui suffit à faire une rive. */
  function outline(cells, t, round) {
    var inSet = {};
    cells.forEach(function (c) { inSet[c[0] + "," + c[1]] = true; });
    var has = function (c, r) { return inSet[c + "," + r] === true; };

    /* Arêtes de bord, orientées dans le sens horaire. */
    var edges = [];
    cells.forEach(function (cell) {
      var c = cell[0], r = cell[1];
      var x = c * t, y = r * t;
      if (!has(c, r - 1)) edges.push([[x, y], [x + t, y]]);
      if (!has(c + 1, r)) edges.push([[x + t, y], [x + t, y + t]]);
      if (!has(c, r + 1)) edges.push([[x + t, y + t], [x, y + t]]);
      if (!has(c - 1, r)) edges.push([[x, y + t], [x, y]]);
    });

    /* Chaînage : chaque segment se raccorde à celui qui part de son arrivée. */
    var byStart = {};
    edges.forEach(function (e) { byStart[e[0][0] + "," + e[0][1]] = e; });

    var path = new Path2D();
    var used = {};
    edges.forEach(function (start) {
      var key = start[0][0] + "," + start[0][1];
      if (used[key]) return;

      var loop = [];
      var e = start;
      while (e && !used[e[0][0] + "," + e[0][1]]) {
        used[e[0][0] + "," + e[0][1]] = true;
        loop.push(e[0]);
        e = byStart[e[1][0] + "," + e[1][1]];
      }
      if (loop.length < 3) return;

      /* Coins adoucis : on coupe chaque angle par une courbe. */
      var n = loop.length;
      for (var i = 0; i < n; i++) {
        var prev = loop[(i - 1 + n) % n], cur = loop[i], next = loop[(i + 1) % n];
        var inX = cur[0] - prev[0], inY = cur[1] - prev[1];
        var outX = next[0] - cur[0], outY = next[1] - cur[1];
        var inLen = Math.hypot(inX, inY) || 1, outLen = Math.hypot(outX, outY) || 1;
        var rIn = Math.min(round, inLen / 2), rOut = Math.min(round, outLen / 2);

        var aX = cur[0] - inX / inLen * rIn, aY = cur[1] - inY / inLen * rIn;
        var bX = cur[0] + outX / outLen * rOut, bY = cur[1] + outY / outLen * rOut;

        if (i === 0) path.moveTo(aX, aY);
        else path.lineTo(aX, aY);
        path.quadraticCurveTo(cur[0], cur[1], bX, bY);
      }
      path.closePath();
    });
    return path;
  }

  var Water = {
    /* Silhouette de toutes les mares, calculée une fois par taille d'écran. */
    shape: function (geo) {
      if (waterPath && waterVersion === geo.tile) return waterPath;
      waterPath = outline(MAP.WATER_LIST, geo.tile, geo.tile * 0.34);
      waterVersion = geo.tile;
      return waterPath;
    },

    /* Lit de la mare : peint dans le décor, il ne bouge jamais. */
    bed: function (ctx, geo) {
      var t = geo.tile;
      ctx.save();
      ctx.clip(Water.shape(geo));
      MAP.WATER_LIST.forEach(function (cell) {
        var x = cell[0] * t, y = cell[1] * t;
        var grd = ctx.createRadialGradient(x + t / 2, y + t / 2, t * 0.1,
                                           x + t / 2, y + t / 2, t * 0.9);
        grd.addColorStop(0, "#1d4f63");
        grd.addColorStop(0.6, "#2b6d84");
        grd.addColorStop(1, "#3f8a9c");
        ctx.fillStyle = grd;
        ctx.fillRect(x - t, y - t, t * 3, t * 3);
      });
      ctx.restore();

      /* Berge : un liseré de terre humide, plus sombre, autour de la mare. */
      ctx.save();
      ctx.lineWidth = Math.max(2, t * 0.10);
      ctx.strokeStyle = "rgba(62, 48, 26, 0.55)";
      ctx.stroke(Water.shape(geo));
      ctx.restore();
    },

    /* Calque de reflets. Mirroir de ce qui borde la mare, cuit dans une image
       et recopié tel quel à chaque trame. Il n'est refait que si la bordure
       change — une tour bâtie ou améliorée. Les arbres et les rochers, eux,
       ne bougent jamais.

       Le calque évite surtout de détourer et de recomposer le canvas principal
       soixante fois par seconde : la première version le faisait, et la
       cadence tombait de 60 à 19 images par seconde dès qu'une tour bordait
       une mare. */
    layer: function (geo, items, key) {
      if (reflection && reflectionKey === key) return reflection;

      var cv = document.createElement("canvas");
      cv.width = geo.w;
      cv.height = geo.h;
      var g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";

      g.globalAlpha = 0.32;
      items.forEach(function (it) {
        g.save();
        /* Miroir autour de la rive. La figure est ensuite dessinée à sa
           position *réelle* : c'est la symétrie qui la renvoie dans l'eau. La
           dessiner déjà retournée revenait à l'annuler — le reflet se
           superposait à l'objet, et la mare restait vide. */
        g.translate(0, it.shoreY);
        g.scale(1, -1);
        g.translate(0, -it.shoreY);
        A.draw(g, it.name, {
          x: it.x, y: it.y, w: it.w, frame: it.frame, flip: it.flip
        });
        g.restore();
      });

      /* Ne garder que ce qui tombe dans l'eau. */
      g.globalAlpha = 1;
      g.globalCompositeOperation = "destination-in";
      g.fillStyle = "#000";
      g.fill(Water.shape(geo));

      reflection = cv;
      reflectionKey = key;
      return reflection;
    },

    /* Tout ce qui se passe dans l'eau, sous un seul détourage : le reflet, la
       surface animée, les ronds de poissons. Trois détourages séparés
       coûtaient trois fois le prix pour le même résultat. */
    draw: function (ctx, now, geo, items, key, withWildlife) {
      var t = geo.tile;
      var time = now / 1000;

      ctx.save();
      ctx.clip(Water.shape(geo));

      if (items.length) ctx.drawImage(Water.layer(geo, items, key), 0, 0);

      MAP.WATER_LIST.forEach(function (cell, i) {
        var x = cell[0] * t, y = cell[1] * t;

        /* Rides : des arcs pâles qui glissent lentement. Deux fréquences,
           sinon le motif se répète à l'œil en quelques secondes. */
        ctx.lineWidth = Math.max(1, t * 0.035);
        for (var k = 0; k < 4; k++) {
          var ph = time * (0.18 + k * 0.05) + i * 1.7 + k;
          var ry = y + ((ph % 1) * 1.25 - 0.1) * t;
          ctx.strokeStyle = "rgba(220, 245, 250, "
            + (0.10 + 0.06 * Math.sin(ph * 3)).toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(x - t * 0.1, ry);
          ctx.bezierCurveTo(x + t * 0.3, ry - t * 0.05,
                            x + t * 0.7, ry + t * 0.05,
                            x + t * 1.1, ry);
          ctx.stroke();
        }

        /* Éclats du soleil : de courtes rayures claires qui naissent et
           s'éteignent. */
        for (var sp = 0; sp < 4; sp++) {
          var phase = (time * 0.35 + sp * 0.37 + i) % 1;
          var glint = Math.max(0, Math.sin(phase * Math.PI)) * 0.55;
          if (glint < 0.06) continue;
          ctx.fillStyle = "rgba(255, 252, 235, " + glint.toFixed(3) + ")";
          ctx.beginPath();
          ctx.ellipse(x + (0.15 + sp * 0.22) * t, y + phase * t,
                      t * 0.10, t * 0.022, -0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (withWildlife) Wildlife.fishRings(ctx, now, geo);
      ctx.restore();
    },

    /* Cases d'eau susceptibles de refléter ce qui est juste au-dessus. */
    shoreFor: function (c, r) {
      return MAP.isWater(c, r + 1) ? r + 1 : -1;
    }
  };

  /* --- La faune -----------------------------------------------------------

     Trois espèces, choisies pour couvrir les trois plans : l'air, le sol et
     l'eau. Aucune n'interagit avec le jeu — ce sont des habitants, pas des
     figurants du combat, et ils ne doivent jamais être pris pour des ennemis.
     D'où des tailles franchement plus petites et des couleurs qui ne sont
     celles d'aucun camp. */

  function hash(i, k) {
    var v = Math.sin(i * 37.31 + k * 91.7) * 43758.5453;
    return v - Math.floor(v);
  }

  /* Routes des chevreuils, cherchées une fois. Le premier jet tirait deux
     points au hasard et sautait le dessin quand l'animal tombait sur le chemin
     ou un rocher : il disparaissait en pleine traversée, ce qui se voit
     davantage qu'un chevreuil mal placé. On cherche donc, dès le départ, un
     aller-retour dont le départ, le milieu et l'arrivée sont tous sur l'herbe.
     Faute de quoi, pas de chevreuil — plutôt aucun qu'un clignotant. */
  var routes = null;

  function grassAt(x, y) {
    var c = Math.floor(x), r = Math.floor(y);
    return MAP.inside(c, r) && !MAP.isPath(c, r) && !MAP.isBlocked(c, r);
  }

  function deerRoutes() {
    if (routes) return routes;
    routes = [];
    for (var i = 0; i < 2; i++) {
      for (var attempt = 0; attempt < 12; attempt++) {
        var k = 33 + attempt * 4;
        var ax = 0.8 + hash(i, k) * (C.COLS - 1.6);
        var ay = 1.0 + hash(i, k + 1) * (C.ROWS - 2.0);
        var bx = 0.8 + hash(i, k + 2) * (C.COLS - 1.6);
        var by = 1.0 + hash(i, k + 3) * (C.ROWS - 2.0);
        var ok = true;
        for (var t = 0; t <= 1.0001; t += 0.125) {
          if (!grassAt(ax + (bx - ax) * t, ay + (by - ay) * t)) { ok = false; break; }
        }
        if (ok) { routes.push({ ax: ax, ay: ay, bx: bx, by: by }); break; }
      }
    }
    return routes;
  }

  var Wildlife = {
    /* Oiseaux : ils traversent en altitude, et leur ombre court au sol bien
       plus bas — c'est l'écart entre les deux qui donne le ciel. */
    birds: function (ctx, now, geo, layer) {
      var t = geo.tile;
      var time = now / 1000;
      var off = Light.offset(2.6, t);

      for (var i = 0; i < 5; i++) {
        var speed = 0.055 + hash(i, 1) * 0.05;
        var dir = hash(i, 2) > 0.5 ? 1 : -1;
        var span = C.COLS + 4;
        var p = (hash(i, 3) + time * speed) % 1;
        var x = (dir > 0 ? p * span - 2 : (1 - p) * span - 2) * t;
        var y = (0.6 + hash(i, 4) * (C.ROWS - 1.2)
                 + Math.sin(time * 0.7 + i * 2.2) * 0.35) * t;
        var flap = Math.sin(time * 9 + i * 1.3);
        var size = t * (0.10 + hash(i, 5) * 0.05);

        if (layer === "shadow") {
          ctx.save();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#1d2a16";
          ctx.beginPath();
          ctx.ellipse(x + off.x, y + off.y, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        ctx.strokeStyle = "rgba(38, 32, 26, 0.75)";
        ctx.lineWidth = Math.max(1.2, t * 0.028);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-size, flap * size * 0.5);
        ctx.quadraticCurveTo(-size * 0.4, -size * 0.35, 0, 0);
        ctx.quadraticCurveTo(size * 0.4, -size * 0.35, size, flap * size * 0.5);
        ctx.stroke();
        ctx.restore();
      }
    },

    /* Papillons : ils flânent au-dessus de l'herbe, jamais sur le chemin ni
       sur l'eau — un papillon qui traverse un boulet de canon ferait tache. */
    butterflies: function (ctx, now, geo) {
      var t = geo.tile;
      var time = now / 1000;

      for (var i = 0; i < 7; i++) {
        var cx = (0.5 + hash(i, 11) * (C.COLS - 1)
                  + Math.sin(time * 0.5 + i * 1.7) * 0.9) * t;
        var cy = (0.5 + hash(i, 12) * (C.ROWS - 1)
                  + Math.cos(time * 0.42 + i * 2.3) * 0.9) * t;
        var col = Math.floor(cx / t), row = Math.floor(cy / t);
        if (MAP.isPath(col, row) || MAP.isWater(col, row)) continue;

        var flap = Math.abs(Math.sin(time * 7 + i));
        var s = t * 0.055;
        var hue = hash(i, 13) > 0.5 ? "rgba(255, 228, 120, 0.9)" : "rgba(255, 168, 210, 0.9)";

        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = hue;
        ctx.beginPath();
        ctx.ellipse(-s * 0.7, 0, s * (0.35 + flap * 0.65), s, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.7, 0, s * (0.35 + flap * 0.65), s, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    /* Chevreuils. Ils broutent l'herbe, à l'écart du chemin, et s'en vont
       d'un bond quand ils s'en approchent. Le seul habitant du plateau qui ne
       fait rien d'autre qu'y vivre — et le plus efficace pour cela, parce
       qu'il touche le sol : un oiseau vit dans le ciel, un chevreuil vit
       *dans* le décor du joueur.

       La trajectoire est une lente dérive déterministe, et le broutage un
       simple abaissement de tête sur une partie du cycle. Aucun état gardé :
       comme tout le reste ici, la position se déduit de l'heure. */
    deer: function (ctx, now, geo) {
      var t = geo.tile;
      var time = now / 1000;

      var routes = deerRoutes();
      for (var i = 0; i < routes.length; i++) {
        var route = routes[i];
        var loop = 26 + hash(i, 31) * 14;
        var k = ((time + hash(i, 32) * loop) % loop) / loop;

        var ease = 0.5 - 0.5 * Math.cos(k * Math.PI * 2);
        var cx = route.ax + (route.bx - route.ax) * ease;
        var cy = route.ay + (route.by - route.ay) * ease;
        var ax = route.ax, bx = route.bx;

        var moving = Math.abs(Math.sin(k * Math.PI * 2)) > 0.25;
        var x = cx * t, y = cy * t;
        var facing = (bx - ax) >= 0 ? 1 : -1;
        var s = t * 0.24;
        var bob = moving ? Math.abs(Math.sin(time * 6 + i)) * s * 0.18 : 0;

        Light.shadow(ctx, x, y + s * 0.5, s * 0.5, 0.3, t);

        ctx.save();
        ctx.translate(x, y - bob);
        ctx.scale(facing, 1);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        /* Pattes */
        ctx.strokeStyle = "#5a3b22";
        ctx.lineWidth = Math.max(1.2, s * 0.16);
        ctx.beginPath();
        ctx.moveTo(-s * 0.35, 0); ctx.lineTo(-s * 0.40, s * 0.55);
        ctx.moveTo(s * 0.30, 0); ctx.lineTo(s * 0.36, s * 0.55);
        ctx.stroke();

        /* Corps */
        ctx.fillStyle = "#9a6b3e";
        ctx.strokeStyle = "#3a2513";
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.15, s * 0.55, s * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        /* Cou et tête : basse quand il broute, haute quand il avance. */
        var headY = moving ? -s * 0.85 : -s * 0.12;
        var headX = s * 0.62;
        ctx.strokeStyle = "#8a5f36";
        ctx.lineWidth = Math.max(1.4, s * 0.20);
        ctx.beginPath();
        ctx.moveTo(s * 0.35, -s * 0.3);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ctx.fillStyle = "#9a6b3e";
        ctx.strokeStyle = "#3a2513";
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.beginPath();
        ctx.ellipse(headX, headY, s * 0.24, s * 0.17, moving ? -0.3 : 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        /* Oreille, et la tache blanche de la croupe */
        ctx.beginPath();
        ctx.ellipse(headX - s * 0.12, headY - s * 0.18, s * 0.09, s * 0.05, -0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245, 238, 225, 0.85)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.45, -s * 0.2, s * 0.12, s * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    /* Poissons : on ne les voit pas, on voit qu'ils sont là. Un rond qui
       s'élargit et s'efface, de loin en loin, dans une mare au hasard.
       Appelé depuis Water.draw, donc déjà détouré. */
    fishRings: function (ctx, now, geo) {
      var t = geo.tile;
      var time = now / 1000;
      var cells = MAP.WATER_LIST;
      if (!cells.length) return;

      ctx.save();
      for (var i = 0; i < 3; i++) {
        var cycle = 4.5 + hash(i, 21) * 3;
        var k = ((time + hash(i, 22) * cycle) % cycle) / cycle;
        if (k > 0.55) continue;                    // le reste du temps, rien
        var beat = Math.floor((time + hash(i, 22) * cycle) / cycle);
        var cell = cells[Math.floor(hash(i + beat * 7, 23) * cells.length)];
        var x = (cell[0] + 0.25 + hash(i + beat * 3, 24) * 0.5) * t;
        var y = (cell[1] + 0.25 + hash(i + beat * 5, 25) * 0.5) * t;

        var grow = k / 0.55;
        ctx.globalAlpha = (1 - grow) * 0.55;
        ctx.strokeStyle = "rgba(235, 252, 255, 0.9)";
        ctx.lineWidth = Math.max(1, t * 0.03);
        ctx.beginPath();
        ctx.ellipse(x, y, t * 0.08 + grow * t * 0.30,
                    (t * 0.08 + grow * t * 0.30) * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  PD.World = { Light: Light, Sky: Sky, Water: Water, Wildlife: Wildlife };
})(window.PD = window.PD || {});
