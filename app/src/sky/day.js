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
export function drawSun(sc) {
  const S = MORNING.sun, { x: fx, y: fy, r } = sc.sun, hc = S.halo, hr = r * HALO_RAD, k2 = 1 / (2 * HALO_SIG * HALO_SIG * r * r);
  const ph = (sc.seed % 628) / 100, so = sc.seed % 997;
  const x0 = Math.max(0, Math.floor(fx - hr)), x1 = Math.min(GW - 1, Math.ceil(fx + hr));
  const y0 = Math.max(0, Math.floor(fy - hr)), y1 = Math.min(SH - 1, Math.ceil(fy + hr));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i - fx, dy = j - fy, d2 = dx * dx + dy * dy; if (d2 > hr * hr) continue;
    const k = j * GW + i, d = Math.sqrt(d2);
    let w = HALO_PEAK * Math.exp(-d2 * k2);
    if (d > r && d < r * RAY_OUT) {                                   // rays: sharp lobes of cos, each with its own strength
      const an = Math.atan2(dy, dx), lobe = Math.pow(Math.max(0, Math.cos(RAYS * 0.5 * an + ph)), RAY_POW);
      w += RAY_PEAK * lobe * (0.4 + vn(an * 2.3 + 8, 0, so)) * Math.min(1, (d - r) / (r * 0.25)) * (1 - (d - r) / (r * (RAY_OUT - 1)));
    }
    BR[k] += hc[0] * w; BG[k] += hc[1] * w; BB[k] += hc[2] * w;
  }
  const cx0 = Math.max(0, Math.floor(fx - r - 1)), cx1 = Math.min(GW - 1, Math.ceil(fx + r + 1));
  const cy0 = Math.max(0, Math.floor(fy - r - 1)), cy1 = Math.min(SH - 1, Math.ceil(fy + r + 1));
  const core = S.core, limb = S.limb, col = [0, 0, 0];
  for (let j = cy0; j <= cy1; j++) for (let i = cx0; i <= cx1; i++) {
    const dx = i - fx, dy = j - fy, d = Math.sqrt(dx * dx + dy * dy), cov = r + 0.5 - d; if (cov <= 0) continue;
    const t = LIMB * Math.pow(Math.min(1, d / r), LIMB_EXP);
    col[0] = lerp(core[0], limb[0], t); col[1] = lerp(core[1], limb[1], t); col[2] = lerp(core[2], limb[2], t);
    over(i, j, col, cov);
  }
}
