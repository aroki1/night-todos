/* sky/land.js — morning hills and grass (static in M1). Blades live in a table that build() fills when the geometry or scene changes;
   `sway` is per blade and 0 in M1 (M4 animates it); `lean` is the blade's own static curve. */
import { lerp, vn, fbm, H, sm } from '../math.js';
import { GW, SH, BR, BG, BB } from '../framebuffer.js';
import { MORNING } from '../tokens.js';
import { gn } from './day.js';
import { inWater } from './valley.js';

const FAR_HAZE = 0.55, FAR_SKYMID = 0.15, NEAR_DARK = 0.4, RIM = 0.1;   // far hill toward the sky, near hill toward shadow, sun-lit crest
const FAR_UP = 9, FAR_AMP = 15, NEAR_DN = 5, NEAR_AMP = 15;           // crest offset against the horizon and wobble, grains
const TILT = 0.08;                                                    // the whole horizon leans a little across the width
const H_NEAR = 15, H_FAR = 2.5, HEXP = 1.25;                          // blade height (grains) at the viewer / at the horizon, and its growth
const P_FAR = 0.2, P_NEAR = 0.014, PEXP = 1.8;                        // blade base chance per grain: dense far, sparse near
const GJIT = 0.012;                                                   // ground grain jitter (kept low: the ground is a calm field)
const TB = 8, UB = 4;
let rimK = new Float32Array(0);
const RL = MORNING.light;
const sunNear = (sc, i) => { const d = (i - sc.sun.x) / (GW * RL.rimSpread); return RL.rimBase + (1 - RL.rimBase) * Math.exp(-d * d); };   // 1 under the sun, fading to the sides                                                 // colour buckets: distance haze, blade variation

let tab = null, key = '', nearLine = null, farLine = null, rel = null;   // rel: the rolling ground, -0.5..0.5 per grain (crest +, hollow -)
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sceneKey = sc => sc.seed + ':' + GW + 'x' + SH + ':' + sc.horizon;

function lines(sc) {
  const o = sc.seed % 997, far = new Float32Array(GW), near = new Float32Array(GW);
  for (let i = 0; i < GW; i++) {
    const x = i / GW - 0.5;
    far[i] = sc.horizon - FAR_UP + FAR_AMP * (vn(i * 0.0045 + 3, 0.5, o) * 0.7 + vn(i * 0.012, 1.5, o + 5) * 0.3 - 0.5) + x * TILT * SH;
    near[i] = sc.horizon + NEAR_DN + NEAR_AMP * (vn(i * 0.007 + 40, 2.5, o + 11) * 0.75 + vn(i * 0.02, 3.5, o + 17) * 0.25 - 0.5) - x * TILT * SH * 0.6;
  }
  farLine = far; nearLine = near;
}

function build(sc) {
  lines(sc);
  const o = sc.seed % 997, cap = GW * SH / 3 | 0;
  const bx = new Int16Array(cap), by = new Int16Array(cap), bh = new Uint8Array(cap), bn = new Int8Array(cap), bu = new Uint8Array(cap), bt = new Uint8Array(cap);
  let m = 0;
  for (let y = Math.floor(sc.horizon) - 12; y < SH; y++) for (let i = 0; i < GW && m < cap; i++) {
    const top = nearLine[i], t = (y - top) / (SH - top); if (t < 0) continue;
    const dens = 0.55 + 1.0 * (fbm(i * 0.03, y * 0.06, o) - 0.5);                       // patches: tufts and bare runs
    const p = (P_NEAR + (P_FAR - P_NEAR) * Math.pow(1 - t, PEXP)) * Math.max(0.15, dens) * 1.6;
    if (H(i * 1.37 + o, y * 0.91) >= p || inWater(sc, i, y, 1.5)) continue;
    const u = H(i + 0.3, y + o), v = H(y * 0.7 + 5, i * 0.3 + o);
    const h = Math.max(2, Math.round(lerp(H_FAR, H_NEAR, Math.pow(t, HEXP)) * (0.7 + 0.6 * u)));
    bx[m] = i; by[m] = y; bh[m] = h; bu[m] = Math.min(UB - 1, (u * UB) | 0); bt[m] = Math.min(255, (t * 255) | 0);
    bn[m] = Math.round((v * 2 - 1) * h * 0.3);
    m++;
  }
  rel = new Float32Array(GW * SH);                                                      // gentle rolling bands: low-frequency noise, stretched across the view, tilted a little
  for (let y = Math.max(0, Math.floor(sc.horizon) - 12); y < SH; y++) for (let i = 0; i < GW; i++) {
    const d = Math.max(0, y - nearLine[i]) / Math.max(1, SH - nearLine[i]), fy = 0.05 + 0.1 * d, fx = 0.006 + 0.01 * d;                     // bands get broader toward the viewer
    rel[y * GW + i] = (vn(i * fx + y * 0.003 + 60, y * fy, o + 51) * 0.7 + vn(i * fx * 2.3 + 9, y * fy * 2.1, o + 57) * 0.3 - 0.5) * 1.5;
  }
  tab = { n: m, bx, by, bh, bn, bu, bt, sway: new Float32Array(m) }; key = sceneKey(sc);
}
const ensure = sc => { if (!tab || key !== sceneKey(sc)) build(sc); };

