/* scripts/parity.mjs — pixel-diff app/ (?v10parity=1) against prototype/v10.html in headless Edge.
   node scripts/parity.mjs   (needs `npm run dev` on :5173). Regions: sky / labels / bar / bar-right. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path'; import os from 'node:os'; import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const base = 'seed=7&clock=2026-11-13T21:00';
const scenes = {
  ambient: 'dev=1&demo=1&' + base + '&t=12&freeze=1',
  'finish-1200': 'dev=1&demo=1&' + base + '&scene=finish&star=patterns%20quiz%20prep&t=0&at=1200',
  'moon-comet': 'dev=1&demo=1&' + base.replace('seed=7', 'seed=' + (process.env.SEED || 2)) + '&t=12&freeze=1'
};
function decode(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, ct, idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? out[y * st + x - bpp] : 0, u = y ? out[(y - 1) * st + x] : 0, c = x >= bpp && y ? out[(y - 1) * st + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      out[y * st + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'par-'));
const shot = (url, out) => execFileSync('node', [path.join(root, 'scripts/cdp.mjs'), url, out, '--wait', '2500'], { stdio: 'pipe' });
let worst = 0;
for (const [name, q] of Object.entries(scenes)) {
  const a = path.join(tmp, name + '-v10.png'), b = path.join(tmp, name + '-app.png');
  shot(pathToFileURL(path.join(root, 'prototype/v10.html')).href + '?' + q, a);
  shot('http://127.0.0.1:5173/?v10parity=1&' + q, b);
  const A = decode(a), B = decode(b); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const reg = {};
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp; let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.data[i + k] - B.data[i + k]));
    if (d > 0) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); const r = y >= 6 + 196 * 3 ? (x > 800 ? 'bar-right' : 'bar') : 'sky/labels'; reg[r] = (reg[r] || 0) + 1; }
  }
  console.log(name.padEnd(12), 'diff px:', n, n ? 'bbox ' + [x0, y0, x1, y1] : '', JSON.stringify(reg));
  fs.copyFileSync(b, path.join(root, 'prototype/shots/v11/parity-' + name + '.png'));
}
