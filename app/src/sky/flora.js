/* sky/flora.js — morning flowers and buds (static in M1): one per task finished this week, one bud per carried-over task.
   The flowers are the point of the meadow: heads 5-9 grains across on stems 12-25 grains tall (near), smaller and hazier far away.
   Each species is a rule on (distance, angle) around a core, so a daisy is thin white rays, a poppy four broad red petals, and so on. */
import { lerp, sm } from '../math.js';
import { MORNING } from '../tokens.js';
import { GW, SH, over } from '../framebuffer.js';
import { riverAt, inWater } from './valley.js';

const R_NEAR = 6.6, R_BIG = 8.6, FAR_R = 0.6, R_MIN = 2, SMALL_W = 520, SMALL_MIN = 0.55;   // phones: scale the flowers by GW / SMALL_W (never below SMALL_MIN)
const MIN_W = 0;             // head radius in grains (big flowers, far shrink, floor)
const STEM_NEAR = 18, STEM_VAR = 7, STEM_BIG = 8, FAR_STEM = 0.62;   // stem height: base, +pick%VAR, +big, far shrink
const FAR_HAZE = 0.2;                                               // share of the sky colour at the far end
const BASE_NEAR = 4, BASE_FAR = 4;                                  // distance from the bottom / from the horizon, grains
/* radial species: default petal count, edge floor a (between petals), petal sharpness p, core radius share, core kind */
const RADIAL = {
  daisy:         { n: 8, a: 0.5,  p: 1.7, core: 0.36 },
  aster:         { n: 8, a: 0.42, p: 2.4, core: 0.3 },
  chrysanthemum: { n: 8, a: 0.68, p: 1.0, core: 0.26, ring: 1 },
  poppy:         { n: 4, a: 0.72, p: 0.6, core: 0.26 },
  cornflower:    { n: 6, a: 0.38, p: 2.6, core: 0.24 },
  hellebore:     { n: 5, a: 0.78, p: 0.5, core: 0.34, dots: 1 }
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const S = [0, 0, 0];
const L = MORNING.light;
let rimK = 0;                                  // this flower's backlight (strongest under the sun)

export function drawFlora(sc) {
  const g = sc.pal.grass, stemC = sc.pal.stem, leafC = mix3(stemC, g[2], 0.3), sky = sc.pal.sky[2], shadow = g[3];
  const sz = Math.max(SMALL_MIN, Math.min(1, GW / SMALL_W));
  const list = sc.flowers.slice().sort((a, b) => b.depth - a.depth || a.x - b.x);   // far first
  const spot = f => {
    let x = Math.round(f.x * (GW - 1));
    const base = Math.round(lerp(SH - BASE_NEAR, sc.horizon + BASE_FAR, f.depth));
    { const [rc, rw] = riverAt(sc, base); if (rw > 0 && Math.abs(x - rc) < rw + 3) x = Math.round(rc + (x < rc ? -1 : 1) * (rw + 4 + (f.pick % 3))); }   // never in the water: step to the nearest bank
    return [x, base];
  };
  /* long soft shadows first (the sun is in front: they fall toward the viewer and a little away from the sun's x), so no flower is ever darkened by another's */
  const dk = mix3(shadow, [0, 0, 0], 0.35);
  for (const f of list) {
    const [x, base] = spot(f), far = f.depth, h = f.bud ? 9 : STEM_NEAR + (f.pick % STEM_VAR) + (f.big ? STEM_BIG : 0), len = Math.round(h * sz * lerp(1, FAR_STEM, far) * L.shadowLen), dir = x < sc.sun.x ? -1 : 1;
    const R = f.bud ? 1.5 : Math.max(R_MIN, (f.big ? R_BIG : R_NEAR) * sz * lerp(1, FAR_R, far)), fade = 1 - 0.5 * far;
    for (let q = 1; q <= len; q++) {
      const cx = x + dir * q * L.shadowDx, y = base + q; if (y >= SH) break; if (inWater(sc, cx, y, 1)) continue;
      over(Math.round(cx), y, dk, L.shadowA * fade * (1 - 0.65 * q / len)); if (far < 0.6) over(Math.round(cx) + dir, y, dk, L.shadowA * 0.5 * fade * (1 - q / len));
    }
    const ex = x + dir * len * L.shadowDx, ey = base + len, rw = R * 0.85;                // the head's shadow: a flat smudge of grains at the end
    for (let dy = -2; dy <= 2; dy++) for (let dx = -Math.ceil(rw); dx <= Math.ceil(rw); dx++) {
      const e = (dx / rw) * (dx / rw) + (dy / 2.2) * (dy / 2.2), y = ey + dy; if (e > 1 || y >= SH || y < 0 || inWater(sc, ex + dx, y, 1)) continue;
      over(Math.round(ex + dx), y, dk, L.shadowA * 0.55 * fade * (1 - e) * (0.6 + 0.6 * ((dx * 7 + dy * 3 + f.pick) & 1)));
    }
  }
  for (const f of list) {
    const [x, base] = spot(f);
    rimK = L.rimBase + (1 - L.rimBase) * Math.exp(-Math.pow((x - sc.sun.x) / (GW * L.rimSpread), 2));
    const haze = FAR_HAZE * f.depth, far = f.depth, sp = sc.pal.species[f.pick % sc.pal.species.length], [pet, core] = MORNING.flowers[sp];
    const px = (i, j, c, a = 1) => {
      if (a <= 0) return; S[0] = lerp(c[0], sky[0], haze); S[1] = lerp(c[1], sky[1], haze); S[2] = lerp(c[2], sky[2], haze); over(i, j, S, a);
    };
    const lean = ((f.pick >> 3) % 5) - 2;                               // -2..2: stems are not ruled lines
    const stem = (h, c) => { for (let q = 0; q < h; q++) px(x + Math.round(lean * (q / h) * (q / h)), base - q, c); return x + Math.round(lean); };
    px(x - 1, base, shadow, 0.5); px(x + 1, base, shadow, 0.5);
    if (f.bud) {
      const h = Math.max(4, Math.round((8 + (f.pick % 3)) * lerp(1, FAR_STEM, far))), tx = stem(h, stemC), ty = base - h, bw = far < 0.6 ? 1 : 1;
      const green = mix3(stemC, g[2], 0.25);
      px(tx, ty, green); for (let k = -bw; k <= bw; k++) px(tx + k, ty - 1, green); for (let k = -bw; k <= bw; k++) px(tx + k, ty - 2, mix3(green, pet, 0.8));
      px(tx, ty - 3, pet);
      continue;
    }
    const R = Math.max(R_MIN, (f.big ? R_BIG : R_NEAR) * sz * lerp(1, FAR_R, far));
    const h = Math.max(6, Math.round((STEM_NEAR + (f.pick % STEM_VAR) + (f.big ? STEM_BIG : 0)) * sz * lerp(1, FAR_STEM, far)));
    const tx = stem(h, stemC), ty = base - h;
    if (h >= 10) {                                                      // two leaves, one each side, pointing up and out
      const q1 = Math.round(h * 0.3), q2 = Math.round(h * 0.55), xq = q => x + Math.round(lean * (q / h) * (q / h));
      px(xq(q1) + 1, base - q1, leafC); px(xq(q1) + 2, base - q1 - 1, leafC); px(xq(q1) + 3, base - q1 - 2, leafC);
      px(xq(q2) - 1, base - q2, leafC); px(xq(q2) - 2, base - q2 - 1, leafC);
    }
    if (sp === 'tulip' || sp === 'crocus') cup(px, tx, ty, R, sp === 'crocus', pet, core);
    else if (sp === 'snowdrop') bell(px, tx, ty, R, stemC, pet, core);
    else radial(px, RADIAL[sp] || RADIAL.daisy, tx, ty - Math.round(R) + 1, R, f.petals, pet, core);
  }
}

/* a head seen from the front: petals as lobes of cos around the core, anti-aliased by edge distance */
function radial(px, spc, cx, cy, R, petals, pet, core) {
  const n = petals || spc.n, ph = -Math.PI / 2, dark = mix3(pet, core, 0.3), cr = spc.core * R, r1 = Math.ceil(R) + 1;
  for (let dy = -r1; dy <= r1; dy++) for (let dx = -r1; dx <= r1; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx), lobe = Math.pow(Math.abs(Math.cos(n * (ang - ph) / 2)), spc.p);
    const edge = R * (spc.a + (1 - spc.a) * lobe), cov = Math.min(1, Math.max(0, edge - d + 0.5));
    if (cov <= 0) continue;
    const t = sm(0, 1, d / R);
    let c = mix3(dark, pet, Math.min(1, t * 1.6));
    if (d > R * 0.62 && dy <= R * 0.5) c = mix3(c, L.rim, Math.min(0.85, rimK * L.rimGrass * 1.3 * sm(R * 0.62, R, d)));   // petal edges catch the backlight
    if (spc.ring && d < R * 0.62) c = mix3(pet, core, 0.35);
    if (d < cr + 0.5) { c = core; if (spc.dots && ((dx + dy) & 1)) c = mix3(core, pet, 0.5); px(cx + dx, cy + dy, c, Math.min(1, cr - d + 0.5 + (cov > 0.99 ? 1 : 0))); if (d < cr - 0.5) continue; }
    px(cx + dx, cy + dy, c, cov);
  }
  if (spc.dots) for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.3; px(cx + Math.round(Math.cos(a) * cr * 1.5), cy + Math.round(Math.sin(a) * cr * 1.5), core, 0.8); }
}

