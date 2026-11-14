/* sky/life.js — the living hold (M4b): the wind and the rare, slow life of the morning meadow.
   Everything here is a closed-form function of sky time T and the week's seed: no state steps from frame to frame, so a frozen frame is deterministic.
   wind: one value per column (a base sway and gusts that travel along x); grass and flowers read it.
   life: pollen, dew, butterflies and a distant flock of birds. Each kind is on or off per time slot (hash of the seed); a season has at most 2 kinds besides the birds,
   and a flock only crosses when at most 1 of them is on, so at most 2 kinds are ever visible at once. */
import { MORNING } from '../tokens.js';
import { H, vn, lerp, sm } from '../math.js';
import { GW, SH, over } from '../framebuffer.js';
import { bladeTip } from './land.js';

const WD = MORNING.wind, GU = WD.gust, LF = MORNING.life, BD = LF.birds;

export const wind = { col: new Float32Array(0) };

/* the wind at sky time T into wind.col (tip offset per unit of blade height, positive = to the right), scaled by k (0..1) */
export function windStep(sc, T, k) {
  if (wind.col.length !== GW) wind.col = new Float32Array(GW);
  const c = wind.col, o = sc.seed % 997, wt = T * WD.w;
  for (let i = 0; i < GW; i++) c[i] = WD.lean + WD.amp * Math.sin(wt + i * WD.k);
  const life = (GW + 6 * GU.sig) / GU.speed;                                     // how long a gust takes to cross the frame
  for (let n = Math.floor((T - life) / GU.every) - 1, ne = Math.ceil(T / GU.every) + 1; n <= ne; n++) {
    const s = n * GU.every + (H(n, o) - 0.5) * GU.jit;                           // gust n starts at s: 6 to 14 s after the one before
    if (T < s) continue;
    const p = -3 * GU.sig + GU.speed * (T - s); if (p > GW + 3 * GU.sig) continue;
    const a = GU.amp * (0.6 + 0.4 * H(n + 17, o)), i0 = Math.max(0, Math.floor(p - 3 * GU.sig)), i1 = Math.min(GW - 1, Math.ceil(p + 3 * GU.sig));
    for (let i = i0; i <= i1; i++) { const d = (i - p) / GU.sig; c[i] += a * Math.exp(-0.5 * d * d); }
  }
  if (k !== 1) for (let i = 0; i < GW; i++) c[i] *= k;
  return wind;
}

/* ---- the schedule ---- */
const seedOf = sc => sc.seed % 997;
const kindsOf = sc => LF.kinds[sc.season] || [];
const slotOn = (kind, s, o) => (H(s * 7.13 + LF.salt[kind] * 3.7, o * 0.013 + LF.salt[kind]) < LF.p[kind] ? 1 : 0);
/* how much of `kind` is there at T (0..1): on or off in its slot, crossing over in the last `fade` seconds of the slot */
export function kindK(sc, kind, T) {
  if (kindsOf(sc).indexOf(kind) < 0) return 0;
  const o = seedOf(sc), S = LF.slot, s = Math.floor(T / S), a = slotOn(kind, s, o), u = sm(S - LF.fade, S, T - s * S);
  return u > 0 ? lerp(a, slotOn(kind, s + 1, o), u) : a;
}
/* the flock crossing n: its start (s), or null when it does not cross (the slots it spans have 2 other kinds on) */
export function flockStart(sc, n) {
  const o = seedOf(sc), s = n * BD.every + (H(n, o + 3) - 0.5) * BD.jit, S = LF.slot, ks = kindsOf(sc);
  for (let q = Math.floor(s / S); q <= Math.floor((s + BD.cross) / S); q++) { let c = 0; for (const kd of ks) c += slotOn(kd, q, o); if (c > 1) return null; }
  return s;
}

/* ---- drawing ---- */
/* everything alive at T, strength k (0..1: the hold's motion comes in after the sunrise). skyTop: per column, the first row that is not open sky (the birds stay in the sky). Call after the flowers (sc.heads) */
export function drawLife(sc, T, k, skyTop) {
  if (k <= 0) return;
  const o = seedOf(sc);
  const kp = kindK(sc, 'pollen', T) * k; if (kp > 0.01) pollen(sc, T, kp, o);
  const kd = kindK(sc, 'dew', T) * k; if (kd > 0.01) dew(sc, T, kd, o);
  const kb = kindK(sc, 'butterfly', T) * k; if (kb > 0.01) butterflies(sc, T, kb, o);
  for (let n = Math.floor((T - BD.cross) / BD.every) - 1, ne = Math.ceil(T / BD.every) + 1; n <= ne; n++) {
    const s = flockStart(sc, n); if (s === null || T < s || T > s + BD.cross) continue;
    birds(sc, T, n, (T - s) / BD.cross, k, o, skyTop);
  }
}

