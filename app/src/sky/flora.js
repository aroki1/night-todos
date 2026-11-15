/* sky/flora.js — morning flowers and buds (static in M1): one per task finished this week, one bud per carried-over task.
   The flowers are the point of the meadow: heads 5-9 grains across on stems 12-25 grains tall (near), smaller and hazier far away.
   Each species is a rule on (distance, angle) around a core, so a daisy is thin white rays, a poppy four broad red petals, and so on.
   Drawn with draw.js: stems, leaves and buds are lists of single grains (points), the heads are fields over their own rectangle (shadeLayers). */
import { lerp, sm } from '../math.js';
import { MORNING } from '../tokens.js';
import { GW, SH } from '../framebuffer.js';
import { shade, shadeLayers, points } from '../draw.js';
import { riverAt, inWater } from './valley.js';

const R_NEAR = 6.6,
  R_BIG = 8.6,
  FAR_R = 0.6,
  R_MIN = 2,
  SMALL_W = 520,
  SMALL_MIN = 0.55; // phones: scale the flowers by GW / SMALL_W (never below SMALL_MIN)
const STEM_NEAR = 18,
  STEM_VAR = 7,
  STEM_BIG = 8,
  FAR_STEM = 0.62; // stem height: base, +pick%VAR, +big, far shrink
const FAR_HAZE = 0.2; // share of the sky colour at the far end
const BASE_NEAR = 4,
  BASE_FAR = 4; // distance from the bottom / from the horizon, grains
