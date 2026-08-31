#!/usr/bin/env node
/* Vérifie l'import de planches de sprites, sans Unreal ni navigateur.

     node tools/tests/test-textures.mjs

   Ce qui est couvert : le codec PNG dans les deux sens, le détourage, le
   rognage et le report d'ancrage, l'empaquetage sans chevauchement, et le
   manifeste engendré. Les images de test sont fabriquées ici : le banc ne
   dépend d'aucun fichier extérieur. */

import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { encodePng, decodePng } from "../png.mjs";
import { chromaKey, trim, pack } from "../import-textures.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const failures = [];

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "ÉCHEC"} ${label}${ok ? "" : "  — " + detail}`);
  if (!ok) failures.push(label);
}

/* Une image de test : un rectangle plein sur fond magenta. */
function makeImage(size, key, rect, color) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = x >= rect[0] && x < rect[2] && y >= rect[1] && y < rect[3];
      const c = inside ? color : key;
      const i = (y * size + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return { width: size, height: size, rgba };
}

/* --- Codec ---------------------------------------------------------------- */

console.log("Codec PNG");
{
  const src = makeImage(24, [255, 0, 255], [4, 6, 20, 22], [10, 200, 30]);
  const back = decodePng(encodePng(src.width, src.height, src.rgba));
  check("aller-retour sans perte", back.rgba.equals(src.rgba));
  check("dimensions conservées", back.width === 24 && back.height === 24);

  let bad = false;
  try { decodePng(Buffer.from("pas un png du tout")); } catch { bad = true; }
  check("un fichier qui n'est pas un PNG est refusé", bad);
}

/* --- Détourage et rognage -------------------------------------------------- */

console.log("Détourage et rognage");
{
  const img = makeImage(40, [255, 0, 255], [10, 12, 30, 36], [200, 40, 40]);
  const cleared = chromaKey(img, [255, 0, 255], 40);
  check("le fond est effacé", cleared === 40 * 40 - 20 * 24, String(cleared));

  const cut = trim(img);
  check("les marges sont coupées", cut.width === 20 && cut.height === 24,
    `${cut.width}×${cut.height}`);
  check("le décalage est retenu", cut.offsetX === 10 && cut.offsetY === 12,
    `${cut.offsetX},${cut.offsetY}`);
  check("la taille d'origine est retenue",
    cut.sourceWidth === 40 && cut.sourceHeight === 40);

  const empty = makeImage(8, [255, 0, 255], [0, 0, 0, 0], [0, 0, 0]);
  chromaKey(empty, [255, 0, 255], 40);
  check("une image entièrement fond ne donne rien", trim(empty) === null);

  /* Tolérance : un fond légèrement bruité doit quand même partir. */
  const noisy = makeImage(10, [250, 6, 248], [2, 2, 8, 8], [0, 0, 0]);
  const n = chromaKey(noisy, [255, 0, 255], 40);
  check("un fond approché est effacé grâce à la tolérance", n === 100 - 36, String(n));
}

/* --- Empaquetage ----------------------------------------------------------- */

console.log("Empaquetage");
{
  const items = [
    { width: 40, height: 30 }, { width: 20, height: 60 },
    { width: 35, height: 25 }, { width: 50, height: 10 }
  ];
  const atlas = pack(items, 2, 100);
  check("tout est placé", items.every(i => i.x !== undefined && i.y !== undefined));
  check("rien ne dépasse en largeur",
    items.every(i => i.x + i.width <= atlas.width), JSON.stringify(atlas));
  check("rien ne dépasse en hauteur",
    items.every(i => i.y + i.height <= atlas.height));

  let overlap = false;
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const A = items[a], B = items[b];
      if (A.x < B.x + B.width && B.x < A.x + A.width &&
          A.y < B.y + B.height && B.y < A.y + A.height) overlap = true;
    }
  }
  check("aucun chevauchement", !overlap);
}

/* --- Chaîne complète ------------------------------------------------------- */

console.log("Import de bout en bout");
{
  const dir = mkdtempSync(join(tmpdir(), "pd-tex-"));
  const caps = join(dir, "caps");
  mkdirSync(caps);

  /* Deux trames de marche, et une figure volante à l'ancrage différent. */
  const write = (name, rect, color) => {
    const img = makeImage(64, [255, 0, 255], rect, color);
    writeFileSync(join(caps, name), encodePng(img.width, img.height, img.rgba));
  };
  write("crawler@0.png", [20, 24, 44, 60], [80, 160, 40]);
  write("crawler@1.png", [22, 24, 46, 60], [80, 160, 40]);
  write("flyer@0.png", [16, 16, 48, 40], [120, 100, 220]);
  write("tower_gun@3.png", [24, 8, 40, 60], [160, 160, 160]);

  execFileSync(process.execPath,
    [join(ROOT, "tools/import-textures.mjs"), caps, "--name", "essai", "--out", dir],
    { stdio: "pipe" });

  const manifest = readFileSync(join(dir, "essai", "atlas.js"), "utf8");
  const PD = {};
  new Function("window", manifest)({ PD });
  const skin = PD.SKINS.essai;

  check("le manifeste s'exécute et s'enregistre", !!skin);
  check("les quatre sprites sont là",
    Object.keys(skin.frames).length === 3
    && Object.keys(skin.frames.crawler).length === 2, JSON.stringify(Object.keys(skin.frames)));

  const c0 = skin.frames.crawler["0"];
  check("le sprite est rogné à son contenu", c0.w === 24 && c0.h === 36, `${c0.w}×${c0.h}`);
  check("la taille de capture est conservée", c0.sw === 64 && c0.sh === 64);
  /* Ancrage aux pieds : y = 1 × 64 − 24 (marge coupée) = 40, au bas du sprite. */
  check("l'ancrage marcheur tombe au bas du sprite",
    Math.abs(c0.ay - 40) < 0.01 && Math.abs(c0.ax - 12) < 0.01, `${c0.ax},${c0.ay}`);

  const f0 = skin.frames.flyer["0"];
  /* Ancrage au centre : y = 0,5 × 64 − 16 = 16, au milieu du sprite (24 de haut). */
  check("l'ancrage volant tombe au milieu du sprite",
    Math.abs(f0.ay - 16) < 0.01, String(f0.ay));

  const atlas = decodePng(readFileSync(join(dir, "essai", "atlas.png")));
  check("l'atlas est une image lisible", atlas.width > 0 && atlas.height > 0);

  /* Le pixel au coin d'un sprite dans l'atlas doit être la couleur peinte,
     pas du magenta : c'est la preuve que le détourage a bien eu lieu avant
     l'empaquetage. */
  const at = (x, y) => {
    const i = (y * atlas.width + x) * 4;
    return [atlas.rgba[i], atlas.rgba[i + 1], atlas.rgba[i + 2], atlas.rgba[i + 3]];
  };
  const px = at(c0.x + 2, c0.y + 2);
  check("le sprite est posé dans l'atlas avec sa couleur",
    px[0] === 80 && px[1] === 160 && px[2] === 40 && px[3] === 255, JSON.stringify(px));
  check("aucun magenta ne subsiste",
    !(px[0] === 255 && px[1] === 0 && px[2] === 255));

  rmSync(dir, { recursive: true, force: true });
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} vérification(s) en échec : ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Tout passe.");
