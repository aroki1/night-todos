/* sky/valley.js — the morning valley behind and around the meadow: far ridges, the tree line, the river (with glints and reeds),
   a few small far trees and the mist. Nothing round but the sun: every shape is grains with ragged outlines and gaps.
   Static in M1 (M4 animates the glints). Everything is a function of the scene `sc` (seed, geometry). */
import { lerp, vn, H, rng, sm } from '../math.js';
import { MORNING } from '../tokens.js';
import { GW, SH, BR, BG, BB, over } from '../framebuffer.js';
import { skyColor } from './day.js';

/* ridges: peak height (share of SH, capped by a share of GW on phones), bump width (share of GW), blue share, base lift */
const RIDGES = [
  { up: 0.3, w: 0.2, blue: 0.36, lift: 14 },
  { up: 0.2, w: 0.16, blue: 0.52, lift: 8 }
];
const BLUE = 0.82; // ridge blue = the top sky colour x this
const TREELINE_HAZE = 0.4,
  COPSE = 0.4;
/* river: half width at the viewer (share of GW), thread half width at the horizon, growth exponent, bank wobble (share of the width) */
const RIVER_W = 0.25,
  THREAD = 0.03,
  WEXP = 1.0,
  WOBBLE = 0.2,
  BANK = 1.2;

const SN = MORNING.snow;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---- the river table (rows -> left and right bank). land.js and flora.js read it. ---- */
let rv = null,
  rsc = null,
  rgw = 0,
  rsh = 0;
