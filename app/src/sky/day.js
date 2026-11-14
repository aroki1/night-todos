/* sky/day.js — the morning sky and sun (static in M1). Every grain is a function of the scene `sc` only. */
import { lerp, rng, vn } from '../math.js';
import { MORNING } from '../tokens.js';
import { GW, SH, BR, BG, BB, over } from '../framebuffer.js';

const JIT = 0.014;                    // per-grain brightness jitter of the sky (pointillism: a flat gradient reads as a smear)
const RAYS = 8, RAY_POW = 10, RAY_PEAK = 0, RAY_OUT = 2.9;   // static streaks: count, sharpness, strength, reach in radii
const HALO_PEAK = 0.2, HALO_SIG = 0.7, HALO_RAD = 3;           // halo: peak, sigma and reach in radii
const LIMB = 0.8, LIMB_EXP = 2.6;     // limb darkening: share of the limb colour at the edge, profile exponent

/* a fixed table of grain noise, shared by sky, hills and grass (a pure function of nothing: same in every frame) */
export const GRAIN = new Float32Array(4096);
{ const r = rng(90210); for (let i = 0; i < GRAIN.length; i++) GRAIN[i] = r() * 2 - 1; }
export const gn = (i, j) => GRAIN[(Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & 4095];

/* the sky colour of row j into `out` (the same gradient drawDaySky writes; valley.js reflects it in water and haze) */
export function skyColor(sc, j, out) {
  const [a, b, c] = sc.pal.sky, mid = sc.midY, hz = sc.horizon;
  const t = j <= mid ? j / Math.max(1, mid) : Math.min(1, (j - mid) / Math.max(1, hz - mid)), p = j <= mid ? a : b, q = j <= mid ? b : c;
  out[0] = lerp(p[0], q[0], t); out[1] = lerp(p[1], q[1], t); out[2] = lerp(p[2], q[2], t); return out;
}

/* every sky grain is SET (not added): top -> mid at sc.midY -> horizon colour at sc.horizon and below */
export function drawDaySky(sc) {
  const [a, b, c] = sc.pal.sky, mid = sc.midY, hz = sc.horizon;
  for (let j = 0; j < SH; j++) {
    const t = j <= mid ? j / Math.max(1, mid) : Math.min(1, (j - mid) / Math.max(1, hz - mid));
    const p = j <= mid ? a : b, q = j <= mid ? b : c;
    const r = lerp(p[0], q[0], t), g = lerp(p[1], q[1], t), bl = lerp(p[2], q[2], t);
    for (let i = 0; i < GW; i++) { const k = j * GW + i, u = 1 + gn(i, j) * JIT; BR[k] = r * u; BG[k] = g * u; BB[k] = bl * u; }
  }
}

/* the sun: halo and rays added to the sky, then the disc with fractional edge coverage */
/* o (the sunrise and the sunset, M2b): { y: centre row, haloK: halo strength 0..1, fade: the whole sun's strength 0..1, clip: per column, the first row that is land (nothing is drawn from there down), core, limb, halo: colours }. No o = the resting sun of the hold */
export function drawSun(sc, o) {
  const S = MORNING.sun, { x: fx, r } = sc.sun, fy = o ? o.y : sc.sun.y, hc = o ? o.halo : S.halo, hr = r * HALO_RAD, k2 = 1 / (2 * HALO_SIG * HALO_SIG * r * r);
  const hk = o ? o.haloK : 1, clip = o ? o.clip : null, fade = o ? o.fade : 1;
  const ph = (sc.seed % 628) / 100, so = sc.seed % 997;
  if (o) haloMoving(sc, o, hc, hr, k2, hk * fade);
  const x0 = Math.max(0, Math.floor(fx - hr)), x1 = Math.min(GW - 1, Math.ceil(fx + hr));
  const y0 = Math.max(0, Math.floor(fy - hr)), y1 = Math.min(SH - 1, Math.ceil(fy + hr));
  if (!o) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i - fx, dy = j - fy, d2 = dx * dx + dy * dy; if (d2 > hr * hr) continue;
    const k = j * GW + i, d = Math.sqrt(d2);
    let w = HALO_PEAK * Math.exp(-d2 * k2) * hk;
    if (RAY_PEAK !== 0 && d > r && d < r * RAY_OUT) {                                   // rays: sharp lobes of cos, each with its own strength
      const an = Math.atan2(dy, dx), lobe = Math.pow(Math.max(0, Math.cos(RAYS * 0.5 * an + ph)), RAY_POW);
      w += RAY_PEAK * lobe * (0.4 + vn(an * 2.3 + 8, 0, so)) * Math.min(1, (d - r) / (r * 0.25)) * (1 - (d - r) / (r * (RAY_OUT - 1)));
    }
    BR[k] += hc[0] * w; BG[k] += hc[1] * w; BB[k] += hc[2] * w;
  }
  const cx0 = Math.max(0, Math.floor(fx - r - 1)), cx1 = Math.min(GW - 1, Math.ceil(fx + r + 1));
  const cy0 = Math.max(0, Math.floor(fy - r - 1)), cy1 = Math.min(SH - 1, Math.ceil(fy + r + 1));
  const core = o ? o.core : S.core, limb = o ? o.limb : S.limb, col = [0, 0, 0];
  for (let j = cy0; j <= cy1; j++) for (let i = cx0; i <= cx1; i++) {
    const dx = i - fx, dy = j - fy, d = Math.sqrt(dx * dx + dy * dy), cov = r + 0.5 - d; if (cov <= 0 || (clip && j >= clip[i])) continue;
    const t = LIMB * Math.pow(Math.min(1, d / r), LIMB_EXP);
    col[0] = lerp(core[0], limb[0], t); col[1] = lerp(core[1], limb[1], t); col[2] = lerp(core[2], limb[2], t);
    over(i, j, col, cov * fade);
  }
}

