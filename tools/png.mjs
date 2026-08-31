/* PNG, lecture et écriture — sans dépendance.

   L'écriture existait déjà pour les icônes ; la lecture est arrivée avec
   l'import de planches de sprites : il faut bien ouvrir les images qu'Unreal
   dépose sur le disque. `zlib` est dans Node, le reste tient en une page.

   Portée volontairement étroite : 8 bits par canal, RGB ou RGBA, non
   entrelacé. C'est ce qu'écrivent Unreal, Aseprite, GIMP et Photoshop par
   défaut. Tout le reste est refusé avec un message qui dit quoi faire, plutôt
   que décodé de travers en silence. */

import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
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

/* --- Écriture ------------------------------------------------------------- */

export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePng : ${rgba.length} octets pour ${width}×${height} (attendu ${width * height * 4})`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;   // filtre « none »
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* --- Lecture -------------------------------------------------------------- */

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/* Défiltrage. Chaque ligne PNG porte son filtre en tête, et se reconstruit à
   partir du pixel de gauche et de la ligne du dessus. C'est la seule partie
   subtile du format ; le reste n'est que des entiers gros-boutiens. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(line, 0, pos, pos + stride);
    pos += stride;
    const up = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? line[x - bpp] : 0;
      const above = up ? up[x] : 0;
      const upLeft = up && x >= bpp ? up[x - bpp] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[x] = (line[x] + left) & 255; break;
        case 2: line[x] = (line[x] + above) & 255; break;
        case 3: line[x] = (line[x] + ((left + above) >> 1)) & 255; break;
        case 4: line[x] = (line[x] + paeth(left, above, upLeft)) & 255; break;
        default: throw new Error(`filtre PNG inconnu : ${filter} (ligne ${y})`);
      }
    }
  }
  return out;
}

/* Renvoie { width, height, rgba } — toujours en RGBA, quelle que soit
   l'entrée : le reste de la chaîne n'a pas à connaître les variantes. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("ce fichier n'est pas un PNG.");

  let pos = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;                       // longueur + type + données + CRC

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (depth !== 8) {
    throw new Error(`PNG en ${depth} bits par canal : réenregistrez-le en 8 bits.`);
  }
  if (interlace !== 0) {
    throw new Error("PNG entrelacé (Adam7) : réenregistrez-le sans entrelacement.");
  }
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(
      `PNG de type ${colorType} (palette ou niveaux de gris) : réenregistrez-le en RGB ou RGBA.`
    );
  }

  const bpp = colorType === 6 ? 4 : 3;
  const flat = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp);

  if (bpp === 4) return { width, height, rgba: flat };

  /* RGB → RGBA : opaque partout. La transparence viendra du détourage. */
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < flat.length; i += 3, j += 4) {
    rgba[j] = flat[i];
    rgba[j + 1] = flat[i + 1];
    rgba[j + 2] = flat[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}
