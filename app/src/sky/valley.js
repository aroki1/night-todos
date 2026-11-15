/* sky/valley.js — the morning valley behind and around the meadow: far ridges, the tree line, the river (with glints and reeds),
   a few small far trees and the mist. Nothing round but the sun: every shape is grains with ragged outlines and gaps.
   Static in M1 (M4 animates the glints). Everything is a function of the scene `sc` (seed, geometry).
   Drawing goes through draw.js (shade, fillBelow, points): this file only says what is drawn and how it is coloured. */
import { lerp, vn, H, rng, sm } from '../math.js';
import { MORNING } from '../tokens.js';
import { GW, SH } from '../framebuffer.js';
import { OVER, SET, shade, fillBelow, points } from '../draw.js';
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
let river = null,
  riverScene = null,
  riverGW = 0,
  riverSH = 0;
function buildRiver(sc) {
  const seedOff = sc.seed % 997,
    bankLeft = new Float32Array(SH),
    bankRight = new Float32Array(SH),
    y0 = sc.horizon - 2,
    span = SH - y0,
    mirrored = H(seedOff, 5) < 0.2;
  const nearWidth = GW * RIVER_W;
  if (sc.portrait) {
    river = { bankLeft, bankRight };
    riverScene = sc;
    riverGW = GW;
    riverSH = SH;
    return;
  } // phones: no river, the meadow continues
  /* the course: a loose S. From the mist it swings out to the left, crosses the meadow back to the right and leaves at the bottom right (mirrored for some weeks).
     Control points (row share t, x share of GW) with seeded jitter, joined by a smooth cubic, so the bends are uneven. */
  const jt = (k, a) => (H(seedOff + k, 11 + k) - 0.5) * a;
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
  const bendW = k => 1 + 0.16 * Math.sin(k * 6.28 + H(seedOff, 13) * 6.28); // a different width in each bend
  for (let j = Math.max(0, y0); j < SH; j++) {
    const t = (j - y0) / span,
      w = lerp(GW * THREAD, nearWidth, t) * bendW(t),
      fx = xAt(t),
      x = GW * (mirrored ? 1 - fx : fx);
    const wl = w * (1 + WOBBLE * (vn(j * 0.05, 0.5, seedOff + 1) - 0.5) * 1.4),
      wr = w * (1 + WOBBLE * (vn(j * 0.05, 4.5, seedOff + 2) - 0.5) * 1.4);
    bankLeft[j] = x - wl;
    bankRight[j] = x + wr;
  }
  river = { bankLeft, bankRight };
  riverScene = sc;
  riverGW = GW;
  riverSH = SH;
}
const needRiver = sc => {
  if (!river || riverScene !== sc || riverGW !== GW || riverSH !== SH) buildRiver(sc);
}; // by identity: called per grain
/* centre and half width of the river at row j (w 0 above the river's start) */
export function riverAt(sc, j) {
  needRiver(sc);
  j = j | 0;
  if (j < 0 || j >= SH || river.bankRight[j] <= 0) return [0, 0];
  return [(river.bankLeft[j] + river.bankRight[j]) / 2, (river.bankRight[j] - river.bankLeft[j]) / 2];
}
export function inWater(sc, i, j, pad = 0) {
  needRiver(sc);
  if (j < 0 || j >= SH) return false;
  return river.bankRight[j] > 0 && i >= river.bankLeft[j] - pad && i <= river.bankRight[j] + pad;
}

/* ---- ridges: one main peak with a shoulder, irregular slopes; the sun gets a clear notch ---- */

