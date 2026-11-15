/* sky/land.js — morning hills and grass (static in M1). Blades live in a table that build() fills when the geometry or scene changes;
   `sway` is per blade and 0 in M1 (M4 animates it); `lean` is the blade's own static curve. */
import { lerp, vn, fbm, H, sm } from '../math.js';
import { GW, SH, BR, BG, BB } from '../framebuffer.js';
import { MORNING } from '../tokens.js';
import { gn } from './day.js';
import { inWater } from './valley.js';

const FAR_HAZE = 0.55,
  FAR_SKYMID = 0.15,
  NEAR_DARK = 0.4,
  RIM = 0.1; // far hill toward the sky, near hill toward shadow, sun-lit crest
const FAR_UP = 9,
  FAR_AMP = 15,
  NEAR_DN = 5,
  NEAR_AMP = 15; // crest offset against the horizon and wobble, grains
const TILT = 0.08; // the whole horizon leans a little across the width
const H_NEAR = 15,
  H_FAR = 2.5,
  HEXP = 1.25; // blade height (grains) at the viewer / at the horizon, and its growth
const P_FAR = 0.2,
  P_NEAR = 0.014,
  PEXP = 1.8; // blade base chance per grain: dense far, sparse near
const GJIT = 0.012; // ground grain jitter (kept low: the ground is a calm field)
const TB = 8,
  UB = 4;
let rimK = new Float32Array(0);
const RL = MORNING.light,
  SN = MORNING.snow;
const sunNear = (sc, i) => {
  const d = (i - sc.sun.x) / (GW * RL.rimSpread);
  return RL.rimBase + (1 - RL.rimBase) * Math.exp(-d * d);
}; // 1 under the sun, fading to the sides                                                 // colour buckets: distance haze, blade variation

let snowStrokes = null,
  tab = null,
  key = '',
  nearLine = null,
  farLine = null,
  rel = null; // rel: the rolling ground, -0.5..0.5 per grain (crest +, hollow -)
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sceneKey = sc => sc.seed + ':' + GW + 'x' + SH + ':' + sc.horizon;

function lines(sc) {
  const o = sc.seed % 997,
    far = new Float32Array(GW),
    near = new Float32Array(GW);
  for (let i = 0; i < GW; i++) {
    const x = i / GW - 0.5;
    far[i] = sc.horizon - FAR_UP + FAR_AMP * (vn(i * 0.0045 + 3, 0.5, o) * 0.7 + vn(i * 0.012, 1.5, o + 5) * 0.3 - 0.5) + x * TILT * SH;
    near[i] =
      sc.horizon +
      NEAR_DN +
      NEAR_AMP * (vn(i * 0.007 + 40, 2.5, o + 11) * 0.75 + vn(i * 0.02, 3.5, o + 17) * 0.25 - 0.5) -
      x * TILT * SH * 0.6;
  }
  farLine = far;
  nearLine = near;
}

