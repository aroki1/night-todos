/* sky/moon.js — the real-phase moon, its rise/set window and its placement. */
import { clamp01, ease, rng } from '../math.js';
import { C, SIZE, FLAGS } from '../tokens.js';
import { GW, SH, add, over, onSkyReset } from '../framebuffer.js';
import { sky } from './sky.js';
import { T, wall, moonAge, moonK, moonUp, moonWindowOpacity, SYNODIC } from './clock.js';
import { stars, NS, Rb } from '../model/store.js';
import { lab, edgeList, setMoonClear } from '../model/placement.js';

export const moonSt = { init: false, x: 0, y: 0, ox: 0, oy: 0, t0: -99, show: false, k: 0, age: 0, tileKey: -1, tile: null };

function distToSeg(px, py, ax, ay, ux, uy, s0, s1) {
  const t = Math.max(s0, Math.min(s1, (px - ax) * ux + (py - ay) * uy));
  return Math.hypot(px - (ax + ux * t), py - (ay + uy * t));
}
/* 14 grains of clear sky around the disc: from stars, labels, and edge lines (6 grains) */
export function moonOK(x, y) {
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (!(s.on || (s.gh && s.ghA > .5))) continue;
    if (Math.hypot(x - s.gx, y - s.gy) - Rb(s) < 5 + SIZE.moonClearStars) return false;
    const L = lab[i];
    if (L.shown && L.bx0 !== undefined) {
      const dx = Math.max(L.bx0 - x, 0, x - L.bx1), dy = Math.max(L.by0 - y, 0, y - L.by1);
      if (Math.hypot(dx, dy) < 5 + SIZE.moonClearStars) return false;
    }
  }
  if (!FLAGS.parity) for (let e = 0; e < edgeList.length; e += 6) {
    if (distToSeg(x, y, edgeList[e], edgeList[e + 1], edgeList[e + 2], edgeList[e + 3], edgeList[e + 4], edgeList[e + 5]) < 5 + SIZE.moonClearEdges) return false;
  }
  return true;
}
export function moonClear(gx, gy) {
  if (!moonSt.show || !moonSt.init) return true;
  return Math.hypot(gx - moonSt.x, gy - moonSt.y) > 5 + SIZE.moonClearStars;
}
setMoonClear(moonClear);

export function moonPick() {
  const r = rng((sky.seed * 31 + 7) >>> 0);
  let best = null, bd = -1;
  for (let k = 0; k < 80; k++) {
    const x = 30 + Math.floor(r() * (GW - 60)), y = 14 + Math.floor(r() * (SH * .4 - 14 - 6));
    if (moonOK(x, y)) return { x, y };
    const d = Math.hypot(x - 200, y - 40);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}
export function resetMoon() { moonSt.init = false; moonSt.tileKey = -1; }
onSkyReset(resetMoon);

export function moonUpdate() {
  const M = moonSt, age = moonAge(wall(T));
  M.age = age; M.k = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
  M.op = FLAGS.parity ? 1 : moonWindowOpacity(T);
  M.show = M.k >= .03 && (FLAGS.parity || M.op > 0);
  if (!M.init || !moonOK(M.x, M.y)) {
    const np = moonPick();
    if (!M.init) { M.x = np.x; M.y = np.y; M.init = true; }
    else if (np.x !== M.x || np.y !== M.y) { M.ox = M.x; M.oy = M.y; M.x = np.x; M.y = np.y; M.t0 = T; }
  }
}
function moonTileFor(age, k) {                       // cached per hour of lunar age: lit / earthshine grains and the halo
  const key = Math.round(age * 24); if (moonSt.tileKey === key) return moonSt.tile;
  const ph = 2 * Math.PI * age / SYNODIC, cp = Math.cos(ph), waxing = age < SYNODIC / 2, E = [], Lt = [];
  for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
    const d = Math.hypot(i, j), dc = clamp01(5.5 - d); if (dc <= 0) continue;
    const w = Math.sqrt(Math.max(0, 25 - j * j)), tc = waxing ? clamp01(i - w * cp + .5) : clamp01(-w * cp - i + .5);
    if (dc * (1 - tc) > .01) E.push(i, j, .22 * dc * (1 - tc));
    if (dc * tc > .01) Lt.push(i, j, .9 * dc * tc);
  }
  const hp = .05 + .10 * k, HR2 = 22, hw = HR2 * 2 + 1, Hh = new Float32Array(hw * hw);
  for (let j = -HR2; j <= HR2; j++) for (let i = -HR2; i <= HR2; i++) {
    const d2 = i * i + j * j; if (d2 <= HR2 * HR2) Hh[(j + HR2) * hw + i + HR2] = hp * Math.exp(-d2 / 98);
  }
  moonSt.tileKey = key; moonSt.tile = { E, Lt, Hh, hw, HR2 }; return moonSt.tile;
}
function drawMoonAt(cx, cy, op) {
  const tl = moonSt.tile, hw = tl.hw, R2 = tl.HR2, Hh = tl.Hh, mc = C.moonH;
  for (let j = -R2; j <= R2; j++) for (let i = -R2; i <= R2; i++) {
    const v = Hh[(j + R2) * hw + i + R2]; if (v > 0) add(cx + i, cy + j, mc, v * op);
  }
  for (let q = 0; q < tl.E.length; q += 3) over(cx + tl.E[q], cy + tl.E[q + 1], C.moonE, tl.E[q + 2] * op);
  for (let q = 0; q < tl.Lt.length; q += 3) over(cx + tl.Lt[q], cy + tl.Lt[q + 1], C.moonL, tl.Lt[q + 2] * op);
}
export function drawMoon() {
  const M = moonSt;
  if (!M.show || !M.init) return;
  moonTileFor(M.age, M.k);
  const k = ease.inOut(clamp01((T - M.t0) / 2));
  const op = M.op === undefined ? 1 : M.op;
  if (k < 1) { drawMoonAt(M.ox, M.oy, (1 - k) * op); drawMoonAt(M.x, M.y, k * op); }
  else drawMoonAt(M.x, M.y, op);
}