/* the outline of ridge n: row of its top edge per column */
function ridgeOutline(sc, R, n, seedOff, side) {
  const top = new Float32Array(GW),
    horizon = sc.horizon,
    sunBottom = sc.sun.y + sc.sun.r + 3,
    peak = Math.min(SH * R.up, GW * 9),
    w = GW * R.w;
  const s = n ? -side : side,
    c1 = GW * (0.5 + s * (0.26 + 0.12 * H(seedOff + n, 23))),
    c2 = c1 + s * w * 1.25,
    c3 = GW * (0.5 - s * (0.3 + 0.1 * H(seedOff + n, 25)));
  const bump = (x, c, ww, h) => h * Math.exp(-Math.pow(Math.abs(x - c) / (x < c ? ww * 0.8 : ww * 1.25), 1.45));
  for (let i = 0; i < GW; i++) {
    let h = bump(i, c1, w, peak) + bump(i, c2, w * 0.7, peak * 0.5) + bump(i, c3, w * 0.8, peak * 0.4); // main peak, its shoulder, a distant second
    h *= 1 + (vn(i * 0.05 + 3, 0.5, seedOff + n) - 0.5) * 0.22;
    h += (vn(i * 0.02, 1.5, seedOff + 7 + n) - 0.4) * peak * 0.12;
    h = Math.max(0, h);
    let y = horizon + 6 - R.lift * 0.4 - h;
    const dx = Math.abs(i - sc.sun.x),
      weight = 1 - sm(sc.sun.r * 0.7, sc.sun.r * 2.3, dx); // the ridge sinks below the sun
    y = lerp(y, Math.max(y, sunBottom), weight);
    top[i] = y;
  }
  return top;
}

/* winter: what the snow on a ridge needs per column. lit: +1 where the slope faces the sun; fall: which way the ground drops; hmax: the tallest peak */
function snowMap(sc, top, base) {
  let hmax = 1;
  for (let i = 0; i < GW; i++) hmax = Math.max(hmax, base - top[i]);
  const lit = new Float32Array(GW),
    fall = new Float32Array(GW);
  for (let i = 0; i < GW; i++) {
    const a2 = Math.max(0, i - 14),
      b2 = Math.min(GW - 1, i + 14);
    fall[i] = Math.sign(top[b2] - top[a2]);
    const a = Math.max(0, i - 5),
      b = Math.min(GW - 1, i + 5);
    lit[i] = clamp(((top[b] - top[a]) / Math.max(1, b - a)) * Math.sign(sc.sun.x - i) * 2.5, -1, 1);
  }
  return { hmax, lit, fall, base };
}

/* winter: turns the hazy ridge colour in `col` into rock with a snow cap on the peaks and streaks down the fall line */
function snowOnRidge(col, i, j, R, n, seedOff, map) {
  const MT = SN.mtn,
    { hmax, lit, fall, base } = map;
  const L = clamp(lit[i] * 0.5 + 0.5 + (vn(i * 0.09 + j * 0.05, j * 0.16 - i * 0.03, seedOff + 31 + n) - 0.5) * MT.facet, 0, 1),
    hk = R.blue * MT.hazeK,
    hazeC = [col[0], col[1], col[2]];
  const rock = mix3(hazeC, mix3(MT.rock[1], MT.rock[0], L), MT.rockA); // the rock keeps the ridge's hazy tone, a little cooler
  col[0] = rock[0];
  col[1] = rock[1];
  col[2] = rock[2];
  const alt = base - j,
    line =
      hmax * (MT.line + lit[i] * 0.5 * MT.litK) +
      (vn(i * 0.11, 2.5, seedOff + n * 3) - 0.5) * MT.rag * 2 +
      (H(i * 1.7 + seedOff, j * 1.3) - 0.5) * MT.rag * 0.8,
    dist = line - alt; // snow line: higher in the light, lower in the shade, ragged
  let cov = 0;
  if (dist <= 0)
    cov = MT.capA * Math.min(1, 0.55 - dist / (MT.rag * 2)); // the cap on the peaks and the upper slopes, soft at its edge
  else {
    // below: thin streaks down the fall line, tapering out downhill
    const len = hmax * MT.fall * (0.4 + 1.2 * vn(i * 0.07, 7.5, seedOff + n * 9)),
      f = 1 - dist / len,
      xs = i - fall[i] * dist * MT.shear;
    if (f > 0) {
      const gl = vn(xs * MT.gx, 0.5 + n * 3, seedOff + 13 + n * 17);
      if (gl > MT.thr + (1 - f) * 0.2 && H(i * 1.9 + seedOff, j * 1.1 + n) < 0.5 + f * 0.5) cov = MT.streakA * (0.5 + 0.5 * f);
    }
  }
  if (cov > 0) {
    const sn = mix3(MT.shade, MT.lit, L),
      v = 1 + (H(i + seedOff, j * 1.7) - 0.5) * 0.05,
      c = mix3(sn, hazeC, hk * 0.5);
    col[0] = lerp(col[0], c[0] * v, cov);
    col[1] = lerp(col[1], c[1] * v, cov);
    col[2] = lerp(col[2], c[2] * v, cov);
  }
}