/* pollen: 10-20 single grains drifting up, brighter inside the sun's halo, fading in and out at the ends of their climb */
function pollen(sc, T, k, o) {
  const P = LF.pollen, n = P.n[0] + Math.floor(H(o, 41) * (P.n[1] - P.n[0] + 1)), span = SH * P.span, yb = sc.horizon + 50, hr = sc.sun.r * 1.7;
  for (let g = 0; g < n; g++) {
    const life = span / (P.rise * (0.8 + 0.4 * H(g, o + 42))), u = (T / life + H(g, o + 43)) % 1;
    const x = H(g, o + 44) * GW + P.drift * Math.sin(T * P.driftHz + g * 2.3), y = yb - u * span, i = Math.round(x), j = Math.round(y);
    const dx = i - sc.sun.x, dy = j - sc.sun.y;
    over(i, j, P.color, Math.min(1, P.a * (1 + P.haloBoost * Math.exp(-(dx * dx + dy * dy) / (2 * hr * hr))) * Math.sin(Math.PI * u) * k));
  }
}

/* dew: at most one glint a second on a grass tip, lasting a short while */
function dew(sc, T, k, o) {
  const D = LF.dew, s = Math.floor(T / D.every), t = T - s * D.every;
  if (t >= D.life || H(s, o + 21) >= D.p) return;
  const tip = bladeTip(sc, H(s + 0.5, o + 22)); if (!tip) return;
  over(tip[0], tip[1], D.color, D.a * Math.sin(Math.PI * t / D.life) * k);
}

/* butterflies: 1-2 on a slow noise path; every cycle one may settle on a flower for a few seconds (wings slow), then leave */
function butterflies(sc, T, k, o) {
  const B = LF.butterfly, n = 1 + (H(o, 45) < 0.5 ? 1 : 0), heads = sc.heads || [], y0 = sc.horizon + 12, y1 = SH - 14;
  for (let b = 0; b < n; b++) {
    let x = GW * (0.08 + 0.84 * vn(T * B.drift + b * 17.3, 0.5, o + 60)), y = lerp(y0, y1, vn(T * B.drift * 1.1 + b * 9.1, 4.5, o + 61)) + 1.2 * Math.sin(T * B.wobble[0] + b * 2) + Math.sin(T * B.wobble[1] + b);
    const cy = Math.floor(T / B.cycle + b * 0.37), lt = T - (cy - b * 0.37) * B.cycle;
    let w = 0;
    if (heads.length && H(cy + b * 7, o + 62) < B.land) {
      const hd = heads[Math.floor(H(cy, o + 63 + b) * heads.length)], a = 3 + H(cy, o + 64) * 6, d = B.stay[0] + (B.stay[1] - B.stay[0]) * H(cy, o + 65);
      w = sm(a - B.approach, a, lt) * (1 - sm(a + d, a + d + B.approach, lt));
      if (w > 0) { x = lerp(x, hd.gx, w); y = lerp(y, hd.gy - hd.r * 0.3, w); }
    }
    const open = Math.sin(2 * Math.PI * (w > 0.99 ? B.restHz : B.hz) * T + b * 1.9) > 0, c = B.colors[(H(b, o + 66) * B.colors.length) | 0], i = Math.round(x), j = Math.round(y);
    over(i, j, B.body, 0.9 * k);
    if (open) { over(i - 1, j, c, 0.95 * k); over(i + 1, j, c, 0.95 * k); over(i - 1, j - 1, c, 0.6 * k); over(i + 1, j - 1, c, 0.6 * k); }
    else { over(i, j - 1, c, 0.9 * k); over(i, j - 2, c, 0.55 * k); }
  }
}

/* birds: a flock of 3-7 one-grain Vs in a loose V formation crossing the far sky, flapping slowly */
function birds(sc, T, n, p, k, o, skyTop) {
  const nb = BD.n[0] + Math.floor(H(n, o + 51) * (BD.n[1] - BD.n[0] + 1)), dir = H(n, o + 52) < 0.5 ? 1 : -1, pad = 20 + nb * 2;
  const cx = dir > 0 ? -pad + p * (GW + 2 * pad) : GW + pad - p * (GW + 2 * pad), cy = SH * lerp(BD.y[0], BD.y[1], H(n, o + 53));
  for (let b = 0; b < nb; b++) {
    const row = (b + 1) >> 1, side = b & 1 ? 1 : -1, x = Math.round(cx - dir * row * BD.dx), y = Math.round(cy + row * BD.dy * side + 1.5 * Math.sin(T * BD.bob + b * 1.7 + n));
    const flap = (T * BD.hz + H(b, o + 54)) % 1 < 0.5;                           // wings up (V) and wings down (^)
    for (let q = -1; q <= 1; q++) {
      const i = x + q, j = y - (flap ? (q !== 0 ? 1 : 0) : (q === 0 ? 1 : 0));
      if (i < 0 || i >= GW || (skyTop && j >= skyTop[i])) continue;
      over(i, j, BD.color, BD.a * k);
    }
  }
}
