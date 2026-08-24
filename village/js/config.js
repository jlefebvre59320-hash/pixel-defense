/* Village — équilibrage et contenu.
   Tout ce qui se règle sans toucher au moteur vit ici : la carte, le rythme
   du temps, les bâtiments, l'économie. Les rendements sont exprimés par
   seconde de jeu, jamais par image : le village se comporte pareil à 60 et à
   120 Hz, et les vitesses ×2/×3 se contentent de multiplier le temps écoulé. */
(function (V) {
  "use strict";

  var CONFIG = {
    /* Carte. Le losange isométrique fait 32 × 16 pixels d'art — la
       proportion 2:1 classique, celle qui tombe juste sur une grille de
       pixels et évite les bords en escalier. */
    COLS: 24,
    ROWS: 24,
    TW: 32,
    TH: 16,

    /* Temps compressé : une journée dure six secondes. C'est le battement du
       jeu — la nourriture se mange à la journée, la population grandit à la
       journée. Assez court pour voir son village vivre, assez long pour avoir
       le temps de décider. */
    DAY: 6.0,
    SPEEDS: [1, 2, 3],

    START: { wood: 140, stone: 40, grain: 40, bread: 0, gold: 80 },
    START_POP: 6,

    /* Stockage : sans limite, on accumulerait sans jamais rien décider.
       L'entrepôt devient un vrai choix de construction. */
    BASE_CAP: 250,
    CAP_PER_STORE: 300,

    /* Part de la population en âge de travailler. Le reste (enfants, anciens)
       mange sans produire — c'est ce qui empêche de gagner en empilant les
       maisons. */
    WORKER_RATIO: 0.6,

    /* Nourriture : un habitant consomme 0,9 ration par jour. Le pain vaut
       deux rations, le grain une seule : transformer double la valeur, et
       c'est tout l'intérêt du moulin. */
    FOOD_PER_POP: 0.9,
    BREAD_FOOD: 2,
    GRAIN_FOOD: 1,

    /* Il faut trois jours de réserve pour qu'une famille s'installe, et une
       journée sans manger pour qu'elle reparte. */
    GROWTH_BUFFER_DAYS: 3,
    GROWTH_EVERY_DAYS: 1,

    /* Impôt : chaque habitant verse une petite taxe par jour. Le marché reste
       la vraie source d'or, mais sans ce revenu de base un village dont le
       territoire est plein ne pourrait plus jamais s'agrandir — faute de place
       pour bâtir le marché qui paierait l'agrandissement. */
    TAX_PER_POP: 0.15,

    /* Territoire : un carré autour de l'hôtel de ville, qu'on agrandit à
       prix d'or. C'est le puits qui donne un sens à la monnaie. */
    TERRITORY: 4,
    EXPAND_BASE: 120,
    EXPAND_GROWTH: 1.7,

    WIN_POP: 120
  };

  /* ---------------------------------------------------------------------
     Bâtiments
     kind      : rôle dans la simulation
     cost      : bois / pierre / or
     workers   : habitants mobilisés à plein régime
     rate      : production par seconde, avant qualité d'emplacement
     unlock    : population minimale pour le débloquer
     height    : hauteur du volume, en pixels d'art
     --------------------------------------------------------------------- */
  CONFIG.BUILDINGS = {
    house: {
      key: "house",
      name: "Maison",
      tag: "Population",
      desc: "Loge 5 habitants. Sans toit, personne ne s'installe — même le grenier plein.",
      kind: "house",
      cost: { wood: 45 },
      workers: 0,
      slots: 5,
      color: "#d9a05f",
      roof: "#b4523f",
      style: "house",
      width: 0.8,
      roofH: 9,
      height: 10,
      unlock: 0
    },
    lumber: {
      key: "lumber",
      name: "Bûcheronnerie",
      tag: "Bois",
      desc: "Coupe le bois des arbres alentour. Rendement proportionnel aux arbres à moins de deux cases : posée en pleine prairie, elle ne produit presque rien.",
      kind: "wood",
      cost: { wood: 35 },
      workers: 2,
      /* 0,9 bois par seconde, soit 5,4 par journée : deux bûcheronneries
         financent une maison tous les quatre jours, le rythme auquel la
         population arrive. */
      rate: 0.9,
      color: "#b08a56",
      roof: "#7a5433",
      style: "lumber",
      width: 0.82,
      roofH: 8,
      height: 9,
      unlock: 0
    },
    quarry: {
      key: "quarry",
      name: "Carrière",
      tag: "Pierre",
      desc: "Extrait la pierre des rochers voisins. Inutile loin d'un affleurement.",
      kind: "stone",
      cost: { wood: 60 },
      workers: 3,
      rate: 0.6,
      color: "#a8adb6",
      roof: "#6f7885",
      style: "quarry",
      width: 0.85,
      roofH: 7,
      height: 8,
      unlock: 10
    },
    field: {
      key: "field",
      name: "Champ",
      tag: "Grain",
      desc: "Cultive le grain. Il lui faut de la place : le rendement suit le nombre de cases d'herbe libres autour.",
      kind: "grain",
      cost: { wood: 25 },
      workers: 2,
      /* Un champ occupe 2 ouvriers, soit 3,3 habitants à nourrir (0,5 ration
         par seconde). À 1,6 grain par seconde, il nourrit ses ouvriers et sept
         personnes de plus : c'est ce surplus qui fait grandir le village. */
      rate: 1.6,
      color: "#d8bd5e",
      roof: "#9c7c46",
      style: "field",
      width: 0.92,
      roofH: 0,
      height: 2,
      unlock: 0
    },
    mill: {
      key: "mill",
      name: "Moulin",
      tag: "Pain",
      desc: "Transforme le grain en pain. Le pain nourrit deux fois mieux : c'est le vrai passage à l'échelle du village.",
      kind: "mill",
      cost: { wood: 90, stone: 25 },
      workers: 2,
      /* 1,2 grain (1,2 ration) devient 0,9 pain (1,8 ration) : la moitié de
         valeur en plus, pour deux ouvriers. Sans ce gain net, personne
         n'aurait de raison de bâtir un moulin. */
      rate: 0.9,          // pain par seconde
      consumes: 1.2,      // grain par seconde
      color: "#e2d8c0",
      roof: "#8a4b32",
      style: "tower",
      width: 0.72,
      roofH: 8,
      height: 13,
      unlock: 20
    },
    market: {
      key: "market",
      name: "Marché",
      tag: "Or",
      desc: "Vend le surplus — tout ce qui dépasse les trois quarts d'un entrepôt part en or, plutôt que de pourrir sur place.",
      kind: "market",
      cost: { wood: 70, stone: 40 },
      workers: 2,
      rate: 3.0,          // unités vendues par seconde
      color: "#c9a37a",
      roof: "#b4523f",
      style: "market",
      width: 0.85,
      roofH: 7,
      height: 9,
      unlock: 30
    },
    store: {
      key: "store",
      name: "Entrepôt",
      tag: "Stockage",
      desc: "Ajoute 300 de capacité à chaque ressource. Sans lui, la production plafonne et le surplus est perdu.",
      kind: "store",
      cost: { wood: 55, stone: 30 },
      workers: 1,
      color: "#c08f5e",
      roof: "#6f5236",
      style: "store",
      width: 0.9,
      roofH: 8,
      height: 10,
      unlock: 15
    }
  };

  CONFIG.BUILD_ORDER = ["house", "field", "lumber", "quarry", "mill", "store", "market"];

  /* L'hôtel de ville : posé au centre au début de la partie, ni constructible
     ni démolissable. Il loge les six premiers habitants et fixe le centre du
     territoire. */
  CONFIG.HALL = {
    key: "hall",
    name: "Hôtel de ville",
    tag: "Le cœur",
    desc: "Le premier toit du village. Il loge six habitants, fixe le centre du territoire, et quelques villageois y ramassent bois et grain — de quoi repartir même quand les réserves sont vides.",
    kind: "hall",
    cost: {},
    workers: 0,
    slots: 6,
    /* Corvée de bois : sans ce filet, un village qui a dépensé son dernier
       rondin ne pourrait plus jamais bâtir la bûcheronnerie qui en produit.
       Un jeu de construction ne doit pas pouvoir se bloquer sans retour. */
    trickle: { wood: 0.12, grain: 0.06 },
    color: "#e6dcc3",
    roof: "#8a4b32",
    style: "hall",
    width: 0.9,
    roofH: 12,
    height: 13,
    unlock: 0
  };

  /* Prix de vente au marché, en or par unité. Le pain se vend le mieux :
     produire de la valeur ajoutée doit rapporter plus que vendre la matière. */
  CONFIG.PRICES = { wood: 0.5, stone: 0.7, grain: 0.6, bread: 1.6 };

  /* Ce que le marché garde en réserve : il ne vend qu'au-delà de ce seuil,
     exprimé en fraction de la capacité. */
  CONFIG.SELL_THRESHOLD = 0.75;

  /* Paliers du village, purement narratifs — mais c'est ce qui donne le
     sentiment d'avancer entre deux constructions. */
  CONFIG.LEVELS = [
    { pop: 0, name: "Campement" },
    { pop: 15, name: "Hameau" },
    { pop: 35, name: "Village" },
    { pop: 70, name: "Bourg" },
    { pop: 120, name: "Ville" }
  ];

  CONFIG.levelFor = function (pop) {
    var best = CONFIG.LEVELS[0];
    for (var i = 0; i < CONFIG.LEVELS.length; i++) {
      if (pop >= CONFIG.LEVELS[i].pop) best = CONFIG.LEVELS[i];
    }
    return best;
  };

  /* Qualité d'un emplacement, entre 0 et 1. C'est là que se joue tout le
     placement : une bûcheronnerie sans arbres ou un champ étouffé entre deux
     maisons coûtent le prix fort pour rien. */
  CONFIG.yieldFactor = function (kind, counts) {
    switch (kind) {
      case "wood":  return Math.min(1, counts.trees / 6);
      case "stone": return Math.min(1, counts.rocks / 4);
      case "grain": return Math.min(1, counts.freeGrass / 8);
      default:      return 1;
    }
  };

  /* Rayon d'examen de l'emplacement, en cases. */
  CONFIG.YIELD_RADIUS = { wood: 2, stone: 2, grain: 1 };

  CONFIG.expandCost = function (bought) {
    return Math.round(CONFIG.EXPAND_BASE * Math.pow(CONFIG.EXPAND_GROWTH, bought));
  };

  /* Score de fin : la population d'abord — c'est elle qu'on a fait vivre. */
  CONFIG.score = function (st) {
    return Math.floor(st.pop * 100 + st.res.gold + st.buildings.length * 20 + st.day * 5);
  };

  V.CONFIG = CONFIG;
})(window.V = window.V || {});
