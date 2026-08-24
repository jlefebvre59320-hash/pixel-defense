/* Village — l'interface.
   Tout ce qui est texte ou bouton vit dans le DOM, jamais dans le canvas :
   net sur tous les écrans, lisible au lecteur d'écran, utilisable au clavier,
   et le doigt tombe sur de vraies cibles de 44 px. Le canvas ne dessine que
   le village. */
(function (V) {
  "use strict";

  var C = V.CONFIG;
  var Sim = V.Sim;
  var World = V.World;
  var Art = V.Art;

  var el = {};
  var actions = {};
  var last = {};
  var sheetKind = null;
  var sheetTile = null;
  var sheetBuilding = null;

  function $(id) { return document.getElementById(id); }

  function text(node, value) {
    if (last[node.id] === value) return;
    last[node.id] = value;
    node.textContent = value;
  }

  function n(x) { return Math.floor(x).toLocaleString("fr-FR"); }
  function rate(x) { return (x >= 0 ? "+" : "") + x.toFixed(2).replace(".", ",") + "/s"; }

  /* Vignette d'un métier : le bâtiment lui-même, dessiné en miniature sur un
     carré d'herbe. Aucune icône à charger, et surtout : ce qu'on voit sur la
     carte est exactement ce qu'on a choisi dans le panneau. */
  function icon(type, size) {
    var d = Sim.def(type);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cv = document.createElement("canvas");
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.style.width = size + "px";
    cv.style.height = size + "px";
    cv.className = "icon";

    var g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#5c9c4f";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(0, cv.height * 0.7, cv.width, cv.height * 0.3);

    var k = cv.width / (C.TW * 1.15);
    Art.building(g, cv.width / 2, cv.height * 0.74, k, d, { spin: 0.7 });
    return cv;
  }

  var UI = {
    icon: icon,

    init: function (handlers) {
      actions = handlers;
      ["map", "sheet", "overlay", "toast", "hud",
        "v-wood", "v-stone", "v-grain", "v-bread", "v-gold",
        "v-pop", "v-day", "v-work",
        "btn-village", "btn-speed", "btn-pause", "btn-sound",
        "btn-zoom-in", "btn-zoom-out", "btn-center"].forEach(function (id) { el[id] = $(id); });

      el["btn-village"].addEventListener("click", function () { actions.onVillage(); });
      el["btn-speed"].addEventListener("click", function () { actions.onSpeed(); });
      el["btn-pause"].addEventListener("click", function () { actions.onPause(); });
      el["btn-sound"].addEventListener("click", function () { actions.onSound(); });
      el["btn-zoom-in"].addEventListener("click", function () { actions.onZoom(1); });
      el["btn-zoom-out"].addEventListener("click", function () { actions.onZoom(-1); });
      el["btn-center"].addEventListener("click", function () { actions.onCenter(); });
    },

    mapRect: function () { return el.map.getBoundingClientRect(); },
    mapHost: function () { return el.map; },

    /* ---- Bandeau -------------------------------------------------------- */

    sync: function (st) {
      var cap = Sim.capacity(st);
      text(el["v-wood"], n(st.res.wood) + "/" + n(cap));
      text(el["v-stone"], n(st.res.stone) + "/" + n(cap));
      text(el["v-grain"], n(st.res.grain));
      text(el["v-bread"], n(st.res.bread));
      text(el["v-gold"], n(st.res.gold));

      var housing = Sim.housing(st);
      text(el["v-pop"], st.pop + "/" + housing);
      el["v-pop"].parentNode.classList.toggle("warn", housing <= st.pop);

      text(el["v-day"], "J" + st.day + " · " + st.levelName);

      var staffing = Sim.staffing(st);
      text(el["v-work"], Math.round(staffing * 100) + "%");
      el["v-work"].parentNode.classList.toggle("warn", staffing < 0.99);

      /* Famine : le bandeau des vivres vire au rouge avant que la population
         ne baisse — l'alerte doit précéder la sanction. */
      var days = Sim.food(st) / Math.max(1, st.pop * C.FOOD_PER_POP);
      el["v-grain"].parentNode.classList.toggle("danger", days < 1.5);
      el["v-bread"].parentNode.classList.toggle("danger", days < 1.5);

      text(el["btn-speed"], "×" + st.speed);
      text(el["btn-pause"], st.phase === "paused" ? "▶" : "❚❚");
      el["btn-sound"].classList.toggle("off", !V.Audio.isEnabled());

      var live = st.phase === "playing" || st.phase === "paused";
      el["btn-speed"].disabled = !live;
      el["btn-pause"].disabled = !live;
      el["btn-village"].disabled = !live;

      if (sheetKind === "build") UI.refreshCosts(st);
      if (sheetKind === "overview") UI.refreshOverview(st);
      if (sheetKind === "building" && sheetBuilding) UI.refreshBuilding(st);
    },

    refreshCosts: function (st) {
      el.sheet.querySelectorAll("[data-type]").forEach(function (card) {
        var type = card.dataset.type;
        var d = Sim.def(type);
        var poor = !Sim.canAfford(st, d.cost);
        var locked = !Sim.unlocked(st, type);
        card.classList.toggle("poor", poor || locked);
        card.disabled = poor || locked;
      });
    },

    /* ---- Panneau du bas -------------------------------------------------- */

    closeSheet: function () {
      sheetKind = null;
      sheetTile = null;
      sheetBuilding = null;
      el.sheet.classList.add("hidden");
      el.sheet.innerHTML = "";
    },

    isOpen: function () { return sheetKind !== null; },

    _head: function (title, subtitle) {
      var head = document.createElement("div");
      head.className = "sheet-head";

      var box = document.createElement("div");
      box.className = "sheet-titles";
      var t = document.createElement("span");
      t.className = "sheet-title";
      t.textContent = title;
      box.appendChild(t);
      if (subtitle) {
        var s = document.createElement("span");
        s.className = "sheet-sub";
        s.textContent = subtitle;
        box.appendChild(s);
      }
      head.appendChild(box);

      var close = document.createElement("button");
      close.className = "chip";
      close.textContent = "Fermer";
      close.addEventListener("click", function () { actions.onCloseSheet(); });
      head.appendChild(close);
      return head;
    },

    /* Construire : on montre, pour CETTE case, ce que chaque bâtiment y
       produirait vraiment. C'est tout le jeu — un même bâtiment vaut trois
       fois plus à dix mètres près. */
    showBuild: function (st, c, r) {
      sheetKind = "build";
      sheetTile = { c: c, r: r };
      sheetBuilding = null;

      el.sheet.classList.remove("hidden");
      el.sheet.innerHTML = "";
      el.sheet.appendChild(UI._head("Construire ici", "Case " + c + ", " + r));

      var grid = document.createElement("div");
      grid.className = "cards";

      C.BUILD_ORDER.forEach(function (type) {
        var d = Sim.def(type);
        var card = document.createElement("button");
        card.className = "card";
        card.dataset.type = type;

        card.appendChild(icon(type, 34));

        var name = document.createElement("span");
        name.className = "card-name";
        name.textContent = d.name;
        card.appendChild(name);

        var cost = document.createElement("span");
        cost.className = "card-cost";
        cost.textContent = UI.costLabel(d.cost);
        card.appendChild(cost);

        var meta = document.createElement("span");
        meta.className = "card-meta";
        if (!Sim.unlocked(st, type)) {
          meta.textContent = d.unlock + " hab. requis";
          meta.classList.add("locked");
        } else {
          meta.textContent = UI.yieldLabel(type, c, r);
        }
        card.appendChild(meta);

        /* Appui = aperçu du bâtiment sur la case visée, relâchement =
           construction : on voit ce qu'on achète avant de payer. */
        card.addEventListener("pointerenter", function () { UI.hint(d.desc); });
        card.addEventListener("pointerdown", function () {
          UI.hint(d.desc);
          actions.onPreview(type);
        });
        card.addEventListener("click", function () { actions.onBuild(type); });
        grid.appendChild(card);
      });

      el.sheet.appendChild(grid);

      var hint = document.createElement("p");
      hint.className = "sheet-hint";
      hint.id = "sheet-hint";
      hint.textContent = "Appuyez sur un bâtiment : le rendement affiché est celui de cette case précise.";
      el.sheet.appendChild(hint);

      UI.refreshCosts(st);
    },

    hint: function (t) {
      var node = $("sheet-hint");
      if (node) node.textContent = t;
    },

    costLabel: function (cost) {
      var parts = [];
      if (cost.wood) parts.push(cost.wood + " bois");
      if (cost.stone) parts.push(cost.stone + " pierre");
      if (cost.gold) parts.push(cost.gold + " or");
      return parts.join(" · ") || "gratuit";
    },

    /* Rendement estimé sur une case, en toutes lettres. */
    yieldLabel: function (type, c, r) {
      var d = Sim.def(type);
      if (d.kind === "house") return d.slots + " habitants";
      if (d.kind === "store") return "+" + C.CAP_PER_STORE + " stock";
      if (d.kind === "mill") return "grain → pain";
      if (d.kind === "market") return "vend le surplus";

      var q = World.quality(d.kind, c, r);
      var unit = d.kind === "wood" ? "bois" : d.kind === "stone" ? "pierre" : "grain";
      return (d.rate * q).toFixed(2).replace(".", ",") + " " + unit + "/s";
    },

    /* Fiche d'un bâtiment : ce qu'il produit ici et maintenant. */
    showBuilding: function (st, b) {
      sheetKind = "building";
      sheetBuilding = b;
      sheetTile = null;

      var d = Sim.def(b.type);
      el.sheet.classList.remove("hidden");
      el.sheet.innerHTML = "";
      el.sheet.appendChild(UI._head(d.name, d.tag));

      var body = document.createElement("div");
      body.className = "building-body";
      body.appendChild(icon(b.type, 44));

      var stats = document.createElement("div");
      stats.className = "b-stats";
      stats.id = "b-stats";
      body.appendChild(stats);
      el.sheet.appendChild(body);

      var desc = document.createElement("p");
      desc.className = "sheet-hint";
      desc.textContent = d.desc;
      el.sheet.appendChild(desc);

      if (b.type !== "hall") {
        var actionsRow = document.createElement("div");
        actionsRow.className = "sheet-actions";
        var demolish = document.createElement("button");
        demolish.className = "btn ghost grow";
        demolish.textContent = "Démolir · récupère la moitié";
        demolish.addEventListener("click", function () { actions.onDemolish(b); });
        actionsRow.appendChild(demolish);
        el.sheet.appendChild(actionsRow);
      }

      UI.refreshBuilding(st);
    },

    refreshBuilding: function (st) {
      var node = $("b-stats");
      if (!node || !sheetBuilding) return;
      var b = sheetBuilding;
      var d = Sim.def(b.type);
      var split = Sim.staffingSplit(st);
      var staffing = (d.kind === "grain" || d.kind === "mill") ? split.food : split.other;
      var rows = [];

      if (d.slots) rows.push(["Logement", d.slots + " habitants"]);
      if (d.workers) rows.push(["Ouvriers", d.workers + (staffing < 0.99 ? " (à " + Math.round(staffing * 100) + " %)" : "")]);

      if (d.kind === "wood" || d.kind === "stone" || d.kind === "grain") {
        var unit = d.kind === "wood" ? "bois" : d.kind === "stone" ? "pierre" : "grain";
        rows.push(["Emplacement", Math.round(b.quality * 100) + " %"]);
        rows.push(["Production", (Sim.output(st, b, staffing)).toFixed(2).replace(".", ",") + " " + unit + "/s"]);
      } else if (d.kind === "mill") {
        rows.push(["Transforme", (d.consumes * staffing).toFixed(2).replace(".", ",") + " grain/s"]);
        rows.push(["Produit", (d.rate * staffing).toFixed(2).replace(".", ",") + " pain/s"]);
      } else if (d.kind === "market") {
        rows.push(["Vend", "jusqu'à " + d.rate + " unités/s"]);
      } else if (d.kind === "store") {
        rows.push(["Stockage", "+" + C.CAP_PER_STORE]);
      }

      node.innerHTML = "";
      rows.forEach(function (row) {
        var line = document.createElement("div");
        line.className = "b-row";
        line.innerHTML = '<span>' + row[0] + '</span><b>' + row[1] + '</b>';
        node.appendChild(line);
      });
    },

    /* Vue d'ensemble : l'état du village en une page, et le seul endroit où
       l'on dépense l'or. */
    showOverview: function (st) {
      sheetKind = "overview";
      sheetTile = null;
      sheetBuilding = null;

      el.sheet.classList.remove("hidden");
      el.sheet.innerHTML = "";
      el.sheet.appendChild(UI._head("Le village", st.levelName));

      var body = document.createElement("div");
      body.className = "b-stats";
      body.id = "ov-stats";
      el.sheet.appendChild(body);

      var row = document.createElement("div");
      row.className = "sheet-actions";
      var expand = document.createElement("button");
      expand.className = "btn primary grow";
      expand.id = "btn-expand";
      expand.addEventListener("click", function () { actions.onExpand(); });
      row.appendChild(expand);
      el.sheet.appendChild(row);

      var hint = document.createElement("p");
      hint.className = "sheet-hint";
      hint.id = "sheet-hint";
      hint.textContent = "Agrandir repousse la limite dorée d'une case sur tout le tour du village.";
      el.sheet.appendChild(hint);

      UI.refreshOverview(st);
    },

    refreshOverview: function (st) {
      var node = $("ov-stats");
      if (!node) return;

      var split = Sim.staffingSplit(st);
      var prod = { wood: 0, stone: 0, grain: 0, bread: 0 };
      st.buildings.forEach(function (b) {
        var d = Sim.def(b.type);
        if (d.kind === "wood") prod.wood += Sim.output(st, b, split.other);
        else if (d.kind === "stone") prod.stone += Sim.output(st, b, split.other);
        else if (d.kind === "grain") prod.grain += Sim.output(st, b, split.food);
        else if (d.kind === "mill") {
          prod.bread += d.rate * split.food;
          prod.grain -= d.consumes * split.food;
        }
        if (d.trickle) {
          if (d.trickle.wood) prod.wood += d.trickle.wood;
          if (d.trickle.grain) prod.grain += d.trickle.grain;
        }
      });

      /* Bilan des vivres : la seule ligne qui décide de la survie. */
      var eat = st.pop * C.FOOD_PER_POP / C.DAY;                    // rations/s
      var foodProd = prod.grain * C.GRAIN_FOOD + prod.bread * C.BREAD_FOOD;
      var balance = foodProd - eat;
      var daysLeft = Sim.food(st) / Math.max(0.0001, st.pop * C.FOOD_PER_POP);

      var rows = [
        ["Population", st.pop + " / " + Sim.housing(st) + " logés"],
        ["Main-d'œuvre", Sim.workersAvailable(st) + " / " + Sim.workersNeeded(st) + " postes"],
        ["Bois", rate(prod.wood)],
        ["Pierre", rate(prod.stone)],
        ["Grain", rate(prod.grain)],
        ["Pain", rate(prod.bread)],
        ["Vivres", (balance >= 0 ? "excédent " : "déficit ") + rate(balance).replace("+", "")],
        ["Réserve", daysLeft.toFixed(1).replace(".", ",") + " jours"],
        ["Bâtiments", st.buildings.length]
      ];

      node.innerHTML = "";
      rows.forEach(function (r) {
        var line = document.createElement("div");
        line.className = "b-row";
        var danger = (r[0] === "Vivres" && balance < 0) || (r[0] === "Réserve" && daysLeft < 1.5);
        line.innerHTML = '<span>' + r[0] + '</span><b class="' + (danger ? "bad" : "") + '">' + r[1] + '</b>';
        node.appendChild(line);
      });

      var expand = $("btn-expand");
      if (expand) {
        var cost = Sim.expandCost(st);
        expand.textContent = "Agrandir le territoire · " + cost + " or";
        expand.disabled = st.res.gold < cost;
      }
    },

    /* ---- Écrans pleins et messages ---------------------------------------- */

    hideOverlay: function () {
      el.overlay.classList.add("hidden");
      el.overlay.innerHTML = "";
    },

    showOverlay: function (opts) {
      el.overlay.classList.remove("hidden");
      el.overlay.innerHTML = "";

      var box = document.createElement("div");
      box.className = "panel";

      if (opts.kicker) {
        var k = document.createElement("p");
        k.className = "kicker";
        k.textContent = opts.kicker;
        box.appendChild(k);
      }

      var h = document.createElement("h1");
      h.textContent = opts.title;
      box.appendChild(h);

      (opts.lines || []).forEach(function (line) {
        var p = document.createElement("p");
        p.className = "line";
        p.innerHTML = line;
        box.appendChild(p);
      });

      (opts.buttons || []).forEach(function (b) {
        if (b.hidden) return;
        var btn = document.createElement("button");
        btn.className = "btn " + (b.style || "primary");
        btn.textContent = b.label;
        btn.addEventListener("click", b.onClick);
        box.appendChild(btn);
      });

      el.overlay.appendChild(box);
    },

    toast: function (message) {
      el.toast.textContent = message;
      el.toast.classList.remove("hidden");
      clearTimeout(el.toast._t);
      el.toast._t = setTimeout(function () { el.toast.classList.add("hidden"); }, 1800);
    }
  };

  V.UI = UI;
})(window.V);