export function drawMountains(sc) {
  if (sc.portrait) return; // phones: no mountains, the hazy tree line is the horizon
  const seedOff = sc.seed % 997,
    horizon = sc.horizon,
    blue = sc.pal.sky[0].map(v => v * BLUE),
    snow = sc.pal.snow,
    side = H(seedOff, 21) < 0.5 ? -1 : 1;
  RIDGES.forEach((R, n) => {
    const top = ridgeOutline(sc, R, n, seedOff, side),
      map = snow ? snowMap(sc, top, horizon + 6 - R.lift * 0.4) : null;
    // each grain: the sky colour of its row pulled towards the ridge blue, a grain of soft edge above the outline
    fillBelow(
      top,
      horizon + 10,
      (i, j, d, col) => {
        if (d < -1) return 0;
        skyColor(sc, j, col);
        const k = R.blue * (1 - 0.55 * clamp(d / 28, 0, 1)) * (snow ? SN.mtn.body : 1);
        col[0] = lerp(col[0], blue[0], k);
        col[1] = lerp(col[1], blue[1], k);
        col[2] = lerp(col[2], blue[2], k);
        if (snow) snowOnRidge(col, i, j, R, n, seedOff, map);
        return d < 0 ? 1 + d : 1;
      },
      OVER,
      1
    );
  });
}

/* ---- tree line: a ragged band of grain clusters in copses with gaps, hazy, along the far hill (drawn before the near hill) ---- */
export function drawTreeline(sc, farLine) {
  const g = sc.pal.grass,
    skyLow = sc.pal.sky[2],
    seedOff = sc.seed % 997,
    snow = sc.pal.snow,
    blossom = sc.pal.blossom,
    pink = sc.pal.foliage[3],
    white = MORNING.valley.blossom;
  const base = snow ? mix3(SN.tree, skyLow, TREELINE_HAZE * 0.7) : mix3(mix3(g[1], g[3], 0.55), skyLow, TREELINE_HAZE),
    gold = mix3(base, g[2], 0.32),
    light = mix3(base, skyLow, 0.22),
    capColour = snow ? mix3(SN.treeSnow, skyLow, 0.25) : light;
  /* per column: where the crown starts, how tall it is, and the row below its foot (a column in no copse is empty) */
  const crownTop = new Float32Array(GW),
    crownH = new Int32Array(GW),
    foot = new Float32Array(GW);
  for (let i = 0; i < GW; i++) {
    const mask = vn(i * 0.016 + 11, 0.6, seedOff + 13);
    if (mask < COPSE) continue;
    const str = sm(COPSE, 0.75, mask),
      clump = vn(i * 0.23 + 5, 2.5, seedOff + 4),
      h = Math.round((2 + 7 * str) * (0.35 + 1.1 * clump));
    crownH[i] = h;
    crownTop[i] = Math.round(farLine[i]) - h;
    foot[i] = Math.round(farLine[i]) + 5;
  }
  fillBelow(
    crownTop,
    foot,
    (i, j, depth, col) => {
      const h = crownH[i]; // depth: grains from the crown's top
      if (depth < 3 && H(i * 1.7 + seedOff, j * 2.3) < 0.55 - depth * 0.15) return 0; // ragged top edge: sparse grains
      if (H(i + 0.5, j + seedOff) < (snow ? SN.treeGap : 0.07)) return 0; // small gaps (winter: bare crowns, mostly gaps)
      let c = snow
        ? depth < 2 && H(i * 1.3, j + seedOff) < 0.3
          ? capColour
          : base
        : H(i * 0.37, seedOff + 9) > 0.8 || vn(i * 0.07, 4.5, seedOff) > 0.72
          ? gold
          : depth < 3
            ? light
            : base;
      if (blossom > 0 && vn(i * 0.05 + 30, 0.5, seedOff + 19) > 1 - blossom && depth < h - 1 && H(i * 2.9 + seedOff, j * 1.3) < 0.4)
        c = H(i, j * 3.1) < 0.6 ? pink : white; // spring: blossom in some crowns
      const lit = 1 + (0.5 - depth / (h + 4)) * 0.16 + (H(i, j) - 0.5) * 0.08;
      col[0] = c[0] * lit;
      col[1] = c[1] * lit;
      col[2] = c[2] * lit;
      return 1;
    },
    SET
  );
}

