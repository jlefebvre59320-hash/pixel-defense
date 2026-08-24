/* Village — assemblage : la boucle, le doigt, les écrans.
   Seul fichier à connaître à la fois la simulation, la vue et l'interface ;
   les autres s'ignorent. */
(function (V) {
  "use strict";

  var C = V.CONFIG;
  var World = V.World;
  var Iso = V.Iso;
  var Sim = V.Sim;
  var Render = V.Render;
  var UI = V.UI;
  var Store = V.Store;
  var Audio = V.Audio;

  var canvas = document.getElementById("board");
  var ctx = null;
  var st = null;
  var view = { hover: null, selected: null, previewType: null };
  var lastPhase = null;
  var lastT = 0;
  var lastEvent = 0;
  var saveTimer = 0;

  /* ---- Écrans ------------------------------------------------------------ */

  function bestLine() {
    if (!Store.get("best")) return "Aucune partie terminée pour l'instant.";
    return "Record : <b>" + Store.get("best").toLocaleString("fr-FR") + "</b> points · " + Store.get("bestPop") + " habitants";
  }

  function showTitle() {
    if (st) st.phase = "title";
    UI.closeSheet();
    UI.showOverlay({
      kicker: "Bâtisseur isométrique",
      title: "VILLAGE",
      lines: [
        "Une clairière, six habitants, une hache. À vous d'en faire une ville de " + C.WIN_POP + " âmes.",
        bestLine()
      ],
      buttons: [
        { label: "Reprendre la partie", primary: true, onClick: resume, hidden: !Store.hasSave() },
        { label: Store.hasSave() ? "Nouvelle partie" : "Commencer", style: Store.hasSave() ? "ghost" : "primary", onClick: newGame },
        { label: "Comment jouer", style: "ghost", onClick: showHelp }
      ]
    });
  }

  function showHelp() {
    UI.showOverlay({
      kicker: "Règles",
      title: "COMMENT JOUER",
      lines: [
        "<b>Appuyez sur une case libre</b> pour bâtir. Le panneau annonce ce que chaque bâtiment produirait <em>sur cette case précise</em> : une bûcheronnerie en pleine prairie ne rapporte rien.",
        "<b>Faites glisser</b> pour vous déplacer, les boutons + et − pour zoomer.",
        "<b>Nourrir avant d'agrandir.</b> Chaque habitant mange tous les jours ; le pain nourrit deux fois mieux que le grain, d'où le moulin.",
        "<b>La main-d'œuvre est limitée</b> : 60 % des habitants travaillent. Trop d'ateliers pour trop peu de monde, et tout tourne au ralenti.",
        "<b>Le marché vend le surplus</b> et l'or agrandit le territoire.",
        "Clavier : <b>Espace</b> pause · <b>V</b> vue d'ensemble · <b>S</b> vitesse · <b>Échap</b> fermer."
      ],
      buttons: [{ label: "Retour", onClick: showTitle }]
    });
  }

  function startState(state) {
    st = state;
    st.phase = "playing";
    st.speed = Store.get("speed") || 1;
    lastPhase = "playing";
    lastEvent = st.events.length;
    view = { hover: null, selected: null, previewType: null };
    Render.reset();
    Iso.setZoom(Iso.fitZoom(World.territory));
    Iso.centerOn(World.hall.c, World.hall.r);
    UI.closeSheet();
    UI.hideOverlay();
    Audio.unlock();
  }

  function newGame() {
    Store.clearSave();
    startState(Sim.create(Math.floor(Math.random() * 100000) + 1));
  }

  function resume() {
    var data = Store.get("save");
    var restored = data && Sim.restore(data);
    if (!restored) { newGame(); return; }
    startState(restored);
  }

  function showEnd(won) {
    UI.closeSheet();
    var score = C.score(st);
    var record = Store.finish(score, st.stats.peakPop);
    Store.clearSave();

    UI.showOverlay({
      kicker: won ? "Victoire" : "Fin de partie",
      title: won ? "VILLE PROSPÈRE" : "LE VILLAGE S'EST VIDÉ",
      lines: [
        "Score : <b>" + score.toLocaleString("fr-FR") + "</b>" + (record ? " — <em>nouveau record !</em>" : ""),
        st.stats.peakPop + " habitants au plus fort · " + st.buildings.length + " bâtiments · " + st.day + " jours",
        won
          ? "Le village est devenu une ville. Vous pouvez continuer à le faire grandir."
          : "Plus personne pour cultiver. Un village se nourrit avant de s'agrandir : un champ de plus vaut mieux qu'une maison de trop."
      ],
      buttons: [
        { label: won ? "Continuer" : "Réessayer", primary: true, onClick: won ? continueFree : newGame },
        { label: "Menu", style: "ghost", onClick: showTitle }
      ]
    });
  }

  /* Après la victoire, le village continue : rien n'oblige à s'arrêter au
     seuil de la ville. */
  function continueFree() {
    st.phase = "playing";
    lastPhase = "playing";
    C.WIN_POP = Infinity;
    UI.hideOverlay();
  }

  function togglePause() {
    if (st.phase === "playing") {
      st.phase = "paused";
      UI.showOverlay({
        kicker: "Partie en cours",
        title: "EN PAUSE",
        lines: ["Jour " + st.day + " · " + st.pop + " habitants · " + st.levelName],
        buttons: [
          { label: "Reprendre", primary: true, onClick: togglePause },
          { label: "Sauvegarder et quitter", style: "ghost", onClick: function () { save(); showTitle(); } }
        ]
      });
    } else if (st.phase === "paused") {
      st.phase = "playing";
      UI.hideOverlay();
    }
  }

  function save() {
    if (!st || (st.phase !== "playing" && st.phase !== "paused")) return;
    Store.set("save", Sim.snapshot(st));
  }

  /* ---- Entrées ----------------------------------------------------------- */

  var pointers = {};
  var drag = null;
  var pinch = null;

  function tileAtClient(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return Iso.toTile((clientX - rect.left) * Iso.dpr, (clientY - rect.top) * Iso.dpr);
  }

  function onTap(clientX, clientY) {
    if (st.phase !== "playing") return;
    var cell = tileAtClient(clientX, clientY);
    view.previewType = null;

    if (!World.inBounds(cell.c, cell.r)) { deselect(); return; }

    var b = Sim.at(st, cell.c, cell.r);
    if (b) {
      view.selected = { c: b.c, r: b.r };
      UI.showBuilding(st, b);
      return;
    }

    if (World.canBuild(cell.c, cell.r)) {
      view.selected = { c: cell.c, r: cell.r };
      UI.showBuild(st, cell.c, cell.r);
    } else {
      deselect();
      if (World.inBounds(cell.c, cell.r) && !World.inTerritory(cell.c, cell.r)) {
        UI.toast("Hors du territoire — agrandissez-le depuis « Le village »");
      }
    }
  }

  function deselect() {
    view.selected = null;
    view.previewType = null;
    UI.closeSheet();
  }

  function bindInput() {
    canvas.addEventListener("pointerdown", function (e) {
      Audio.unlock();
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        /* Deux doigts : on passe en pincement, et on abandonne le
           déplacement en cours pour que la carte ne parte pas de travers. */
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        drag = null;
      } else {
        drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
      }
    });

    canvas.addEventListener("pointermove", function (e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }

      /* Survol à la souris : la case sous le curseur s'éclaire. Au doigt, il
         n'y a pas de survol — c'est la sélection qui fait foi. */
      if (e.pointerType === "mouse" && !drag) {
        view.hover = tileAtClient(e.clientX, e.clientY);
      }

      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > pinch.dist * 1.35) { Iso.zoomBy(1); pinch.dist = dist; }
        else if (dist < pinch.dist * 0.75) { Iso.zoomBy(-1); pinch.dist = dist; }
        return;
      }

      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) drag.moved = true;
      if (drag.moved) {
        Iso.pan(dx * Iso.dpr, dy * Iso.dpr);
        view.hover = tileAtClient(e.clientX, e.clientY);
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    });

    function endPointer(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (drag && !drag.moved) onTap(e.clientX, e.clientY);
      drag = null;
    }

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", function (e) { delete pointers[e.pointerId]; drag = null; pinch = null; });

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      Iso.zoomBy(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    canvas.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });

    document.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); if (st.phase === "playing" || st.phase === "paused") togglePause(); return; }
      if (k === "escape") { deselect(); return; }
      if (st.phase !== "playing") return;
      if (k === "v") handlers.onVillage();
      else if (k === "s") handlers.onSpeed();
      else if (k === "+" || k === "=") Iso.zoomBy(1);
      else if (k === "-") Iso.zoomBy(-1);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { save(); if (st.phase === "playing") togglePause(); }
    });
    window.addEventListener("pagehide", save);
  }

  var handlers = {
    onBuild: function (type) {
      if (!view.selected) return;
      var d = Sim.def(type);
      if (!Sim.unlocked(st, type)) { UI.toast("Débloqué à " + d.unlock + " habitants"); Audio.play("deny"); return; }
      if (!Sim.canAfford(st, d.cost)) { UI.toast("Matériaux insuffisants"); Audio.play("deny"); return; }

      var b = Sim.place(st, type, view.selected.c, view.selected.r);
      if (!b) { UI.toast("Impossible ici"); Audio.play("deny"); return; }
      Audio.play("build");
      view.previewType = null;
      UI.closeSheet();
      view.selected = null;
      save();
    },
    onPreview: function (type) { view.previewType = type; },
    onDemolish: function (b) {
      if (Sim.demolish(st, b)) {
        Audio.play("demolish");
        deselect();
        save();
      }
    },
    onExpand: function () {
      if (Sim.expand(st)) { Audio.play("coin"); UI.refreshOverview(st); save(); }
      else { UI.toast("Pas assez d'or"); Audio.play("deny"); }
    },
    onVillage: function () {
      if (UI.isOpen()) { deselect(); return; }
      view.selected = null;
      UI.showOverview(st);
    },
    onCloseSheet: deselect,
    onSpeed: function () {
      var i = C.SPEEDS.indexOf(st.speed);
      st.speed = C.SPEEDS[(i + 1) % C.SPEEDS.length];
      Store.set("speed", st.speed);
    },
    onPause: function () { if (st.phase === "playing" || st.phase === "paused") togglePause(); },
    onSound: function () {
      var on = !Audio.isEnabled();
      Audio.setEnabled(on);
      Store.set("sound", on);
      if (on) Audio.play("build");
    },
    onZoom: function (step) { Iso.zoomBy(step); },
    onCenter: function () { Iso.centerOn(World.hall.c, World.hall.r); }
  };

  /* ---- Boucle ------------------------------------------------------------- */

  function frame(now) {
    requestAnimationFrame(frame);

    var dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    if (dt > 0.05) dt = 0.05;   // onglet en arrière-plan : on ne rattrape pas

    if (st.phase === "playing") {
      Sim.update(st, dt * st.speed);
      Render.life(st, dt * st.speed);

      /* Messages du village : famine, palier franchi, territoire agrandi. */
      while (lastEvent < st.events.length) {
        var ev = st.events[lastEvent++];
        UI.toast(ev.text);
        if (ev.text.indexOf("Famine") === 0) Audio.play("famine", 500);
        else Audio.play("level", 500);
      }

      saveTimer += dt;
      if (saveTimer > 5) { saveTimer = 0; save(); }
    }

    if (ctx) Render.frame(ctx, st, now, view);
    UI.sync(st);

    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      if (st.phase === "won") { Audio.play("win", 0); showEnd(true); }
      if (st.phase === "over") { Audio.play("lose", 0); showEnd(false); }
    }
  }

  /* ---- Démarrage ---------------------------------------------------------- */

  function resize() {
    ctx = Iso.resize(canvas, UI.mapHost());
  }

  function boot() {
    var problems = V.Art.validate();
    if (problems.length) console.warn("Sprites incohérents :\n" + problems.join("\n"));

    Audio.setEnabled(Store.get("sound") !== false);
    UI.init(handlers);

    st = Sim.create(1);
    resize();
    Iso.setZoom(Iso.fitZoom(World.territory));
    Iso.centerOn(World.hall.c, World.hall.r);
    bindInput();

    if (window.ResizeObserver) new ResizeObserver(resize).observe(UI.mapHost());
    else window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", function () { setTimeout(resize, 200); });

    showTitle();
    requestAnimationFrame(frame);

    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* sans importance */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* Passerelle de mise au point, depuis la console du navigateur :
     V.debug.state(), V.debug.give(500), V.debug.pop(60). */
  V.debug = {
    state: function () { return st; },
    give: function (n) {
      n = n || 500;
      st.res.wood += n; st.res.stone += n; st.res.grain += n; st.res.gold += n;
    },
    pop: function (n) { st.pop = n || 50; },
    day: function (n) { st.t = (n || 10) * C.DAY; }
  };
})(window.V);