/* a hill: soft crest (one fractional grain), tone from `top` (hazy, rim-lit) to `bot`, calm low-frequency patches */
function fillHill(line, top, bot, rim, o) {
  for (let i = 0; i < GW; i++) {
    for (let j = Math.max(0, Math.ceil(line[i]) - 1); j < SH; j++) {
      const k = j * GW + i, depth = j - line[i]; if (depth < -1) continue;
      const a = depth < 0 ? 1 + depth : 1, f = Math.min(1, depth / 22), lit = depth < 1.5 ? 1 + RIM * rim : 1;
      const patch = 1 + (vn(i * 0.02, j * 0.06, o) - 0.5) * 0.1 + gn(i, j) * GJIT;
      const r = lerp(top[0], bot[0], f) * lit * patch, g = lerp(top[1], bot[1], f) * lit * patch, b = lerp(top[2], bot[2], f) * lit * patch;
      BR[k] += (r - BR[k]) * a; BG[k] += (g - BG[k]) * a; BB[k] += (b - BB[k]) * a;
    }
  }
}

/* the ground under the blades: a calm field, haze above, deeper green below (blades supply the texture) */
function drawGround(sc, hillTop) {
  const g = sc.pal.grass, deep = mix3(g[1], g[3], 0.32), o = sc.seed % 997;
  for (let i = 0; i < GW; i++) {
    const top = Math.max(0, Math.ceil(nearLine[i])), span = SH - nearLine[i];
    for (let j = top; j < SH; j++) {
      const t = sm(0, 1, (j - nearLine[i]) / span), k = j * GW + i, rl = rel[k], u = (1 + (vn(i * 0.025, j * 0.1, o + 3) - 0.5) * 0.1 + gn(i + 5, j) * GJIT) * (1 + rl * RL.roll);
      const w = Math.max(0, rl) * RL.rollWarm * sunNear(sc, i) * (0.4 + 0.6 * t);                      // light crests catch a little gold, hollows stay dark
      BR[k] = lerp(lerp(hillTop[0], deep[0], t) * u, RL.rim[0], w); BG[k] = lerp(lerp(hillTop[1], deep[1], t) * u, RL.rim[1], w); BB[k] = lerp(lerp(hillTop[2], deep[2], t) * u, RL.rim[2], w);
    }
  }
}

/* the hill crest lines (rows, per column): far = the tree line's ridge, near = where the meadow begins */
export function hillLines(sc) { ensure(sc); return { far: farLine, near: nearLine }; }

/* `between` runs after the far hill and before the near one (the tree line goes there) */
export function drawHills(sc, between) {
  ensure(sc);
  const g = sc.pal.grass, sky = sc.pal.sky, o = sc.seed % 997;
  const farTop = mix3(mix3(g[0], sky[2], FAR_HAZE), sky[1], FAR_SKYMID), farBot = mix3(g[0], sky[2], FAR_HAZE * 0.55);
  const nearTop = mix3(mix3(g[0], g[1], 0.4), g[3], NEAR_DARK), nearBot = mix3(g[1], g[3], 0.2);
  fillHill(farLine, farTop, farBot, 0.6, o + 21);
  if (between) between();
  fillHill(nearLine, nearTop, nearBot, 1, o + 33);
  drawGround(sc, nearBot);
}

export function drawGrass(sc) {
  ensure(sc);
  const g = sc.pal.grass, hz = sc.pal.sky[2];
  /* palettes by distance bucket (haze toward the hill colour) and blade variation: [base, body, mid, tip] */
  const hazeC = mix3(g[0], hz, 0.25), pal = [];
  for (let tb = 0; tb < TB; tb++) {
    const hz2 = Math.pow(1 - tb / (TB - 1), 1.4) * 0.6, row = [];
    for (let ub = 0; ub < UB; ub++) {
      const body = mix3(mix3(g[1], g[3], 0.18), g[2], ub * 0.05), tip = mix3(g[2], [1, 1, 0.9], 0.15 + ub * 0.05);
      row.push([mix3(mix3(g[1], g[3], 0.72), hazeC, hz2), mix3(body, hazeC, hz2), mix3(mix3(body, tip, 0.45), hazeC, hz2), mix3(tip, hazeC, hz2 * 0.8)]);
    }
    pal.push(row);
  }
  const { n, bx, by, bh, bn, bu, bt, sway } = tab;
  if (rimK.length !== GW) rimK = new Float32Array(GW);
  for (let i = 0; i < GW; i++) rimK[i] = sunNear(sc, i) * RL.rimGrass;
  for (let b = 0; b < n; b++) {
    const i0 = bx[b], y = by[b], h = bh[b], cs = pal[Math.min(TB - 1, (bt[b] / 255 * TB) | 0)][bu[b]], lean = bn[b], sw = sway[b], thick = h > 4;
    const kl = 1 + rel[y * GW + i0] * RL.roll, rk = rimK[i0] * (0.5 + 0.5 * (bt[b] / 255));
    for (let q = 0; q < h; q++) {
      const f = h > 1 ? q / (h - 1) : 0, i = i0 + Math.round((lean + sw) * f * f), j = y - q;
      if (j < 0 || j >= SH || inWater(sc, i, j, 0.5)) continue;
      const c = q < (h > 8 ? 2 : 1) ? cs[0] : q >= h - (h > 6 ? 2 : 1) ? cs[3] : q > h * 0.5 ? cs[2] : cs[1];
      const tip = q >= h - 1 ? rk : q >= h - 2 ? rk * 0.5 : 0;                                       // the rim: warm gold on the tips, strongest under the sun
      if (i >= 0 && i < GW) { const k = j * GW + i; BR[k] = lerp(c[0] * kl, RL.rim[0], tip); BG[k] = lerp(c[1] * kl, RL.rim[1], tip); BB[k] = lerp(c[2] * kl, RL.rim[2], tip); }
      if (thick && q < h - 2 && i + 1 < GW && i >= -1) { const k = j * GW + i + 1, c2 = q < 2 ? cs[0] : cs[1]; BR[k] = c2[0]; BG[k] = c2[1]; BB[k] = c2[2]; }
    }
  }
}