function buildRiver(sc) {
  const o = sc.seed % 997,
    rl = new Float32Array(SH),
    rr = new Float32Array(SH),
    y0 = sc.horizon - 2,
    span = SH - y0,
    mir = H(o, 5) < 0.2;
  const Wn = GW * RIVER_W;
  if (sc.portrait) {
    rv = { rl, rr };
    rsc = sc;
    rgw = GW;
    rsh = SH;
    return;
  } // phones: no river, the meadow continues
  /* the course: a loose S. From the mist it swings out to the left, crosses the meadow back to the right and leaves at the bottom right (mirrored for some weeks).
     Control points (row share t, x share of GW) with seeded jitter, joined by a smooth cubic, so the bends are uneven. */
  const jt = (k, a) => (H(o + k, 11 + k) - 0.5) * a;
  const pts = [
    [0, 0.5 + jt(1, 0.04)],
    [0.16 + jt(2, 0.04), 0.4 + jt(3, 0.05)],
    [0.38 + jt(4, 0.05), 0.26 + jt(5, 0.06)],
    [0.62 + jt(6, 0.05), 0.5 + jt(7, 0.07)],
    [0.84 + jt(8, 0.04), 0.76 + jt(9, 0.05)],
    [1.05, 0.9 + jt(10, 0.04)]
  ];
  const xAt = t => {
    let k = 0;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const p0 = pts[Math.max(0, k - 1)],
      p1 = pts[k],
      p2 = pts[k + 1],
      p3 = pts[Math.min(pts.length - 1, k + 2)],
      u = clamp((t - p1[0]) / (p2[0] - p1[0]), 0, 1);
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * (p2[0] - p1[0]),
      m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * (p2[0] - p1[0]),
      u2 = u * u,
      u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
  const bendW = k => 1 + 0.16 * Math.sin(k * 6.28 + H(o, 13) * 6.28); // a different width in each bend
  for (let j = Math.max(0, y0); j < SH; j++) {
    const t = (j - y0) / span,
      w = lerp(GW * THREAD, Wn, t) * bendW(t),
      fx = xAt(t),
      x = GW * (mir ? 1 - fx : fx);
    const wl = w * (1 + WOBBLE * (vn(j * 0.05, 0.5, o + 1) - 0.5) * 1.4),
      wr = w * (1 + WOBBLE * (vn(j * 0.05, 4.5, o + 2) - 0.5) * 1.4);
    rl[j] = x - wl;
    rr[j] = x + wr;
  }
  rv = { rl, rr };
  rsc = sc;
  rgw = GW;
  rsh = SH;
}
const needRiver = sc => {
  if (!rv || rsc !== sc || rgw !== GW || rsh !== SH) buildRiver(sc);
}; // by identity: called per grain
/* centre and half width of the river at row j (w 0 above the river's start) */
export function riverAt(sc, j) {
  needRiver(sc);
  j = j | 0;
  if (j < 0 || j >= SH || rv.rr[j] <= 0) return [0, 0];
  return [(rv.rl[j] + rv.rr[j]) / 2, (rv.rr[j] - rv.rl[j]) / 2];
}
export function inWater(sc, i, j, pad = 0) {
  needRiver(sc);
  if (j < 0 || j >= SH) return false;
  return rv.rr[j] > 0 && i >= rv.rl[j] - pad && i <= rv.rr[j] + pad;
}

/* ---- ridges: one main peak with a shoulder, irregular slopes; the sun gets a clear notch ---- */
export function drawMountains(sc) {
  if (sc.portrait) return; // phones: no mountains, the hazy tree line is the horizon
  const o = sc.seed % 997,
    hz = sc.horizon,
    sk = [0, 0, 0],
    blue = sc.pal.sky[0].map(v => v * BLUE),
    sunBottom = sc.sun.y + sc.sun.r + 3;
  const side = H(o, 21) < 0.5 ? -1 : 1;
  RIDGES.forEach((R, n) => {
    const top = new Float32Array(GW),
      peak = Math.min(SH * R.up, GW * (sc.portrait ? 0.42 : 9)) * (n ? 1 : 1),
      w = GW * R.w * (sc.portrait ? 1.3 : 1);
    {
      const s = n ? -side : side,
        c1 = GW * (0.5 + s * (0.26 + 0.12 * H(o + n, 23))),
        c2 = c1 + s * w * 1.25,
        c3 = GW * (0.5 - s * (0.3 + 0.1 * H(o + n, 25)));
      const bump = (x, c, ww, h) => h * Math.exp(-Math.pow(Math.abs(x - c) / (x < c ? ww * 0.8 : ww * 1.25), 1.45));
      for (let i = 0; i < GW; i++) {
        let h = bump(i, c1, w, peak) + bump(i, c2, w * 0.7, peak * 0.5) + bump(i, c3, w * 0.8, peak * 0.4); // main peak, its shoulder, a distant second
        h *= 1 + (vn(i * 0.05 + 3, 0.5, o + n) - 0.5) * 0.22;
        h += (vn(i * 0.02, 1.5, o + 7 + n) - 0.4) * peak * 0.12;
        h = Math.max(0, h);
        let y = hz + 6 - R.lift * 0.4 - h;
        const dx = Math.abs(i - sc.sun.x),
          wgt = 1 - sm(sc.sun.r * 0.7, sc.sun.r * 2.3, dx); // the ridge sinks below the sun
        y = lerp(y, Math.max(y, sunBottom), wgt);
        top[i] = y;
      }
    }
    const MT = SN.mtn,
      base = hz + 6 - R.lift * 0.4,
      snow = sc.pal.snow;
    let hmax = 1,
      lit = null,
      fall = null;
    if (snow) {
      for (let i = 0; i < GW; i++) hmax = Math.max(hmax, base - top[i]);
      lit = new Float32Array(GW);
      fall = new Float32Array(GW);
      for (let i = 0; i < GW; i++) {
        const a2 = Math.max(0, i - 14),
          b2 = Math.min(GW - 1, i + 14);
        fall[i] = Math.sign(top[b2] - top[a2]);
        const a = Math.max(0, i - 5),
          b = Math.min(GW - 1, i + 5);
        lit[i] = clamp(((top[b] - top[a]) / Math.max(1, b - a)) * Math.sign(sc.sun.x - i) * 2.5, -1, 1);
      }
    } // lit: +1 where the slope faces the sun
    for (let i = 0; i < GW; i++)
      for (let j = Math.max(0, Math.floor(top[i]) - 1); j < hz + 10; j++) {
        const d = j - top[i],
          a = d < 0 ? 1 + d : 1;
        if (d < -1) continue;
        skyColor(sc, j, sk);
        const k = R.blue * (1 - 0.55 * clamp(d / 28, 0, 1)) * (snow ? SN.mtn.body : 1),
          q = j * GW + i;
        let r = lerp(sk[0], blue[0], k),
          g = lerp(sk[1], blue[1], k),
          b = lerp(sk[2], blue[2], k);
        if (snow) {
          const L = clamp(lit[i] * 0.5 + 0.5 + (vn(i * 0.09 + j * 0.05, j * 0.16 - i * 0.03, o + 31 + n) - 0.5) * MT.facet, 0, 1),
            hk = R.blue * MT.hazeK,
            hazeC = [r, g, b];
          [r, g, b] = mix3(hazeC, mix3(MT.rock[1], MT.rock[0], L), MT.rockA); // the rock keeps the ridge's hazy tone, a little cooler
          const alt = base - j,
            line =
              hmax * (MT.line + lit[i] * 0.5 * MT.litK) +
              (vn(i * 0.11, 2.5, o + n * 3) - 0.5) * MT.rag * 2 +
              (H(i * 1.7 + o, j * 1.3) - 0.5) * MT.rag * 0.8,
            dist = line - alt; // snow line: higher in the light, lower in the shade, ragged
          let cov = 0;
          if (dist <= 0)
            cov = MT.capA * Math.min(1, 0.55 - dist / (MT.rag * 2)); // the cap on the peaks and the upper slopes, soft at its edge
          else {
            // below: thin streaks down the fall line, tapering out downhill
            const len = hmax * MT.fall * (0.4 + 1.2 * vn(i * 0.07, 7.5, o + n * 9)),
              f = 1 - dist / len,
              xs = i - fall[i] * dist * MT.shear;
            if (f > 0) {
              const gl = vn(xs * MT.gx, 0.5 + n * 3, o + 13 + n * 17);
              if (gl > MT.thr + (1 - f) * 0.2 && H(i * 1.9 + o, j * 1.1 + n) < 0.5 + f * 0.5) cov = MT.streakA * (0.5 + 0.5 * f);
            }
          }
          if (cov > 0) {
            const sn = mix3(MT.shade, MT.lit, L),
              v = 1 + (H(i + o, j * 1.7) - 0.5) * 0.05,
              c = mix3(sn, hazeC, hk * 0.5);
            r = lerp(r, c[0] * v, cov);
            g = lerp(g, c[1] * v, cov);
            b = lerp(b, c[2] * v, cov);
          }
        }
        BR[q] += (r - BR[q]) * a;
        BG[q] += (g - BG[q]) * a;
        BB[q] += (b - BB[q]) * a;
      }
  });
}

/* ---- tree line: a ragged band of grain clusters in copses with gaps, hazy, along the far hill (drawn before the near hill) ---- */
export function drawTreeline(sc, farLine) {
  const g = sc.pal.grass,
    hz = sc.pal.sky[2],
    o = sc.seed % 997,
    snow = sc.pal.snow,
    bl = sc.pal.blossom,
    pink = sc.pal.foliage[3],
    white = MORNING.valley.blossom;
  const base = snow ? mix3(SN.tree, hz, TREELINE_HAZE * 0.7) : mix3(mix3(g[1], g[3], 0.55), hz, TREELINE_HAZE),
    gold = mix3(base, g[2], 0.32),
    light = mix3(base, hz, 0.22),
    top = snow ? mix3(SN.treeSnow, hz, 0.25) : light;
  for (let i = 0; i < GW; i++) {
    const mask = vn(i * 0.016 + 11, 0.6, o + 13);
    if (mask < COPSE) continue;
    const str = sm(COPSE, 0.75, mask),
      clump = vn(i * 0.23 + 5, 2.5, o + 4),
      h = Math.round((2 + 7 * str) * (0.35 + 1.1 * clump));
    for (let q = -h; q <= 4; q++) {
      const j = Math.round(farLine[i]) + q,
        depth = q + h; // grains from the crown's top
      if (depth < 3 && H(i * 1.7 + o, j * 2.3) < 0.55 - depth * 0.15) continue; // ragged top edge: sparse grains
      if (H(i + 0.5, j + o) < (snow ? SN.treeGap : 0.07)) continue; // small gaps (winter: bare crowns, mostly gaps)
      let col = snow
        ? depth < 2 && H(i * 1.3, j + o) < 0.3
          ? top
          : base
        : H(i * 0.37, o + 9) > 0.8 || vn(i * 0.07, 4.5, o) > 0.72
          ? gold
          : depth < 3
            ? light
            : base;
      if (bl > 0 && vn(i * 0.05 + 30, 0.5, o + 19) > 1 - bl && depth < h - 1 && H(i * 2.9 + o, j * 1.3) < 0.4)
        col = H(i, j * 3.1) < 0.6 ? pink : white; // spring: blossom in some crowns
      const lit = 1 + (0.5 - depth / (h + 4)) * 0.16 + (H(i, j) - 0.5) * 0.08;
      if (j >= 0 && j < SH) {
        const k = j * GW + i;
        BR[k] = col[0] * lit;
        BG[k] = col[1] * lit;
        BB[k] = col[2] * lit;
      }
    }
  }
}

/* ---- the river: irregular banks, water as a cool dark reflection of the sky, sun glints, a dark rim and a few reeds ---- */
export function drawRiver(sc, nearLine) {
  needRiver(sc);
  if (sc.portrait) return;
  const { rl, rr } = rv,
    S = sc.pal.sky,
    o = sc.seed % 997,
    g = sc.pal.grass;
  const snow = sc.pal.snow,
    topC = snow ? SN.water[0] : mix3(mix3(S[2], S[0], 0.55), [0, 0, 0], 0.18),
    botC = snow ? SN.water[1] : mix3(S[0], [0, 0, 0], 0.38),
    rim = mix3(g[3], g[1], 0.3),
    gr = sc.sun.r * 0.7,
    wc = [0, 0, 0];
  for (let j = Math.max(0, sc.horizon - 2); j < SH; j++) {
    const l = rl[j],
      r = rr[j];
    if (r <= 0) continue;
    const t = (j - (sc.horizon - 2)) / (SH - sc.horizon + 2);
    const sl = (rl[Math.min(SH - 1, j + 1)] - rl[Math.max(0, j - 1)]) / 2,
      sr = (rr[Math.min(SH - 1, j + 1)] - rr[Math.max(0, j - 1)]) / 2,
      mg = 3 + 1.8 * Math.sqrt(1 + Math.max(sl * sl, sr * sr)); // flat banks: the soft edge is many grains wide along the row
    for (let i = Math.max(0, Math.floor(l - mg)); i <= Math.min(GW - 1, Math.ceil(r + mg)); i++) {
      // the far reach runs on through the mist band

      const rise = clamp(j - nearLine[i] + 0.5, 0, 1);
      if (rise <= 0) continue; // the river belongs to the foreground: it starts at the meadow's back edge, which overlaps it
      const din = Math.min((i - l) / Math.sqrt(1 + sl * sl), (r - i) / Math.sqrt(1 + sr * sr)),
        cov = clamp(din + 0.5, 0, 1) * rise; // distance to the bank curve, not along the row: no stair steps
      if (cov <= 0) {
        if (-din < BANK) over(i, j, rim, 0.45 * rise * (1 - -din / BANK));
        continue;
      }
      const rip = 1 + (vn(i * 0.09, j * 0.8, o) - 0.5) * 0.12 + (H(i, j) - 0.5) * 0.03;
      wc[0] = lerp(topC[0], botC[0], t) * rip;
      wc[1] = lerp(topC[1], botC[1], t) * rip;
      wc[2] = lerp(topC[2], botC[2], t) * rip;
      over(i, j, wc, cov);
      if (snow) {
        const iw = SN.ice.w * (0.5 + vn(j * 0.12, 6.5, o + 3)) + (H(i * 1.9 + o, j * 0.7) - 0.5) * SN.ice.rag;
        if (din < iw) {
          const v = 1 + (H(i, j * 1.7) - 0.5) * 0.12;
          over(i, j, [SN.ice.color[0] * v, SN.ice.color[1] * v, SN.ice.color[2] * v], SN.ice.a * cov * Math.min(1, (iw - din) * 1.5));
          continue;
        }
      } // winter: ice shelves, ragged
      if (din > 0.3 && din < 2.2) over(i, j, rim, 0.4 * (1 - Math.abs(din - 1) / 1.2)); // thin darker wet edge
      if (din > 0.5 && din < 2.6 && H(i * 1.7 + o, j * 0.9) < 0.1 * (1 - din / 2.6)) {
        over(i, j, g[2], 0.8);
        over(i, j - 1, g[2], 0.7);
      } // a few grass tips lean over the water
    }
  }
  /* reeds on the banks: thin blades, some with a cattail head */
  const rg = rng(o * 7 + 1),
    V = MORNING.valley,
    n = 9;
  for (let k = 0; k < n; k++) {
    const t = 0.3 + 0.7 * rg(),
      j = Math.round(sc.horizon - 2 + t * (SH - sc.horizon + 2)),
      side = rg() < 0.5 ? -1 : 1,
      x = Math.round(side < 0 ? rl[j] - 1 - rg() * 2 : rr[j] + 1 + rg() * 2),
      h = Math.round(4 + t * 7 + rg() * 3),
      cat = rg() < 0.55;
    for (let q = 0; q < h; q++) over(x + Math.round(side * q * 0.07), j - q, mix3(V.reed, g[3], q < 2 ? 0.5 : 0), 1);
    if (cat) {
      over(x + side, j - h + 1, V.cattail, 1);
      over(x + side, j - h, V.cattail, 1);
    }
  }
}

/* ---- mist: a soft pale band lying on the valley floor, a little denser where it drifts (low-frequency noise) ---- */
const mistA = (sc, i, j, o, y0, sig) =>
  0.4 * sc.pal.mist * Math.exp(-((j - y0) * (j - y0)) / (2 * sig * sig)) * (0.65 + 0.7 * vn(i * 0.011, j * 0.12, o + 40));
export function drawMist(sc) {
  const o = sc.seed % 997,
    c = MORNING.valley.mist,
    y0 = sc.horizon + 6 + sc.pal.mistDy,
    sig = Math.max(5, SH * 0.06);
  for (let j = Math.max(0, Math.floor(y0 - sig * 3)); j < Math.min(SH, y0 + sig * 3.5); j++)
    for (let i = 0; i < GW; i++) over(i, j, c, mistA(sc, i, j, o, y0, sig));
}

/* ---- river glints (M4b): short flickers in the dappled light, densest under the sun. The cells are the old ones, a third at most; each flickers on its own period.
   The list is built once per scene: grain, strength (the mist over it already taken off), period and phase. drawGlints paints the flickers at sky time `t`. ---- */
let gl = null,
  glSc = null,
  glW = 0,
  glH = 0;
function buildGlints(sc, nearLine) {
  const out = [],
    G = MORNING.glints,
    o = sc.seed % 997,
    gr = sc.sun.r * 0.7,
    my0 = sc.horizon + 6 + sc.pal.mistDy,
    msig = Math.max(5, SH * 0.06);
  needRiver(sc);
  const { rl, rr } = rv;
  if (!sc.portrait)
    for (let j = Math.max(0, sc.horizon - 2); j < SH; j++) {
      const l = rl[j],
        r = rr[j];
      if (r <= 0) continue;
      const t = (j - (sc.horizon - 2)) / (SH - sc.horizon + 2);
      for (let i = Math.max(0, Math.floor(l)); i <= Math.min(GW - 1, Math.ceil(r)); i++) {
        const dx = Math.abs(i - sc.sun.x) / (gr + (r - l) * 0.2);
        if (dx >= 1 || Math.min(i - l, r - i) < (sc.pal.snow ? SN.ice.w + 1 : 1) || j < nearLine[i] + 1) continue;
        const off = H(j, o + 9) * 5,
          cell = Math.floor((i + off) / 5),
          len = 2 + ((H(cell, j + o) * 3) | 0),
          pos = i + off - cell * 5;
        if (pos < len && H(cell * 1.3 + 1, j * 1.9 + o) < G.chance * sc.pal.glint * Math.pow(1 - dx, 1.6) * (0.4 + 0.6 * t)) {
          const a = (0.3 + 0.22 * (1 - dx)) * (1 - Math.min(1, mistA(sc, i, j, o, my0, msig)));
          out.push({ i, j, a, p: G.period[0] + (G.period[1] - G.period[0]) * H(cell + 0.4, j * 0.7 + o), ph: H(cell * 2.1, j + o + 5) });
        }
      }
    }
  gl = out;
  glSc = sc;
  glW = GW;
  glH = SH;
}
/* the glints at sky time t, scaled by k (0..1); each is on for MORNING.glints.on seconds of its period, as a smooth blink */
export function drawGlints(sc, nearLine, t, k) {
  if (k <= 0) return;
  if (glSc !== sc || glW !== GW || glH !== SH) buildGlints(sc, nearLine);
  const c = sc.pal.snow ? SN.glint : MORNING.valley.glint,
    on = MORNING.glints.on;
  for (let q = 0; q < gl.length; q++) {
    const g = gl[q],
      u = ((t / g.p + g.ph) % 1) * g.p;
    if (u >= on) continue;
    over(g.i, g.j, c, g.a * k * Math.sin((Math.PI * u) / on));
  }
}
