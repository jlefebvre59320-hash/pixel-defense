#!/usr/bin/env node
/* Importe une planche de sprites dans le jeu.

     node tools/import-textures.mjs captures/ --name mon-pack

   Prend un dossier de PNG — ce qu'Unreal dépose en sortie du travail
   `export_sprites`, ou n'importe quelle image faite à la main — et en fait un
   atlas que le jeu sait charger : `skins/<nom>/atlas.png` et son manifeste.

   Ce que l'outil fait, dans l'ordre :

   1. **détourage** : les captures d'Unreal arrivent sur un fond plat (magenta
      par défaut). Exporter de la transparence depuis un SceneCapture demande
      des réglages fragiles qui changent d'une version du moteur à l'autre ;
      un fond franc et un détourage ici, c'est robuste et vérifiable ;
   2. **rognage** : les marges transparentes sont coupées, et le décalage est
      noté — sans quoi l'atlas serait fait de vide et les figures ne
      tomberaient pas au bon endroit ;
   3. **ancrage** : chaque figure garde le point par lequel le jeu la pose —
      les pieds, la base, ou le centre. C'est la même convention que
      `js/art.js` : le rendu place l'ancrage, jamais le coin ;
   4. **empaquetage** : tout est rangé dans une seule image, par étagères ;
   5. **manifeste** : écrit en JavaScript, pas en JSON. Le jeu s'ouvre depuis
      un simple fichier local, où `fetch` est interdit — un `<script>` passe.

   Nommage des fichiers d'entrée : `<figure>[@<trame>].png`, où `<figure>` est
   le nom que connaît le jeu (`crawler`, `tower_gun`, `tree`…) et `<trame>` la
   variante (0/1 pour la marche, 1/2/3 pour le niveau d'une tour).
       crawler@0.png  crawler@1.png  tower_gun@3.png  core.png
*/

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { decodePng, encodePng } from "./png.mjs";

/* Ancrages par défaut, en fraction de la figure rognée : x du bord gauche,
   y du bord haut. Ils reprennent la convention de js/art.js — ce qui marche
   est ancré aux pieds, ce qui vole au centre. Un fichier `anchors.json` posé
   dans le dossier d'entrée les remplace, figure par figure. */
const DEFAULT_ANCHORS = {
  crawler: [0.5, 1], swarm: [0.5, 1], armored: [0.5, 1], boss: [0.5, 1],
  flyer: [0.5, 0.5],
  tower_gun: [0.5, 1], tower_cannon: [0.5, 1], tower_frost: [0.5, 1], tower_tesla: [0.5, 1],
  "tower_cannon.barrel": [0.3, 0.5],
  tree: [0.5, 1], rock: [0.5, 1], core: [0.5, 1], cave: [0.5, 1]
};

const FALLBACK_ANCHOR = [0.5, 1];

function parseArgs(argv) {
  const opts = {
    dir: null, name: "unreal", out: "skins",
    key: [255, 0, 255], tolerance: 40, padding: 2, maxWidth: 2048
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts.dir = a; continue; }
    const val = argv[++i];
    switch (a) {
      case "--name": opts.name = val; break;
      case "--out": opts.out = val; break;
      case "--key": opts.key = val.split(",").map(Number); break;
      case "--tolerance": opts.tolerance = Number(val); break;
      case "--padding": opts.padding = Number(val); break;
      case "--max-width": opts.maxWidth = Number(val); break;
      case "--no-key": opts.key = null; i--; break;
      default: throw new Error(`option inconnue : ${a}`);
    }
  }
  if (!opts.dir) throw new Error("usage : node tools/import-textures.mjs <dossier> [--name nom] [--key r,g,b] [--no-key]");
  return opts;
}

/* --- Détourage ------------------------------------------------------------ */

/* Le fond est reconnu par distance à la couleur clé, en carré plutôt qu'en
   euclidien : un seuil par canal se règle à l'œil, contrairement à un rayon
   dans l'espace des couleurs. */
function chromaKey(img, key, tolerance) {
  const { rgba } = img;
  let cleared = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (Math.abs(rgba[i] - key[0]) <= tolerance &&
        Math.abs(rgba[i + 1] - key[1]) <= tolerance &&
        Math.abs(rgba[i + 2] - key[2]) <= tolerance) {
      rgba[i + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/* --- Rognage -------------------------------------------------------------- */

function trim(img) {
  const { width, height, rgba } = img;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;                 // figure entièrement transparente
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y + y0) * width + x0) * 4, ((y + y0) * width + x1 + 1) * 4);
  }
  return { width: w, height: h, rgba: out, offsetX: x0, offsetY: y0,
           sourceWidth: width, sourceHeight: height };
}

/* --- Empaquetage ---------------------------------------------------------- */

/* Rangement par étagères : les figures sont triées par hauteur décroissante et
   posées en lignes. Sans être optimal, c'est court, prévisible, et sur des
   dizaines de figures de tailles proches la perte est négligeable — un vrai
   empaqueteur serait cent lignes pour gagner quelques kilo-octets. */
function pack(items, padding, maxWidth) {
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width);
  let x = padding, y = padding, rowHeight = 0, atlasWidth = 0;

  for (const it of sorted) {
    if (x + it.width + padding > maxWidth && x > padding) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    it.x = x;
    it.y = y;
    x += it.width + padding;
    rowHeight = Math.max(rowHeight, it.height);
    atlasWidth = Math.max(atlasWidth, x);
  }
  return { width: atlasWidth + padding - padding, height: y + rowHeight + padding };
}

