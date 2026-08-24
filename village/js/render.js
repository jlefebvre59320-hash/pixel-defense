/* Village — le rendu d'une trame.
   Ordre de dessin : le sol d'abord, puis tout ce qui dépasse, trié par
   profondeur. Sur une grille isométrique, la profondeur est simplement
   c + r : ce qui a la plus grande somme est devant. */
(function (V) {
  "use strict";

  var C = V.CONFIG;
  var World = V.World;
  var Iso = V.Iso;
  var Art = V.Art;
  var Sim = V.Sim;

  /* Palette du sol : deux verts proches (le contraste se fait au mouchetis,
     pas entre les cases), un sable chaud, une eau qui respire. */
  var COLORS = {
    void: "#0a1018",
    grass: "#5c9c4f",
    grassAlt: "#548f49",
    sand: "#e0cf9a",
    water: "#3f7fb0",
    waterAlt: "#4a8cbb"
  };

  /* Habitants qui déambulent : ils ne servent à rien, et ils changent tout —
     un village sans passants a l'air d'une maquette. */
  var villagers = [];

  function walkable(c, r) {
    return World.inBounds(c, r)
      && World.tile(c, r) !== World.WATER
      && World.resource(c, r) === World.NONE
      && World.building(c, r) === 0;
  }

  function wanderTarget() {
    for (var tries = 0; tries < 20; tries++) {
      var c = World.hall.c + Math.round((Math.random() - 0.5) * World.territory * 2);
      var r = World.hall.r + Math.round((Math.random() - 0.5) * World.territory * 2);
      if (walkable(c, r)) return { c: c, r: r };
    }
    return { c: World.hall.c, r: World.hall.r };
  }

  var Render = {
    villagers: villagers,

    reset: function () { villagers.length = 0; },

    /* Un passant pour cinq habitants, jamais plus de douze : au-delà, on ne
       voit plus le village. */
    life: function (st, dt) {
      var want = Math.max(0, Math.min(12, Math.floor(st.pop / 5)));
      while (villagers.length < want) {
        var start = wanderTarget();
        villagers.push({
          c: start.c, r: start.r, to: wanderTarget(),
          speed: 0.6 + Math.random() * 0.5,
          bob: Math.random() * 6,
          skin: Math.random() > 0.5 ? "villager1" : "villager2"
        });
      }
      while (villagers.length > want) villagers.pop();

      for (var i = 0; i < villagers.length; i++) {
        var v = villagers[i];
        var dc = v.to.c - v.c, dr = v.to.r - v.r;
        var d = Math.hypot(dc, dr);
        if (d < 0.08) { v.to = wanderTarget(); continue; }
        var step = Math.min(d, v.speed * dt);
        v.c += (dc / d) * step;
        v.r += (dr / d) * step;
      }
    },

    /* ---- Trame ---------------------------------------------------------- */

    frame: function (ctx, st, now, view) {
      var k = Iso.k();
      ctx.fillStyle = COLORS.void;
      ctx.fillRect(0, 0, Iso.w, Iso.h);

      var margin = C.TW * k * 2;
      var visible = function (p) {
        return p.x > -margin && p.x < Iso.w + margin && p.y > -margin && p.y < Iso.h + margin * 2;
      };

      /* --- Sol --- */
      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          var p = Iso.toScreen(c, r);
          if (!visible(p)) continue;

          var t = World.tile(c, r);
          var out = !World.inTerritory(c, r);
          var color;
          if (t === World.WATER) {
            /* L'eau respire : deux tons qui alternent lentement, décalés
               d'une case à l'autre. */
            var wave = Math.sin(now / 700 + (c + r) * 0.6) > 0;
            color = wave ? COLORS.water : COLORS.waterAlt;
          } else if (t === World.SAND) {
            color = COLORS.sand;
          } else {
            color = World.speck(c, r, 0) > 0.5 ? COLORS.grass : COLORS.grassAlt;
          }

          Art.tile(ctx, p.x, p.y, k, {
            color: color,
            dim: out,
            speckle: t === World.WATER ? null : function (i) { return World.speck(c, r, i); }
          });

          /* Écume au bord de l'eau : on la dessine côté terre, là où la vague
             vient mourir. */
          if (t !== World.WATER) {
            var sides = [
              World.tile(c - 1, r) === World.WATER,   // nord-ouest
              World.tile(c, r - 1) === World.WATER,   // nord-est
              World.tile(c + 1, r) === World.WATER,   // sud-est
              World.tile(c, r + 1) === World.WATER    // sud-ouest
            ];
            if (sides[0] || sides[1] || sides[2] || sides[3]) Art.shore(ctx, p.x, p.y, k, sides);
          }
        }
      }

      /* --- Limite du territoire --- */
      Render.territoryBorder(ctx, k);

      /* --- Case visée et aperçu de construction --- */
      if (view.hover && World.inBounds(view.hover.c, view.hover.r)) {
        var hp = Iso.toScreen(view.hover.c, view.hover.r);
        var ok = view.previewType ? World.canBuild(view.hover.c, view.hover.r) : true;
        Art.tileOutline(ctx, hp.x, hp.y, k, ok ? "rgba(255,255,255,0.85)" : "rgba(229,72,77,0.9)", Math.max(1, k));

        /* Aperçu du bâtiment envisagé, en transparence, avec sa qualité
           d'emplacement affichée à côté par l'interface. */
        if (view.previewType && ok) {
          var d = Sim.def(view.previewType);
          Art.building(ctx, hp.x, hp.y, k, d, { alpha: 0.55, spin: now / 400 });
        }
      }

      /* --- Objets, triés par profondeur --- */
      var items = [];

      for (var rr = 0; rr < C.ROWS; rr++) {
        for (var cc = 0; cc < C.COLS; cc++) {
          var res = World.resource(cc, rr);
          if (res === World.TREE) {
            /* Trois essences tirées au bruit : une forêt d'arbres identiques
               se repère au premier coup d'œil. */
            var n = World.speck(cc, rr, 3);
            items.push({ d: cc + rr, kind: n > 0.72 ? "bush" : (n > 0.36 ? "tree2" : "tree1"), c: cc, r: rr });
          } else if (res === World.ROCK) {
            items.push({ d: cc + rr, kind: World.speck(cc, rr, 4) > 0.5 ? "rock2" : "rock1", c: cc, r: rr });
          }
        }
      }

      for (var b = 0; b < st.buildings.length; b++) {
        var bl = st.buildings[b];
        items.push({ d: bl.c + bl.r + 0.5, kind: "building", b: bl });
      }

      for (var v = 0; v < villagers.length; v++) {
        items.push({ d: villagers[v].c + villagers[v].r + 0.25, kind: "villager", v: villagers[v] });
      }

      items.sort(function (a, z) { return a.d - z.d; });

      for (var n = 0; n < items.length; n++) {
        var it = items[n];
        var pos, dim;

        if (it.kind !== "building" && it.kind !== "villager") {
          pos = Iso.toScreen(it.c, it.r);
          if (!visible(pos)) continue;
          dim = !World.inTerritory(it.c, it.r);
          ctx.globalAlpha = dim ? 0.55 : 1;
          Art.drawFoot(ctx, it.kind, pos.x, pos.y + (C.TH / 2) * k * 0.6, Math.max(1, k));
          ctx.globalAlpha = 1;
        } else if (it.kind === "building") {
          pos = Iso.toScreen(it.b.c, it.b.r);
          if (!visible(pos)) continue;
          var def = Sim.def(it.b.type);
          var selected = view.selected && view.selected.c === it.b.c && view.selected.r === it.b.r;
          Art.building(ctx, pos.x, pos.y, k, def, { spin: now / 400 });
          if (selected) {
            Art.tileOutline(ctx, pos.x, pos.y, k, "rgba(255,216,77,0.95)", Math.max(1, k));
          }
        } else {
          pos = Iso.toScreen(it.v.c, it.v.r);
          if (!visible(pos)) continue;
          var bob = Math.sin(now / 220 + it.v.bob) * 0.6 * k;
          /* Ombre du passant : sans elle, il glisse au-dessus de l'herbe. */
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.ellipse(pos.x, pos.y, k * 2, k, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          Art.drawFoot(ctx, it.v.skin, pos.x, pos.y + bob, Math.max(1, k));
        }
      }
    },

    /* Le territoire se lit d'un trait clair sur le sol : dedans on bâtit,
       dehors on regarde. */
    territoryBorder: function (ctx, k) {
      var t = World.territory;
      var h = World.hall;
      var corners = [
        Iso.toScreen(h.c - t, h.r - t),
        Iso.toScreen(h.c + t, h.r - t),
        Iso.toScreen(h.c + t, h.r + t),
        Iso.toScreen(h.c - t, h.r + t)
      ];
      var hw = (C.TW / 2) * k, hh = (C.TH / 2) * k;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y - hh);
      ctx.lineTo(corners[1].x + hw, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y + hh);
      ctx.lineTo(corners[3].x - hw, corners[3].y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,216,77,0.5)";
      ctx.lineWidth = Math.max(1, k);
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.stroke();
      ctx.restore();
    }
  };

  V.Render = Render;
})(window.V);