/* ---- the river: irregular banks, water as a cool dark reflection of the sky, sun glints, a dark rim and a few reeds ---- */
export function drawRiver(sc, nearLine) {
  needRiver(sc);
  if (sc.portrait) return;
  const { bankLeft, bankRight } = river,
    S = sc.pal.sky,
    seedOff = sc.seed % 997,
    g = sc.pal.grass,
    snow = sc.pal.snow,
    topColour = snow ? SN.water[0] : mix3(mix3(S[2], S[0], 0.55), [0, 0, 0], 0.18),
    bottomColour = snow ? SN.water[1] : mix3(S[0], [0, 0, 0], 0.38),
    rim = mix3(g[3], g[1], 0.3),
    y0 = Math.max(0, sc.horizon - 2);

  /* per row: the bank slopes (the soft edge is measured across the bank curve, not along the row) and the columns worth visiting */
  const slopeNormL = new Float32Array(SH),
    slopeNormR = new Float32Array(SH),
    from = new Int32Array(SH),
    to = new Int32Array(SH);
  for (let j = y0; j < SH; j++) {
    const l = bankLeft[j],
      r = bankRight[j];
    if (r <= 0) continue;
    const sl = (bankLeft[Math.min(SH - 1, j + 1)] - bankLeft[Math.max(0, j - 1)]) / 2,
      sr = (bankRight[Math.min(SH - 1, j + 1)] - bankRight[Math.max(0, j - 1)]) / 2,
      margin = 3 + 1.8 * Math.sqrt(1 + Math.max(sl * sl, sr * sr)); // flat banks: the soft edge is many grains wide along the row
    slopeNormL[j] = Math.sqrt(1 + sl * sl);
    slopeNormR[j] = Math.sqrt(1 + sr * sr);
    from[j] = Math.max(0, Math.floor(l - margin));
    to[j] = Math.min(GW - 1, Math.ceil(r + margin)) + 1; // the far reach runs on through the mist band
  }
  const span = j => ({ x0: from[j], x1: to[j] });
  const rows = { y0, y1: SH, x0: j => from[j], x1: j => to[j] };

  const rise = (i, j) => clamp(j - nearLine[i] + 0.5, 0, 1), // the river belongs to the foreground: it starts at the meadow's back edge, which overlaps it
    depthIn = (i, j) => Math.min((i - bankLeft[j]) / slopeNormL[j], (bankRight[j] - i) / slopeNormR[j]), // distance to the bank curve, not along the row: no stair steps
    cover = (i, j) => clamp(depthIn(i, j) + 0.5, 0, 1) * rise(i, j),
    iceWidth = (i, j) => SN.ice.w * (0.5 + vn(j * 0.12, 6.5, seedOff + 3)) + (H(i * 1.9 + seedOff, j * 0.7) - 0.5) * SN.ice.rag,
    iced = (i, j, din) => snow && din < iceWidth(i, j); // winter: ice shelves, ragged
  /* a few grass tips lean over the water: this grain and the one above it */
  const tipAt = (i, j) => {
    if (j >= SH || to[j] <= from[j] || i < from[j] || i >= to[j] || cover(i, j) <= 0) return false;
    const din = depthIn(i, j);
    return !iced(i, j, din) && din > 0.5 && din < 2.6 && H(i * 1.7 + seedOff, j * 0.9) < 0.1 * (1 - din / 2.6);
  };

  /* water (or, just outside the bank, the dark rim fading out) */
  shade(rows, (i, j, col) => {
    if (rise(i, j) <= 0) return 0;
    const din = depthIn(i, j),
      cov = clamp(din + 0.5, 0, 1) * rise(i, j);
    if (cov <= 0) {
      if (-din < BANK) {
        col[0] = rim[0];
        col[1] = rim[1];
        col[2] = rim[2];
        return 0.45 * rise(i, j) * (1 - -din / BANK);
      }
      return 0;
    }
    const t = (j - (sc.horizon - 2)) / (SH - sc.horizon + 2),
      rip = 1 + (vn(i * 0.09, j * 0.8, seedOff) - 0.5) * 0.12 + (H(i, j) - 0.5) * 0.03;
    col[0] = lerp(topColour[0], bottomColour[0], t) * rip;
    col[1] = lerp(topColour[1], bottomColour[1], t) * rip;
    col[2] = lerp(topColour[2], bottomColour[2], t) * rip;
    return cov;
  });
  if (snow)
    shade(rows, (i, j, col) => {
      const cov = cover(i, j);
      if (cov <= 0) return 0;
      const din = depthIn(i, j),
        iw = iceWidth(i, j);
      if (din >= iw) return 0;
      const v = 1 + (H(i, j * 1.7) - 0.5) * 0.12;
      col[0] = SN.ice.color[0] * v;
      col[1] = SN.ice.color[1] * v;
      col[2] = SN.ice.color[2] * v;
      return SN.ice.a * cov * Math.min(1, (iw - din) * 1.5);
    });
  shade(
    rows,
    (i, j) => {
      if (cover(i, j) <= 0) return 0;
      const din = depthIn(i, j);
      if (iced(i, j, din) || !(din > 0.3 && din < 2.2)) return 0;
      return 0.4 * (1 - Math.abs(din - 1) / 1.2);
    },
    OVER,
    rim
  ); // thin darker wet edge
  shade(rows, (i, j) => (tipAt(i, j) ? 0.8 : 0), OVER, g[2]);
  shade({ y0: y0 - 1, y1: SH - 1, x0: j => span(j + 1).x0, x1: j => span(j + 1).x1 }, (i, j) => (tipAt(i, j + 1) ? 0.7 : 0), OVER, g[2]);

  /* reeds on the banks: thin blades, some with a cattail head */
  const rg = rng(seedOff * 7 + 1),
    V = MORNING.valley,
    blades = [],
    n = 9;
  for (let k = 0; k < n; k++) {
    const t = 0.3 + 0.7 * rg(),
      j = Math.round(sc.horizon - 2 + t * (SH - sc.horizon + 2)),
      side = rg() < 0.5 ? -1 : 1,
      x = Math.round(side < 0 ? bankLeft[j] - 1 - rg() * 2 : bankRight[j] + 1 + rg() * 2),
      h = Math.round(4 + t * 7 + rg() * 3),
      cattail = rg() < 0.55;
    for (let q = 0; q < h; q++) blades.push({ i: x + Math.round(side * q * 0.07), j: j - q, c: mix3(V.reed, g[3], q < 2 ? 0.5 : 0), a: 1 });
    if (cattail) {
      blades.push({ i: x + side, j: j - h + 1, c: V.cattail, a: 1 });
      blades.push({ i: x + side, j: j - h, c: V.cattail, a: 1 });
    }
  }
  points(blades);
}

