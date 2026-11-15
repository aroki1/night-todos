/* sky/clouds.js — half-res fbm clouds, bilinear upsample, refreshed in slices. */
import { fbm, sm, H, tone } from '../math.js';
import { GW, SH, SR, SG, SB, CR, CG, CB, BARY, dpr, geometryListeners, onSkyReset } from '../framebuffer.js';
import { sky } from './sky.js';
import { FLAGS } from '../tokens.js';
import * as gc from './cloudsgl.js';
import { T } from './clock.js';
import * as pf from '../stageprof.js';

let HW = Math.ceil(GW / 2), HH = Math.ceil(SH / 2), hr = new Float32Array(HW * HH * 3);
const TW = 96, TH = 48;
const mkTabs = () => [0, 1, 2, 3].map(() => ({ d: new Float32Array(TW * TH), x0: 0, y0: 0 }));
const ctabs = [0, 1, 2].map(mkTabs);
let cloudT = -9, cycT = 0, cycRow = HH, upRow = 0;
let gst = 0, gup = 0, gcyc = 0;      // ?gpuclouds=1 live state: 0 idle, 1 read in flight, 2 upsampling hr into CRn

/* live path only (the exact path above stays as it was): the slow layers w (scale 420) and m (scale 600) are keyframed every KP s of sky time and
   interpolated; keyframe C (the next one, tC = tB + KP) is computed ahead over the slices, so nothing lags. CRn/CGn/CBn double-buffer the upsample. */
const KP = .5;
let kA, kB, kC, kfOk = false, kOff = NaN, tA = 0, tB = 0, tC = 0, crow = 0, CRn, CGn, CBn, colI0 = new Int32Array(0), colU = new Float64Array(0);
const ktw = mkTabs(), ktm = mkTabs();
const mkS = () => ({ ix: new Float64Array(4), iy: new Float64Array(4), a: new Float64Array(4), b: new Float64Array(4), c: new Float64Array(4), d: new Float64Array(4) });
const Sw = mkS(), Sn = mkS(), Sm = mkS();

function alloc() {
  HW = Math.max(1, Math.ceil(GW / 2)); HH = Math.max(1, Math.ceil(SH / 2));
  hr = new Float32Array(HW * HH * 3); cycRow = HH; upRow = 0; gst = 0; gc.resize(HW, HH);
  const mk = () => ({ w: new Float32Array(HW * HH), m: new Float32Array(HW * HH) });
  kA = mk(); kB = mk(); kC = mk(); kfOk = false; crow = HH;
  CRn = new Float32Array(GW * SH); CGn = new Float32Array(GW * SH); CBn = new Float32Array(GW * SH);
  colI0 = new Int32Array(GW); colU = new Float64Array(GW);
  for (let i = 0; i < GW; i++) { const fx = Math.min(HW - 1.001, i / 2), i0 = Math.floor(fx); colI0[i] = i0; colU[i] = fx - i0; }
}
alloc();
geometryListeners.push(alloc);
onSkyReset(() => { cloudT = -9; cycRow = HH; kfOk = false; gst = 0; gc.drop(); });

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
/* bilinear upsample of output rows j0..j1-1 into cr/cg/cb (same arithmetic as the original per-pixel loop; column terms hoisted) */
function upRows(j0, j1, cr, cg, cb) {
  const h = hr, sr = SR, sg = SG, sb = SB, ci = colI0, cu = colU, hw3 = HW * 3;
  for (let j = j0; j < j1; j++) {
    const fy = Math.min(HH - 1.001, j / 2), jj = Math.floor(fy), v = fy - jj, rb = jj * HW, ow = j * GW;
    for (let i = 0; i < GW; i++) {
      const u = cu[i], k = ow + i;
      const q00 = (rb + ci[i]) * 3, q10 = q00 + 3, q01 = q00 + hw3, q11 = q01 + 3;
      cr[k] = sr[k] + (h[q00] * (1 - u) + h[q10] * u) * (1 - v) + (h[q01] * (1 - u) + h[q11] * u) * v;
      cg[k] = sg[k] + (h[q00 + 1] * (1 - u) + h[q10 + 1] * u) * (1 - v) + (h[q01 + 1] * (1 - u) + h[q11 + 1] * u) * v;
      cb[k] = sb[k] + (h[q00 + 2] * (1 - u) + h[q10 + 2] * u) * (1 - v) + (h[q01 + 2] * (1 - u) + h[q11 + 2] * u) * v;
    }
  }
}
export function cloudUpsample(t) { upRows(0, SH, CR, CG, CB); cloudT = t; }
/* GPU path for the exact formula: fills hr (same layout as cloudRows). false = use the CPU */
function gpuFill(t, dst) { return FLAGS.gpuclouds && !!sky && gc.ok() && gc.render(t, sky.off, sky.cl[0], sky.cl[1], BARY) && gc.readSync(dst); }
export function clouds() { if (!gpuFill(T, hr)) cloudRows(T, 0, HH); cloudUpsample(T); cycRow = HH; gst = 0; gc.drop(); }
export function isCloudStale() { return cloudT < 0; }
export function cloudTime() { return cloudT; }
export function cloudReset() { cloudT = -9; cycRow = HH; }
/* live loop: refresh ~15x/s of sky time, each refresh spread over 5 frames (6 at dpr>=2) */
let paceFrames = 0;
export function setCloudPace(n) { paceFrames = n; }       // idle loop renders ~4x less often: finish a refresh in fewer renders (0 = default)
/* value noise with the lattice cell cached per octave: consecutive cells of a row mostly share it.
   cut: if the result is certain to stay <= cut, stop early and return an upper bound (<= cut); the cloud density is exactly 0 there anyway */