/* the halo of the moving sun: the same gaussian, from a table at the whole-grain centre (the halo is smooth: half a grain of shift is invisible), cut by the land per column */
let hTab = null, hSide = 0, hKey = '';
function haloMoving(sc, o, hc, hr, k2, k) {
  if (k <= 0) return;
  const R = Math.ceil(hr), side = 2 * R + 1, key = side + ':' + k2;
  if (hKey !== key) {
    hKey = key; hSide = side; hTab = new Float32Array(side * side);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const d2 = (i - R) * (i - R) + (j - R) * (j - R); if (d2 <= hr * hr) hTab[j * side + i] = HALO_PEAK * Math.exp(-d2 * k2); }
  }
  const cx = Math.round(sc.sun.x), cy = Math.round(o.y), clip = o.clip, a0 = hc[0] * k, a1 = hc[1] * k, a2 = hc[2] * k;
  const x0 = Math.max(0, cx - R), x1 = Math.min(GW - 1, cx + R), y0 = Math.max(0, cy - R), y1 = Math.min(SH - 1, cy + R);
  for (let j = y0; j <= y1; j++) {
    const t0 = (j - cy + R) * hSide - cx + R, g0 = j * GW;
    for (let i = x0; i <= x1; i++) {
      if (clip && j >= clip[i]) continue;
      const w = hTab[t0 + i]; if (w === 0) continue;
      BR[g0 + i] += a0 * w; BG[g0 + i] += a1 * w; BB[g0 + i] += a2 * w;
    }
  }
}

/* ---- the sunrise and the sunset (M2b, M2c): the sky palettes and the grain jitter the grain-by-grain sky pass (render/morning.js) uses ---- */
let jit = null, jitW = 0, jitH = 0;
export const jitter = () => {
  if (!jit || jitW !== GW || jitH !== SH) {
    jit = new Float32Array(GW * SH); jitW = GW; jitH = SH;
    for (let j = 0; j < SH; j++) for (let i = 0; i < GW; i++) jit[j * GW + i] = 1 + gn(i, j) * JIT;
  }
  return jit;
};
/* the sky palette at dusk progress k (0 = the season's own sky, then gold, rose, violet), as [top, mid, horizon] into `out` */
export function duskPal(sc, k, out) {
  const base = sc.pal.sky, st = MORNING.dusk.stops, n = st.length;
  if (k <= 0) { for (let c = 0; c < 3; c++) out[c] = base[c]; return out; }
  const f = Math.min(1, k) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i, a = i === 0 ? base : st[i - 1], b = st[i];
  for (let c = 0; c < 3; c++) out[c] = [lerp(a[c][0], b[c][0], t), lerp(a[c][1], b[c][1], t), lerp(a[c][2], b[c][2], t)];
  return out;
}
/* M2c: the gradient of `p3` ([top, mid, horizon]) as 3 floats per row into `tab` from `off` (the rows of the day sky, before the grain jitter) */
export function skyRows(sc, p3, tab, off) {
  const [a, b, c] = p3, mid = sc.midY, hz = sc.horizon;
  for (let j = 0; j < SH; j++) {
    const t = j <= mid ? j / Math.max(1, mid) : Math.min(1, (j - mid) / Math.max(1, hz - mid)), p = j <= mid ? a : b, q = j <= mid ? b : c, o = off + j * 3;
    tab[o] = lerp(p[0], q[0], t); tab[o + 1] = lerp(p[1], q[1], t); tab[o + 2] = lerp(p[2], q[2], t);
  }
}