/* radial species: default petal count, edge floor a (between petals), petal sharpness p, core radius share, core kind */
const RADIAL = {
  daisy: { n: 8, a: 0.5, p: 1.7, core: 0.36 },
  aster: { n: 8, a: 0.42, p: 2.4, core: 0.3 },
  chrysanthemum: { n: 8, a: 0.68, p: 1.0, core: 0.26, ring: 1 },
  poppy: { n: 4, a: 0.72, p: 0.6, core: 0.26 },
  cornflower: { n: 6, a: 0.38, p: 2.6, core: 0.24 },
  hellebore: { n: 5, a: 0.78, p: 0.5, core: 0.34, dots: 1 }
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const L = MORNING.light,
  WF = MORNING.wind.flower,
  SN = MORNING.snow;
const SIL = MORNING.rise.sil,
  SIL_B = MORNING.rise.silBase,
  SIL_G = MORNING.rise.silGain;
const RAW = 0, // how an item of a grain list is coloured: as given (shadows, the snow dip) ...
  PLAIN = 1, // ... hazed toward the sky and darkened toward the silhouette ...
  LIT = 2; // ... the same, after the hover lightening (heads and buds)
const tint = [0, 0, 0]; // scratch for the one colour being drawn

/* The land of this frame (the sunrise and the sunset, M2b/M2c), set by drawFlora.
   landDrop: rows the whole land is lowered by. landKeep: (i, j) -> 0..1, how much of the land is still there at that grain (the dissolving land takes its flowers with it) or null. */
let landDrop = 0;
let landKeep = null;
let rimStrength = 0; // this flower's backlight (strongest under the sun)

const keepAt = (i, j) => (landKeep ? landKeep(i, j) : 1);
/* a grain of a list: i, j are the grid column and row of a flower at rest; the lowered land moves it */
const grain = (list, i, j, c, a = 1, how = PLAIN) => list.push({ i, j: j + landDrop, c, a, how });

/* where the colour of a grain ends up: `look` = { haze, sky, dark, hover } of this flower */
function inkInto(out, c, how, look) {
  let r = c[0],
    g = c[1],
    b = c[2];
  if (how === RAW) {
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return;
  }
  if (how === LIT && look.hover > 0) {
    r = lerp(r, 1, look.hover);
    g = lerp(g, 1, look.hover);
    b = lerp(b, 1, look.hover);
  }
  out[0] = lerp(r, look.sky[0], look.haze);
  out[1] = lerp(g, look.sky[1], look.haze);
  out[2] = lerp(b, look.sky[2], look.haze);
  if (look.dark > 0) {
    const m = SIL_B + SIL_G * (0.299 * out[0] + 0.587 * out[1] + 0.114 * out[2]);
    for (let q = 0; q < 3; q++) out[q] = lerp(out[q], SIL[q] * m, look.dark);
  } // the silhouette hour: colour drains toward the dark land
}
const drawGrains = (list, look) =>
  points(list, (p, out) => {
    inkInto(out, p.c, p.how, look);
    return p.a * keepAt(p.i, p.j);
  });
/* one layer of a head grain (heads are fields: the callback paints through `paint`, see shadeLayers) */
function layer(look, paint, i, j, c, a = 1) {
  if (a <= 0) return;
  inkInto(tint, c, LIT, look);
  paint(tint, a * keepAt(i, j));
}

/* where a flower stands: x, and the row of its foot */
function spot(sc, f) {
  let x = Math.round(f.x * (GW - 1));
  const base = Math.round(lerp(SH - BASE_NEAR, sc.horizon + BASE_FAR, f.depth)),
    [riverCentre, riverHalfWidth] = riverAt(sc, base);
  if (riverHalfWidth > 0 && Math.abs(x - riverCentre) < riverHalfWidth + 3)
    x = Math.round(riverCentre + (x < riverCentre ? -1 : 1) * (riverHalfWidth + 4 + (f.pick % 3))); // never in the water: step to the nearest bank
  return [x, base];
}

const headRadius = (f, size, far) => Math.max(R_MIN, (f.big ? R_BIG : R_NEAR) * size * lerp(1, FAR_R, far));
const stemHeight = (f, size, far) =>
  Math.max(6, Math.round((STEM_NEAR + (f.pick % STEM_VAR) + (f.big ? STEM_BIG : 0)) * size * lerp(1, FAR_STEM, far)));
const budHeight = (f, far) => Math.max(4, Math.round((8 + (f.pick % 3)) * lerp(1, FAR_STEM, far)));

/* o (the sunrise and the sunset, M2b): { bloom(order) -> { stem, head } 0..1, bud: 0..1, dark: 0..1 (toward the silhouette), shadow: 0..1, dy: rows the whole land is lowered by, keep: (i, j) -> 0..1 or null }.
   No o = the grown meadow of the hold: every factor is 1 and every offset 0, so the grains are exactly those of M1. */
export function drawFlora(sc, o, W) {
  // W: the wind of this frame (sky/life.js) or none: the stems stand straight (up to their own lean)
  const g = sc.pal.grass,
    stemColour = sc.pal.stem,
    fx = {
      sc,
      W,
      size: Math.max(SMALL_MIN, Math.min(1, GW / SMALL_W)),
      bloom: o ? o.bloom : null,
      budK: o ? o.bud : 1,
      shadowK: o ? o.shadow : 1,
      dark: o ? o.dark : 0,
      stemColour,
      leafColour: mix3(stemColour, g[2], 0.3),
      budGreen: mix3(stemColour, g[2], 0.25),
      sky: sc.pal.sky[2],
      shadowColour: g[3]
    };
  landDrop = o ? o.dy | 0 : 0;
  landKeep = o && o.keep ? o.keep : null;
  const indexOf = new Map();
  for (let k = 0; k < sc.flowers.length; k++) indexOf.set(sc.flowers[k], k);
  sc.heads = []; // head centres (with the wind, without the growth) for hover, tap and the butterflies
  const list = sc.flowers.slice().sort((a, b) => b.depth - a.depth || a.x - b.x); // far first
  drawShadows(fx, list);
  for (const f of list) drawFlower(fx, f, indexOf.get(f));
  landDrop = 0;
  landKeep = null;
}

/* how much of the stem is up */
const growth = (fx, f) => (f.bud ? fx.budK : fx.bloom ? fx.bloom(f.order).stem : 1);

/* long soft shadows first (the sun is in front: they fall toward the viewer and a little away from the sun's x), so no flower is ever darkened by another's */
function drawShadows(fx, list) {
  const { sc, size } = fx,
    shadowColour = sc.pal.snow ? SN.shadow : mix3(fx.shadowColour, [0, 0, 0], 0.35),
    look = { haze: 0, sky: fx.sky, dark: 0, hover: 0 };
  for (const f of list) {
    const stemK = growth(fx, f);
    if (stemK <= 0 || fx.shadowK <= 0) continue;
    const headK = f.bud ? stemK : fx.bloom ? fx.bloom(f.order).head : 1;
    const [x, base] = spot(sc, f),
      far = f.depth,
      h = f.bud ? 9 : STEM_NEAR + (f.pick % STEM_VAR) + (f.big ? STEM_BIG : 0),
      len = Math.round(h * size * lerp(1, FAR_STEM, far) * L.shadowLen * stemK),
      dir = x < sc.sun.x ? -1 : 1,
      headR = f.bud ? 1.5 : headRadius(f, size, far),
      fade = 1 - 0.5 * far;
    const trail = [];
    for (let q = 1; q <= len; q++) {
      const cx = x + dir * q * L.shadowDx,
        y = base + q;
      if (y >= SH) break;
      if (inWater(sc, cx, y, 1)) continue;
      grain(trail, Math.round(cx), y, shadowColour, L.shadowA * fade * (1 - (0.65 * q) / len) * fx.shadowK, RAW);
      if (far < 0.6) grain(trail, Math.round(cx) + dir, y, shadowColour, L.shadowA * 0.5 * fade * (1 - q / len) * fx.shadowK, RAW);
    }
    drawGrains(trail, look);
    if (headK <= 0) continue;
    const endX = x + dir * len * L.shadowDx,
      endY = base + len,
      halfWidth = headR * 0.85, // the head's shadow: a flat smudge of grains at the end
      centre = Math.round(endX),
      reach = Math.ceil(halfWidth);
    shade({ x0: centre - reach, x1: centre + reach + 1, y0: endY - 2 + landDrop, y1: endY + 3 + landDrop }, (i, j, col) => {
      const dx = i - centre,
        dy = j - landDrop - endY,
        e = (dx / halfWidth) * (dx / halfWidth) + (dy / 2.2) * (dy / 2.2),
        y = endY + dy;
      if (e > 1 || y >= SH || y < 0 || inWater(sc, endX + dx, y, 1)) return 0;
      col[0] = shadowColour[0];
      col[1] = shadowColour[1];
      col[2] = shadowColour[2];
      return L.shadowA * 0.55 * fade * (1 - e) * (0.6 + 0.6 * ((dx * 7 + dy * 3 + f.pick) & 1)) * headK * fx.shadowK * keepAt(i, j);
    });
  }
}

/* the head at rest (no bloom, no dy) for the morning hover, tap and the butterflies */
function recordHead(fx, f, index, x, base, lean, species) {
  const { size } = fx,
    far = f.depth,
    R0 = headRadius(f, size, far),
    h0 = stemHeight(f, size, far);
  let gx = x + Math.round(lean),
    gy,
    r;
  if (f.bud) {
    gy = base - budHeight(f, far) - 1.5;
    r = 3;
  } else if (species === 'tulip' || species === 'crocus') {
    const height = R0 * (species === 'crocus' ? 2.8 : 2.4);
    gy = base - h0 - height * 0.5;
    r = Math.max(R0 * 1.05, height * 0.5);
  } else if (species === 'snowdrop') {
    const height = R0 * 1.9;
    gx += 3;
    gy = base - h0 + height * 0.5;
    r = Math.max(R0, height * 0.5);
  } else {
    gy = base - h0 - Math.round(R0) + 1;
    r = R0;
  }
  fx.sc.heads.push({ i: index, gx, gy, r });
}

/* the stem leans by `lean` (a curve: the top moves most); returns the column of its tip */
function drawStem(list, x, base, lean, stemH, upTo, colour) {
  const column = q => x + Math.round(lean * (q / stemH) * (q / stemH));
  for (let q = 0; q < upTo; q++) grain(list, column(q), base - q, colour);
  return column(upTo);
}

/* two leaves, one each side, pointing up and out */
function drawLeaves(list, x, base, lean, stemH, upTo, colour) {
  const low = Math.round(stemH * 0.3),
    high = Math.round(stemH * 0.55),
    column = q => x + Math.round(lean * (q / stemH) * (q / stemH));
  if (upTo >= low + 2) {
    grain(list, column(low) + 1, base - low, colour);
    grain(list, column(low) + 2, base - low - 1, colour);
    grain(list, column(low) + 3, base - low - 2, colour);
  }
  if (upTo >= high + 2) {
    grain(list, column(high) - 1, base - high, colour);
    grain(list, column(high) - 2, base - high - 1, colour);
  }
}

function drawFlower(fx, f, index) {
  const { sc, size, W } = fx,
    far = f.depth,
    stemK = growth(fx, f);
  if (stemK <= 0) return;
  const [x, base] = spot(sc, f);
  rimStrength = L.rimBase + (1 - L.rimBase) * Math.exp(-Math.pow((x - sc.sun.x) / (GW * L.rimSpread), 2));
  const species = sc.pal.species[f.pick % sc.pal.species.length],
    [petal, core] = MORNING.flowers[species],
    look = { haze: FAR_HAZE * far, sky: fx.sky, dark: fx.dark, hover: 0 },
    lean0 = ((f.pick >> 3) % 5) - 2, // -2..2: stems are not ruled lines
    restH = f.bud ? budHeight(f, far) : stemHeight(f, size, far),
    lean = lean0 + (W ? W.col[x] * restH * WF : 0); // the lean plus the wind: the stem bends by it, the head rides on its tip
  recordHead(fx, f, index, x, base, lean, species);
  look.hover = sc.hov && sc.hov.i === index ? sc.hov.k * MORNING.labelBox.bright : 0; // the hovered flower's head is lightened (the label's link is drawn by render/morning.js)

  const grains = [];
  if (sc.pal.snow) {
    // winter: a dip of shade where the stem leaves the snow
    for (let q = -2; q <= 2; q++) grain(grains, x + q, base, SN.dip, SN.dipA * (Math.abs(q) > 1 ? 0.55 : 1) * (1 - 0.5 * far), RAW);
    for (let q = -1; q <= 1; q++) grain(grains, x + q, base + 1, SN.dip, SN.dipA * 0.6 * (1 - 0.5 * far), RAW);
  } else {
    grain(grains, x - 1, base, fx.shadowColour, 0.5);
    grain(grains, x + 1, base, fx.shadowColour, 0.5);
  }

  if (f.bud) {
    const upTo = Math.max(1, Math.round(restH * stemK)),
      tipX = drawStem(grains, x, base, lean, restH, upTo, fx.stemColour),
      tipY = base - upTo;
    grain(grains, tipX, tipY, fx.budGreen);
    for (let k = -1; k <= 1; k++) grain(grains, tipX + k, tipY - 1, fx.budGreen);
    for (let k = -1; k <= 1; k++) grain(grains, tipX + k, tipY - 2, mix3(fx.budGreen, petal, 0.8), 1, LIT);
    grain(grains, tipX, tipY - 3, petal, 1, LIT);
    drawGrains(grains, look);
    return;
  }

  const bloom = fx.bloom ? fx.bloom(f.order) : null,
    open = bloom ? bloom.head * bloom.head * (3 - 2 * bloom.head) : 1,
    upTo = Math.max(1, Math.round(restH * stemK)),
    tipX = drawStem(grains, x, base, lean, restH, upTo, fx.stemColour),
    tipY = base - upTo;
  if (restH >= 10) drawLeaves(grains, x, base, lean, restH, upTo, fx.leafColour);
  if (stemK < 1) {
    drawGrains(grains, look);
    return; // the head waits until the stem is up
  }
  if (open < 0.2) {
    // a closed head: a green nub with a hint of petal
    grain(grains, tipX, tipY, fx.budGreen);
    grain(grains, tipX, tipY - 1, mix3(fx.budGreen, petal, (0.8 * open) / 0.2));
    drawGrains(grains, look);
    return;
  }
  drawGrains(grains, look);
  const r = headRadius(f, size, far) * open;
  if (species === 'tulip' || species === 'crocus') drawCup(look, tipX, tipY, r, species === 'crocus', petal, core);
  else if (species === 'snowdrop') drawBell(look, tipX, tipY, r, fx.stemColour, petal, core);
  else drawRadial(look, RADIAL[species] || RADIAL.daisy, tipX, tipY - Math.round(r) + 1, r, f.petals, petal, core);
}

/* a head seen from the front: petals as lobes of cos around the core, anti-aliased by edge distance */
function drawRadial(look, spc, cx, cy, R, petals, petal, core) {
  const n = petals || spc.n,
    phase = -Math.PI / 2,
    dark = mix3(petal, core, 0.3),
    coreR = spc.core * R,
    reach = Math.ceil(R) + 1,
    middle = cy + landDrop;
  const dots = []; // hellebore: five specks around the core
  if (spc.dots)
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + 0.3;
      dots.push({ i: cx + Math.round(Math.cos(a) * coreR * 1.5), j: cy + Math.round(Math.sin(a) * coreR * 1.5) + landDrop });
    }
  shadeLayers({ x0: cx - reach, x1: cx + reach + 1, y0: middle - reach, y1: middle + reach + 1 }, (i, j, paint) => {
    const dx = i - cx,
      dy = j - middle,
      d = Math.sqrt(dx * dx + dy * dy),
      angle = Math.atan2(dy, dx),
      lobe = Math.pow(Math.abs(Math.cos((n * (angle - phase)) / 2)), spc.p),
      edge = R * (spc.a + (1 - spc.a) * lobe),
      cover = Math.min(1, Math.max(0, edge - d + 0.5));
    if (cover > 0) {
      const t = sm(0, 1, d / R);
      let c = mix3(dark, petal, Math.min(1, t * 1.6));
      if (d > R * 0.62 && dy <= R * 0.5) c = mix3(c, L.rim, Math.min(0.85, rimStrength * L.rimGrass * 1.3 * sm(R * 0.62, R, d))); // petal edges catch the backlight
      if (spc.ring && d < R * 0.62) c = mix3(petal, core, 0.35);
      let petalToo = true;
      if (d < coreR + 0.5) {
        c = core;
        if (spc.dots && (dx + dy) & 1) c = mix3(core, petal, 0.5);
        layer(look, paint, i, j, c, Math.min(1, coreR - d + 0.5 + (cover > 0.99 ? 1 : 0)));
        if (d < coreR - 0.5) petalToo = false;
      }
      if (petalToo) layer(look, paint, i, j, c, cover);
    }
    for (let s = 0; s < dots.length; s++) if (dots[s].i === i && dots[s].j === j) layer(look, paint, i, j, core, 0.8);
  });
}

