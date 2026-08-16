/* Pixel Defense — équilibrage et contenu du jeu.
   Tout ce qui se règle sans toucher au moteur vit ici : la grille, les tours,
   les ennemis, les vagues. Les distances sont en cases, les durées en
   secondes, jamais en pixels ni en images par seconde — le jeu doit se
   comporter pareil sur un téléphone à 60 Hz et sur un écran à 120 Hz. */
(function (PD) {
  "use strict";

  var CONFIG = {
    /* Plateau au format téléphone : 9 cases de large, 16 de haut. */
    COLS: 9,
    ROWS: 16,
    /* Résolution d'une case en « pixels d'art ». Toute la tuile, sprites
       compris, est dessinée dans cette grille : c'est ce qui garde des pixels
       carrés et nets à n'importe quelle taille d'écran. */
    ART: 16,

    START_GOLD: 130,
    START_LIVES: 15,

    /* Temps de répit entre deux vagues. Appeler la vague en avance rembourse
       le temps gagné en or : le joueur pressé est récompensé, le joueur
       prudent ne perd rien. */
    WAVE_BREAK: 15,
    EARLY_GOLD_PER_SEC: 3,

    /* Vitesses de jeu proposées par le bouton du bandeau. */
    SPEEDS: [1, 2, 3],

    /* Portée du doigt : rayon de tolérance (en cases) autour d'un appui pour
       attraper une tour. Sans marge, on rate la tour une fois sur trois. */
    TAP_SLACK: 0.15
  };

  /* ---------------------------------------------------------------------
     Tours
     kind : single = un projectile, une cible
            splash = explosion de rayon `splash` cases
            slow   = dégâts + ralentissement
            beam   = tir instantané, traverse le blindage
     Chaque niveau donne dégâts / portée / cadence (tirs par seconde) et son
     prix d'amélioration ; le niveau 1 coûte `cost`.
     --------------------------------------------------------------------- */
  CONFIG.TOWERS = {
    gun: {
      key: "gun",
      name: "Tourelle",
      tag: "Polyvalente",
      desc: "Tir rapide, une cible. Le premier rempart, bon marché.",
      kind: "single",
      cost: 40,
      color: "#8a93a8",
      shotSpeed: 11,
      levels: [
        { dmg: 7, range: 2.6, rate: 1.9, cost: 40 },
        { dmg: 12, range: 2.8, rate: 2.2, cost: 35 },
        { dmg: 19, range: 3.1, rate: 2.5, cost: 70 }
      ]
    },
    cannon: {
      key: "cannon",
      name: "Canon",
      tag: "Explosif",
      desc: "Lent, mais l'obus arrose tout un groupe. Idéal contre les nuées.",
      kind: "splash",
      cost: 80,
      color: "#f2a33c",
      shotSpeed: 7,
      splash: 1.05,
      levels: [
        { dmg: 26, range: 3.0, rate: 0.6, cost: 80 },
        { dmg: 40, range: 3.2, rate: 0.68, cost: 70 },
        { dmg: 62, range: 3.5, rate: 0.75, cost: 130 }
      ]
    },
    frost: {
      key: "frost",
      name: "Cryo",
      tag: "Contrôle",
      desc: "Peu de dégâts, mais fige l'avancée : double le temps sous le feu.",
      kind: "slow",
      cost: 60,
      color: "#5be3e0",
      shotSpeed: 9,
      slow: 0.45,
      slowFor: 1.6,
      levels: [
        { dmg: 3, range: 2.4, rate: 1.2, cost: 60 },
        { dmg: 5, range: 2.7, rate: 1.4, cost: 50 },
        { dmg: 8, range: 3.0, rate: 1.6, cost: 95 }
      ]
    },
    tesla: {
      key: "tesla",
      name: "Tesla",
      tag: "Perce-blindage",
      desc: "Éclair instantané qui ignore le blindage. La réponse aux Blindés.",
      kind: "beam",
      cost: 130,
      color: "#a35bd6",
      ignoreArmor: true,
      levels: [
        { dmg: 9, range: 2.7, rate: 3.2, cost: 130 },
        { dmg: 14, range: 2.9, rate: 3.6, cost: 110 },
        { dmg: 21, range: 3.2, rate: 4.0, cost: 190 }
      ]
    }
  };

  CONFIG.TOWER_ORDER = ["gun", "frost", "cannon", "tesla"];

  /* ---------------------------------------------------------------------
     Ennemis
     armor : dégâts retirés à chaque coup (jamais moins de 1 point encaissé)
     fly   : ignore le chemin, coupe en ligne droite vers la base
     leak  : vies perdues si l'ennemi atteint la base
     size  : rayon de collision, en cases
     scale : taille du sprite, en multiples de la grille d'art (1 = normal)
     --------------------------------------------------------------------- */
  CONFIG.ENEMIES = {
    crawler: { key: "crawler", name: "Rôdeur", hp: 42, speed: 1.55, reward: 6, leak: 1, armor: 0, size: 0.32, scale: 1 },
    swarm: { key: "swarm", name: "Essaim", hp: 20, speed: 2.25, reward: 3, leak: 1, armor: 0, size: 0.24, scale: 1 },
    armored: { key: "armored", name: "Blindé", hp: 130, speed: 0.95, reward: 13, leak: 1, armor: 4, size: 0.36, scale: 1 },
    flyer: { key: "flyer", name: "Drone", hp: 70, speed: 1.35, reward: 10, leak: 1, armor: 0, size: 0.32, scale: 1, fly: true },
    boss: { key: "boss", name: "Colosse", hp: 1400, speed: 0.62, reward: 120, leak: 5, armor: 6, size: 0.62, scale: 2, boss: true }
  };

  /* Les points de vie montent de 20 % par vague : la vague 20 est cinq fois
     plus dure que la première, sans qu'aucune vague ne double la précédente.
     Réglage vérifié avec tools/simulate.mjs : une défense bâtie au
     hasard tombe vers la vague 15, une défense pensée et améliorée tient. */
  CONFIG.HP_RAMP = 0.20;

  /* ---------------------------------------------------------------------
     Vagues — 20 manches, boss aux vagues 10, 15 et 20.
     Un groupe : { t: type, n: nombre, gap: secondes entre deux, at: retard }
     --------------------------------------------------------------------- */
  CONFIG.WAVES = [
    [{ t: "crawler", n: 8, gap: 0.9 }],
    [{ t: "crawler", n: 12, gap: 0.7 }],
    [{ t: "swarm", n: 14, gap: 0.35 }],
    [{ t: "crawler", n: 10, gap: 0.6 }, { t: "armored", n: 2, gap: 2, at: 4 }],
    [{ t: "armored", n: 6, gap: 1.6 }],
    [{ t: "flyer", n: 6, gap: 1.0 }],
    [{ t: "crawler", n: 14, gap: 0.45 }, { t: "flyer", n: 4, gap: 1.4, at: 5 }],
    [{ t: "armored", n: 8, gap: 1.2 }, { t: "swarm", n: 12, gap: 0.3, at: 3 }],
    [{ t: "flyer", n: 10, gap: 0.8 }, { t: "crawler", n: 10, gap: 0.5, at: 2 }],
    [{ t: "boss", n: 1, gap: 1 }, { t: "crawler", n: 12, gap: 0.6, at: 3 }],
    [{ t: "armored", n: 10, gap: 1.0 }, { t: "swarm", n: 16, gap: 0.25, at: 4 }],
    [{ t: "swarm", n: 24, gap: 0.22 }, { t: "flyer", n: 6, gap: 1.2, at: 3 }],
    [{ t: "flyer", n: 12, gap: 0.6 }, { t: "armored", n: 6, gap: 1.5, at: 4 }],
    [{ t: "crawler", n: 20, gap: 0.35 }, { t: "armored", n: 8, gap: 1.2, at: 5 }],
    [{ t: "boss", n: 1, gap: 1 }, { t: "flyer", n: 10, gap: 0.7, at: 2 }],
    [{ t: "armored", n: 14, gap: 0.8 }, { t: "swarm", n: 20, gap: 0.25, at: 6 }],
    [{ t: "swarm", n: 30, gap: 0.18 }, { t: "flyer", n: 8, gap: 1.0, at: 6 }],
    [{ t: "armored", n: 12, gap: 0.7 }, { t: "crawler", n: 20, gap: 0.3, at: 3 }],
    [{ t: "flyer", n: 18, gap: 0.45 }, { t: "armored", n: 10, gap: 1.0, at: 4 }],
    [
      { t: "boss", n: 3, gap: 9 },
      { t: "armored", n: 14, gap: 0.8, at: 2 },
      { t: "swarm", n: 30, gap: 0.25, at: 5 },
      { t: "flyer", n: 12, gap: 0.6, at: 12 }
    ]
  ];

  /* Prime de fin de vague : elle grandit avec la vague, sinon l'économie
     s'essouffle exactement quand les ennemis grossissent. */
  CONFIG.waveBonus = function (wave) {
    return 18 + wave * 3;
  };

  /* Score : les éliminations paient, mais ce sont les vies sauvées qui font
     la différence entre deux joueurs arrivés au bout. */
  CONFIG.KILL_SCORE = 10;
  CONFIG.WAVE_SCORE = 250;
  CONFIG.LIFE_SCORE = 300;

  PD.CONFIG = CONFIG;
})(window.PD = window.PD || {});
