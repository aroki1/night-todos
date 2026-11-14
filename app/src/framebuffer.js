/* framebuffer.js — the grain framebuffer.
   Every visible thing in the sky is a value written here; nothing smooth is drawn over it.
   Geometry is live: every importer sees GW/SH/… change when the viewport changes. */
import { TONE, H } from './math.js';
import { BGPIX } from './tokens.js';
import * as pf from './stageprof.js';

export let dpr = 1, P = 3, D = 2;
export let GW = 404, SH = 196, ROWS = 216, N = GW * SH;
export let UW = GW * 3, UH = ROWS * 3, BARY = SH * 3;
export let cv = null, ctx = null, img = null, u32 = null;

export let BR, BG, BB;                 // composed light
export let SR, SG, SB;                 // sky gradient
export let CR, CG, CB;                 // gradient + clouds
export let OR, OG, OB;                 // old base (crossfade)
export let SBR, SBG, SBB, AGR, AGG, AGB, PROF;

function alloc() {
  const n = N;
  BR = new Float32Array(n); BG = new Float32Array(n); BB = new Float32Array(n);
  SR = new Float32Array(n); SG = new Float32Array(n); SB = new Float32Array(n);
  CR = new Float32Array(n); CG = new Float32Array(n); CB = new Float32Array(n);
  OR = new Float32Array(n); OG = new Float32Array(n); OB = new Float32Array(n);
  SBR = new Float32Array(n); SBG = new Float32Array(n); SBB = new Float32Array(n);
  AGR = new Float32Array(n); AGG = new Float32Array(n); AGB = new Float32Array(n);
  PROF = new Float32Array(SH);
}
alloc();

export const LM = [1, 1, 1];                 // layer multipliers (time of day, moon)
export const skyResets = [];
export function onSkyReset(fn) { skyResets.push(fn); }

export const geometryListeners = [];
let geometryVersion = 0;
export const getGeometryVersion = () => geometryVersion;

export function initCanvas(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
}

/* gw/sh are in grains; barRows in grains. ratio is devicePixelRatio. */
export function configure(gw, sh, barRows, ratio) {
  GW = Math.max(1, Math.round(gw)); SH = Math.max(1, Math.round(sh)); ROWS = SH + barRows;
  N = GW * SH; UW = GW * 3; UH = ROWS * 3; BARY = SH * 3;
  dpr = ratio; P = Math.max(3, Math.round(3 * dpr)); D = P - Math.max(1, Math.round(dpr));
  alloc();
  if (cv) {
    cv.width = GW * P; cv.height = ROWS * P;
    cv.style.width = (cv.width / dpr) + 'px'; cv.style.height = (cv.height / dpr) + 'px';
    img = ctx.createImageData(GW * P, SH * P); u32 = new Uint32Array(img.data.buffer); u32.fill(BGPIX);
  }
  geometryVersion++;
  for (const fn of geometryListeners) fn();
}

export function add(i, j, c, w) {
  if (i < 0 || j < 0 || i >= GW || j >= SH || w <= 0) return;
  const k = j * GW + i; BR[k] += c[0] * w; BG[k] += c[1] * w; BB[k] += c[2] * w;
}
export function over(i, j, c, a) {
  if (i < 0 || j < 0 || i >= GW || j >= SH || a <= 0) return;
  const k = j * GW + i; a = a > 1 ? 1 : a;
  BR[k] += (c[0] - BR[k]) * a; BG[k] += (c[1] - BG[k]) * a; BB[k] += (c[2] - BB[k]) * a;
}
/* bilinear splat by fractional position: anything that moves glides across grains */
export function splat(fx, fy, c, w) {
  const i = Math.floor(fx), j = Math.floor(fy); let u = fx - i, v = fy - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  add(i, j, c, w * (1 - u) * (1 - v)); add(i + 1, j, c, w * u * (1 - v));
  add(i, j + 1, c, w * (1 - u) * v); add(i + 1, j + 1, c, w * u * v);
}
export function halo(fx, fy, c, peak, sig, rad) {
  if (peak <= .002) return;
  const r = Math.ceil(rad), i0 = Math.round(fx), j0 = Math.round(fy), k2 = 1 / (2 * sig * sig), r2 = rad * rad;
  for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    const d2 = (i - fx) * (i - fx) + (j - fy) * (j - fy); if (d2 > r2) continue;
    add(i, j, c, peak * Math.exp(-d2 * k2));
  }
}
/* one ring of light: profile exp(-d^2/0.45), per-grain sparkle */
export function ring(cx, cy, rad, b, col) {
  if (b <= .002) return;
  const ri = Math.ceil(rad + 2);
  for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
    const d = Math.abs(Math.sqrt(i * i + j * j) - rad); if (d < 1.6) add(cx + i, cy + j, col, b * Math.exp(-d * d / .45) * (.6 + .4 * H(cx + i, cy + j)));
  }
}
/* terminal-style cell background: x0..x1, y0..y1 half-open; outermost ring is feathered */
export function dimRect(x0, y0, x1, y1, vis) {
  const f0 = 1 - (1 - .75) * vis, f1 = 1 - (1 - .625) * vis, fi = 1 - (1 - .5) * vis;
  for (let j = Math.max(0, y0); j < Math.min(SH, y1); j++) for (let i = Math.max(0, x0); i < Math.min(GW, x1); i++) {
    const e = Math.min(i - x0, x1 - 1 - i, j - y0, y1 - 1 - j), f = e === 0 ? f0 : e === 1 ? f1 : fi, k = j * GW + i;
    BR[k] *= f; BG[k] *= f; BB[k] *= f;
  }
}

/* grains to device pixels, drawn 1:1 */
export function blit() {
  const W = GW * P, br = BR, bg = BG, bb = BB, px = u32, d = D, pp = P, lut = TONE;
  for (let j = 0; j < SH; j++) {
    const row = j * pp * W;
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i, r = br[k], g = bg[k], b = bb[k];
      const p = (255 << 24) | ((b <= 0 ? 0 : b >= 1 ? 255 : lut[(b * 4096) | 0]) << 16) |
        ((g <= 0 ? 0 : g >= 1 ? 255 : lut[(g * 4096) | 0]) << 8) | (r <= 0 ? 0 : r >= 1 ? 255 : lut[(r * 4096) | 0]);
      const o = row + i * pp;
      for (let dy = 0; dy < d; dy++) { const oo = o + dy * W; for (let dx = 0; dx < d; dx++) px[oo + dx] = p; }
    }
  }
  if (pf.on) pf.mark('blit.paint');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(img, 0, 0);
  if (pf.on) pf.mark('blit.put');
}