function blit(dst, dstW, src, srcW, srcH, dx, dy) {
  for (let row = 0; row < srcH; row++) {
    src.rgba.copy(dst, ((dy + row) * dstW + dx) * 4, row * srcW * 4, (row + 1) * srcW * 4);
  }
}

/* --- Programme ------------------------------------------------------------ */

function main(argv) {
  const opts = parseArgs(argv);
  const dir = resolve(opts.dir);
  if (!existsSync(dir)) throw new Error(`dossier introuvable : ${dir}`);

  const anchorsFile = join(dir, "anchors.json");
  const anchors = existsSync(anchorsFile)
    ? { ...DEFAULT_ANCHORS, ...JSON.parse(readFileSync(anchorsFile, "utf8")) }
    : DEFAULT_ANCHORS;

  const files = readdirSync(dir).filter(f => extname(f).toLowerCase() === ".png").sort();
  if (!files.length) throw new Error(`aucun PNG dans ${dir}`);

  const items = [];
  const skipped = [];

  for (const file of files) {
    const stem = basename(file, extname(file));
    const at = stem.lastIndexOf("@");
    const figure = at > 0 ? stem.slice(0, at) : stem;
    const frame = at > 0 ? stem.slice(at + 1) : "0";

    let img;
    try {
      img = decodePng(readFileSync(join(dir, file)));
    } catch (err) {
      skipped.push(`${file} : ${err.message}`);
      continue;
    }

    if (opts.key) chromaKey(img, opts.key, opts.tolerance);
    const cut = trim(img);
    if (!cut) { skipped.push(`${file} : entièrement transparent après détourage`); continue; }

    const anchor = anchors[figure] || FALLBACK_ANCHOR;
    /* L'ancrage est donné sur l'image *d'origine* ; après rognage il faut le
       ramener dans le repère de la figure coupée, sinon toutes les figures
       dont on a mangé une marge se décaleraient d'autant. */
    const ax = anchor[0] * cut.sourceWidth - cut.offsetX;
    const ay = anchor[1] * cut.sourceHeight - cut.offsetY;

    items.push({
      figure, frame, file,
      width: cut.width, height: cut.height,
      anchorX: ax, anchorY: ay,
      img: cut
    });
  }

  if (!items.length) throw new Error("aucune figure exploitable :\n  " + skipped.join("\n  "));

  const atlas = pack(items, opts.padding, opts.maxWidth);
  const rgba = Buffer.alloc(atlas.width * atlas.height * 4);   // transparent
  for (const it of items) blit(rgba, atlas.width, it.img, it.width, it.height, it.x, it.y);

  const outDir = join(resolve(opts.out), opts.name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "atlas.png"), encodePng(atlas.width, atlas.height, rgba));

  /* Manifeste en JavaScript : le jeu s'ouvre depuis un fichier local, où
     `fetch` est interdit par la politique d'origine. Un `<script>` passe. */
  const frames = {};
  for (const it of items) {
    (frames[it.figure] ||= {})[it.frame] = {
      x: it.x, y: it.y, w: it.width, h: it.height,
      /* Taille de la capture d'origine, avant rognage. C'est elle qui sert
         d'échelle : le jeu demande une largeur, et on veut que deux figures
         cadrées dans la même boîte de capture gardent leurs tailles
         relatives — sinon la moindre marge rognée les ferait grandir. */
      sw: it.img.sourceWidth, sh: it.img.sourceHeight,
      ax: Math.round(it.anchorX * 100) / 100,
      ay: Math.round(it.anchorY * 100) / 100
    };
  }

  const manifest =
`/* Habillage « ${opts.name} » — engendré par tools/import-textures.mjs.
   Ne pas modifier à la main : relancez l'outil sur le dossier de captures.
   ${items.length} figure(s), atlas ${atlas.width}×${atlas.height}. */
(function (PD) {
  PD.SKINS = PD.SKINS || {};
  PD.SKINS[${JSON.stringify(opts.name)}] = {
    name: ${JSON.stringify(opts.name)},
    image: "skins/${opts.name}/atlas.png",
    frames: ${JSON.stringify(frames, null, 2).replace(/\n/g, "\n    ")}
  };
})(window.PD = window.PD || {});
`;
  writeFileSync(join(outDir, "atlas.js"), manifest);

  const byFigure = Object.keys(frames).sort();
  console.log(`Habillage « ${opts.name} » : ${items.length} sprite(s) `
    + `sur ${byFigure.length} figure(s), atlas ${atlas.width}×${atlas.height}.`);
  for (const f of byFigure) {
    console.log(`  ${f.padEnd(22)} trames ${Object.keys(frames[f]).sort().join(", ")}`);
  }
  if (skipped.length) {
    console.log("\nÉcartés :");
    for (const s of skipped) console.log("  " + s);
  }
  console.log(`\nÉcrit : ${join(outDir, "atlas.png")}\n        ${join(outDir, "atlas.js")}`);
  console.log(`\nPour l'activer, ajoutez avant js/main.js dans index.html :`);
  console.log(`  <script src="skins/${opts.name}/atlas.js"></script>`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error("import-textures : " + err.message);
    process.exit(2);
  }
}

export { chromaKey, trim, pack, main };