function build(sc) {
  lines(sc);
  const o = sc.seed % 997,
    cap = ((GW * SH) / 3) | 0;
  const bx = new Int16Array(cap),
    by = new Int16Array(cap),
    bh = new Uint8Array(cap),
    bn = new Int8Array(cap),
    bu = new Uint8Array(cap),
    bt = new Uint8Array(cap),
    am = new Float32Array(cap);
  let m = 0;
  for (let y = Math.floor(sc.horizon) - 12; y < SH; y++)
    for (let i = 0; i < GW && m < cap; i++) {
      const top = nearLine[i],
        t = (y - top) / (SH - top);
      if (t < 0) continue;
      const dens = 0.55 + 1.0 * (fbm(i * 0.03, y * 0.06, o) - 0.5) * sc.pal.patchy; // patches: tufts and bare runs (spring: even)
      const p = (P_NEAR + (P_FAR - P_NEAR) * Math.pow(1 - t, PEXP)) * Math.max(0.15, dens) * 1.6 * (sc.pal.snow ? SN.keep : 1); // winter: a few dry stalks
      if (H(i * 1.37 + o, y * 0.91) >= p || inWater(sc, i, y, 1.5)) continue;
      const u = H(i + 0.3, y + o),
        v = H(y * 0.7 + 5, i * 0.3 + o);
      const h = Math.max(2, Math.round(lerp(H_FAR, H_NEAR * sc.pal.bladeH, Math.pow(t, HEXP)) * (0.7 + 0.6 * u)));
      bx[m] = i;
      by[m] = y;
      bh[m] = h;
      bu[m] = Math.min(UB - 1, (u * UB) | 0);
      bt[m] = Math.min(255, (t * 255) | 0);
      bn[m] = Math.round((v * 2 - 1) * h * 0.3);
      am[m] = h * (0.75 + 0.5 * u); // am: how far the wind bends this blade's tip (grains per unit of wind)
      m++;
    }
  rel = new Float32Array(GW * SH); // gentle rolling bands: low-frequency noise, stretched across the view, tilted a little
  for (let y = Math.max(0, Math.floor(sc.horizon) - 12); y < SH; y++)
    for (let i = 0; i < GW; i++) {
      const d = Math.max(0, y - nearLine[i]) / Math.max(1, SH - nearLine[i]),
        fy = 0.05 + 0.1 * d,
        fx = 0.006 + 0.01 * d; // bands get broader toward the viewer
      rel[y * GW + i] = sc.pal.snow
        ? (vn(i * SN.fx.rollX * (1 + d) + y * 0.003 + 60, y * SN.fx.rollY * (1 + d * 0.8), o + 51) * 0.65 +
            vn(i * SN.fx.rollX * 2.7 * (1 + d) + 9, y * SN.fx.rollY * 2.3 * (1 + d * 0.8), o + 57) * 0.35 -
            0.5) *
          1.6
        : (vn(i * fx + y * 0.003 + 60, y * fy, o + 51) * 0.7 + vn(i * fx * 2.3 + 9, y * fy * 2.1, o + 57) * 0.3 - 0.5) * 1.5;
    }
  snowStrokes = sc.pal.snow ? buildStrokes(sc, o) : null;
  tab = { n: m, bx, by, bh, bn, bu, bt, am: am.subarray(0, m), sway: new Float32Array(m) };
  key = sceneKey(sc);
}
/* winter: the snow's strokes, placed like the meadow's blades (dense and fine toward the horizon, sparse and larger near). kind 0 crust ridge, 1 wind ripple, 2 tuft or lump */
function buildStrokes(sc, o) {
  const F = SN.fx,
    cap = ((GW * SH) / 2) | 0,
    sx = new Int16Array(cap),
    sy = new Int16Array(cap),
    sl = new Uint8Array(cap),
    sk = new Uint8Array(cap),
    su = new Float32Array(cap),
    st = new Float32Array(cap);
  let m = 0;
  for (let y = Math.floor(sc.horizon) - 12; y < SH; y++)
    for (let i = 0; i < GW && m < cap; i++) {
      const top = nearLine[i],
        t = (y - top) / (SH - top);
      if (t < 0) continue;
      const dens = 0.55 + 1.0 * (fbm(i * 0.03, y * 0.06, o + 7) - 0.5),
        p = (P_NEAR * 4 + (P_FAR - P_NEAR * 4) * Math.pow(1 - t, PEXP)) * Math.max(0.15, dens) * F.dens;
      if (H(i * 1.37 + o + 3, y * 0.91 + 1) >= p || inWater(sc, i, y, SN.ice.w + 1.5)) continue;
      const u = H(i + 0.7, y + o + 2),
        v = H(y * 0.7 + 9, i * 0.3 + o),
        kind = v < F.ridge ? 0 : v < F.ridge + F.ripple ? 1 : 2;
      sx[m] = i;
      sy[m] = y;
      su[m] = u;
      st[m] = t;
      sk[m] = kind;
      sl[m] =
        kind === 2
          ? Math.max(1, Math.round(1 + (F.tuft - 1) * Math.pow(t, 0.8) * (0.4 + 0.9 * u)))
          : Math.max(2, Math.round(lerp(F.len[0], F.len[1], Math.pow(t, 0.8)) * (0.6 + 0.8 * u)));
      m++;
    }
  return { n: m, sx, sy, sl, sk, su, st };
}

