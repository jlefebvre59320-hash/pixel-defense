/* Simulateur d'équilibrage — joue des parties entières, sans navigateur.
   Le moteur (config, map, storage, audio, game) ne touche ni au DOM ni au
   canvas : on peut donc le charger dans Node et faire jouer un robot mille
   fois plus vite que le temps réel. C'est ce qui permet de régler les vagues
   sans passer trois heures manette en main.

     node tools/simulate.mjs

   Trois profils sont joués : « novice » (des tourelles au hasard, jamais
   d'amélioration), « correct » (composition variée, améliorations), et
   « bourrin » (remplit la carte). Un bon réglage se lit ainsi : le novice
   tombe avant la fin, le joueur correct gagne en gardant des vies. */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "js");

global.window = { PD: {} };
global.performance = { now: () => 0 };

["config", "map", "storage", "audio", "game"].forEach((m) => require(join(JS, m + ".js")));

const PD = global.window.PD;
const { CONFIG: C, MAP, Game: G } = PD;

/* Emplacements classés par nombre de cases de chemin couvertes : c'est le
   choix qu'un joueur correct fait d'instinct. */
function rankedSpots(range) {
  const out = [];
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < C.COLS; c++) {
      if (!MAP.isBuildable(c, r)) continue;
      let cover = 0;
      for (let rr = 0; rr < C.ROWS; rr++) {
        for (let cc = 0; cc < C.COLS; cc++) {
          if (MAP.isPath(cc, rr) && Math.hypot(cc - c, rr - r) <= range) cover++;
        }
      }
      out.push({ c, r, cover });
    }
  }
  return out.sort((a, b) => b.cover - a.cover);
}

const SPOTS = rankedSpots(2.8);
const free = (st) => SPOTS.filter((s) => !G.towerAt(st, s.c, s.r));
const count = (st, type) => st.towers.filter((t) => t.type === type).length;

const PROFILES = {
  novice(st) {
    if (st.gold < C.TOWERS.gun.cost) return;
    const spots = free(st);
    const pick = spots[Math.floor(Math.random() * Math.min(spots.length, 25))];
    if (pick) G.build(st, pick.c, pick.r, "gun");
  },

  correct(st) {
    const spots = free(st);
    if (!spots.length) return;
    const best = spots[0];
    if (st.gold >= 130 && count(st, "tesla") < 3) return void G.build(st, best.c, best.r, "tesla");
    if (st.gold >= 80 && count(st, "cannon") < 4) return void G.build(st, best.c, best.r, "cannon");
    if (st.gold >= 60 && count(st, "frost") < 3) return void G.build(st, best.c, best.r, "frost");
    if (st.gold >= 40 && st.towers.length < 14) return void G.build(st, best.c, best.r, "gun");

    const up = st.towers.filter((t) => G.nextLevel(t)).sort((a, b) => a.level - b.level)[0];
    if (up && st.gold >= G.nextLevel(up).cost + 60) G.upgrade(st, up);
  },

  bourrin(st) {
    const spots = free(st);
    if (spots.length && st.gold >= 40) G.build(st, spots[0].c, spots[0].r, "gun");
  }
};

function play(strategy) {
  const st = G.create();
  st.phase = "playing";
  const dt = 1 / 60;
  let guard = 0;

  while (st.phase === "playing" && guard < 60 * 60 * 40) {
    guard++;
    strategy(st);
    if (!st.waveActive) G.callWave(st);   // le robot enchaîne les vagues sans attendre
    G.update(st, dt);
  }

  return {
    issue: st.phase === "won" ? "gagné" : "perdu",
    vague: st.wave,
    vies: st.lives,
    score: Math.floor(st.score),
    tours: st.towers.length,
    "or restant": Math.floor(st.gold),
    "durée (min)": +(st.time / 60).toFixed(1)
  };
}

const RUNS = Number(process.argv[2] || 3);
for (const [name, fn] of Object.entries(PROFILES)) {
  for (let i = 0; i < RUNS; i++) {
    console.log(name.padEnd(8), JSON.stringify(play(fn)));
  }
}
