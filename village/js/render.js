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
    waterAlt: "#4a8cbb",
    shallow: "#5fa3c8",
    road: "#b09364",
    roadAlt: "#a8895c",
    flower: ["#f4f1e4", "#ffd15c", "#e08aa8"]
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

  /* Chemins : chaque bâtiment est relié à l'hôtel de ville par un tracé en
     équerre. C'est ce réseau, plus que les bâtiments eux-mêmes, qui fait lire
     un village plutôt qu'une collection de cabanes. Recalculé seulement quand
     le village change. */
  var roads = { version: -1, set: {} };

  function markRoad(set, c, r) {
    if (!World.inBounds(c, r)) return;
    if (World.tile(c, r) === World.WATER) return;
    if (World.resource(c, r) !== World.NONE) return;
    if (World.building(c, r) !== 0) return;
    set[c + "," + r] = true;
  }

  function buildRoads(st) {
    var set = {};
    var hall = World.hall;
    for (var i = 0; i < st.buildings.length; i++) {
      var b = st.buildings[i];
      if (b.type === "hall") continue;
      var c = b.c, r = b.r;
      var sc = Math.sign(hall.c - c), sr = Math.sign(hall.r - r);
      while (c !== hall.c) { c += sc; markRoad(set, c, r); }
      while (r !== hall.r) { r += sr; markRoad(set, c, r); }
    }
    return set;
  }

  var Render = {
    villagers: villagers,

    reset: function () { villagers.length = 0; roads.version = -1; },

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

      /* Au-delà de la carte, ce n'est pas du vide : c'est le large. Un dégradé
         suffit à faire flotter l'île au lieu de la poser sur du noir. */
      var sea = ctx.createLinearGradient(0, 0, 0, Iso.h);
      sea.addColorStop(0, "#0b1b2e");
      sea.addColorStop(1, "#12314a");
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, Iso.w, Iso.h);

      var margin = C.TW * k * 2;
      var visible = function (p) {
        return p.x > -margin && p.x < Iso.w + margin && p.y > -margin && p.y < Iso.h + margin * 2;
      };

      if (roads.version !== st.version) {
        roads.set = buildRoads(st);
        roads.version = st.version;
      }

      /* --- Sol --- */
      for (var r = 0; r < C.ROWS; r++) {
        for (var c = 0; c < C.COLS; c++) {
          var p = Iso.toScreen(c, r);
          if (!visible(p)) continue;

          var t = World.tile(c, r);
          var out = !World.inTerritory(c, r);
          var road = roads.set[c + "," + r] === true;
          var color;
          if (t === World.WATER) {
            /* L'eau respire : deux tons qui alternent lentement, décalés
               d'une case à l'autre, et s'éclaircit près du rivage. */
            var wave = Math.sin(now / 700 + (c + r) * 0.6) > 0;
            var shallow = World.tile(c - 1, r) !== World.WATER || World.tile(c + 1, r) !== World.WATER
              || World.tile(c, r - 1) !== World.WATER || World.tile(c, r + 1) !== World.WATER;
            color = shallow ? COLORS.shallow : (wave ? COLORS.water : COLORS.waterAlt);
          } else if (road) {
            color = World.speck(c, r, 0) > 0.5 ? COLORS.road : COLORS.roadAlt;
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

          /* Fleurs et cailloux : trois pixels par-ci par-là, toujours aux
             mêmes endroits. C'est ce semis qui empêche la prairie de faire
             moquette. */
          if (t === World.GRASS && !out && !road && k >= 2) {
            var deco = World.speck(c, r, 11);
            if (deco > 0.82) {
              var dx = (World.speck(c, r, 12) - 0.5) * C.TW * 0.45 * k;
              var dy = (World.speck(c, r, 13) - 0.5) * C.TH * 0.45 * k;
              var px = Math.max(1, Math.round(k * 0.9));
              ctx.fillStyle = deco > 0.93
                ? "#8d9aa6"
                : COLORS.flower[Math.floor(World.speck(c, r, 14) * 3) % 3];
              ctx.fillRect(Math.round(p.x + dx), Math.round(p.y + dy), px, px);
              if (deco <= 0.93) {
                ctx.fillRect(Math.round(p.x + dx), Math.round(p.y + dy + px), px, px);
              }
            }
          }

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
          } else if (k >= 2) {
            /* Deux traits clairs qui dérivent : sans eux, l'eau est une nappe
               de peinture bleue. */
            var phase = (now / 2200 + World.speck(c, r, 6)) % 1;
            ctx.fillStyle = "rgba(226,240,246,0.22)";
            ctx.fillRect(
              Math.round(p.x - C.TW * 0.18 * k),
              Math.round(p.y + (phase - 0.5) * C.TH * 0.5 * k),
              Math.round(C.TW * 0.36 * k), Math.max(1, k * 0.6)
            );
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
          ctx.globalAlpha = dim ? 0.6 : 1;
          /* Ombre au pied de l'arbre : c'est elle qui le pose sur l'herbe. */
          ctx.save();
          ctx.globalAlpha *= 0.28;
          ctx.fillStyle = "#12240f";
          ctx.beginPath();
          ctx.ellipse(pos.x, pos.y + (C.TH / 2) * k * 0.5, k * 4.5, k * 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          /* Balancement : un pixel de va-et-vient, décalé d'un arbre à
             l'autre. Une forêt parfaitement immobile a l'air peinte. */
          var sway = Math.sin(now / 1400 + (it.c + it.r) * 0.9) * k * 0.8;
          Art.drawFoot(ctx, it.kind, pos.x + sway, pos.y + (C.TH / 2) * k * 0.6, Math.max(1, k));
          ctx.globalAlpha = 1;
        } else if (it.kind === "building") {
          pos = Iso.toScreen(it.b.c, it.b.r);
          if (!visible(pos)) continue;
          var def = Sim.def(it.b.type);
          var selected = view.selected && view.selected.c === it.b.c && view.selected.r === it.b.r;
          Art.building(ctx, pos.x, pos.y, k, def, { spin: now / 400, now: now, seed: it.b.id });
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

      Render.vignette(ctx);
    },

    /* Vignette : quatre coins à peine assombris. Rien ne se voit, tout se
       sent — le regard tombe au centre de la carte. */
    vignette: function (ctx) {
      var g = ctx.createRadialGradient(
        Iso.w / 2, Iso.h / 2, Math.min(Iso.w, Iso.h) * 0.35,
        Iso.w / 2, Iso.h / 2, Math.max(Iso.w, Iso.h) * 0.75
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(3,8,16,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Iso.w, Iso.h);
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
