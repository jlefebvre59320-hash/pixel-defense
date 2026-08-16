/* Pixel Defense — l'interface.
   Tout ce qui est texte, bouton ou panneau vit dans le DOM, pas dans le
   canvas : c'est net sur tous les écrans, ça se traduit, ça se lit au
   lecteur d'écran, et le doigt tombe sur de vraies cibles de 44 px.
   Le canvas ne dessine que le jeu. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var G = PD.Game;
  var S = PD.Sprites;

  var el = {};
  var actions = {};
  var last = {};      // dernières valeurs affichées, pour ne pas réécrire le DOM à chaque trame
  var sheetKind = null;
  var sheetTower = null;

  function $(id) { return document.getElementById(id); }

  function text(node, value) {
    if (last[node.id] === value) return;
    last[node.id] = value;
    node.textContent = value;
  }

  /* Vignette d'une tour : le sprite de sa tête, dessiné dans un petit canvas.
     Une icône de plus à charger serait une requête réseau pour rien. */
  function icon(type, cssSize) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cv = document.createElement("canvas");
    cv.width = Math.round(cssSize * dpr);
    cv.height = Math.round(cssSize * dpr);
    cv.style.width = cssSize + "px";
    cv.style.height = cssSize + "px";
    cv.className = "icon";
    var g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    var px = Math.max(1, Math.floor(cv.width / 12));
    S.draw(g, "head_" + type, cv.width / 2, cv.height / 2, px);
    return cv;
  }

  function fmt(n) { return Math.floor(n).toLocaleString("fr-FR"); }

  var UI = {
    init: function (handlers) {
      actions = handlers;

      ["hud", "stage", "sheet", "overlay", "toast",
        "stat-lives", "stat-gold", "stat-wave", "stat-score",
        "btn-wave", "btn-speed", "btn-sound", "btn-pause"].forEach(function (id) {
          el[id] = $(id);
        });

      el["btn-wave"].addEventListener("click", function () { actions.onWave(); });
      el["btn-speed"].addEventListener("click", function () { actions.onSpeed(); });
      el["btn-sound"].addEventListener("click", function () { actions.onSound(); });
      el["btn-pause"].addEventListener("click", function () { actions.onPause(); });
    },

    /* ---- Bandeaux ------------------------------------------------------- */

    sync: function (st) {
      text(el["stat-lives"], String(st.lives));
      text(el["stat-gold"], fmt(st.gold));
      text(el["stat-wave"], st.wave + "/" + st.waves);
      text(el["stat-score"], fmt(st.score));

      el["stat-lives"].parentNode.classList.toggle("danger", st.lives <= 4);

      /* Hors partie (menu, fin, aide), les commandes du bas n'ont rien à
         commander : on les désactive plutôt que de les laisser cliquables
         sans effet. Le son, lui, se règle à tout moment. */
      var live = st.phase === "playing" || st.phase === "paused";
      el["btn-speed"].disabled = !live;
      el["btn-pause"].disabled = !live;

      var b = el["btn-wave"];
      if (st.phase !== "playing") {
        b.disabled = true;
        text(b, "Vague " + Math.max(1, st.wave) + "/" + st.waves);
      } else if (st.waveActive) {
        b.disabled = true;
        text(b, "Vague " + st.wave + " en cours");
      } else if (st.wave >= st.waves) {
        b.disabled = true;
        text(b, "Dernière vague");
      } else if (st.breakLeft === null) {
        b.disabled = false;
        text(b, st.wave === 0 ? "▶ Lancer la première vague" : "▶ Vague " + (st.wave + 1));
      } else {
        b.disabled = false;
        var bonus = G.earlyBonus(st);
        text(b, "▶ Vague " + (st.wave + 1) + " · " + Math.ceil(st.breakLeft) + "s" + (bonus > 0 ? "  +" + bonus + "◈" : ""));
      }

      text(el["btn-speed"], "×" + st.speed);
      el["btn-sound"].classList.toggle("off", !PD.Audio.isEnabled());
      el["btn-sound"].setAttribute("aria-label", PD.Audio.isEnabled() ? "Couper le son" : "Activer le son");
      text(el["btn-pause"], st.phase === "paused" ? "▶" : "❚❚");

      /* Le panneau d'une tour affiche son or disponible : il doit se
         remettre à jour quand une élimination remplit la bourse. */
      if (sheetKind === "build" || sheetKind === "tower") UI.refreshSheetAffordance(st);
    },

    /* ---- Panneau du bas -------------------------------------------------- */

    closeSheet: function (st) {
      sheetKind = null;
      sheetTower = null;
      el.sheet.classList.add("hidden");
      el.sheet.innerHTML = "";
      if (st) { st.selected = null; st.preview = null; }
    },

    showBuild: function (st, c, r) {
      sheetKind = "build";
      sheetTower = null;
      st.selected = { c: c, r: r };
      st.preview = null;

      el.sheet.classList.remove("hidden");
      el.sheet.innerHTML = "";

      var head = document.createElement("div");
      head.className = "sheet-head";
      head.innerHTML = '<span class="sheet-title">Construire</span>';
      var close = document.createElement("button");
      close.className = "chip";
      close.textContent = "Fermer";
      close.addEventListener("click", function () { UI.closeSheet(st); });
      head.appendChild(close);
      el.sheet.appendChild(head);

      var row = document.createElement("div");
      row.className = "cards";

      C.TOWER_ORDER.forEach(function (key) {
        var def = C.TOWERS[key];
        var lv = def.levels[0];

        var card = document.createElement("button");
        card.className = "card";
        card.dataset.cost = def.cost;
        card.setAttribute("aria-label", def.name + ", " + def.cost + " pièces d'or");

        card.appendChild(icon(key, 34));

        var name = document.createElement("span");
        name.className = "card-name";
        name.textContent = def.name;
        card.appendChild(name);

        var cost = document.createElement("span");
        cost.className = "card-cost";
        cost.textContent = def.cost + " ◈";
        card.appendChild(cost);

        var meta = document.createElement("span");
        meta.className = "card-meta";
        meta.textContent = def.tag;
        card.appendChild(meta);

        /* Appui = aperçu de la portée, relâchement = construction. Le joueur
           voit ce qu'il achète avant de payer, sans clic supplémentaire. */
        card.addEventListener("pointerdown", function () {
          st.preview = { range: lv.range, color: def.color };
        });
        card.addEventListener("click", function () {
          if (actions.onBuild(key)) UI.closeSheet(st);
        });

        row.appendChild(card);
      });

      el.sheet.appendChild(row);

      var hint = document.createElement("p");
      hint.className = "sheet-hint";
      hint.textContent = C.TOWERS[C.TOWER_ORDER[0]].desc;
      el.sheet.appendChild(hint);

      /* La description suit la tour survolée ou pressée : quatre pavés de
         texte côte à côte seraient illisibles sur un téléphone. */
      row.querySelectorAll(".card").forEach(function (card, i) {
        var def = C.TOWERS[C.TOWER_ORDER[i]];
        card.addEventListener("pointerenter", function () { hint.textContent = def.desc; });
        card.addEventListener("pointerdown", function () { hint.textContent = def.desc; });
      });

      UI.refreshSheetAffordance(st);
    },

    showTower: function (st, t) {
      sheetKind = "tower";
      sheetTower = t;
      st.selected = { c: t.c, r: t.r, tower: t };
      var def = C.TOWERS[t.type];
      var lv = G.stats(t);
      st.preview = { range: lv.range, color: def.color };

      el.sheet.classList.remove("hidden");
      el.sheet.innerHTML = "";

      var head = document.createElement("div");
      head.className = "sheet-head";
      head.innerHTML = '<span class="sheet-title">' + def.name + ' <em>niv. ' + t.level + '</em></span>';
      var close = document.createElement("button");
      close.className = "chip";
      close.textContent = "Fermer";
      close.addEventListener("click", function () { UI.closeSheet(st); });
      head.appendChild(close);
      el.sheet.appendChild(head);

      var body = document.createElement("div");
      body.className = "tower-body";
      body.appendChild(icon(t.type, 40));

      var next = G.nextLevel(t);
      var statList = document.createElement("dl");
      statList.className = "stats";
      [
        ["Dégâts", lv.dmg, next && next.dmg],
        ["Portée", lv.range.toFixed(1), next && next.range.toFixed(1)],
        ["Cadence", lv.rate.toFixed(1) + "/s", next && next.rate.toFixed(1) + "/s"]
      ].forEach(function (row) {
        var dt = document.createElement("dt");
        dt.textContent = row[0];
        var dd = document.createElement("dd");
        dd.textContent = row[1];
        if (row[2] && String(row[2]) !== String(row[1])) {
          var up = document.createElement("em");
          up.textContent = " → " + row[2];
          dd.appendChild(up);
        }
        statList.appendChild(dt);
        statList.appendChild(dd);
      });
      body.appendChild(statList);
      el.sheet.appendChild(body);

      var btns = document.createElement("div");
      btns.className = "sheet-actions";

      var up = document.createElement("button");
      up.className = "btn primary grow";
      if (next) {
        up.dataset.cost = next.cost;
        up.textContent = "Améliorer · " + next.cost + " ◈";
        up.addEventListener("click", function () {
          if (actions.onUpgrade(t)) UI.showTower(st, t);
        });
      } else {
        up.textContent = "Niveau maximum";
        up.disabled = true;
      }
      btns.appendChild(up);

      var sell = document.createElement("button");
      sell.className = "btn ghost";
      sell.textContent = "Vendre · +" + G.sellValue(t) + " ◈";
      sell.addEventListener("click", function () {
        actions.onSell(t);
        UI.closeSheet(st);
      });
      btns.appendChild(sell);

      el.sheet.appendChild(btns);
      UI.refreshSheetAffordance(st);
    },

    /* Grise ce qui est trop cher, en direct : rien n'est plus frustrant
       qu'un bouton qui accepte le clic pour répondre « pas assez d'or ». */
    refreshSheetAffordance: function (st) {
      el.sheet.querySelectorAll("[data-cost]").forEach(function (node) {
        var cost = Number(node.dataset.cost);
        var poor = cost > st.gold;
        node.classList.toggle("poor", poor);
        if (node.tagName === "BUTTON") node.disabled = poor;
      });
    },

    isSheetOpen: function () { return sheetKind !== null; },
    sheetTower: function () { return sheetTower; },

    /* ---- Écrans pleins --------------------------------------------------- */

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

      if (opts.lines) {
        opts.lines.forEach(function (line) {
          var p = document.createElement("p");
          p.className = "line";
          p.innerHTML = line;
          box.appendChild(p);
        });
      }

      (opts.buttons || []).forEach(function (b) {
        var btn = document.createElement("button");
        btn.className = "btn " + (b.style || "primary");
        btn.textContent = b.label;
        btn.addEventListener("click", b.onClick);
        box.appendChild(btn);
      });

      el.overlay.appendChild(box);
    },

    /* Message éphémère au centre du plateau (« Vague 3 », « Pas assez d'or »). */
    toast: function (msg) {
      el.toast.textContent = msg;
      el.toast.classList.remove("hidden");
      clearTimeout(el.toast._t);
      el.toast._t = setTimeout(function () {
        el.toast.classList.add("hidden");
      }, 1400);
    },

    stage: function () { return el.stage; }
  };

  PD.UI = UI;
})(window.PD);
