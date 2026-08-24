/* Simulateur d'équilibrage — fait jouer des villages entiers sans navigateur.
   Le moteur (config, world, sim) ne touche ni au DOM ni au canvas : on peut
   donc le charger dans Node et régler l'économie en quelques secondes plutôt
   qu'en quelques soirées.

     node tools/simulate.mjs [nombre de parties]

   Trois profils, qui décrivent trois façons de jouer réelles :
   — « novice » bâtit des maisons et oublie de nourrir : famine avant J20 ;
   — « prudent » équilibre bois, vivres et logements : la ville vers J110 ;
   — « gourmand » entasse les champs pour ne jamais manquer, et n'a plus de
     bois pour loger qui que ce soit : le village stagne à une trentaine
     d'habitants. C'est un vrai piège du jeu, pas un défaut du robot — et
     c'est le genre de chose qu'on ne voit qu'en simulant. */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "js");

global.window = { V: {} };
global.performance = { now: () => 0 };

["config", "world", "sim"].forEach((m) => require(join(JS, m + ".js")));

const V = global.window.V;
const { CONFIG: C, World, Sim } = V;

const STEP = 1 / 30;             // pas de simulation, en secondes de jeu
const MAX_DAYS = 600;

/* Meilleur emplacement libre pour un métier donné, selon la qualité du
   terrain. C'est exactement ce qu'un joueur attentif cherche des yeux. */
function bestSpot(kind) {
  let best = null;
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < C.COLS; c++) {
      if (!World.canBuild(c, r)) continue;
      const q = World.quality(kind, c, r);
      if (!best || q > best.q) best = { c, r, q };
    }
  }
  return best;
}

function anySpot() {
  const spots = [];
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < C.COLS; c++) if (World.canBuild(c, r)) spots.push({ c, r });
  }
  return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
}

function countFree() {
  let n = 0;
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < C.COLS; c++) if (World.canBuild(c, r)) n++;
  }
  return n;
}

function count(st, type) {
  return st.buildings.filter((b) => b.type === type).length;
}

/* Jours de vivres en réserve : la seule jauge qui compte vraiment. */
function daysOfFood(st) {
  return Sim.food(st) / Math.max(0.001, st.pop * C.FOOD_PER_POP);
}

const PROFILES = {
  /* Bâtit des maisons parce que la population monte, et oublie de nourrir. */
  novice(st) {
    if (st.res.wood < 45) return;
    const spot = anySpot();
    if (!spot) return;
    const type = Math.random() < 0.75 ? "house" : "field";
    Sim.place(st, type, spot.c, spot.r);
  },

  /* Nourrit d'abord, loge ensuite, transforme dès que possible. */
  prudent(st) {
    const housing = Sim.housing(st);

    /* Le bois avant tout : c'est la ressource qui achète toutes les autres,
       et un village sans bûcheronnerie vit sur ses réserves. */
    if (count(st, "lumber") === 0 && st.res.wood >= 35) {
      const s = bestSpot("wood");
      if (s && s.q > 0.3) return void Sim.place(st, "lumber", s.c, s.r);
    }
    if (daysOfFood(st) < 6 && st.res.wood >= 25) {
      const s = bestSpot("grain");
      if (s) return void Sim.place(st, "field", s.c, s.r);
    }
    if (st.res.wood < 60 && count(st, "lumber") < 4 && st.res.wood >= 35) {
      const s = bestSpot("wood");
      if (s && s.q > 0.3) return void Sim.place(st, "lumber", s.c, s.r);
    }
    if (housing - st.pop < 3 && st.res.wood >= 45) {
      const s = anySpot();
      if (s) return void Sim.place(st, "house", s.c, s.r);
    }
    if (st.pop >= 10 && count(st, "quarry") < 2 && st.res.wood >= 60) {
      const s = bestSpot("stone");
      if (s && s.q > 0.3) return void Sim.place(st, "quarry", s.c, s.r);
    }
    if (st.pop >= 15 && count(st, "store") < 2 && Sim.canAfford(st, C.BUILDINGS.store.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "store", s.c, s.r);
    }
    if (st.pop >= 20 && count(st, "mill") < 3 && Sim.canAfford(st, C.BUILDINGS.mill.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "mill", s.c, s.r);
    }
    if (st.pop >= 30 && count(st, "market") < 2 && Sim.canAfford(st, C.BUILDINGS.market.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "market", s.c, s.r);
    }
    /* Surplus de bois : encore des champs, ce sont eux qui font grandir. */
    if (st.res.wood > 150) {
      const s = bestSpot("grain");
      if (s) return void Sim.place(st, "field", s.c, s.r);
    }
    if (st.res.gold >= Sim.expandCost(st)) Sim.expand(st);
  },

  /* Vise dix jours de vivres d'avance en permanence. Chaque champ coûte du
     bois, et ce bois manque ensuite pour les maisons : la population plafonne
     faute de toits. Le piège classique du bâtisseur prévoyant. */
  gourmand(st) {
    const housing = Sim.housing(st);
    const freeTiles = countFree();

    if (count(st, "lumber") < 3 && st.res.wood >= 35) {
      const s = bestSpot("wood");
      if (s && s.q > 0.5) return void Sim.place(st, "lumber", s.c, s.r);
    }
    if (daysOfFood(st) < 8 && st.res.wood >= 25) {
      const s = bestSpot("grain");
      if (s) return void Sim.place(st, "field", s.c, s.r);
    }
    if (housing - st.pop < 6 && st.res.wood >= 45) {
      const s = anySpot();
      if (s) return void Sim.place(st, "house", s.c, s.r);
    }
    if (st.pop >= 10 && count(st, "quarry") < 2 && st.res.wood >= 60) {
      const s = bestSpot("stone");
      if (s && s.q > 0.4) return void Sim.place(st, "quarry", s.c, s.r);
    }
    if (st.pop >= 15 && count(st, "store") < 2 && Sim.canAfford(st, C.BUILDINGS.store.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "store", s.c, s.r);
    }
    if (st.pop >= 20 && count(st, "mill") < 4 && Sim.canAfford(st, C.BUILDINGS.mill.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "mill", s.c, s.r);
    }
    if (st.pop >= 30 && count(st, "market") < 2 && Sim.canAfford(st, C.BUILDINGS.market.cost)) {
      const s = anySpot();
      if (s) return void Sim.place(st, "market", s.c, s.r);
    }
    if (freeTiles < 12 && st.res.gold >= Sim.expandCost(st)) return void Sim.expand(st);
    if (st.res.wood > 120) {
      const s = bestSpot("grain");
      if (s) return void Sim.place(st, "field", s.c, s.r);
    }
  }
};

function play(profile, seed) {
  const st = Sim.create(seed);
  st.phase = "playing";
  let guard = 0;

  while (st.phase === "playing" && st.day < MAX_DAYS && guard < 30 * 60 * 60 * 4) {
    guard++;
    if (guard % 15 === 0) PROFILES[profile](st);   // le joueur agit deux fois par seconde
    Sim.update(st, STEP);
  }

  return {
    issue: st.phase === "won" ? "ville" : st.phase === "over" ? "village vidé" : "inachevé",
    jour: st.day,
    habitants: st.pop,
    sommet: st.stats.peakPop,
    bâtiments: st.buildings.length,
    or: Math.floor(st.res.gold),
    famines: st.stats.starved
  };
}

const runs = Number(process.argv[2] || 3);
for (const profile of Object.keys(PROFILES)) {
  for (let i = 0; i < runs; i++) {
    console.log(profile.padEnd(8), JSON.stringify(play(profile, i + 1)));
  }
}
