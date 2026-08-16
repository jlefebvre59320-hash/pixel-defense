/* Pixel Defense — le rendu.
   Une règle : le moteur de jeu ne connaît que des cases, le rendu est seul à
   parler en pixels. Le terrain, qui ne bouge jamais, est dessiné une fois
   dans un canvas hors écran et recopié en une image par trame — sans quoi on
   redessinerait 144 tuiles soixante fois par seconde pour rien. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var MAP = PD.MAP;
  var S = PD.Sprites;

  /* Palette du décor */
  var COL = {
    bg: "#0e1020",
    grass: "#2f7d51",
    grassAlt: "#2a7049",
    grassDot: "#37925d",
    grassEdge: "#20573a",
    path: "#b08a5e",
    pathAlt: "#a8825a",
    pathEdge: "#7c6142",
    pathDot: "#c29a6c",
    base: "#3a4055",
    baseTop: "#4d5470",
    baseEdge: "#191c2b",
    hpBack: "#20222f",
    hpGood: "#57c96a",
    hpBad: "#e5484d",
    white: "#eef1f7"
  };

  var geo = { px: 4, tile: 64, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, cssW: 0, cssH: 0 };
  var terrain = null;

  function fillPx(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }

  /* ---- Géométrie -------------------------------------------------------- */

  var Render = {
    geo: geo,

    /* Recalcule la taille du canvas et l'échelle du pixel d'art.
       `px` est un entier : c'est la condition pour que chaque pixel d'art
       occupe exactement le même nombre de pixels écran, donc pour que le
       dessin reste net au lieu de baver.
       Le canvas est ensuite ramené à la taille exacte du plateau : sans ça,
       l'arrondi à l'entier laisserait deux bandes mortes à l'intérieur du
       cadre, et le plateau flotterait au milieu du vide. */
    resize: function (canvas, host) {
      var rect = (host || canvas.parentNode).getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var border = 4;   // bordure CSS du canvas, 2 px de chaque côté
      var availW = Math.max(40, rect.width - border);
      var availH = Math.max(40, rect.height - border);

      /* Échelle du pixel d'art. Sur un écran haute densité, on s'autorise le
         demi-pas : l'écart d'un pixel d'appareil sur deux vaut alors un quart
         de pixel CSS — invisible à l'œil, et le plateau gagne assez de place
         pour ne pas flotter au milieu du vide. À densité 1 (ordinateur), on
         reste sur des entiers, où le moindre demi-pas se verrait. */
      var step = dpr >= 2 ? 0.5 : 1;
      var raw = Math.min(availW * dpr / C.COLS, availH * dpr / C.ROWS) / C.ART;
      var px = Math.max(1, Math.floor(raw / step) * step);
      var tile = px * C.ART;   // toujours entier : ART est un multiple de 2
      var cw = tile * C.COLS;
      var ch = tile * C.ROWS;

      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = (cw / dpr) + "px";
      canvas.style.height = (ch / dpr) + "px";

      geo.px = px;
      geo.tile = tile;
      geo.w = cw;
      geo.h = ch;
      geo.dpr = dpr;
      geo.cssW = cw / dpr;
      geo.cssH = ch / dpr;
      geo.ox = 0;
      geo.oy = 0;

      terrain = null; // à redessiner à la nouvelle échelle
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      return ctx;
    },

    /* Case visée par un appui, en coordonnées CSS relatives au canvas. */
    tileAt: function (cssX, cssY) {
      var x = (cssX * geo.dpr - geo.ox) / geo.tile;
      var y = (cssY * geo.dpr - geo.oy) / geo.tile;
      return { c: Math.floor(x), r: Math.floor(y), x: x, y: y };
    },

    sx: function (x) { return geo.ox + x * geo.tile; },
    sy: function (y) { return geo.oy + y * geo.tile; },

    /* ---- Terrain (dessiné une seule fois) ------------------------------- */

    buildTerrain: function () {
      var cv = document.createElement("canvas");
      cv.width = geo.w;
      cv.height = geo.h;
      var g = cv.getContext("2d");
      g.imageSmoothingEnabled = false;

      fillPx(g, 0, 0, geo.w, geo.h, COL.bg);

      var px = geo.px, tile = geo.tile;

      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          var x = Render.sx(c), y = Render.sy(r);
          var n = MAP.noise(c, r);
          var path = MAP.isPath(c, r);

          fillPx(g, x, y, tile, tile, path ? (n > 0.5 ? COL.path : COL.pathAlt) : (n > 0.5 ? COL.grass : COL.grassAlt));

          if (path) {
            /* Bord du chemin : un liseré sombre du côté où l'herbe reprend.
               C'est ce qui donne au tracé sa lisibilité en un coup d'œil. */
            if (!MAP.isPath(c, r - 1)) fillPx(g, x, y, tile, px, COL.pathEdge);
            if (!MAP.isPath(c, r + 1)) fillPx(g, x, y + tile - px, tile, px, COL.pathEdge);
            if (!MAP.isPath(c - 1, r)) fillPx(g, x, y, px, tile, COL.pathEdge);
            if (!MAP.isPath(c + 1, r)) fillPx(g, x + tile - px, y, px, tile, COL.pathEdge);

            /* Gravillons : trois cailloux posés par le bruit, toujours aux
               mêmes endroits — le plateau doit rester reconnaissable. */
            for (var i = 0; i < 3; i++) {
              var gn = MAP.noise(c * 7 + i, r * 13 + i * 3);
              var gx = x + px * (2 + Math.floor(gn * 12));
              var gy = y + px * (2 + Math.floor(MAP.noise(r * 5 + i, c * 11) * 12));
              fillPx(g, gx, gy, px, px, COL.pathDot);
            }
          } else {
            /* Touffes d'herbe */
            for (var j = 0; j < 4; j++) {
              var hn = MAP.noise(c * 3 + j, r * 9 + j * 2);
              if (hn < 0.45) continue;
              var hx = x + px * Math.floor(hn * 15);
              var hy = y + px * Math.floor(MAP.noise(r * 3 + j, c * 5) * 15);
              fillPx(g, hx, hy, px, px, hn > 0.8 ? COL.grassEdge : COL.grassDot);
            }
          }
        }
      }

      /* Décor infranchissable */
      for (var r2 = 0; r2 < C.ROWS; r2++) {
        for (var c2 = 0; c2 < C.COLS; c2++) {
          if (!MAP.isBlocked(c2, r2)) continue;
          var cx = Render.sx(c2 + 0.5), cy = Render.sy(r2 + 0.5);
          S.draw(g, MAP.noise(c2, r2) > 0.5 ? "rock" : "tree", cx, cy, px);
        }
      }

      /* Entrée des ennemis : deux chevrons pâles dans la première case du
         chemin, qui disent d'où ça vient sans salir le décor. */
      var ex = Render.sx(MAP.SPAWN.x);
      var ey = Render.sy(0);
      for (var k = 0; k < 2; k++) {
        g.globalAlpha = 0.3 - k * 0.12;
        var top = ey + px * (2 + k * 5);
        fillPx(g, ex - px * 3, top, px * 2, px, COL.white);
        fillPx(g, ex + px, top, px * 2, px, COL.white);
        fillPx(g, ex - px * 2, top + px, px * 2, px, COL.white);
        fillPx(g, ex, top + px, px * 2, px, COL.white);
        fillPx(g, ex - px, top + px * 2, px * 2, px, COL.white);
      }
      g.globalAlpha = 1;

      terrain = cv;
      return cv;
    },

    /* ---- Trame ---------------------------------------------------------- */

    draw: function (ctx, st, now) {
      if (!terrain) Render.buildTerrain();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0);

      var px = geo.px, tile = geo.tile;

      /* Base à défendre, avec un halo qui bat au rythme des dégâts subis. */
      var pulse = 0.55 + 0.45 * Math.sin(now / 420);
      var lifeRatio = st.lives / C.START_LIVES;
      ctx.save();
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = lifeRatio > 0.35 ? "#5be3e0" : "#e5484d";
      ctx.beginPath();
      ctx.arc(Render.sx(MAP.CORE_POINT.x), Render.sy(MAP.CORE_POINT.y), tile * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      S.draw(ctx, "core", Render.sx(MAP.CORE_POINT.x), Render.sy(MAP.CORE_POINT.y), px);

      /* Case sélectionnée + portée de la tour envisagée ou choisie */
      if (st.selected) {
        var sel = st.selected;
        var cx = Render.sx(sel.c + 0.5), cy = Render.sy(sel.r + 0.5);

        if (st.preview) {
          Render.range(ctx, cx, cy, st.preview.range * tile, st.preview.color);
        }

        ctx.save();
        ctx.lineWidth = Math.max(2, px);
        ctx.strokeStyle = st.selected.tower ? "#ffd84d" : "#eef1f7";
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 220);
        ctx.strokeRect(Render.sx(sel.c) + px / 2, Render.sy(sel.r) + px / 2, tile - px, tile - px);
        ctx.restore();
      }

      /* Tours */
      st.towers.forEach(function (t) {
        Render.tower(ctx, t, now);
      });

      /* Ennemis */
      st.enemies.forEach(function (e) {
        Render.enemy(ctx, e, now);
      });

      /* Projectiles */
      st.shots.forEach(function (s) {
        var x = Render.sx(s.x), y = Render.sy(s.y);
        if (s.kind === "splash") {
          fillPx(ctx, x - px * 2, y - px * 2, px * 4, px * 4, "#12131c");
          fillPx(ctx, x - px * 1.5, y - px * 1.5, px * 3, px * 3, "#f2a33c");
        } else if (s.kind === "slow") {
          fillPx(ctx, x - px * 1.5, y - px * 1.5, px * 3, px * 3, "#12131c");
          fillPx(ctx, x - px, y - px, px * 2, px * 2, "#5be3e0");
        } else {
          fillPx(ctx, x - px, y - px, px * 2, px * 2, "#12131c");
          fillPx(ctx, x - px * 0.5, y - px * 0.5, px, px, "#ffd84d");
        }
      });

      /* Effets : explosions, éclairs, poussière */
      st.fx.forEach(function (f) {
        var k = 1 - f.life / f.max;
        if (f.kind === "boom") {
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = k < 0.4 ? "#ffd84d" : "#f2a33c";
          ctx.beginPath();
          ctx.arc(Render.sx(f.x), Render.sy(f.y), f.r * tile * (0.4 + k * 0.8), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (f.kind === "beam") {
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = "#d8a6ff";
          ctx.lineWidth = px * 1.6;
          ctx.beginPath();
          ctx.moveTo(Render.sx(f.x1), Render.sy(f.y1));
          /* Éclair brisé : deux coudes tirés au hasard, figés à la création. */
          ctx.lineTo(Render.sx(f.mx), Render.sy(f.my));
          ctx.lineTo(Render.sx(f.x2), Render.sy(f.y2));
          ctx.stroke();
          ctx.restore();
        } else if (f.kind === "puff") {
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.fillStyle = f.color || "#eef1f7";
          var s2 = px * (1 + k * 2);
          ctx.fillRect(Render.sx(f.x) - s2 / 2, Render.sy(f.y) - s2 / 2 - k * tile * 0.3, s2, s2);
          ctx.restore();
        }
      });

      /* Textes volants : or gagné, vies perdues */
      st.floats.forEach(function (f) {
        var k = f.life / f.max;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = f.color;
        ctx.font = "bold " + Math.round(px * 5) + "px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(f.text, Render.sx(f.x), Render.sy(f.y) - (1 - k) * tile * 0.8);
        ctx.restore();
      });
    },

    range: function (ctx, cx, cy, radius, color) {
      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = color || "#eef1f7";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color || "#eef1f7";
      ctx.lineWidth = Math.max(1, geo.px);
      ctx.stroke();
      ctx.restore();
    },

    tower: function (ctx, t, now) {
      var px = geo.px, tile = geo.tile;
      var x = Render.sx(t.c), y = Render.sy(t.r);
      var cx = x + tile / 2, cy = y + tile / 2;

      /* Socle : une plateforme de pierre, dessinée en aplats — un sprite de
         plus serait de la place perdue pour un carré. */
      fillPx(ctx, x + px, y + px * 2, tile - px * 2, tile - px * 3, COL.baseEdge);
      fillPx(ctx, x + px * 2, y + px * 3, tile - px * 4, tile - px * 5, COL.base);
      fillPx(ctx, x + px * 2, y + px * 3, tile - px * 4, px * 2, COL.baseTop);

      /* Pastilles de niveau, centrées sur le bas du socle : une, deux ou
         trois marques d'or — on lit le niveau d'un coup d'œil sur tout le
         plateau, sans sélectionner la tour. */
      var pips = t.level;
      var pw = px * 2, gap = px;
      var startX = cx - (pips * pw + (pips - 1) * gap) / 2;
      for (var i = 0; i < pips; i++) {
        fillPx(ctx, startX + i * (pw + gap), y + tile - px * 3.5, pw, px * 1.5, "#ffd84d");
      }

      var def = C.TOWERS[t.type];
      var recoil = t.flash > 0 ? Math.min(1, t.flash / 0.09) * px * 2 : 0;
      var ang = t.angle;
      var hx = cx - Math.cos(ang) * recoil;
      var hy = cy - Math.sin(ang) * recoil - px * 2;
      S.draw(ctx, "head_" + def.key, hx, hy, px, ang);
    },

    enemy: function (ctx, e, now) {
      var px = geo.px, tile = geo.tile;
      var def = e.def;
      var cx = Render.sx(e.x), cy = Render.sy(e.y);
      var scale = px * (def.scale || 1);

      /* Ombre portée : elle ancre l'ennemi au sol et distingue d'un coup
         d'œil ce qui vole de ce qui marche. */
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#000";
      var shadowY = def.fly ? cy + tile * 0.45 : cy + def.size * tile * 0.75;
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, def.size * tile * 0.8, def.size * tile * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      var bob = def.fly ? Math.sin(now / 180 + e.id) * px : 0;

      /* Ralenti : flaque de givre au sol, avant le sprite, pour qu'on la voie
         sans qu'elle masque l'ennemi. */
      var frozen = e.slowUntil > e.clock;
      if (frozen) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#5be3e0";
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, def.size * tile * 0.95, def.size * tile * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      S.draw(ctx, def.key, cx, cy - bob, scale);

      /* Voile de givre, puis éclair blanc à l'impact : les deux épousent la
         silhouette du sprite, jamais un carré. */
      if (frozen) S.drawTint(ctx, def.key, cx, cy - bob, scale, "#8ff2ee", 0.45);
      if (e.flash > 0) S.drawTint(ctx, def.key, cx, cy - bob, scale, "#ffffff", Math.min(0.8, e.flash * 8));

      /* Barre de vie : seulement quand l'ennemi a été touché — cent barres
         pleines à l'écran ne disent rien à personne. */
      if (e.hp < e.maxHp) {
        var w = Math.max(px * 6, def.size * tile * 1.8);
        var h = px * 1.5;
        var bx = cx - w / 2;
        var by = cy - def.size * tile - px * 3 - bob;
        fillPx(ctx, bx - px * 0.5, by - px * 0.5, w + px, h + px, "#12131c");
        fillPx(ctx, bx, by, w, h, COL.hpBack);
        var ratio = Math.max(0, e.hp / e.maxHp);
        fillPx(ctx, bx, by, w * ratio, h, ratio > 0.35 ? COL.hpGood : COL.hpBad);
      }
    }
  };

  PD.Render = Render;
})(window.PD);
