#!/usr/bin/env node
/* eslint-disable */
// Post-export fix for Cloudflare Pages: CF Pages never uploads any directory
// named `node_modules`, so assets Metro places under dist/assets/node_modules/
// (Google fonts, expo-router PNGs) would 404 into the SPA fallback (index.html).
// Moves dist/assets/node_modules -> dist/assets/vendor and rewrites references.
// Web-only: touches nothing but the export output dir. Idempotent.
// Usage: node scripts/fix-web-assets.cjs [distDir=dist]
'use strict';
const fs = require('fs');
const path = require('path');

const dist = path.resolve(process.argv[2] || 'dist');
const FROM = 'assets/node_modules/';
const TO = 'assets/vendor/';
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.json', '.map', '.txt', '.xml', '.webmanifest']);

function fail(msg) { console.error(`[fix-web-assets] ERROR: ${msg}`); process.exit(1); }
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { out.push({ p, dir: true, name: e.name }); walk(p, out); }
    else out.push({ p, dir: false, name: e.name });
  }
  return out;
}

if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) fail(`output dir not found: ${dist}`);
const src = path.join(dist, 'assets', 'node_modules');
const dst = path.join(dist, 'assets', 'vendor');

// 1. Move the directory (skip if already done).
let moved = 0;
if (fs.existsSync(src)) {
  if (fs.existsSync(dst)) fail(`both ${src} and ${dst} exist; refusing to merge`);
  moved = walk(src).filter((e) => !e.dir).length;
  fs.renameSync(src, dst);
}

// 2. Rewrite references in text files (only the exact "assets/node_modules/" prefix).
let rewrittenFiles = 0, rewrittenRefs = 0;
for (const e of walk(dist)) {
  if (e.dir || !TEXT_EXT.has(path.extname(e.name).toLowerCase())) continue;
  const s = fs.readFileSync(e.p, 'utf8');
  if (!s.includes(FROM)) continue;
  const n = s.split(FROM).length - 1;
  if (!fs.existsSync(dst)) fail(`${e.p} references ${FROM} but ${dst} does not exist`);
  fs.writeFileSync(e.p, s.split(FROM).join(TO));
  rewrittenFiles++; rewrittenRefs += n;
}

// 3. Verify: no node_modules dir anywhere, no stale references left.
const left = walk(dist);
const nm = left.filter((e) => e.dir && e.name === 'node_modules');
if (nm.length) fail(`node_modules dir(s) still in output (CF Pages drops them):\n  ${nm.map((e) => e.p).join('\n  ')}`);
const stale = left.filter((e) => !e.dir && TEXT_EXT.has(path.extname(e.name).toLowerCase()) && fs.readFileSync(e.p, 'utf8').includes(FROM));
if (stale.length) fail(`stale "${FROM}" references remain in:\n  ${stale.map((e) => e.p).join('\n  ')}`);
if (moved && !rewrittenRefs) fail(`moved ${moved} file(s) but found no references to rewrite; bundle format changed?`);

console.log(moved || rewrittenRefs
  ? `[fix-web-assets] moved ${moved} file(s) to assets/vendor, rewrote ${rewrittenRefs} reference(s) in ${rewrittenFiles} file(s)`
  : '[fix-web-assets] nothing to do (no assets/node_modules)');