const REM = [.9375, .4375, .1875, .0625];     // most the octaves k..3 can still add (each noise value is <= 1)
function fbmS(px, py, o, tabs, S, cut) {
  let v = 0, a = .5, f = 1;
  for (let k = 0; k < 4; k++) {
    const x = px * f, y = py * f, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    if (ix !== S.ix[k] || iy !== S.iy[k]) { const t = tabs[k]; S.ix[k] = ix; S.iy[k] = iy; S.a[k] = Hc(t, o, ix, iy); S.b[k] = Hc(t, o, ix + 1, iy); S.c[k] = Hc(t, o, ix, iy + 1); S.d[k] = Hc(t, o, ix + 1, iy + 1); }
    const A = S.a[k], B = S.b[k], C = S.c[k], D = S.d[k];
    v += a * (A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy); f *= 2.03; a *= .5;
    if (cut && k < 3 && (v + REM[k + 1]) / .94 <= cut) return (v + REM[k + 1]) / .94;      // cannot reach `cut`: the caller only needs to know that
  }
  return v / .94;
}
const rowReset = S => { S.ix.fill(1e9); S.iy.fill(1e9); };
function kfPrep(t) { const sw = .3 * Math.sin(t * .05); prepTabs(ktw, t * 3 / 420 + sw, 0); prepTabs(ktm, t * 3 / 600 - t * .002, 0); }
function kfRows(K, t, j0, j1) {
  const o = sky.off, sw = .3 * Math.sin(t * .05);
  for (let j = j0; j < j1; j++) {
    rowReset(Sw); rowReset(Sm);
    for (let i = 0; i < HW; i++) {
      const px = i * 6 + t * 3, py = j * 6, q = j * HW + i;
      K.w[q] = fbmS(px / 420 + sw, py / 420, o, ktw, Sw);
      K.m[q] = fbmS(px / 600 - t * .002, py / 600, o + 57, ktm, Sm);
    }
  }
}
function kfStartC() { tC = tB + KP; kfPrep(tC); crow = 0; }
function kfAdvanceC(to) { if (to > crow) { kfRows(kC, tC, crow, to); crow = to; } }
/* make A (<= t) and B (> t) valid; rotate when t crosses tB, rebuild after a jump or a sky change */
function kfEnsure(t) {
  if (kfOk && kOff === sky.off && t >= tA && t < tB) return;
  if (kfOk && kOff === sky.off && t >= tB && t < tB + KP) {
    kfAdvanceC(HH);
    const a = kA; kA = kB; kB = kC; kC = a; tA = tB; tB = tC; kfStartC(); return;
  }
  tA = Math.floor(t / KP) * KP; tB = tA + KP;
  kfPrep(tA); kfRows(kA, tA, 0, HH); kfPrep(tB); kfRows(kB, tB, 0, HH);
  kfStartC(); kOff = sky.off; kfOk = true;
}
function cloudRowsLive(t, j0, j1) {
  if (!sky) return;
  const o = sky.off, ca = sky.cl[0], cb = sky.cl[1], tn = ctabs[1], u = (t - tA) / KP, wA = kA.w, wB = kB.w, mA = kA.m, mB = kB.m;
  if (j0 === 0) prepTabs(tn, t * 3 / 230, -t * .004);
  for (let j = j0; j < j1; j++) {
    rowReset(Sn);
    const rf = sm(-10, BARY * .9, BARY - j * 6 + 40);
    for (let i = 0; i < HW; i++) {
      const px = i * 6 + t * 3, py = j * 6, q0 = j * HW + i;
      const w = wA[q0] + (wB[q0] - wA[q0]) * u, m = mA[q0] + (mB[q0] - mA[q0]) * u;
      const n = fbmS(px / 230 + w * 1.6, py / 230 + w * .8 - t * .004, o + 31, tn, Sn, .5);
      let a = sm(.5, .86, n) * (.55 + .45 * m) * rf * .3;
      if (a < 1e-5) a = 0;
      const k = sm(.35, .65, m), q = q0 * 3;
      for (let c = 0; c < 3; c++) hr[q + c] = (ca[c] + (cb[c] - ca[c]) * k) * a;
    }
  }
}
/* live loop on the GPU: render the whole grid, read it back through a pack buffer and a fence (never waits), then upsample in slices and publish */
function gpuTick() {
  if (gst === 0) {
    if (T - cloudT < .0625) return;
    gcyc = T;
    if (!gc.render(gcyc, sky.off, sky.cl[0], sky.cl[1], BARY) || !gc.readStart()) return;
    gst = 1; if (pf.on) pf.lap('clouds.kf'); return;
  }
  if (gst === 1) {
    const r = gc.readPoll(hr);
    if (pf.on) pf.lap('clouds.rows');
    if (r < 0) { gst = 0; return; }
    if (r === 0) return;
    gst = 2; gup = 0;
  }
  const frames = paceFrames || (dpr >= 2 ? 6 : 5), lim = Math.min(SH, gup + Math.ceil(SH / frames));
  upRows(gup, lim, CRn, CGn, CBn); gup = lim;
  if (gup >= SH) { CR.set(CRn); CG.set(CGn); CB.set(CBn); cloudT = gcyc; gst = 0; }
  if (pf.on) pf.lap('clouds.upsample');
}
export function cloudsTick() {
  if (!sky) return;
  if (FLAGS.gpuclouds) { if (gc.ok()) return gpuTick(); if (gst) { gst = 0; cycRow = HH; } }
  if (cycRow >= HH) { if (T - cloudT < .0625) return; cycT = T; cycRow = 0; upRow = 0; }
  const frames = paceFrames || (dpr >= 2 ? 6 : 5), chunk = Math.ceil(HH / frames);
  const j1 = Math.min(HH, cycRow + chunk);
  if (cycRow === 0) kfEnsure(cycT);
  kfAdvanceC(Math.min(HH, Math.ceil(HH * (T - tA) / (KP * .75))));
  if (pf.on) pf.lap('clouds.kf');
  cloudRowsLive(cycT, cycRow, j1); cycRow = j1;
  if (pf.on) pf.lap('clouds.rows');
  /* upsample the output rows whose two source rows are done; the last slice finishes the grid, then the buffer is published in one go */
  const lim = cycRow >= HH ? SH : Math.min(SH, 2 * cycRow - 2);
  if (lim > upRow) { upRows(upRow, lim, CRn, CGn, CBn); upRow = lim; }
  if (cycRow >= HH) { CR.set(CRn); CG.set(CGn); CB.set(CBn); cloudT = cycT; }
  if (pf.on) pf.lap('clouds.upsample');
}
export function cloudDebug(x, y) {
  const fx = Math.min(HW - 1.001, x / 2), fy = Math.min(HH - 1.001, y / 2), i0 = Math.floor(fx), j0 = Math.floor(fy);
  const q00 = (j0 * HW + i0) * 3;
  return { HW, HH, hrLen: hr.length, q00, h: [hr[q00], hr[q00 + 1], hr[q00 + 2], hr[q00 + 3], hr[q00 + 4], hr[q00 + 5]], cloudT, sky: sky && sky.cl };
}
/* full refresh when frozen (tests, sky swaps) */
export function cloudsForce() { if (!gpuFill(T, hr)) cloudRows(T, 0, HH); cloudUpsample(T); cycRow = HH; gst = 0; gc.drop(); }
/* dev: which path the clouds take, and why */
export function cloudsPath() { if (!FLAGS.gpuclouds) return { path: 'cpu', why: 'flag off' }; return gc.ok() ? { path: 'gpu', why: '' } : { path: 'cpu', why: gc.why() }; }
export const cloudsGpuStats = () => ({ ...gc.stats, error: gc.error() });
/* dev: the CPU exact path against the GPU path at the current T, into scratch buffers (the live ones stay as they are) */
export function cloudsCompare() {
  if (!sky) return { err: 'no sky' };
  if (!gc.ok()) return { err: gc.why() };
  const live = hr, n = GW * SH, mk = () => [new Float32Array(n), new Float32Array(n), new Float32Array(n)], hc = new Float32Array(live.length), hg = new Float32Array(live.length), A = mk(), B = mk();
  hr = hc; cloudRows(T, 0, HH); upRows(0, SH, A[0], A[1], A[2]);
  const g = gc.render(T, sky.off, sky.cl[0], sky.cl[1], BARY) && gc.readSync(hg);
  if (g) { hr = hg; upRows(0, SH, B[0], B[1], B[2]); }
  hr = live;
  if (cycRow < HH) cycRow = HH;                  // the CPU compare used the live lattice tables: restart a half-done refresh
  gst = 0; gc.drop();
  if (!g) return { err: gc.why() };
  let hrMax = 0, crMax = 0, tMax = 0, tOver = 0;
  for (let i = 0; i < hc.length; i++) hrMax = Math.max(hrMax, Math.abs(hc[i] - hg[i]));
  for (let c = 0; c < 3; c++) for (let k = 0; k < n; k++) {
    crMax = Math.max(crMax, Math.abs(A[c][k] - B[c][k]));
    const d = Math.abs(tone(A[c][k]) - tone(B[c][k])); if (d > tMax) tMax = d; if (d > 1) tOver++;
  }
  return { hrMaxAbs: hrMax, crMaxAbs: crMax, tone8Max: tMax, tone8Over1Share: tOver / (3 * n), grains: n, HW, HH };
}
