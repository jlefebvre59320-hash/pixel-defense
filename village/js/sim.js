/* Village — la simulation.
   Ni DOM, ni canvas, ni pixel : le village avance à partir d'un temps écoulé
   et signale ce qui mérite un mot au joueur. C'est ce qui rend les vitesses
   ×2/×3 gratuites, et ce qui permet à un robot de jouer cent ans de village
   en une seconde (tools/simulate.mjs). */
(function (V) {
  "use strict";

  var C = V.CONFIG;
  var World = V.World;

  function def(type) {
    return type === "hall" ? C.HALL : C.BUILDINGS[type];
  }

  var Sim = {
    def: def,

    create: function (seed) {
      World.generate(seed || 1);

      var st = {
        phase: "title",          // title | playing | paused | won | over
        t: 0,                    // temps de jeu, en secondes
        day: 0,
        speed: 1,
        res: {
          wood: C.START.wood, stone: C.START.stone,
          grain: C.START.grain, bread: C.START.bread, gold: C.START.gold
        },
        pop: C.START_POP,
        buildings: [],
        nextId: 1,
        version: 0,          // incrémenté à chaque construction ou démolition
        expandBought: 0,
        famineDays: 0,
        seed: seed || 1,
        stats: { built: 0, peakPop: C.START_POP, sold: 0, starved: 0 },
        events: [],              // messages destinés à l'interface
        levelName: C.levelFor(C.START_POP).name
      };

      /* L'hôtel de ville est posé d'office : une partie ne commence pas sur
         une page blanche. */
      Sim.place(st, "hall", World.hall.c, World.hall.r, true);
      return st;
    },

    /* ---- Bâtiments ------------------------------------------------------ */

    at: function (st, c, r) {
      var id = World.building(c, r);
      if (id <= 0) return null;
      for (var i = 0; i < st.buildings.length; i++) {
        if (st.buildings[i].id === id) return st.buildings[i];
      }
      return null;
    },

    canAfford: function (st, cost) {
      for (var k in cost) {
        if (st.res[k] === undefined) continue;
        if (st.res[k] < cost[k]) return false;
      }
      return true;
    },

    /* Un bâtiment est proposé si la population l'a débloqué : présenter dès
       le départ sept bâtiments dont cinq inaccessibles n'aide personne. */
    unlocked: function (st, type) {
      return st.pop >= def(type).unlock;
    },

    place: function (st, type, c, r, free) {
      var d = def(type);
      if (!free) {
        if (!World.canBuild(c, r)) return false;
        if (!Sim.unlocked(st, type)) return false;
        if (!Sim.canAfford(st, d.cost)) return false;
        for (var k in d.cost) st.res[k] -= d.cost[k];
      }

      var b = {
        id: st.nextId++,
        type: type,
        c: c, r: r,
        quality: World.quality(d.kind, c, r),
        built: st.t
      };
      st.buildings.push(b);
      st.version++;
      World.setOccupied(c, r, b.id);
      if (!free) st.stats.built++;
      return b;
    },

    /* Démolition : on récupère la moitié des matériaux. Assez pour corriger
       une erreur de placement, pas assez pour bâtir au hasard. */
    demolish: function (st, b) {
      if (!b || b.type === "hall") return false;
      var d = def(b.type);
      for (var k in d.cost) {
        if (st.res[k] !== undefined) st.res[k] += Math.floor(d.cost[k] * 0.5);
      }
      World.setOccupied(b.c, b.r, 0);
      st.buildings.splice(st.buildings.indexOf(b), 1);
      st.version++;
      return true;
    },

    expandCost: function (st) { return C.expandCost(st.expandBought); },

    expand: function (st) {
      var cost = Sim.expandCost(st);
      if (st.res.gold < cost) return false;
      st.res.gold -= cost;
      st.expandBought++;
      st.version++;
      World.expand();
      Sim.notify(st, "Territoire agrandi");
      return true;
    },

    /* ---- Grandeurs dérivées --------------------------------------------- */

    housing: function (st) {
      var total = 0;
      for (var i = 0; i < st.buildings.length; i++) {
        var d = def(st.buildings[i].type);
        if (d.slots) total += d.slots;
      }
      return total;
    },

    capacity: function (st) {
      var stores = 0;
      for (var i = 0; i < st.buildings.length; i++) {
        if (st.buildings[i].type === "store") stores++;
      }
      return C.BASE_CAP + stores * C.CAP_PER_STORE;
    },

    workersAvailable: function (st) { return Math.floor(st.pop * C.WORKER_RATIO); },

    workersNeeded: function (st) {
      var n = 0;
      for (var i = 0; i < st.buildings.length; i++) n += def(st.buildings[i].type).workers || 0;
      return n;
    },

    /* Taux d'occupation des postes, toutes activités confondues. En dessous
       de 1, les ateliers tournent au ralenti : c'est le signal qu'il manque
       des habitants — ou qu'il y a trop de bâtiments. */
    staffing: function (st) {
      var need = Sim.workersNeeded(st);
      if (need <= 0) return 1;
      return Math.min(1, Sim.workersAvailable(st) / need);
    },

    /* Répartition des bras : les champs et les moulins sont servis les
       premiers, le reste se partage ce qui demeure.
       Sans cette priorité, un village qui a trop bâti entre en spirale — la
       famine fait baisser la population, donc la main-d'œuvre, donc la
       récolte — et ne peut plus jamais s'en sortir. Nourrir d'abord, c'est ce
       que ferait n'importe quel village réel. */
    staffingSplit: function (st) {
      var needFood = 0, needOther = 0;
      for (var i = 0; i < st.buildings.length; i++) {
        var d = def(st.buildings[i].type);
        var w = d.workers || 0;
        if (d.kind === "grain" || d.kind === "mill") needFood += w;
        else needOther += w;
      }

      var available = Sim.workersAvailable(st);
      var food = needFood > 0 ? Math.min(1, available / needFood) : 1;
      var left = Math.max(0, available - needFood);
      var other = needOther > 0 ? Math.min(1, left / needOther) : 1;
      return { food: food, other: other };
    },

    /* Nourriture disponible, exprimée en rations. */
    food: function (st) {
      return st.res.bread * C.BREAD_FOOD + st.res.grain * C.GRAIN_FOOD;
    },

    /* Production par seconde d'un bâtiment, à l'état actuel du village. */
    output: function (st, b, staffing) {
      var d = def(b.type);
      if (!d.rate) return 0;
      return d.rate * (b.quality === undefined ? 1 : b.quality) * staffing;
    },

    notify: function (st, text) {
      st.events.push({ text: text, day: st.day });
      if (st.events.length > 40) st.events.shift();
    },

    /* ---- Boucle ---------------------------------------------------------- */

    update: function (st, dt) {
      if (st.phase !== "playing") return;

      st.t += dt;
      var cap = Sim.capacity(st);
      var split = Sim.staffingSplit(st);

      var add = function (key, amount) {
        st.res[key] = Math.min(cap, st.res[key] + amount);
      };

      for (var i = 0; i < st.buildings.length; i++) {
        var b = st.buildings[i];
        var d = def(b.type);
        var staffing = (d.kind === "grain" || d.kind === "mill") ? split.food : split.other;

        /* La corvée de l'hôtel de ville ne dépend ni des ouvriers ni du
           terrain : c'est un filet de sécurité, pas une source à optimiser. */
        if (d.trickle) {
          for (var key in d.trickle) add(key, d.trickle[key] * dt);
        }

        switch (d.kind) {
          case "wood":  add("wood", Sim.output(st, b, staffing) * dt); break;
          case "stone": add("stone", Sim.output(st, b, staffing) * dt); break;
          case "grain": add("grain", Sim.output(st, b, staffing) * dt); break;

          case "mill": {
            /* Le moulin ne tourne que s'il a du grain : une chaîne de
               production doit s'arrêter à la source, pas fabriquer du vide. */
            var want = d.consumes * staffing * dt;
            var got = Math.min(want, st.res.grain);
            if (got > 0) {
              st.res.grain -= got;
              add("bread", d.rate * staffing * dt * (got / want));
            }
            break;
          }

          case "market": {
            /* On vend le surplus, en commençant par ce qui déborde le plus.
               Le marché ne touche jamais à la réserve. */
            var budget = d.rate * staffing * dt;
            var keys = ["bread", "grain", "wood", "stone"];
            keys.sort(function (a, z) { return st.res[z] - st.res[a]; });
            for (var k = 0; k < keys.length && budget > 0; k++) {
              var key = keys[k];
              var surplus = st.res[key] - cap * C.SELL_THRESHOLD;
              if (surplus <= 0) continue;
              var sold = Math.min(surplus, budget);
              st.res[key] -= sold;
              st.res.gold += sold * C.PRICES[key];
              st.stats.sold += sold;
              budget -= sold;
            }
            break;
          }
        }
      }

      /* Le jour tombe : on mange, puis on compte les vivants. */
      var day = Math.floor(st.t / C.DAY);
      while (st.day < day) {
        st.day++;
        Sim.newDay(st);
        if (st.phase !== "playing") return;
      }
    },

    newDay: function (st) {
      st.res.gold += st.pop * C.TAX_PER_POP;

      var need = st.pop * C.FOOD_PER_POP;

      /* On mange le pain d'abord : il nourrit deux fois mieux, et le garder
         au grenier pendant qu'on rationne le grain n'aurait aucun sens. */
      var fromBread = Math.min(st.res.bread, need / C.BREAD_FOOD);
      st.res.bread -= fromBread;
      need -= fromBread * C.BREAD_FOOD;

      var fromGrain = Math.min(st.res.grain, need / C.GRAIN_FOOD);
      st.res.grain -= fromGrain;
      need -= fromGrain * C.GRAIN_FOOD;

      if (need > 0.01) {
        /* Famine : le village perd des habitants, pas seulement des points. */
        st.famineDays++;
        var lost = Math.max(1, Math.floor(st.pop * 0.06));
        st.pop = Math.max(0, st.pop - lost);
        st.stats.starved += lost;
        Sim.notify(st, "Famine : " + lost + " habitant" + (lost > 1 ? "s" : "") + " sont partis");
        if (st.pop <= 0) {
          st.phase = "over";
          return;
        }
      } else {
        st.famineDays = 0;
        var housing = Sim.housing(st);
        var buffer = st.pop * C.FOOD_PER_POP * C.GROWTH_BUFFER_DAYS;
        var stock = Sim.food(st);
        if (housing > st.pop && stock >= buffer && st.day % C.GROWTH_EVERY_DAYS === 0) {
          /* Grenier plein et logements libres : deux familles s'installent au
             lieu d'une. Un village bien tenu doit se voir grandir. */
          var fast = stock >= buffer * 2 && housing - st.pop >= 5;
          st.pop += fast ? 2 : 1;
          st.pop = Math.min(st.pop, housing);
          st.stats.peakPop = Math.max(st.stats.peakPop, st.pop);
        }
      }

      var level = C.levelFor(st.pop).name;
      if (level !== st.levelName) {
        st.levelName = level;
        Sim.notify(st, "Le village devient un " + level.toLowerCase());
      }

      if (st.pop >= C.WIN_POP) st.phase = "won";
    },

    /* ---- Sauvegarde ------------------------------------------------------ */

    snapshot: function (st) {
      return {
        v: 1,
        seed: st.seed, t: st.t, day: st.day, pop: st.pop, res: st.res,
        expandBought: st.expandBought, stats: st.stats,
        buildings: st.buildings.map(function (b) {
          return { id: b.id, type: b.type, c: b.c, r: b.r };
        }),
        nextId: st.nextId
      };
    },

    restore: function (data) {
      if (!data || data.v !== 1) return null;
      var st = Sim.create(data.seed);
      st.t = data.t;
      st.day = data.day;
      st.pop = data.pop;
      st.res = data.res;
      st.expandBought = data.expandBought || 0;
      st.stats = data.stats || st.stats;
      st.levelName = C.levelFor(st.pop).name;

      /* On repose les bâtiments un par un : la carte est régénérée depuis la
         même graine, donc les emplacements retrouvent leur qualité d'origine
         sans qu'on ait eu à l'enregistrer. */
      World.territory = C.TERRITORY + st.expandBought;

      st.buildings = [];
      World.occ.fill(0);
      st.nextId = 1;
      Sim.place(st, "hall", World.hall.c, World.hall.r, true);
      data.buildings.forEach(function (b) {
        if (b.type === "hall") return;
        Sim.place(st, b.type, b.c, b.r, true);
      });
      st.nextId = Math.max(st.nextId, data.nextId || 1);
      return st;
    }
  };

  V.Sim = Sim;
})(window.V);