/* tulip / crocus: a cup seen from the side. Tulip: wide belly, three petal tips; crocus: slim, with an orange stamen peeking out */
function cup(px, cx, ty, R, crocus, pet, core) {
  const Hh = Math.round(R * (crocus ? 2.8 : 2.4)), W = R * (crocus ? 0.78 : 1.05), cw = crocus ? 0.4 : Math.max(0.5, R * 0.3), shade = mix3(pet, core, 0.22);
  for (let k = 0; k < Hh; k++) {
    const t = k / (Hh - 1), w = W * (0.45 + 0.55 * (1 - (1 - t) * (1 - t))), y = ty - k, top = k >= Hh - 3;
    for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
      const ax = Math.abs(x); if (ax > w + 0.3) continue;
      if (top && ax > cw && ax < w * 0.55) continue;                      // the notch between petals
      if (crocus && k >= Hh - 2 && ax > cw) continue;
      px(cx + x, y, ax > w * 0.7 || k > Hh - 3 ? mix3(x < 0 || k === 0 ? shade : pet, L.rim, rimK * L.rimGrass) : (x < 0 || k === 0 ? shade : pet), ax > w ? 0.6 : 1);
    }
  }
  if (crocus) { px(cx, ty - Hh, core); px(cx, ty - Hh + 1, core, 0.8); }
}

/* snowdrop: the stem arches over and a white bell hangs from it, tipped green */
function bell(px, cx, ty, R, stemC, pet, core) {
  const bx = cx + 3, Hh = Math.round(R * 1.9);
  px(cx, ty, stemC); px(cx + 1, ty - 1, stemC); px(cx + 2, ty - 1, stemC); px(bx, ty, stemC);
  for (let k = 0; k < Hh; k++) {
    const t = k / (Hh - 1), w = R * (0.35 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5)), y = ty + 1 + k;
    for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) { const ax = Math.abs(x); if (ax > w + 0.3) continue; if (k >= Hh - 1 && ax < 1 && Hh > 4) continue; px(bx + x, y, x < 0 ? mix3(pet, core, 0.18) : pet, ax > w ? 0.6 : 1); }
  }
  px(bx - 1, ty + Hh, core, 0.9); px(bx + 1, ty + Hh, core, 0.9);
}
