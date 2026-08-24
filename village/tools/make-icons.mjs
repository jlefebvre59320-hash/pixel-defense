/* Fabrique les icônes PNG de Village à partir d'un dessin en pixels.
   Aucune dépendance : l'encodeur PNG tient en quarante lignes et zlib est
   fourni par Node. Relancer après avoir modifié ICON :
     node tools/make-icons.mjs
*/
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Une maison sur son pré — lisible jusqu'à 32 px, avec une marge suffisante
   pour survivre au masque rond d'Android. */
const ICON = [
  "................",
  "................",
  "......kkkk......",
  ".....krrrrk.....",
  "....krrrrrrk....",
  "...krrrrrrrrk...",
  "..krrrrrrrrrrk..",
  "..kknnnnnnnnkk..",
  "...knnkkkknnk...",
  "...knnkyykknnk..",
  "...knnkyykknnk..",
  "...knnnnnnnnk...",
  "..kGGGGGGGGGGk..",
  ".kGGGGGGGGGGGGk.",
  "..kkkkkkkkkkkk..",
  "................"
];

const PAL = {
  ".": null,
  k: [0x24, 0x1b, 0x12, 255],
  r: [0xc9, 0x78, 0x4a, 255],   // toit
  n: [0xd8, 0xc9, 0xa3, 255],   // mur
  y: [0xff, 0xd8, 0x4d, 255],   // fenêtre
  G: [0x4f, 0x8f, 0x4a, 255]    // herbe
};

const BG = [0x0b, 0x12, 0x20, 255];

/* --- Encodeur PNG minimal ------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtre « none » : l'image est minuscule
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

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
  return png(size, size, buf);
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
