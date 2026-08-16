/* Pixel Defense — mémoire locale : record et préférences.
   Tout échec est absorbé : en navigation privée, le jeu marche, il ne
   retient simplement rien. Jamais d'erreur qui casse une partie pour un
   score qu'on n'a pas pu écrire. */
(function (PD) {
  "use strict";

  var KEY = "pixeldefense.v1";

  var DEFAULTS = {
    best: 0,        // meilleur score
    bestWave: 0,    // vague la plus loin atteinte
    won: false,     // partie déjà terminée au moins une fois
    sound: true,
    speed: 1
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var data = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, data && typeof data === "object" ? data : {});
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  var state = read();

  var Store = {
    get: function (k) { return state[k]; },

    set: function (k, v) {
      state[k] = v;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* ignoré volontairement */
      }
    },

    /* Enregistre une fin de partie ; renvoie true si c'est un nouveau record,
       pour que l'écran de fin puisse le fêter. */
    finish: function (score, wave, won) {
      var record = score > state.best;
      if (record) Store.set("best", Math.floor(score));
      if (wave > state.bestWave) Store.set("bestWave", wave);
      if (won && !state.won) Store.set("won", true);
      return record;
    }
  };

  PD.Store = Store;
})(window.PD);
