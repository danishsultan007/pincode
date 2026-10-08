// One-off generator for the app icon set — same dependency-free approach as
// _gen-favicon-source.cjs (raw PNG bytes + Node's zlib), with 4x4 supersampling
// for smooth edges. Draws the pin-drop mark from src/components/ui/Logo.tsx.
//
//   node scripts/_gen-app-icons.cjs
//
// Writes assets/icon.png, assets/adaptive-icon.png, assets/splash-icon.png,
// store/play-icon-512.png and store/feature-graphic-1024x500.png. The PNGs are
// committed; re-run only when the mark or brand colors change.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const IRIS = [0x4b, 0x41, 0xd6];     // tokens.accent
const LOGO_RED = [0xf0, 0x44, 0x38]; // tokens.logoRed
const WHITE = [255, 255, 255];

// --- pin geometry in the logo's 24x24 viewBox ---
function cubic(p0, p1, p2, p3, t) {
  const m = 1 - t;
  const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
const STEPS = 48;
const poly = [[21, 10]];
for (let i = 1; i <= STEPS; i++) poly.push(cubic([21, 10], [21, 17], [12, 23], [12, 23], i / STEPS));
for (let i = 1; i <= STEPS; i++) poly.push(cubic([12, 23], [12, 23], [3, 17], [3, 10], i / STEPS));
for (let i = 1; i <= STEPS; i++) {
  const th = Math.PI - (Math.PI * i) / STEPS;
  poly.push([12 + 9 * Math.cos(th), 10 - 9 * Math.sin(th)]);
}
function inPoly(x, y) {
  if (x < 3 || x > 21 || y < 1 || y > 23) return false;   // bbox early-out: most pixels are far from the pin
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const HOLE = { cx: 12, cy: 10, r: 3.2 };
const inPin = (x, y) => inPoly(x, y) && (x - HOLE.cx) ** 2 + (y - HOLE.cy) ** 2 > HOLE.r * HOLE.r;
const inHole = (x, y) => (x - HOLE.cx) ** 2 + (y - HOLE.cy) ** 2 <= HOLE.r * HOLE.r;

// --- canvas ---
// layers: array of {test(px,py)->bool, color:[r,g,b]} painted in order on top of `bg` ([r,g,b] or null=transparent)
function render(w, h, bg, layers) {
  const SS = 4;
  const buf = Buffer.alloc(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
          let c = bg;
          for (const l of layers) if (l.test(x, y)) c = l.color;
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS, i = (py * w + px) * 4;
      const covered = a / 255;
      buf[i] = covered ? Math.round(r / covered) : 0;
      buf[i + 1] = covered ? Math.round(g / covered) : 0;
      buf[i + 2] = covered ? Math.round(b / covered) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// pin of height `ph` px, horizontally centred at cx, top at top (pin spans y 1..23 in the viewBox, x 3..21)
function pinTests(cx, top, ph, color, holeColor) {
  const s = ph / 22;                       // px per viewBox unit
  const ox = cx - 12 * s, oy = top - 1 * s;
  const toBox = (x, y) => [(x - ox) / s, (y - oy) / s];
  const layers = [{ test: (x, y) => { const [u, v] = toBox(x, y); return inPin(u, v); }, color }];
  if (holeColor) layers.push({ test: (x, y) => { const [u, v] = toBox(x, y); return inHole(u, v); }, color: holeColor });
  return layers;
}

// --- PNG encoder ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(rel, w, h, bg, layers) {
  const out = path.join(__dirname, '..', rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const data = png(w, h, render(w, h, bg, layers));
  fs.writeFileSync(out, data);
  console.log('wrote', rel, w + 'x' + h, data.length, 'bytes');
}

// App icon: white pin on iris, opaque (Play and iOS reject transparency here).
write('assets/icon.png', 1024, 1024, IRIS, pinTests(512, 1024 * 0.2, 1024 * 0.6, WHITE, IRIS));
// Adaptive foreground: transparent; Android masks the outer ~1/3, so keep the pin in the central 66%.
write('assets/adaptive-icon.png', 1024, 1024, null, pinTests(512, 1024 * 0.27, 1024 * 0.46, WHITE, IRIS));
// Splash mark.
write('assets/splash-icon.png', 1024, 1024, null, pinTests(512, 1024 * 0.15, 1024 * 0.7, LOGO_RED, null));
// Play Store icon (512, opaque).
write('store/play-icon-512.png', 512, 512, IRIS, pinTests(256, 512 * 0.2, 512 * 0.6, WHITE, IRIS));

// Feature graphic: pin centred on iris with soft concentric "radar" rings.
const rings = [150, 235, 320, 405].map((r, i) => ({
  test: (x, y) => { const d = Math.hypot(x - 512, y - 250); return Math.abs(d - r) < 2.5; },
  color: [0x6b, 0x62, 0xe6].map((v, k) => Math.round(v - (v - IRIS[k]) * (i / 6))),
}));
write('store/feature-graphic-1024x500.png', 1024, 500, IRIS, [...rings, ...pinTests(512, 70, 360, WHITE, IRIS)]);
