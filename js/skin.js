/* Pixel Defense — les habillages.

   Le jeu sait se dessiner tout seul : `js/art.js` trace chaque figure en
   courbes, et c'est ce qu'on voit par défaut. Cette couche permet de *remplacer*
   n'importe quelle figure par une image — une planche de sprites sortie d'un
   pack de textures Unreal, ou n'importe quel PNG.

   Deux règles, et tout le reste en découle :

   1. **Le repli est toujours possible.** Une figure absente de l'habillage est
      tracée comme avant. On peut donc habiller le jeu par morceaux : les
      gobelins d'abord, les tours plus tard, et rien ne casse entre-temps.
   2. **L'ancrage commande.** Une image porte le point par lequel le jeu la
      pose — les pieds, la base, le centre — exactement comme les figures
      tracées. Le rendu place l'ancrage, jamais le coin.

   Les manifestes sont engendrés par `tools/import-textures.mjs` et se
   déclarent avant `js/main.js` :

       <script src="skins/mon-pack/atlas.js"></script>

   Ils s'enregistrent dans `PD.SKINS`. Le premier déclaré est pris ; l'ordre
   des balises fait donc la priorité. */
(function (PD) {
  "use strict";

  var active = null;      // { name, frames, img, ready }
  var tints = {};         // teintes calculées une fois

  var Skin = {
    /* Charge un habillage déclaré. Sans argument, prend le premier venu. */
    use: function (name) {
      var all = PD.SKINS || {};
      var key = name || Object.keys(all)[0];
      if (!key || !all[key]) return null;

      var def = all[key];
      var img = new Image();
      var state = { name: key, frames: def.frames || {}, img: img, ready: false };

      /* Tant que l'image n'est pas là, `ready` reste faux et le jeu continue
         de tracer ses figures. Pas d'écran vide, pas d'attente : l'habillage
         apparaît quand il est prêt. */
      img.onload = function () { state.ready = true; };
      img.onerror = function () {
        console.warn("Habillage « " + key + " » : " + def.image + " introuvable ;"
          + " le jeu reste en dessin tracé.");
      };
      img.src = def.image;

      active = state;
      tints = {};
      return state;
    },

    current: function () { return active; },

    /* Cadre d'une figure dans l'habillage actif, ou null. Les trames sont
       cherchées d'abord telles quelles, puis en repli sur « 0 » : un habillage
       qui ne fournit qu'un seul dessin de gobelin sert les deux trames de
       marche plutôt que de disparaître une image sur deux. */
    frame: function (name, frame) {
      if (!active || !active.ready) return null;
      var byFrame = active.frames[name];
      if (!byFrame) return null;
      return byFrame[String(frame === undefined ? 0 : frame)] || byFrame["0"] || null;
    },

    /* Version teintée de l'atlas entier, calculée une fois par couleur.
       Teinter l'atlas plutôt que chaque figure évite un canvas par sprite et
       par couleur — et le découpage reste valable, puisque les coordonnées
       ne changent pas. */
    tinted: function (color) {
      if (!active || !active.ready) return null;
      var key = active.name + "|" + color;
      if (tints[key]) return tints[key];

      var cv = document.createElement("canvas");
      cv.width = active.img.width;
      cv.height = active.img.height;
      var g = cv.getContext("2d");
      g.drawImage(active.img, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, cv.width, cv.height);

      tints[key] = cv;
      return cv;
    },

    /* Dessine une figure de l'habillage. Renvoie faux si elle n'y est pas —
       l'appelant retombe alors sur le dessin tracé. */
    draw: function (ctx, name, opts) {
      var f = Skin.frame(name, opts.frame);
      if (!f) return false;

      var source = opts.tint ? Skin.tinted(opts.tint) : active.img;
      if (!source) return false;

      /* L'échelle vient de la largeur de la *capture*, pas du sprite rogné :
         c'est ce qui garde les tailles relatives entre figures cadrées de la
         même façon. */
      var k = opts.w / (f.sw || f.w);

      ctx.save();
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
      ctx.translate(opts.x, opts.y);
      if (opts.angle) ctx.rotate(opts.angle);
      if (opts.flip) ctx.scale(-1, 1);
      ctx.drawImage(source, f.x, f.y, f.w, f.h,
        -f.ax * k, -f.ay * k, f.w * k, f.h * k);
      ctx.restore();
      return true;
    }
  };

  PD.Skin = Skin;
})(window.PD = window.PD || {});