/* tulip / crocus: a cup seen from the side. Tulip: wide belly, three petal tips; crocus: slim, with an orange stamen peeking out */
function drawCup(look, cx, tipY, R, crocus, petal, core) {
  const height = Math.round(R * (crocus ? 2.8 : 2.4)),
    width = R * (crocus ? 0.78 : 1.05),
    notch = crocus ? 0.4 : Math.max(0.5, R * 0.3),
    shaded = mix3(petal, core, 0.22),
    reach = Math.ceil(width),
    top = tipY + landDrop;
  shadeLayers({ x0: cx - reach, x1: cx + reach + 1, y0: top - height, y1: top + 1 }, (i, j, paint) => {
    const k = top - j, // rows up from the base of the cup
      x = i - cx;
    if (k >= 0 && k < height && height >= 2) {
      const t = k / (height - 1),
        w = width * (0.45 + 0.55 * (1 - (1 - t) * (1 - t))),
        ax = Math.abs(x),
        tipRows = k >= height - 3;
      const skip = ax > w + 0.3 || (tipRows && ax > notch && ax < w * 0.55) || (crocus && k >= height - 2 && ax > notch); // the notch between petals
      if (!skip) {
        const side = x < 0 || k === 0 ? shaded : petal;
        layer(look, paint, i, j, ax > w * 0.7 || k > height - 3 ? mix3(side, L.rim, rimStrength * L.rimGrass) : side, ax > w ? 0.6 : 1);
      }
    }
    if (crocus && x === 0) {
      if (k === height) layer(look, paint, i, j, core);
      if (k === height - 1) layer(look, paint, i, j, core, 0.8);
    }
  });
}

