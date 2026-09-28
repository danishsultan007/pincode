// One-off generator for assets/favicon-source.png — rasterizes the exact
// same pin-drop shape as src/components/ui/Logo.tsx
// (`M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z` + a hole circle) into a
// real PNG, since Expo's own favicon pipeline (@expo/image-utils, via
// jimp-compact) can rasterize PNG/JPEG but rejects SVG input outright, and
// `sharp` (which could read SVG) is only a devDependency of that package,
// not available at runtime here. Zero new dependencies: builds the raw PNG
// bytes by hand using only Node's built-in zlib for the IDAT deflate.
//
// This script is a build-time tool, not part of the app — run once
// (`node scripts/_gen-favicon-source.cjs`) whenever the mark's shape or
// color changes, then delete/ignore its output isn't needed since the PNG
// it produces is committed as the favicon's source art.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256; // source resolution; expo's export step downsamples to 16/32/48
const RED = [0xdc, 0x26, 0x26, 255];
const TRANSPARENT = [0, 0, 0, 0];

// --- geometry, in the SVG's 24x24 viewBox units ---
function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
function sampleCubic(p0, p1, p2, p3, steps, out) {
  for (let i = 1; i <= steps; i++) out.push(cubicPoint(p0, p1, p2, p3, i / steps));
}

const STEPS = 48;
const poly = [[21, 10]];
// c 0 7 -9 13 -9 13  (from (21,10) to (12,23), cp1=(21,17), cp2=(12,23))
sampleCubic([21, 10], [21, 17], [12, 23], [12, 23], STEPS, poly);
// s -9 -6 -9 -13  (reflected cp1 == (12,23), cp2=(3,17), end=(3,10))
sampleCubic([12, 23], [12, 23], [3, 17], [3, 10], STEPS, poly);
// a 9 9 0 0 1 18 0  — semicircle over the top from (3,10) back to (21,10)
for (let i = 1; i <= STEPS; i++) {
  const theta = Math.PI - (Math.PI * i) / STEPS; // PI -> 0
  poly.push([12 + 9 * Math.cos(theta), 10 - 9 * Math.sin(theta)]);
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const HOLE = { cx: 12, cy: 10, r: 3.2 };
const scale = SIZE / 24;
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const x = (px + 0.5) / scale;
    const y = (py + 0.5) / scale;
    const inHole = (x - HOLE.cx) ** 2 + (y - HOLE.cy) ** 2 <= HOLE.r * HOLE.r;
    const color = !inHole && pointInPolygon(x, y, poly) ? RED : TRANSPARENT;
    const idx = (py * SIZE + px) * 4;
    pixels[idx] = color[0];
    pixels[idx + 1] = color[1];
    pixels[idx + 2] = color[2];
    pixels[idx + 3] = color[3];
  }
}

// --- minimal PNG encoder (IHDR + one IDAT + IEND), RGBA8, filter type 0 ---
function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter: none
  pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idatData = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'assets', 'favicon-source.png');
fs.writeFileSync(outPath, png);
console.log('wrote', outPath, png.length, 'bytes');