/* draw the snow strokes: the top of each ridge or lump is lit (gold toward the sun), the side facing the viewer is blue shade, a lump casts a short shadow away from the sun */
function drawStrokes(sc) {
  const { n, sx, sy, sl, sk, su, st } = snowStrokes,
    F = SN.fx,
    g = sc.pal.grass,
    haze = mix3(g[0], sc.pal.sky[2], 0.3),
    dir = [];
  const put = (i, j, c, a) => {
    if (i < 0 || i >= GW || j < 0 || j >= SH || inWater(sc, i, j, SN.ice.w)) return;
    const k = j * GW + i;
    BR[k] += (c[0] - BR[k]) * a;
    BG[k] += (c[1] - BG[k]) * a;
    BB[k] += (c[2] - BB[k]) * a;
  };
  for (let b = 0; b < n; b++) {
    const i = sx[b],
      y = sy[b],
      l = sl[b],
      t = st[b],
      u = su[b],
      rl = rel[y * GW + i],
      s = Math.max(0, Math.min(1, 0.5 + rl * SN.relief)),
      sn = sunNear(sc, i),
      tone = 1 + (u - 0.5) * 2 * F.tone;
    const hz = (1 - t) * SN.haze * 1.5,
      sd = Math.sign(i - sc.sun.x) || 1;
    const hi = mix3(mix3(SN.lit, SN.gold, Math.min(1, SN.goldK * 1.4 * sn * (0.3 + s) * (0.4 + 0.6 * t))), haze, hz),
      lo = mix3(mix3(SN.shade, SN.deep, 1 - s), haze, hz);
    const H1 = [hi[0] * tone, hi[1] * tone, hi[2] * tone],
      S1 = [lo[0] * tone, lo[1] * tone, lo[2] * tone];
    if (sk[b] === 2) {
      for (let q = 0; q < l; q++) put(i, y - q, q === l - 1 ? H1 : mix3(S1, H1, q / l), 0.95); // a lump or tuft: shade at its foot, lit on top
      if (l > 1) put(i + sd, y - l + 1, H1, 0.6);
      const sl2 = 1 + Math.round((F.shadow[0] - 1) * Math.pow(t, 0.7) * (0.5 + u));
      for (let q = 1; q <= sl2; q++) put(i + sd * q, y + (q > 2 ? 1 : 0), SN.shadow, F.shadow[1] * (1 - q / (sl2 + 1.5)) * (0.5 + 0.5 * t)); // its long shadow
    } else {
      const slope = sk[b] === 1 ? 0.5 : 0;
      for (let q = 0; q < l; q++) {
        const jj = y + Math.round(q * slope * (u < 0.5 ? 1 : -1)),
          edge = q === 0 || q === l - 1;
        put(i + q, jj, H1, edge ? 0.55 : 0.9);
        put(i + q, jj + 1, S1, edge ? 0.45 : 0.8);
      } // a crust ridge: lit on top, shade below it
    }
  }
}

const ensure = sc => {
  if (!tab || key !== sceneKey(sc)) build(sc);
};

/* a hill: soft crest (one fractional grain), tone from `top` (hazy, rim-lit) to `bot`, calm low-frequency patches */
function fillHill(line, top, bot, rim, o) {
  for (let i = 0; i < GW; i++) {
    for (let j = Math.max(0, Math.ceil(line[i]) - 1); j < SH; j++) {
      const k = j * GW + i,
        depth = j - line[i];
      if (depth < -1) continue;
      const a = depth < 0 ? 1 + depth : 1,
        f = Math.min(1, depth / 22),
        lit = depth < 1.5 ? 1 + RIM * rim : 1;
      const patch = 1 + (vn(i * 0.02, j * 0.06, o) - 0.5) * 0.1 + gn(i, j) * GJIT;
      const r = lerp(top[0], bot[0], f) * lit * patch,
        g = lerp(top[1], bot[1], f) * lit * patch,
        b = lerp(top[2], bot[2], f) * lit * patch;
      BR[k] += (r - BR[k]) * a;
      BG[k] += (g - BG[k]) * a;
      BB[k] += (b - BB[k]) * a;
    }
  }
}

