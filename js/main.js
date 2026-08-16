/* Pixel Defense — assemblage : boucle, entrées, écrans.
   C'est le seul fichier qui connaît à la fois le jeu, le rendu et l'interface ;
   les autres restent indépendants les uns des autres. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var MAP = PD.MAP;
  var G = PD.Game;
  var R = PD.Render;
  var UI = PD.UI;
  var A = PD.Audio;
  var Store = PD.Store;

  var canvas = document.getElementById("board");
  var ctx = null;
  var st = G.create();
  var lastPhase = null;
  var lastT = 0;

  /* ---- Écrans ----------------------------------------------------------- */

  function bestLine() {
    var best = Store.get("best");
    if (!best) return "Aucune partie jouée pour l'instant.";
    return "Record : <b>" + best.toLocaleString("fr-FR") + "</b> points · vague " + Store.get("bestWave");
  }

  function showTitle() {
    st.phase = "title";
    UI.closeSheet(st);
    UI.showOverlay({
      kicker: "Tower defense de poche",
      title: "Pixel Defense",
      lines: [
        "20 vagues, 4 tours, une base à défendre.",
        bestLine()
      ],
      buttons: [
        { label: "Jouer", onClick: newGame },
        { label: "Comment jouer", style: "ghost", onClick: showHelp }
      ]
    });
  }

  function showHelp() {
    UI.showOverlay({
      kicker: "Règles",
      title: "Comment jouer",
      lines: [
        "<b>Appuyez sur une case d'herbe</b> pour bâtir une tour, sur une tour pour l'améliorer ou la revendre (60 % du prix payé).",
        "<b>Les ennemis suivent le chemin</b> jusqu'à votre base — sauf les <b>drones</b>, qui volent tout droit : ne massez pas tout le long du chemin.",
        "<b>Les Blindés</b> encaissent 4 dégâts sur chaque coup : les tirs rapides ne leur font presque rien, la <b>Tesla</b> les traverse.",
        "<b>Appelez la vague en avance</b> : chaque seconde gagnée rapporte 3 ◈.",
        "Clavier : <b>Espace</b> pause · <b>N</b> vague suivante · <b>1-4</b> construire · <b>S</b> vitesse."
      ],
      buttons: [{ label: "Retour", onClick: showTitle }]
    });
  }

  function newGame() {
    st = G.create();
    st.phase = "playing";
    st.speed = Store.get("speed") || 1;
    lastPhase = "playing";
    UI.closeSheet(st);
    UI.hideOverlay();
    A.unlock();
  }

  function showEnd(won) {
    UI.closeSheet(st);
    var lines = [
      "Score : <b>" + Math.floor(st.score).toLocaleString("fr-FR") + "</b>" + (st.newRecord ? " — <em>nouveau record !</em>" : ""),
      "Vague " + st.wave + "/" + st.waves + " · " + st.stats.kills + " ennemis abattus · " + st.stats.built + " tours bâties"
    ];
    if (!won) lines.push("La base est tombée. Les drones passent par-dessus le chemin — pensez-y au prochain essai.");
    else lines.push("Base intacte&nbsp;: " + st.lives + " vies sauvées, " + Math.floor(st.gold) + " ◈ non dépensés.");

    UI.showOverlay({
      kicker: won ? "Victoire" : "Défaite",
      title: won ? "Base tenue !" : "Base détruite",
      lines: lines,
      buttons: [
        { label: "Rejouer", onClick: newGame },
        { label: "Menu", style: "ghost", onClick: showTitle }
      ]
    });
  }

  function togglePause(force) {
    if (st.phase === "playing" && force !== false) {
      st.phase = "paused";
      UI.showOverlay({
        kicker: "Partie en cours",
        title: "En pause",
        lines: ["Vague " + st.wave + "/" + st.waves + " · " + st.lives + " vies · " + Math.floor(st.gold) + " ◈"],
        buttons: [
          { label: "Reprendre", onClick: function () { togglePause(false); } },
          { label: "Abandonner", style: "ghost", onClick: showTitle }
        ]
      });
    } else if (st.phase === "paused") {
      st.phase = "playing";
      UI.hideOverlay();
    }
  }

  /* ---- Entrées ---------------------------------------------------------- */

  function onTap(clientX, clientY) {
    if (st.phase !== "playing") return;
    var rect = canvas.getBoundingClientRect();
    var t = R.tileAt(clientX - rect.left, clientY - rect.top);

    if (!MAP.inside(t.c, t.r)) { UI.closeSheet(st); return; }

    var tower = G.towerAt(st, t.c, t.r);
    if (tower) { UI.showTower(st, tower); return; }

    if (MAP.isBuildable(t.c, t.r)) {
      UI.showBuild(st, t.c, t.r);
    } else {
      UI.closeSheet(st);
    }
  }

  function bindInput() {
    canvas.addEventListener("pointerdown", function (e) {
      A.unlock();
      e.preventDefault();
      onTap(e.clientX, e.clientY);
    });

    /* Le canvas ne doit jamais faire défiler la page ni déclencher le zoom :
       un jeu qui bouge sous le doigt est injouable sur téléphone. */
    canvas.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    document.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();

      if (k === " " || k === "spacebar") { e.preventDefault(); if (st.phase === "playing" || st.phase === "paused") togglePause(); return; }
      if (k === "escape") { UI.closeSheet(st); return; }
      if (st.phase !== "playing") return;
      if (k === "n") { handlers.onWave(); return; }
      if (k === "s") { handlers.onSpeed(); return; }

      var n = parseInt(k, 10);
      if (n >= 1 && n <= C.TOWER_ORDER.length && st.selected && !st.selected.tower) {
        handlers.onBuild(C.TOWER_ORDER[n - 1]);
        UI.closeSheet(st);
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && st.phase === "playing") togglePause(true);
    });
  }

  var handlers = {
    onBuild: function (type) {
      if (!st.selected || st.selected.tower) return false;
      var ok = G.build(st, st.selected.c, st.selected.r, type);
      if (!ok) UI.toast(st.gold < C.TOWERS[type].cost ? "Pas assez d'or" : "Impossible ici");
      return ok;
    },
    onUpgrade: function (t) {
      var ok = G.upgrade(st, t);
      if (!ok) UI.toast("Pas assez d'or");
      return ok;
    },
    onSell: function (t) { G.sell(st, t); },
    onWave: function () {
      if (st.phase !== "playing" || st.waveActive) return;
      var bonus = G.callWave(st);
      UI.toast("Vague " + st.wave + (bonus ? " · +" + bonus + " ◈" : ""));
    },
    onSpeed: function () {
      var i = C.SPEEDS.indexOf(st.speed);
      st.speed = C.SPEEDS[(i + 1) % C.SPEEDS.length];
      Store.set("speed", st.speed);
    },
    onSound: function () {
      var on = !A.isEnabled();
      A.setEnabled(on);
      Store.set("sound", on);
      if (on) { A.unlock(); A.play("build"); }
    },
    onPause: function () {
      if (st.phase === "playing" || st.phase === "paused") togglePause();
    }
  };

  /* ---- Boucle ----------------------------------------------------------- */

  function frame(now) {
    requestAnimationFrame(frame);

    var dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    /* Un onglet en arrière-plan rend des écarts d'une seconde ou plus :
       on plafonne, sinon la vague traverse la carte pendant qu'on regarde
       ailleurs. */
    if (dt > 0.05) dt = 0.05;

    if (st.phase === "playing") {
      /* En vitesse ×3, un seul grand pas ferait sauter des collisions :
         on découpe en tranches d'au plus 20 ms de temps de jeu. */
      var total = dt * st.speed;
      var steps = Math.max(1, Math.ceil(total / 0.02));
      for (var i = 0; i < steps; i++) G.update(st, total / steps);
    }

    if (ctx) R.draw(ctx, st, now);
    UI.sync(st);

    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      if (st.phase === "over") showEnd(false);
      if (st.phase === "won") showEnd(true);
    }
  }

  /* ---- Démarrage --------------------------------------------------------- */

  function resize() {
    ctx = R.resize(canvas, UI.stage());
  }

  function boot() {
    var bad = PD.Sprites.validate();
    if (bad.length) console.warn("Sprites incohérents :\n" + bad.join("\n"));

    A.setEnabled(Store.get("sound") !== false);
    UI.init(handlers);
    resize();
    bindInput();

    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(UI.stage());
    } else {
      window.addEventListener("resize", resize);
    }
    window.addEventListener("orientationchange", function () { setTimeout(resize, 200); });

    showTitle();
    requestAnimationFrame(frame);

    /* Hors ligne : le service worker n'existe qu'en http(s). Ouvrir le jeu
       directement depuis un fichier local marche aussi, sans mise en cache. */
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* sans importance */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Passerelle de mise au point : depuis la console du navigateur,
     PD.debug.state() donne la partie en cours, PD.debug.give(500) de l'or.
     Rien de tout cela n'est branché sur l'interface. */
  PD.debug = {
    state: function () { return st; },
    give: function (n) { st.gold += n || 500; },
    wave: function (n) { st.wave = Math.max(0, (n || 1) - 1); st.waveActive = false; st.breakLeft = null; }
  };
})(window.PD);
