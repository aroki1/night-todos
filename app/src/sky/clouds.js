/* sky/clouds.js — half-res fbm clouds, bilinear upsample, refreshed in slices. */
import { fbm, sm, H } from '../math.js';
import { GW, SH, SR, SG, SB, CR, CG, CB, BARY, dpr, geometryListeners, onSkyReset } from '../framebuffer.js';
import { sky } from './sky.js';
import { T } from './clock.js';

let HW = Math.ceil(GW / 2), HH = Math.ceil(SH / 2), hr = new Float32Array(HW * HH * 3);
const TW = 96, TH = 48;
const ctabs = [0, 1, 2].map(() => [0, 1, 2, 3].map(() => ({ d: new Float32Array(TW * TH), x0: 0, y0: 0 })));
let cloudT = -9, cycT = 0, cycRow = HH;

function alloc() {
  HW = Math.max(1, Math.ceil(GW / 2)); HH = Math.max(1, Math.ceil(SH / 2));
  hr = new Float32Array(HW * HH * 3); cycRow = HH;
}
geometryListeners.push(alloc);
onSkyReset(() => { cloudT = -9; cycRow = HH; });

function Hc(t, o, ix, iy) {
  const a = ix - t.x0, b = iy - t.y0;
  if (a < 0 || b < 0 || a >= TW || b >= TH) return H(ix + o, iy);
  const k = a * TH + b; let v = t.d[k];
  if (v !== v) { v = H(ix + o, iy); t.d[k] = v; }
  return v;
}
function vnc(px, py, o, t) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = Hc(t, o, ix, iy), b = Hc(t, o, ix + 1, iy), c = Hc(t, o, ix, iy + 1), d = Hc(t, o, ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbmc(px, py, o, tabs) { let v = 0, a = .5, f = 1; for (let k = 0; k < 4; k++) { v += a * vnc(px * f, py * f, o, tabs[k]); f *= 2.03; a *= .5; } return v / .94; }
function prepTabs(tabs, axMin, ayMin) { let f = 1; for (let k = 0; k < 4; k++) { const t = tabs[k]; t.x0 = Math.floor(axMin * f) - 1; t.y0 = Math.floor(ayMin * f) - 1; t.d.fill(NaN); f *= 2.03; } }

export function cloudRows(t, j0, j1) {
  if (!sky) return;
  const o = sky.off, ca = sky.cl[0], cb = sky.cl[1], tw = ctabs[0], tn = ctabs[1], tm = ctabs[2], sw = .3 * Math.sin(t * .05);
  if (j0 === 0) { prepTabs(tw, t * 3 / 420 + sw, 0); prepTabs(tn, t * 3 / 230, -t * .004); prepTabs(tm, t * 3 / 600 - t * .002, 0); }
  for (let j = j0; j < j1; j++) for (let i = 0; i < HW; i++) {
    const px = i * 6 + t * 3, py = j * 6;
    const w = fbmc(px / 420 + sw, py / 420, o, tw);
    const n = fbmc(px / 230 + w * 1.6, py / 230 + w * .8 - t * .004, o + 31, tn);
    const m = fbmc(px / 600 - t * .002, py / 600, o + 57, tm);
    let a = sm(.5, .86, n) * (.55 + .45 * m) * sm(-10, BARY * .9, BARY - py + 40) * .3;
    if (a < 1e-5) a = 0;
    const k = sm(.35, .65, m), q = (j * HW + i) * 3;
    for (let c = 0; c < 3; c++) hr[q + c] = (ca[c] + (cb[c] - ca[c]) * k) * a;
  }
}
export function cloudUpsample(t) {
  const h = hr, cr = CR, cg = CG, cb = CB, sr = SR, sg = SG, sb = SB;
  for (let j = 0; j < SH; j++) for (let i = 0; i < GW; i++) {
    const fx = Math.min(HW - 1.001, i / 2), fy = Math.min(HH - 1.001, j / 2);
    const i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0, k = j * GW + i;
    const q00 = (j0 * HW + i0) * 3, q10 = q00 + 3, q01 = q00 + HW * 3, q11 = q01 + 3;
    cr[k] = sr[k] + (h[q00] * (1 - u) + h[q10] * u) * (1 - v) + (h[q01] * (1 - u) + h[q11] * u) * v;
    cg[k] = sg[k] + (h[q00 + 1] * (1 - u) + h[q10 + 1] * u) * (1 - v) + (h[q01 + 1] * (1 - u) + h[q11 + 1] * u) * v;
    cb[k] = sb[k] + (h[q00 + 2] * (1 - u) + h[q10 + 2] * u) * (1 - v) + (h[q01 + 2] * (1 - u) + h[q11 + 2] * u) * v;
  }
  cloudT = t;
}
export function clouds() { cloudRows(T, 0, HH); cloudUpsample(T); cycRow = HH; }
export function isCloudStale() { return cloudT < 0; }
export function cloudTime() { return cloudT; }
export function cloudReset() { cloudT = -9; cycRow = HH; }
/* live loop: refresh ~15x/s of sky time, each refresh spread over 5 frames (6 at dpr>=2) */
let paceFrames = 0;
export function setCloudPace(n) { paceFrames = n; }       // idle loop renders ~4x less often: finish a refresh in fewer renders (0 = default)
export function cloudsTick() {
  if (cycRow >= HH) { if (T - cloudT < .0625) return; cycT = T; cycRow = 0; }
  if (cycRow < HH) {
    const frames = paceFrames || (dpr >= 2 ? 6 : 5), chunk = Math.ceil(HH / frames);
    const j1 = Math.min(HH, cycRow + chunk);
    cloudRows(cycT, cycRow, j1); cycRow = j1;
    if (cycRow >= HH) cloudUpsample(cycT);
  }
}
export function cloudDebug(x, y) {
  const fx = Math.min(HW - 1.001, x / 2), fy = Math.min(HH - 1.001, y / 2), i0 = Math.floor(fx), j0 = Math.floor(fy);
  const q00 = (j0 * HW + i0) * 3;
  return { HW, HH, hrLen: hr.length, q00, h: [hr[q00], hr[q00 + 1], hr[q00 + 2], hr[q00 + 3], hr[q00 + 4], hr[q00 + 5]], cloudT, sky: sky && sky.cl };
}
/* full refresh when frozen (tests, sky swaps) */
export function cloudsForce() { cloudRows(T, 0, HH); cloudUpsample(T); cycRow = HH; }