/* the ground under the blades: a calm field, haze above, deeper green below (blades supply the texture) */
function drawGround(sc, hillTop) {
  if (sc.pal.snow) return snowGround(sc, hillTop);
  const g = sc.pal.grass,
    deep = mix3(g[1], g[3], 0.32),
    o = sc.seed % 997;
  for (let i = 0; i < GW; i++) {
    const top = Math.max(0, Math.ceil(nearLine[i])),
      span = SH - nearLine[i];
    for (let j = top; j < SH; j++) {
      const t = sm(0, 1, (j - nearLine[i]) / span),
        k = j * GW + i,
        rl = rel[k],
        u = (1 + (vn(i * 0.025, j * 0.1, o + 3) - 0.5) * 0.1 + gn(i + 5, j) * GJIT) * (1 + rl * RL.roll * sc.pal.roll);
      const w = Math.max(0, rl) * RL.rollWarm * sunNear(sc, i) * (0.4 + 0.6 * t); // light crests catch a little gold, hollows stay dark
      BR[k] = lerp(lerp(hillTop[0], deep[0], t) * u, RL.rim[0], w);
      BG[k] = lerp(lerp(hillTop[1], deep[1], t) * u, RL.rim[1], w);
      BB[k] = lerp(lerp(hillTop[2], deep[2], t) * u, RL.rim[2], w);
    }
  }
}

/* winter: the meadow is a snow field. Rolling drifts shade it: crests are lit (warm gold toward the sun), hollows and the sides facing the viewer stay in cool blue shade; haze toward the far hill */
function snowGround(sc, hillTop) {
  const g = sc.pal.grass,
    o = sc.seed % 997,
    haze = mix3(g[0], sc.pal.sky[2], 0.3);
  for (let i = 0; i < GW; i++) {
    const top = Math.max(0, Math.ceil(nearLine[i])),
      span = SH - nearLine[i],
      sn = sunNear(sc, i);
    for (let j = top; j < SH; j++) {
      const t = sm(0, 1, (j - nearLine[i]) / span),
        k = j * GW + i,
        rl = rel[k],
        rn = rel[Math.min(SH - 1, j + 1) * GW + i],
        sl = (rl - rn) * SN.slope; // sl > 0: the drift's far side, facing the sun
      const s = Math.max(0, Math.min(1, 0.5 + rl * SN.relief + sl * 0.5 + (H(i * 1.3 + o, j * 0.7 + 4) - 0.5) * SN.fx.dither)),
        u = 1 + (vn(i * 0.025, j * 0.1, o + 3) - 0.5) * 0.05 + gn(i + 5, j) * SN.jit;
      let c = mix3(mix3(SN.deep, SN.shade, Math.min(1, s * 1.6)), SN.lit, Math.max(0, s - 0.4) / 0.6);
      c = mix3(c, SN.deep, Math.max(0, -rl) * SN.hollow * 4);
      c = mix3(c, SN.gold, Math.max(0, s - 0.5) * SN.goldK * sn * (0.4 + 0.6 * t));
      c = mix3(c, haze, (1 - t) * SN.haze);
      BR[k] = c[0] * u;
      BG[k] = c[1] * u;
      BB[k] = c[2] * u;
    }
  }
}

/* the hill crest lines (rows, per column): far = the tree line's ridge, near = where the meadow begins */
export function hillLines(sc) {
  ensure(sc);
  return { far: farLine, near: nearLine };
}

/* `between` runs after the far hill and before the near one (the tree line goes there) */
export function drawHills(sc, between) {
  ensure(sc);
  const g = sc.pal.grass,
    sky = sc.pal.sky,
    o = sc.seed % 997;
  const farTop = mix3(mix3(g[0], sky[2], FAR_HAZE), sky[1], FAR_SKYMID),
    farBot = mix3(g[0], sky[2], FAR_HAZE * 0.55);
  const nearTop = mix3(mix3(g[0], g[1], 0.4), g[3], NEAR_DARK),
    nearBot = mix3(g[1], g[3], 0.2);
  fillHill(farLine, farTop, farBot, 0.6, o + 21);
  if (between) between();
  fillHill(nearLine, nearTop, nearBot, 1, o + 33);
  drawGround(sc, nearBot);
}

