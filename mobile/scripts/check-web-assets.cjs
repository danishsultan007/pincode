// Verifies every "/assets/..." URL in the exported JS/CSS/HTML maps to a real file
// and that no node_modules dir or reference remains. Usage: node check-web-assets.cjs <distDir>
'use strict';
const fs = require('fs'); const path = require('path');
const dist = path.resolve(process.argv[2] || 'dist');
const files = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? (e.name === 'node_modules' && files.push({ nm: p }), w(p)) : files.push({ p }); } })(dist);
let bad = 0, ok = 0;
for (const f of files) if (f.nm) { console.error('node_modules dir:', f.nm); bad++; }
for (const { p } of files.filter((f) => f.p && /\.(js|css|html|json|map)$/.test(f.p))) {
  const s = fs.readFileSync(p, 'utf8');
  if (s.includes('assets/node_modules/')) { console.error('stale ref in', p); bad++; }
  for (const m of s.matchAll(/["'`(]\/(assets\/[^"'`)?#\s]+)/g)) {
    const t = path.join(dist, decodeURIComponent(m[1]));
    if (fs.existsSync(t) && fs.statSync(t).isFile()) ok++; else { console.error('MISSING', m[1], 'referenced from', path.relative(dist, p)); bad++; }
  }
}
console.log(`checked ${ok + bad} item(s): ${ok} ok, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