/* snowdrop: the stem arches over and a white bell hangs from it, tipped green */
function drawBell(look, cx, tipY, R, stemColour, petal, core) {
  const bx = cx + 3,
    height = Math.round(R * 1.9),
    reach = Math.ceil(R * 0.9) + 1,
    top = tipY + landDrop;
  shadeLayers({ x0: Math.min(cx, bx - reach), x1: bx + reach + 1, y0: top - 1, y1: top + height + 2 }, (i, j, paint) => {
    const row = j - top; // 0 = the row of the arch
    if ((i === cx && row === 0) || (i === cx + 1 && row === -1) || (i === cx + 2 && row === -1) || (i === bx && row === 0))
      layer(look, paint, i, j, stemColour);
    const k = row - 1; // rows down from the arch
    if (k >= 0 && k < height && height >= 2) {
      const t = k / (height - 1),
        w = R * (0.35 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5)),
        x = i - bx,
        ax = Math.abs(x);
      if (ax <= w + 0.3 && !(k >= height - 1 && ax < 1 && height > 4))
        layer(look, paint, i, j, x < 0 ? mix3(petal, core, 0.18) : petal, ax > w ? 0.6 : 1);
    }
    if (row === height && (i === bx - 1 || i === bx + 1)) layer(look, paint, i, j, core, 0.9);
  });
}
