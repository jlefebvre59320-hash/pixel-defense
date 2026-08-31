/* Fabrique les icônes PNG de l'application à partir d'un dessin en pixels.
   Aucune dépendance : l'encodage vit dans tools/png.mjs, partagé avec l'import
   de planches de sprites. Relancer après avoir modifié ICON :
     node tools/make-icons.mjs
*/
import { encodePng } from "./png.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Tourelle dorée sur socle d'acier — lisible jusqu'à 32 px, avec une marge
   suffisante pour survivre au masque rond d'Android. */
const ICON = [
  "................",
  "................",
  ".......kk.......",
  ".......yy.......",
  ".......yy.......",
  "......kyyk......",
  ".....kyyyyk.....",
  "....kyyyyyyk....",
  "....kyyoyyyk....",
  "...kyyyyyyyyk...",
  "...kyyyyyyyyk...",
  "...kSSSSSSSSk...",
  "..kSssssssssk...",
  "..kSSSSSSSSSSk..",
  "..kkkkkkkkkkkk..",
  "................"
];

const PAL = {
  ".": null,
  k: [0x12, 0x13, 0x1c, 255],
  y: [0xff, 0xd8, 0x4d, 255],
  o: [0xb9, 0x95, 0x0f, 255],
  s: [0x8a, 0x93, 0xa8, 255],
  S: [0x5b, 0x64, 0x79, 255]
};

const BG = [0x0e, 0x10, 0x20, 255];

/* --- Rendu --------------------------------------------------------------- */

function render(size) {
  const art = ICON.length;
  if (size % art !== 0) throw new Error(`taille ${size} non divisible par ${art}`);
  const scale = size / art;
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = ICON[Math.floor(y / scale)];
      const ch = row[Math.floor(x / scale)] || ".";
      const col = PAL[ch] || BG;
      const i = (y * size + x) * 4;
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = col[3];
    }
  }
  return encodePng(size, size, buf);
}

ICON.forEach((row, i) => {
  if (row.length !== ICON[0].length) throw new Error(`ligne ${i} : ${row.length} caractères`);
});

mkdirSync(join(ROOT, "icons"), { recursive: true });
for (const size of [192, 512]) {
  const file = join(ROOT, "icons", `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log("écrit", file);
}
