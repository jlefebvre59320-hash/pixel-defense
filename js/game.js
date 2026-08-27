/* Pixel Defense — la simulation.
   Aucune référence au DOM ni au canvas ici : l'état du jeu avance tout seul,
   à partir d'un temps écoulé. C'est ce qui rend le mode accéléré (×2, ×3)
   gratuit — on appelle simplement update() avec un dt multiplié — et ce qui
   permettrait de rejouer une partie ailleurs sans rien changer. */
(function (PD) {
  "use strict";

  var C = PD.CONFIG;
  var MAP = PD.MAP;
  var A = PD.Audio;

  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

  var Game = {
    create: function () {
      var st = {
        phase: "title",       // title | playing | paused | over | won
        gold: C.START_GOLD,
        lives: C.START_LIVES,
        score: 0,
        wave: 0,              // vagues lancées
        waves: C.WAVES.length,
        waveActive: false,
        breakLeft: null,      // null = pas de décompte (avant la 1re vague)
        clock: 0,             // temps depuis le début de la vague
        time: 0,              // temps de jeu total
        speed: 1,
        enemies: [],
        towers: [],
        shots: [],
        fx: [],
        floats: [],
        spawnQueue: [],
        selected: null,
        preview: null,
        stats: { kills: 0, leaks: 0, built: 0 },
        newRecord: false,
        nextId: 1
      };
      return st;
    },

    /* ---- Construction et gestion des tours ----------------------------- */

    towerAt: function (st, c, r) {
      for (var i = 0; i < st.towers.length; i++) {
        if (st.towers[i].c === c && st.towers[i].r === r) return st.towers[i];
      }
      return null;
    },

    canBuild: function (st, c, r, type) {
      if (!MAP.isBuildable(c, r)) return false;
      if (Game.towerAt(st, c, r)) return false;
      return st.gold >= C.TOWERS[type].cost;
    },

    build: function (st, c, r, type) {
      var def = C.TOWERS[type];
      if (!def || !Game.canBuild(st, c, r, type)) { A.play("deny"); return false; }
      st.gold -= def.cost;
      st.towers.push({
        id: st.nextId++,
        c: c, r: r,
        x: c + 0.5, y: r + 0.5,
        type: type,
        level: 1,
        invested: def.cost,
        cool: 0,
        angle: -Math.PI / 2,
        flash: 0,
        kills: 0
      });
      st.stats.built++;
      A.play("build");
      return true;
    },

    nextLevel: function (t) {
      return C.TOWERS[t.type].levels[t.level] || null;
    },

    upgrade: function (st, t) {
      var lv = Game.nextLevel(t);
      if (!lv || st.gold < lv.cost) { A.play("deny"); return false; }
      st.gold -= lv.cost;
      t.invested += lv.cost;
      t.level++;
      A.play("upgrade");
      return true;
    },

    sellValue: function (t) { return Math.floor(t.invested * 0.6); },

    sell: function (st, t) {
      var i = st.towers.indexOf(t);
      if (i < 0) return false;
      st.gold += Game.sellValue(t);
      st.towers.splice(i, 1);
      A.play("sell");
      return true;
    },

    stats: function (t) {
      var def = C.TOWERS[t.type];
      return def.levels[t.level - 1];
    },

    /* ---- Vagues --------------------------------------------------------- */

    /* Appel anticipé : le temps de répit non consommé est converti en or.
       Sans ça, la vitesse de jeu n'a aucun intérêt stratégique. */
    callWave: function (st) {
      if (st.waveActive || st.phase !== "playing" || st.wave >= st.waves) return 0;
      var bonus = st.breakLeft === null ? 0 : Math.floor(st.breakLeft) * C.EARLY_GOLD_PER_SEC;
      if (bonus > 0) {
        st.gold += bonus;
        Game.float(st, MAP.CORE_POINT.x, MAP.CORE_POINT.y - 1, "+" + bonus, "#ffd84d");
      }
      Game.startWave(st);
      return bonus;
    },

    earlyBonus: function (st) {
      return st.breakLeft === null ? 0 : Math.floor(st.breakLeft) * C.EARLY_GOLD_PER_SEC;
    },

    startWave: function (st) {
      st.wave++;
      st.waveActive = true;
      st.clock = 0;
      st.breakLeft = null;

      var groups = C.WAVES[st.wave - 1] || [];
      var hpMul = 1 + (st.wave - 1) * C.HP_RAMP;
      var queue = [];
      var boss = false;

      groups.forEach(function (g) {
        var def = C.ENEMIES[g.t];
        if (def.boss) boss = true;
        for (var i = 0; i < g.n; i++) {
          queue.push({
            type: g.t,
            at: (g.at || 0) + i * g.gap,
            hp: Math.round(def.hp * hpMul)
          });
        }
      });

      queue.sort(function (a, b) { return a.at - b.at; });
      st.spawnQueue = queue;
      A.play(boss ? "boss" : "wave", 0);
    },

    /* ---- Ennemis -------------------------------------------------------- */

    spawn: function (st, type, hp) {
      var def = C.ENEMIES[type];
      var path;

      if (def.fly) {
        /* Les harpies ignorent le chemin : elles entrent par un point au hasard
           en haut de l'écran et filent droit sur la forteresse. Une défense massée
           le long du chemin ne les arrête pas — c'est tout l'intérêt. */
        var x = 1 + Math.random() * (C.COLS - 2);
        path = [{ x: x, y: -1 }, { x: MAP.CORE_POINT.x, y: MAP.CORE_POINT.y }];
      } else {
        path = MAP.WAYPOINTS;
      }

      var total = 0;
      for (var i = 0; i < path.length - 1; i++) {
        total += dist(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
      }

      st.enemies.push({
        id: st.nextId++,
        def: def,
        path: path,
        wp: 1,                        // point de passage visé
        x: path[0].x, y: path[0].y,
        rawX: path[0].x, rawY: path[0].y,   // position sur le chemin, sans décalage latéral
        hp: hp, maxHp: hp,
        traveled: 0,
        total: total,
        progress: 0,
        off: (Math.random() - 0.5) * 0.34,  // décalage latéral : la file ne se superpose pas
        slowUntil: -1,
        slowFactor: 1,
        flash: 0,
        clock: 0
      });
    },

    moveEnemy: function (st, e, dt) {
      var slowed = e.slowUntil > st.time;
      var speed = e.def.speed * (slowed ? e.slowFactor : 1);
      var left = speed * dt;

      /* Avance le long des segments : un pas de temps peut en traverser
         plusieurs d'un coup en vitesse ×3, il faut donc boucler. */
      while (left > 0 && e.wp < e.path.length) {
        var target = e.path[e.wp];
        var d = dist(e.rawX, e.rawY, target.x, target.y);

        if (d <= left) {
          left -= d;
          e.rawX = target.x;
          e.rawY = target.y;
          e.traveled += d;
          e.wp++;
        } else {
          var k = left / d;
          e.rawX += (target.x - e.rawX) * k;
          e.rawY += (target.y - e.rawY) * k;
          e.traveled += left;
          left = 0;
        }
      }

      e.progress = e.total > 0 ? e.traveled / e.total : 1;

      /* Décalage latéral appliqué à l'affichage et aux tirs : les ennemis
         d'une même file ne se marchent pas dessus. */
      var seg = Math.min(e.wp, e.path.length - 1);
      var a = e.path[Math.max(0, seg - 1)], b = e.path[seg];
      var vx = b.x - a.x, vy = b.y - a.y;
      var len = Math.hypot(vx, vy) || 1;
      e.x = e.rawX + (-vy / len) * e.off;
      e.y = e.rawY + (vx / len) * e.off;

      return e.wp >= e.path.length;   // arrivé à la forteresse
    },

    damage: function (st, e, amount, ignoreArmor) {
      if (e.dead) return;
      var d = ignoreArmor ? amount : Math.max(1, amount - e.def.armor);
      e.hp -= d;
      e.flash = 0.1;
      if (e.hp <= 0) {
        e.dead = true;
        st.gold += e.def.reward;
        st.score += e.def.reward * C.KILL_SCORE;
        st.stats.kills++;
        Game.float(st, e.x, e.y, "+" + e.def.reward, "#ffd84d");
        Game.puff(st, e.x, e.y, e.def.boss ? 14 : 6);
        A.play("kill", 60);
      } else {
        A.play("hit", 90);
      }
    },

    /* ---- Effets --------------------------------------------------------- */

    float: function (st, x, y, text, color) {
      st.floats.push({ x: x, y: y, text: text, color: color, life: 1, max: 1 });
    },

    puff: function (st, x, y, n) {
      for (var i = 0; i < n; i++) {
        st.fx.push({
          kind: "puff",
          x: x + (Math.random() - 0.5) * 0.5,
          y: y + (Math.random() - 0.5) * 0.5,
          color: Math.random() > 0.5 ? "#eef1f7" : "#8a93a8",
          life: 0.4, max: 0.4
        });
      }
    },

    /* ---- Tours : visée et tir ------------------------------------------- */

    pickTarget: function (st, t, range) {
      var best = null, bestProgress = -1;
      for (var i = 0; i < st.enemies.length; i++) {
        var e = st.enemies[i];
        if (e.dead) continue;
        if (dist(t.x, t.y, e.x, e.y) > range + e.def.size) continue;
        /* On vise toujours l'ennemi le plus avancé : c'est celui qui coûte
           des vies dans deux secondes. */
        if (e.progress > bestProgress) { bestProgress = e.progress; best = e; }
      }
      return best;
    },

    fire: function (st, t, target) {
      var def = C.TOWERS[t.type];
      var lv = Game.stats(t);
      t.flash = 0.1;

      if (def.kind === "beam") {
        /* Éclair : pas de projectile, le coup part et touche dans la trame.
           Les deux coudes sont tirés une fois et figés — un éclair qui
           tremble à chaque image donne le mal de mer. */
        var mx = (t.x + target.x) / 2 + (Math.random() - 0.5) * 0.6;
        var my = (t.y + target.y) / 2 + (Math.random() - 0.5) * 0.6;
        st.fx.push({
          kind: "beam", x1: t.x, y1: t.y, mx: mx, my: my,
          x2: target.x, y2: target.y, life: 0.12, max: 0.12
        });
        Game.damage(st, target, lv.dmg, true);
        A.play("zap", 70);
        return;
      }

      st.shots.push({
        x: t.x, y: t.y,
        target: target,
        tx: target.x, ty: target.y,
        speed: def.shotSpeed,
        dmg: lv.dmg,
        kind: def.kind,
        splash: def.splash || 0,
        slow: def.slow || 0,
        slowFor: def.slowFor || 0,
        ignoreArmor: !!def.ignoreArmor
      });

      A.play(def.kind === "splash" ? "cannon" : def.kind === "slow" ? "frost" : "shoot", 55);
    },

    impact: function (st, s) {
      if (s.splash > 0) {
        st.fx.push({ kind: "boom", x: s.tx, y: s.ty, r: s.splash, life: 0.32, max: 0.32 });
        A.play("boom", 80);
        for (var i = 0; i < st.enemies.length; i++) {
          var e = st.enemies[i];
          if (e.dead) continue;
          if (dist(s.tx, s.ty, e.x, e.y) <= s.splash + e.def.size) {
            Game.damage(st, e, s.dmg, s.ignoreArmor);
          }
        }
        return;
      }

      var target = s.target;
      if (!target || target.dead) return;   // la cible est morte en vol : le tir se perd
      Game.damage(st, target, s.dmg, s.ignoreArmor);
      if (s.slow > 0) {
        target.slowUntil = st.time + s.slowFor;
        target.slowFactor = 1 - s.slow;
      }
    },

    /* ---- Boucle --------------------------------------------------------- */

    update: function (st, dt) {
      if (st.phase !== "playing") return;

      st.time += dt;

      /* Décompte avant la vague suivante */
      if (!st.waveActive && st.breakLeft !== null) {
        st.breakLeft -= dt;
        if (st.breakLeft <= 0) Game.startWave(st);
      }

      /* Apparitions */
      if (st.waveActive) {
        st.clock += dt;
        while (st.spawnQueue.length && st.spawnQueue[0].at <= st.clock) {
          var next = st.spawnQueue.shift();
          Game.spawn(st, next.type, next.hp);
        }
      }

      /* Ennemis */
      var arrived = [];
      st.enemies.forEach(function (e) {
        e.clock = st.time;
        if (e.flash > 0) e.flash -= dt;
        if (e.dead) return;
        if (Game.moveEnemy(st, e, dt)) arrived.push(e);
      });

      arrived.forEach(function (e) {
        e.dead = true;
        st.lives -= e.def.leak;
        st.stats.leaks++;
        Game.float(st, MAP.CORE_POINT.x, MAP.CORE_POINT.y - 0.8, "-" + e.def.leak, "#e5484d");
        Game.puff(st, e.x, e.y, 8);
        A.play("leak", 120);
      });

      st.enemies = st.enemies.filter(function (e) { return !e.dead; });

      /* Tours */
      st.towers.forEach(function (t) {
        if (t.flash > 0) t.flash -= dt;
        var lv = Game.stats(t);
        t.cool -= dt;
        var target = Game.pickTarget(st, t, lv.range);
        if (!target) return;
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        if (t.cool <= 0) {
          Game.fire(st, t, target);
          t.cool = 1 / lv.rate;
        }
      });

      /* Projectiles */
      st.shots = st.shots.filter(function (s) {
        if (s.target && !s.target.dead) { s.tx = s.target.x; s.ty = s.target.y; }
        var d = dist(s.x, s.y, s.tx, s.ty);
        var step = s.speed * dt;
        if (d <= step || d < 0.05) {
          s.x = s.tx; s.y = s.ty;
          Game.impact(st, s);
          return false;
        }
        s.x += (s.tx - s.x) / d * step;
        s.y += (s.ty - s.y) / d * step;
        return true;
      });

      /* Effets et textes */
      st.fx = st.fx.filter(function (f) { f.life -= dt; return f.life > 0; });
      st.floats = st.floats.filter(function (f) { f.life -= dt; return f.life > 0; });

      /* Fin de vague */
      if (st.waveActive && st.spawnQueue.length === 0 && st.enemies.length === 0) {
        st.waveActive = false;
        st.score += C.WAVE_SCORE;
        var bonus = C.waveBonus(st.wave);
        st.gold += bonus;
        Game.float(st, MAP.CORE_POINT.x, MAP.CORE_POINT.y - 1.2, "+" + bonus, "#ffd84d");

        if (st.wave >= st.waves) {
          Game.finish(st, true);
          return;
        }
        st.breakLeft = C.WAVE_BREAK;
      }

      if (st.lives <= 0) {
        st.lives = 0;
        Game.finish(st, false);
      }
    },

    finish: function (st, won) {
      st.phase = won ? "won" : "over";
      if (won) st.score += st.lives * C.LIFE_SCORE + st.gold;
      st.newRecord = PD.Store.finish(st.score, st.wave, won);
      A.play(won ? "win" : "lose", 0);
    }
  };

  PD.Game = Game;
})(window.PD);