/* a near blade picked by r (0..1) for a dew glint: its tip as it was drawn last, or null (the sway of the last drawGrass is kept in the table) */
export function bladeTip(sc, r) {
  ensure(sc);
  const { n, bx, by, bh, bn, bt, sway } = tab;
  for (let t = 0; t < 8 && n > 0; t++) {
    const b = Math.min(n - 1, (((r + t * 0.6180339) % 1) * n) | 0),
      h = bh[b];
    if (h < 8 || bt[b] < 90) continue;
    const i = bx[b] + Math.round(bn[b] + sway[b]),
      j = by[b] - h + 1;
    if (!inWater(sc, i, j, 1)) return [i, j];
  }
  return null;
}

/* W: the wind of this frame (sky/life.js `wind`: .col per column) or null = the blades at rest (the cached land of the sunrise and the sunset) */
export function drawGrass(sc, W) {
  ensure(sc);
  const g = sc.pal.grass,
    hz = sc.pal.sky[2];
  /* palettes by distance bucket (haze toward the hill colour) and blade variation: [base, body, mid, tip] */
  const hazeC = mix3(g[0], hz, 0.25),
    pal = [];
  for (let tb = 0; tb < TB; tb++) {
    const hz2 = Math.pow(1 - tb / (TB - 1), 1.4) * 0.6,
      row = [];
    for (let ub = 0; ub < UB; ub++) {
      const body = mix3(mix3(g[1], g[3], 0.18), g[2], ub * 0.05),
        tip = mix3(g[2], [1, 1, 0.9], 0.15 + ub * 0.05);
      if (sc.pal.snow) {
        const d = SN.dry,
          dt = mix3(d[2], [1, 1, 0.9], ub * 0.05);
        row.push([mix3(d[0], hazeC, hz2), mix3(d[1], hazeC, hz2), mix3(mix3(d[1], dt, 0.5), hazeC, hz2), mix3(dt, hazeC, hz2 * 0.8)]);
        continue;
      } // winter: dry stalks
      row.push([
        mix3(mix3(g[1], g[3], 0.72), hazeC, hz2),
        mix3(body, hazeC, hz2),
        mix3(mix3(body, tip, 0.45), hazeC, hz2),
        mix3(tip, hazeC, hz2 * 0.8)
      ]);
    }
    pal.push(row);
  }
  const { n, bx, by, bh, bn, bu, bt, sway, am } = tab;
  if (W) {
    const col = W.col;
    for (let b = 0; b < n; b++) sway[b] = col[bx[b]] * am[b];
  } else sway.fill(0);
  if (snowStrokes) drawStrokes(sc);
  if (rimK.length !== GW) rimK = new Float32Array(GW);
  for (let i = 0; i < GW; i++) rimK[i] = sunNear(sc, i) * RL.rimGrass;
  for (let b = 0; b < n; b++) {
    const i0 = bx[b],
      y = by[b],
      h = bh[b],
      cs = pal[Math.min(TB - 1, ((bt[b] / 255) * TB) | 0)][bu[b]],
      lean = bn[b],
      sw = sway[b],
      thick = h > 4 && !sc.pal.snow;
    const kl = 1 + rel[y * GW + i0] * RL.roll * sc.pal.roll,
      rk = rimK[i0] * (0.5 + 0.5 * (bt[b] / 255));
    for (let q = 0; q < h; q++) {
      const f = h > 1 ? q / (h - 1) : 0,
        i = i0 + Math.round((lean + sw) * f * f),
        j = y - q;
      if (j < 0 || j >= SH || inWater(sc, i, j, 0.5)) continue;
      const c = q < (h > 8 ? 2 : 1) ? cs[0] : q >= h - (h > 6 ? 2 : 1) ? cs[3] : q > h * 0.5 ? cs[2] : cs[1];
      const tip = q >= h - 1 ? rk : q >= h - 2 ? rk * 0.5 : 0; // the rim: warm gold on the tips, strongest under the sun
      if (i >= 0 && i < GW) {
        const k = j * GW + i;
        BR[k] = lerp(c[0] * kl, RL.rim[0], tip);
        BG[k] = lerp(c[1] * kl, RL.rim[1], tip);
        BB[k] = lerp(c[2] * kl, RL.rim[2], tip);
      }
      if (thick && q < h - 2 && i + 1 < GW && i >= -1) {
        const k = j * GW + i + 1,
          c2 = q < 2 ? cs[0] : cs[1];
        BR[k] = c2[0];
        BG[k] = c2[1];
        BB[k] = c2[2];
      }
    }
  }
}
