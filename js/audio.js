/* Pixel Defense — bruitages de synthèse.
   Aucun fichier son : tout est fabriqué à la volée avec l'oscillateur du
   navigateur. C'est ce qui permet au jeu de tenir en quelques dizaines de
   kilo-octets et de fonctionner hors ligne du premier coup.
   Le contexte audio n'est créé qu'au premier geste du joueur : les
   navigateurs mobiles refusent tout son avant, et le créer trop tôt laisse
   un contexte suspendu qui ne se réveille jamais. */
(function (PD) {
  "use strict";

  var ctx = null;
  var master = null;
  var enabled = true;
  var lastAt = {};   // limite le nombre de sons identiques par seconde

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  /* Une note : forme d'onde, hauteur de départ et d'arrivée, durée.
     L'enveloppe est volontairement courte — un jeu de tower defense tire
     plusieurs fois par seconde, tout ce qui traîne devient une bouillie. */
  function tone(opts) {
    if (!enabled || !ensure()) return;
    if (ctx.state === "suspended") ctx.resume();

    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.3, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /* Bruit blanc court, pour les explosions : un oscillateur ne fait pas un
     « boum » crédible. */
  function noise(dur, vol, filterHz) {
    if (!enabled || !ensure()) return;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = filterHz || 900;
    var gain = ctx.createGain();
    gain.gain.value = vol || 0.35;
    src.connect(filt); filt.connect(gain); gain.connect(master);
    src.start();
  }

  var SOUNDS = {
    shoot: function () { tone({ type: "square", from: 620, to: 260, dur: 0.06, vol: 0.14 }); },
    cannon: function () { noise(0.22, 0.4, 700); tone({ type: "sawtooth", from: 160, to: 50, dur: 0.2, vol: 0.25 }); },
    frost: function () { tone({ type: "sine", from: 1200, to: 700, dur: 0.1, vol: 0.15 }); },
    zap: function () { tone({ type: "sawtooth", from: 1500, to: 400, dur: 0.07, vol: 0.16 }); },
    hit: function () { tone({ type: "square", from: 220, to: 120, dur: 0.05, vol: 0.12 }); },
    kill: function () { tone({ type: "square", from: 420, to: 700, dur: 0.09, vol: 0.2 }); },
    boom: function () { noise(0.3, 0.5, 500); },
    build: function () { tone({ type: "square", from: 300, to: 900, dur: 0.12, vol: 0.25 }); },
    sell: function () { tone({ type: "square", from: 700, to: 240, dur: 0.14, vol: 0.22 }); },
    upgrade: function () { tone({ type: "square", from: 500, to: 1100, dur: 0.16, vol: 0.25 }); },
    deny: function () { tone({ type: "square", from: 180, to: 110, dur: 0.14, vol: 0.22 }); },
    leak: function () { tone({ type: "sawtooth", from: 320, to: 90, dur: 0.35, vol: 0.3 }); },
    wave: function () { tone({ type: "square", from: 400, to: 800, dur: 0.18, vol: 0.22 }); },
    boss: function () { tone({ type: "sawtooth", from: 120, to: 60, dur: 0.7, vol: 0.32 }); noise(0.5, 0.3, 300); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone({ type: "square", from: f, to: f, dur: 0.18, vol: 0.26 }); }, i * 130);
      });
    },
    lose: function () {
      [400, 320, 240, 160].forEach(function (f, i) {
        setTimeout(function () { tone({ type: "sawtooth", from: f, to: f * 0.8, dur: 0.28, vol: 0.28 }); }, i * 180);
      });
    }
  };

  PD.Audio = {
    setEnabled: function (v) {
      enabled = !!v;
      if (enabled) ensure();
    },
    isEnabled: function () { return enabled; },

    /* `minGap` évite qu'une nuée de dix tourelles fasse dix fois le même
       bruit sur la même image : au-delà, c'est du bruit, pas du son. */
    play: function (name, minGap) {
      var fn = SOUNDS[name];
      if (!fn || !enabled) return;
      var now = performance.now();
      var gap = minGap === undefined ? 45 : minGap;
      if (lastAt[name] && now - lastAt[name] < gap) return;
      lastAt[name] = now;
      try { fn(); } catch (e) { /* ignoré : le son n'est jamais critique */ }
    },

    /* Appelé au premier appui : débloque l'audio sur iOS et Android. */
    unlock: function () {
      if (!enabled) return;
      var c = ensure();
      if (c && c.state === "suspended") c.resume();
    }
  };
})(window.PD);