/* ---- mist: a soft pale band lying on the valley floor, a little denser where it drifts (low-frequency noise) ---- */
const mistA = (sc, i, j, seedOff, y0, sig) =>
  0.4 * sc.pal.mist * Math.exp(-((j - y0) * (j - y0)) / (2 * sig * sig)) * (0.65 + 0.7 * vn(i * 0.011, j * 0.12, seedOff + 40));
export function drawMist(sc) {
  const seedOff = sc.seed % 997,
    y0 = sc.horizon + 6 + sc.pal.mistDy,
    sig = Math.max(5, SH * 0.06);
  shade(
    { x0: 0, x1: GW, y0: Math.floor(y0 - sig * 3), y1: y0 + sig * 3.5 },
    (i, j) => mistA(sc, i, j, seedOff, y0, sig),
    OVER,
    MORNING.valley.mist
  );
}

/* ---- river glints (M4b): short flickers in the dappled light, densest under the sun. The cells are the old ones, a third at most; each flickers on its own period.
   The list is built once per scene: grain, strength (the mist over it already taken off), period and phase. drawGlints paints the flickers at sky time `t`. ---- */
let glints = null,
  glintScene = null,
  glintGW = 0,
  glintSH = 0;
function buildGlints(sc, nearLine) {
  const list = [],
    G = MORNING.glints,
    seedOff = sc.seed % 997,
    sunGlow = sc.sun.r * 0.7,
    mistY = sc.horizon + 6 + sc.pal.mistDy,
    mistSig = Math.max(5, SH * 0.06);
  needRiver(sc);
  const { bankLeft, bankRight } = river;
  if (!sc.portrait)
    for (let j = Math.max(0, sc.horizon - 2); j < SH; j++) {
      const l = bankLeft[j],
        r = bankRight[j];
      if (r <= 0) continue;
      const t = (j - (sc.horizon - 2)) / (SH - sc.horizon + 2);
      for (let i = Math.max(0, Math.floor(l)); i <= Math.min(GW - 1, Math.ceil(r)); i++) {
        const dx = Math.abs(i - sc.sun.x) / (sunGlow + (r - l) * 0.2);
        if (dx >= 1 || Math.min(i - l, r - i) < (sc.pal.snow ? SN.ice.w + 1 : 1) || j < nearLine[i] + 1) continue;
        const off = H(j, seedOff + 9) * 5,
          cell = Math.floor((i + off) / 5),
          len = 2 + ((H(cell, j + seedOff) * 3) | 0),
          pos = i + off - cell * 5;
        if (pos < len && H(cell * 1.3 + 1, j * 1.9 + seedOff) < G.chance * sc.pal.glint * Math.pow(1 - dx, 1.6) * (0.4 + 0.6 * t)) {
          const a = (0.3 + 0.22 * (1 - dx)) * (1 - Math.min(1, mistA(sc, i, j, seedOff, mistY, mistSig)));
          list.push({
            i,
            j,
            a,
            p: G.period[0] + (G.period[1] - G.period[0]) * H(cell + 0.4, j * 0.7 + seedOff),
            ph: H(cell * 2.1, j + seedOff + 5)
          });
        }
      }
    }
  glints = list;
  glintScene = sc;
  glintGW = GW;
  glintSH = SH;
}
/* the glints at sky time t, scaled by k (0..1); each is on for MORNING.glints.on seconds of its period, as a smooth blink */
export function drawGlints(sc, nearLine, t, k) {
  if (k <= 0) return;
  if (glintScene !== sc || glintGW !== GW || glintSH !== SH) buildGlints(sc, nearLine);
  const on = MORNING.glints.on;
  points(
    glints,
    (g, col) => {
      const u = ((t / g.p + g.ph) % 1) * g.p;
      if (u >= on) return 0;
      return g.a * k * Math.sin((Math.PI * u) / on);
    },
    OVER,
    sc.pal.snow ? SN.glint : MORNING.valley.glint
  );
}
