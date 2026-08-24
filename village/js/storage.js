/* Village — mémoire locale : partie en cours, record, préférences.
   Toute panne d'écriture est absorbée : en navigation privée, on joue, on ne
   garde simplement rien. Perdre un village faute d'avoir pu écrire un octet
   serait la pire des punitions. */
(function (V) {
  "use strict";

  var KEY = "village.v1";

  var defaults = {
    save: null,        // partie en cours (instantané de la simulation)
    best: 0,           // meilleur score
    bestPop: 0,
    sound: true,
    speed: 1
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, defaults);
      var data = JSON.parse(raw);
      return Object.assign({}, defaults, data && typeof data === "object" ? data : {});
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  var state = read();

  var Store = {
    get: function (k) { return state[k]; },

    set: function (k, v) {
      state[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
    },

    hasSave: function () { return !!state.save; },
    clearSave: function () { Store.set("save", null); },

    /* Fin de partie : on retient le score et la population atteinte. */
    finish: function (score, pop) {
      var record = score > state.best;
      if (record) Store.set("best", Math.floor(score));
      if (pop > state.bestPop) Store.set("bestPop", pop);
      return record;
    }
  };

  V.Store = Store;
})(window.V);
