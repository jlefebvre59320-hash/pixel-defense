/* Pixel Defense — le rendu.
   Une règle : le moteur de jeu ne connaît que des cases et des secondes, le
   rendu est seul à parler en pixels.

   Le décor, qui ne bouge jamais, est peint une fois dans un canvas hors écran
   et recopié en une image par trame. Le reste — tours, ennemis, tirs, effets —
   est redessiné à chaque trame, mais chaque figure vient de la couche d'art,
   déjà cuite : on ne trace pas cent courbes soixante fois par seconde.

   Profondeur : tours et ennemis sont triés par leur position verticale avant
   d'être dessinés. Sans ce tri, un ennemi passant devant une tour lui passerait
   parfois derrière, et le plateau perdrait tout relief. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var MAP = PD.MAP;
  var A = PD.Art;

  /* Palette du décor — la même lumière que la couche d'art : le clair en haut,
     l'ombre en bas. */
  var COL = {
    bg: "#1b2a17",
    grassTop: "#7cb04a",
    grassBottom: "#568a37",
    grassDark: "#4a7d2f",
    grassLight: "#93c45c",
    flower: "#f2e36b",
    dirt: "#c9a468",
    dirtLight: "#dcbc86",
    dirtRim: "#8a6134",
    pebble: "#a8894f",
    plot: "rgba(0,0,0,0.055)",
    plotEdge: "rgba(255,255,255,0.05)",
    hpBack: "#2b1d14",
    hpGood: "#6fc24a",
    hpBad: "#e5484d",
    ink: "#2b1d14",
    parchment: "#f4e9cf"
  };

  /* Largeur d'une tour, en cases. Une seule définition : le dessin, les
     repères qu'on pose dessus et l'ombre au sol s'en servent tous. */
  var TOWER_W = 1.42;

  var geo = { px: 4, tile: 64, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, cssW: 0, cssH: 0 };
  var terrain = null;

  /* Bruit stable : le plateau doit être reconnaissable d'une partie à l'autre,
     donc aucune touffe d'herbe n'est tirée au sort au chargement. */
  function noise(a, b) { return MAP.noise(a, b); }

  var Render = {
    geo: geo,

    /* ---- Géométrie ------------------------------------------------------ */

    resize: function (canvas, host) {
      var rect = (host || canvas.parentNode).getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var border = 4;                        // bordure CSS, 2 px de chaque côté
      var availW = Math.max(40, rect.width - border);
      var availH = Math.max(40, rect.height - border);

      /* Plus de contrainte d'entier : le dessin est peint, pas pixellisé.
         La case prend simplement toute la place disponible. */
      var tile = Math.floor(Math.min(availW * dpr / C.COLS, availH * dpr / C.ROWS));
      var cw = tile * C.COLS;
      var ch = tile * C.ROWS;

      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = (cw / dpr) + "px";
      canvas.style.height = (ch / dpr) + "px";

      geo.tile = tile;
      geo.px = tile / C.ART;                 // conservé : quelques mesures s'y réfèrent
      geo.w = cw;
      geo.h = ch;
      geo.dpr = dpr;
      geo.cssW = cw / dpr;
      geo.cssH = ch / dpr;
      geo.ox = 0;
      geo.oy = 0;

      terrain = null;                        // à repeindre à la nouvelle échelle
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      return ctx;
    },

    tileAt: function (cssX, cssY) {
      var x = (cssX * geo.dpr - geo.ox) / geo.tile;
      var y = (cssY * geo.dpr - geo.oy) / geo.tile;
      return { c: Math.floor(x), r: Math.floor(y), x: x, y: y };
    },

    sx: function (x) { return geo.ox + x * geo.tile; },
    sy: function (y) { return geo.oy + y * geo.tile; },

    /* ---- Décor (peint une seule fois) ----------------------------------- */

    /* Le chemin est tracé comme un ruban : un trait épais qui suit les points
       de passage, avec des coudes arrondis. C'est exactement le tracé que
       suivent les ennemis — impossible que le dessin et le jeu se
       contredisent, et les virages sont ronds au lieu d'être en escalier. */
    ribbon: function (g, width, color) {
      g.lineWidth = width;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.strokeStyle = color;
      g.beginPath();
      var wp = MAP.WAYPOINTS;
      g.moveTo(Render.sx(wp[0].x), Render.sy(wp[0].y));
      for (var i = 1; i < wp.length; i++) {
        g.lineTo(Render.sx(wp[i].x), Render.sy(wp[i].y));
      }
      g.stroke();
    },

    buildTerrain: function () {
      var cv = document.createElement("canvas");
      cv.width = geo.w;
      cv.height = geo.h;
      var g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";

      var tile = geo.tile;

      /* Prairie : un dégradé, puis des taches d'herbe plus claires et plus
         sombres. Ce sont elles qui empêchent le fond de ressembler à un
         aplat de tableur. */
      var gr = g.createLinearGradient(0, 0, 0, geo.h);
      gr.addColorStop(0, COL.grassTop);
      gr.addColorStop(1, COL.grassBottom);
      g.fillStyle = gr;
      g.fillRect(0, 0, geo.w, geo.h);

      for (var i = 0; i < 260; i++) {
        var n1 = noise(i * 1.7, 3.1), n2 = noise(i * 2.3, 7.7), n3 = noise(i * 5.1, 1.3);
        g.save();
        g.globalAlpha = 0.10 + n3 * 0.10;
        g.fillStyle = n3 > 0.5 ? COL.grassLight : COL.grassDark;
        g.beginPath();
        g.ellipse(n1 * geo.w, n2 * geo.h,
          tile * (0.25 + n3 * 0.55), tile * (0.12 + n3 * 0.22),
          n1 * 3, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      /* Emplacements constructibles : une pelouse tondue, à peine plus sombre,
         cernée d'un liseré clair. Le premier réglage transformait le pré en
         damier — il faut que l'œil s'en aperçoive quand il cherche où bâtir,
         et l'oublie le reste du temps. */
      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          if (!MAP.isBuildable(c, r)) continue;
          var px0 = Render.sx(c) + tile * 0.18;
          var py0 = Render.sy(r) + tile * 0.18;
          var s = tile * 0.64;
          g.beginPath();
          Render.roundRect(g, px0, py0, s, s, tile * 0.16);
          g.fillStyle = COL.plot;
          g.fill();
          g.lineWidth = Math.max(1, tile * 0.02);
          g.strokeStyle = COL.plotEdge;
          g.stroke();
        }
      }

      /* Chemin : bordure de terre sombre, terre battue, puis reflet clair au
         milieu — trois passes du même ruban. */
      Render.ribbon(g, tile * 1.00, COL.dirtRim);
      Render.ribbon(g, tile * 0.88, COL.dirt);
      g.save();
      g.globalAlpha = 0.35;
      Render.ribbon(g, tile * 0.46, COL.dirtLight);
      g.restore();

      /* Ornières et gravillons : le chemin doit avoir été emprunté. */
      g.save();
      g.globalAlpha = 0.5;
      for (var k = 0; k < 220; k++) {
        var t = k / 220;
        var p = Render.alongPath(t);
        var jitter = (noise(k * 3.3, 1.9) - 0.5) * tile * 0.62;
        var perp = Render.perpAt(t);
        var gx = Render.sx(p.x) + perp.x * jitter;
        var gy = Render.sy(p.y) + perp.y * jitter;
        var rad = tile * (0.018 + noise(k, 5.5) * 0.035);
        g.fillStyle = noise(k, 9.1) > 0.6 ? COL.dirtLight : COL.pebble;
        g.beginPath();
        g.arc(gx, gy, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      /* Fleurs dans l'herbe : trois points jaunes par touffe, hors chemin. */
      for (var f = 0; f < 90; f++) {
        var fx = noise(f * 4.1, 2.2) * geo.w;
        var fy = noise(f * 6.7, 8.8) * geo.h;
        var fc = Math.floor(fx / tile), fr = Math.floor(fy / tile);
        if (MAP.isPath(fc, fr) || MAP.isBlocked(fc, fr)) continue;
        g.fillStyle = noise(f, 3.3) > 0.5 ? COL.flower : "#f0f4ea";
        for (var d = 0; d < 3; d++) {
          g.beginPath();
          g.arc(fx + d * tile * 0.06, fy + (d % 2) * tile * 0.05, tile * 0.022, 0, Math.PI * 2);
          g.fill();
        }
      }

      /* Décor infranchissable : arbres et rochers, posés sur le bas de leur
         case pour qu'ils aient l'air debout et non collés. */
      for (var r2 = 0; r2 < C.ROWS; r2++) {
        for (var c2 = 0; c2 < C.COLS; c2++) {
          if (!MAP.isBlocked(c2, r2)) continue;
          var isTree = noise(c2, r2) > 0.45;
          var bx = Render.sx(c2 + 0.5);
          var by = Render.sy(r2 + 0.95);
          Render.groundShadow(g, bx, by, tile * (isTree ? 0.36 : 0.40));
          A.draw(g, isTree ? "tree" : "rock", {
            x: bx, y: by, w: tile * (isTree ? 1.6 : 1.4)
          });
        }
      }

      /* Caverne d'où sortent les vagues, en haut du chemin. */
      Render.groundShadow(g, Render.sx(MAP.SPAWN.x), Render.sy(0.5), tile * 0.5);
      A.draw(g, "cave", { x: Render.sx(MAP.SPAWN.x), y: Render.sy(0.62), w: tile * 1.85 });

      /* La forteresse à défendre. */
      var core = MAP.CORE_POINT;
      Render.groundShadow(g, Render.sx(core.x), Render.sy(core.y + 0.42), tile * 0.75);
      A.draw(g, "core", { x: Render.sx(core.x), y: Render.sy(core.y + 0.42), w: tile * 2.35 });

      /* Vignette : le plateau se referme sur lui-même au lieu d'être coupé
         net par le bord de l'écran. */
      var vg = g.createRadialGradient(geo.w / 2, geo.h / 2, geo.h * 0.35,
        geo.w / 2, geo.h / 2, geo.h * 0.78);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(20,30,14,0.42)");
      g.fillStyle = vg;
      g.fillRect(0, 0, geo.w, geo.h);

      terrain = cv;
      return cv;
    },

    roundRect: function (g, x, y, w, h, r) {
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    },

    /* Point du chemin à la fraction `t` (0 au départ, 1 à la base). */
    alongPath: function (t) {
      var wp = MAP.WAYPOINTS;
      var want = t * MAP.LENGTH;
      var acc = 0;
      for (var i = 0; i < wp.length - 1; i++) {
        var d = Math.hypot(wp[i + 1].x - wp[i].x, wp[i + 1].y - wp[i].y);
        if (acc + d >= want) {
          var k = d > 0 ? (want - acc) / d : 0;
          return { x: wp[i].x + (wp[i + 1].x - wp[i].x) * k,
                   y: wp[i].y + (wp[i + 1].y - wp[i].y) * k };
        }
        acc += d;
      }
      return wp[wp.length - 1];
    },

    perpAt: function (t) {
      var a = Render.alongPath(Math.max(0, t - 0.005));
      var b = Render.alongPath(Math.min(1, t + 0.005));
      var vx = b.x - a.x, vy = b.y - a.y;
      var len = Math.hypot(vx, vy) || 1;
      return { x: -vy / len, y: vx / len };
    },

    groundShadow: function (g, x, y, r) {
      g.save();
      g.globalAlpha = 0.26;
      g.fillStyle = "#1d2a16";
      g.beginPath();
      g.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    },

    /* ---- Trame ---------------------------------------------------------- */

    draw: function (ctx, st, now) {
      if (!terrain) Render.buildTerrain();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(terrain, 0, 0);

      var tile = geo.tile;

      /* Halo de la forteresse : il bat plus vite quand la garnison faiblit. */
      var lifeRatio = st.lives / C.START_LIVES;
      var pulse = 0.55 + 0.45 * Math.sin(now / (lifeRatio > 0.35 ? 620 : 300));
      ctx.save();
      ctx.globalAlpha = 0.20 * pulse;
      ctx.fillStyle = lifeRatio > 0.35 ? "#ffd84d" : "#e5484d";
      ctx.beginPath();
      ctx.arc(Render.sx(MAP.CORE_POINT.x), Render.sy(MAP.CORE_POINT.y), tile * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* Case choisie, et portée de la tour envisagée. */
      if (st.selected) {
        var sel = st.selected;
        var cx = Render.sx(sel.c + 0.5), cy = Render.sy(sel.r + 0.5);
        if (st.preview) Render.range(ctx, cx, cy, st.preview.range * tile, st.preview.color);

        ctx.save();
        ctx.lineWidth = Math.max(2, tile * 0.05);
        ctx.strokeStyle = sel.tower ? "#ffd84d" : COL.parchment;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 220);
        ctx.beginPath();
        Render.roundRect(ctx, Render.sx(sel.c) + tile * 0.08, Render.sy(sel.r) + tile * 0.08,
          tile * 0.84, tile * 0.84, tile * 0.18);
        ctx.stroke();
        ctx.restore();
      }

      /* Tri par profondeur : ce qui est plus bas passe devant. */
      var drawables = [];
      st.towers.forEach(function (t) {
        drawables.push({ y: t.r + 0.9, kind: "tower", it: t });
      });
      st.enemies.forEach(function (e) {
        drawables.push({ y: e.def.fly ? e.y + 1.4 : e.y, kind: "enemy", it: e });
      });
      drawables.sort(function (a, b) { return a.y - b.y; });
      drawables.forEach(function (d) {
        if (d.kind === "tower") Render.tower(ctx, d.it, now);
        else Render.enemy(ctx, d.it, now);
      });

      Render.shots(ctx, st);
      Render.fx(ctx, st);
      Render.floats(ctx, st);
    },

    range: function (ctx, cx, cy, radius, color) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color || COL.parchment;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = color || COL.parchment;
      ctx.lineWidth = Math.max(2, geo.tile * 0.045);
      ctx.setLineDash([geo.tile * 0.22, geo.tile * 0.16]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },

    /* ---- Tours ---------------------------------------------------------- */

    tower: function (ctx, t, now) {
      var tile = geo.tile;
      var cx = Render.sx(t.c + 0.5);
      var footY = Render.sy(t.r + 0.94);
      var def = C.TOWERS[t.type];

      Render.groundShadow(ctx, cx, footY, tile * 0.42);
      A.draw(ctx, "tower_" + def.key, { x: cx, y: footY, w: TOWER_W * tile, frame: t.level });

      /* Le canon est la seule tour dont une pièce pivote : sa bouche suit la
         cible, et recule au tir. Les autres restent immobiles — ce sont leurs
         projectiles qui disent où elles visent. */
      if (def.key === "cannon") {
        var recoil = t.flash > 0 ? Math.min(1, t.flash / 0.09) * tile * 0.10 : 0;
        var deck = A.markAt("tower_cannon", t.level, TOWER_W * tile);
        A.draw(ctx, "tower_cannon.barrel", {
          x: cx + deck.x - Math.cos(t.angle) * recoil,
          y: footY + deck.y - Math.sin(t.angle) * recoil,
          w: tile * 0.90, frame: t.level, angle: t.angle
        });
      }

      /* Départ du coup. Seules deux tours en montrent un : la bombarde, à la
         bouche de son fût, et la tour de mages, dont l'orbe s'embrase. Les
         archers tirent des flèches et la tour de givre des éclats — ce sont
         les projectiles qui disent d'où part le tir. Un éclat posé au milieu
         d'une tour d'archers ressemblait à une lanterne allumée. */
      if (t.flash > 0 && (def.key === "cannon" || def.key === "tesla")) {
        var k = Math.min(1, t.flash / 0.1);
        ctx.save();
        ctx.globalAlpha = k * 0.85;
        var mk = A.markAt("tower_" + def.key, t.level, TOWER_W * tile);
        if (def.key === "cannon") {
          var mz = tile * 0.52;
          ctx.fillStyle = "#ffd84d";
          ctx.beginPath();
          ctx.arc(cx + mk.x + Math.cos(t.angle) * mz, footY + mk.y + Math.sin(t.angle) * mz,
            tile * 0.13 * k, 0, Math.PI * 2);
        } else {
          /* L'orbe du mage : il s'allume sur place, il ne crache rien. */
          ctx.fillStyle = "#dda6f5";
          ctx.beginPath();
          ctx.arc(cx + mk.x, footY + mk.y, tile * 0.20 * k, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }

      /* Fanions de niveau : une, deux ou trois marques d'or au pied de la
         tour. On lit la puissance de toute la défense sans rien toucher. */
      var pips = t.level;
      var pw = tile * 0.11, gap = tile * 0.05;
      var startX = cx - (pips * pw + (pips - 1) * gap) / 2;
      ctx.save();
      for (var i = 0; i < pips; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * (pw + gap) + pw / 2, footY + tile * 0.03, pw * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd84d";
        ctx.strokeStyle = COL.ink;
        ctx.lineWidth = Math.max(1, tile * 0.022);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },

    /* ---- Ennemis -------------------------------------------------------- */

    enemy: function (ctx, e, now) {
      var tile = geo.tile;
      var def = e.def;
      var cx = Render.sx(e.x), cy = Render.sy(e.y);
      var w = tile * 0.92 * (def.scale || 1);

      /* Sens de marche : pris sur le segment de chemin en cours. Sur un
         segment vertical, on garde le dernier sens plutôt que de faire
         pivoter la créature pour rien. */
      var seg = Math.min(e.wp, e.path.length - 1);
      var a = e.path[Math.max(0, seg - 1)], b = e.path[seg];
      var vx = b.x - a.x;
      if (Math.abs(vx) > 0.01) e.face = vx < 0 ? -1 : 1;
      var flip = e.face === -1;

      /* Trame de marche liée à la distance parcourue, pas à l'horloge : un
         ennemi gelé ralentit aussi ses jambes. */
      var frame = def.fly
        ? (Math.floor(now / 110 + e.id) % 2)
        : (Math.floor(e.traveled * 3.4) % 2);

      var bob = def.fly ? Math.sin(now / 260 + e.id) * tile * 0.10 : 0;
      var footY = def.fly ? cy + bob : cy + def.size * tile * 0.55;
      var shadowY = def.fly ? cy + tile * 0.62 : footY;

      Render.groundShadow(ctx, cx, shadowY, def.size * tile * (def.fly ? 0.6 : 0.85));

      /* Ralenti : une flaque de givre au sol, posée avant la créature pour
         qu'on la voie sans qu'elle la masque. */
      var frozen = e.slowUntil > e.clock;
      if (frozen) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = A.PAL.ice;
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, def.size * tile * 1.0, def.size * tile * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      var opts = { x: cx, y: footY, w: w, frame: frame, flip: flip };
      A.draw(ctx, def.key, opts);

      /* Voile de givre puis éclat blanc à l'impact : les deux épousent la
         silhouette, jamais un carré posé par-dessus. */
      if (frozen) {
        A.draw(ctx, def.key, { x: cx, y: footY, w: w, frame: frame, flip: flip,
          tint: "#9beaf6", alpha: 0.45 });
      }
      if (e.flash > 0) {
        A.draw(ctx, def.key, { x: cx, y: footY, w: w, frame: frame, flip: flip,
          tint: "#ffffff", alpha: Math.min(0.8, e.flash * 8) });
      }

      /* Barre de vie : seulement une fois l'ennemi touché. Cent barres pleines
         à l'écran ne disent rien à personne. */
      if (e.hp < e.maxHp) {
        var bw = Math.max(tile * 0.4, def.size * tile * 1.9);
        var bh = tile * 0.10;
        var bx = cx - bw / 2;
        /* Posée juste au-dessus du sommet réel de la créature, quel que soit
           son point d'ancrage — pieds pour ce qui marche, centre pour ce qui
           vole. */
        var by = footY - A.topAt(def.key, w) - tile * 0.07;

        ctx.save();
        ctx.lineWidth = Math.max(1.5, tile * 0.028);
        ctx.strokeStyle = COL.ink;
        ctx.fillStyle = COL.hpBack;
        ctx.beginPath();
        Render.roundRect(ctx, bx, by, bw, bh, bh / 2);
        ctx.fill();
        ctx.stroke();

        var ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
        if (ratio > 0.02) {
          ctx.beginPath();
          Render.roundRect(ctx, bx, by, bw * ratio, bh, bh / 2);
          ctx.fillStyle = ratio > 0.35 ? COL.hpGood : COL.hpBad;
          ctx.fill();
        }
        ctx.restore();
      }
    },

    /* ---- Projectiles ---------------------------------------------------- */

    shots: function (ctx, st) {
      var tile = geo.tile;
      st.shots.forEach(function (s) {
        var x = Render.sx(s.x), y = Render.sy(s.y);
        /* Le tir ne porte pas sa direction : elle se déduit de ce qui lui
           reste à parcourir, et suit donc la cible qui se déplace. */
        var ang = Math.atan2(s.ty - s.y, s.tx - s.x);

        ctx.save();
        ctx.translate(x, y);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (s.kind === "splash") {
          /* Boulet : une masse sombre, un reflet, et une traînée de fumée. */
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#8a8f96";
          ctx.beginPath();
          ctx.arc(-Math.cos(ang) * tile * 0.22, -Math.sin(ang) * tile * 0.22, tile * 0.11, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.arc(0, 0, tile * 0.13, 0, Math.PI * 2);
          ctx.fillStyle = "#3a3a42";
          ctx.strokeStyle = COL.ink;
          ctx.lineWidth = Math.max(1.5, tile * 0.03);
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(-tile * 0.04, -tile * 0.05, tile * 0.04, 0, Math.PI * 2);
          ctx.fillStyle = "#d7dae0";
          ctx.fill();

        } else if (s.kind === "slow") {
          /* Éclat de glace, pointe en avant. */
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(tile * 0.16, 0);
          ctx.lineTo(0, -tile * 0.07);
          ctx.lineTo(-tile * 0.12, 0);
          ctx.lineTo(0, tile * 0.07);
          ctx.closePath();
          ctx.fillStyle = A.PAL.iceLight;
          ctx.strokeStyle = A.PAL.iceDark;
          ctx.lineWidth = Math.max(1.5, tile * 0.03);
          ctx.fill();
          ctx.stroke();

        } else {
          /* Flèche : hampe, pointe, empennage. */
          ctx.rotate(ang);
          ctx.strokeStyle = COL.ink;
          ctx.lineWidth = Math.max(2, tile * 0.045);
          ctx.beginPath();
          ctx.moveTo(-tile * 0.16, 0);
          ctx.lineTo(tile * 0.14, 0);
          ctx.stroke();
          ctx.strokeStyle = A.PAL.woodLight;
          ctx.lineWidth = Math.max(1, tile * 0.022);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(tile * 0.20, 0);
          ctx.lineTo(tile * 0.10, -tile * 0.055);
          ctx.lineTo(tile * 0.10, tile * 0.055);
          ctx.closePath();
          ctx.fillStyle = A.PAL.iron;
          ctx.strokeStyle = COL.ink;
          ctx.lineWidth = Math.max(1, tile * 0.02);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = A.PAL.white;
          ctx.beginPath();
          ctx.moveTo(-tile * 0.16, 0);
          ctx.lineTo(-tile * 0.24, -tile * 0.06);
          ctx.lineTo(-tile * 0.14, 0);
          ctx.lineTo(-tile * 0.24, tile * 0.06);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    },

    /* ---- Effets --------------------------------------------------------- */

    fx: function (ctx, st) {
      var tile = geo.tile;
      st.fx.forEach(function (f) {
        var k = 1 - f.life / f.max;          // 0 au début, 1 à la fin

        if (f.kind === "boom") {
          /* Explosion en trois bulles décalées : une seule sphère fait
             « bulle de savon », trois font « nuage ». */
          var R = f.r * tile * (0.45 + k * 0.85);
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.95;
          var offs = [[0, 0, 1], [-0.55, -0.35, 0.62], [0.5, -0.2, 0.55]];
          for (var i = 0; i < offs.length; i++) {
            var grd = ctx.createRadialGradient(
              Render.sx(f.x) + offs[i][0] * R, Render.sy(f.y) + offs[i][1] * R, 0,
              Render.sx(f.x) + offs[i][0] * R, Render.sy(f.y) + offs[i][1] * R, R * offs[i][2]);
            grd.addColorStop(0, k < 0.45 ? "#fff3b0" : "#ffd166");
            grd.addColorStop(0.55, "#f2a33c");
            grd.addColorStop(1, "rgba(120,60,20,0)");
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(Render.sx(f.x) + offs[i][0] * R, Render.sy(f.y) + offs[i][1] * R,
              R * offs[i][2], 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

        } else if (f.kind === "beam") {
          /* Trait de magie : un halo large, un cœur clair, et un éclair brisé.
             Les trois passes donnent l'impression de lumière. */
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          var pts = [[f.x1, f.y1], [f.mx, f.my], [f.x2, f.y2]];
          [[tile * 0.20, A.PAL.arcaneDark, 0.5],
           [tile * 0.11, A.PAL.arcane, 0.9],
           [tile * 0.045, "#ffffff", 1]].forEach(function (pass) {
            ctx.globalAlpha = (1 - k) * pass[2];
            ctx.lineWidth = pass[0];
            ctx.strokeStyle = pass[1];
            ctx.beginPath();
            ctx.moveTo(Render.sx(pts[0][0]), Render.sy(pts[0][1]));
            ctx.lineTo(Render.sx(pts[1][0]), Render.sy(pts[1][1]));
            ctx.lineTo(Render.sx(pts[2][0]), Render.sy(pts[2][1]));
            ctx.stroke();
          });
          ctx.restore();

        } else if (f.kind === "puff") {
          /* Poussière : une bouffée ronde qui monte et s'efface. */
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.75;
          ctx.fillStyle = f.color || COL.parchment;
          var rr = tile * (0.06 + k * 0.16);
          ctx.beginPath();
          ctx.arc(Render.sx(f.x), Render.sy(f.y) - k * tile * 0.45, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    },

    /* ---- Textes volants -------------------------------------------------- */

    floats: function (ctx, st) {
      var tile = geo.tile;
      st.floats.forEach(function (f) {
        var k = f.life / f.max;
        var x = Render.sx(f.x);
        var y = Render.sy(f.y) - (1 - k) * tile * 0.9;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.font = "700 " + Math.round(tile * 0.34) + "px Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        /* Cerné comme le reste du jeu : un chiffre nu se perdrait sur l'herbe. */
        ctx.lineWidth = Math.max(2, tile * 0.06);
        ctx.lineJoin = "round";
        ctx.strokeStyle = COL.ink;
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
        ctx.restore();
      });
    }
  };

  PD.Render = Render;
})(window.PD);
