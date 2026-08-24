/* Village — bruitages de synthèse, sans un seul fichier son.
   Contexte audio créé au premier geste : les navigateurs mobiles refusent
   tout son avant, et le créer trop tôt laisse un contexte endormi. */
(function (V) {
  "use strict";

  var ctx = null, master = null, enabled = true, lastAt = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function tone(type, from, to, dur, vol) {
    if (!enabled || !ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    build: function () { tone("square", 320, 720, 0.14, 0.3); },
    demolish: function () { tone("sawtooth", 500, 120, 0.22, 0.25); },
    deny: function () { tone("square", 180, 110, 0.14, 0.25); },
    coin: function () { tone("square", 900, 1300, 0.08, 0.18); },
    day: function () { tone("sine", 520, 520, 0.09, 0.1); },
    level: function () {
      [523, 659, 784].forEach(function (f, i) {
        setTimeout(function () { tone("square", f, f, 0.16, 0.24); }, i * 120);
      });
    },
    famine: function () { tone("sawtooth", 300, 90, 0.4, 0.3); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone("square", f, f, 0.18, 0.26); }, i * 130);
      });
    },
    lose: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        setTimeout(function () { tone("sawtooth", f, f * 0.85, 0.3, 0.26); }, i * 180);
      });
    }
  };

  V.Audio = {
    setEnabled: function (v) { enabled = !!v; if (enabled) ensure(); },
    isEnabled: function () { return enabled; },
    unlock: function () { var c = ensure(); if (c && c.state === "suspended") c.resume(); },

    /* `gap` évite qu'un même bruit se répète dix fois sur une image. */
    play: function (name, gap) {
      if (!enabled || !SOUNDS[name]) return;
      var now = performance.now();
      var min = gap === undefined ? 60 : gap;
      if (lastAt[name] && now - lastAt[name] < min) return;
      lastAt[name] = now;
      try { SOUNDS[name](); } catch (e) { /* le son n'est jamais critique */ }
    }
  };
})(window.V);
