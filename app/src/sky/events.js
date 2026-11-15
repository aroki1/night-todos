/* sky/events.js — satellites, meteor showers, aurora, the comet. Rare, dim, seeded. */
import { H, sm, clamp01, seg, fbm } from '../math.js';
import { C, FLAGS } from '../tokens.js';
import { GW, SH, splat, halo, BR, BG, BB, geometryListeners, onSkyReset } from '../framebuffer.js';
import { sky } from './sky.js';
import { T, wall, wc, hourOf } from './clock.js';
import { moonSt } from './moon.js';

const DEMO = FLAGS.demo ? 20 : 1; // ?demo=1 speeds every rare event x20

/* ---------- satellites ---------- */
const SAT_PER = 330 / DEMO,
  SAT_J = 60 / DEMO;
function satPass(n) {
  const sd = sky.seed * 0.0137 + n * 7.31,
    t0 = n * SAT_PER + 12 + H(sd, 1) * SAT_J;
  const v = 14 + 8 * H(sd, 2),
    ltr = H(sd, 3) < 0.5,
    y0 = 8 + 90 * H(sd, 4);
  const y1 = Math.max(6, Math.min(115, y0 + (H(sd, 5) - 0.5) * 70));
  const x0 = ltr ? -2 : GW + 2,
    x1 = ltr ? GW + 2 : -2,
    len = Math.hypot(x1 - x0, y1 - y0),
    dur = len / v;
  const flare = H(sd, 6) < 1 / 6;
  return { t0, dur, x0, y0, x1, y1, flare, um: dur * (0.3 + 0.4 * H(sd, 7)) };
}
export function satNow(out) {
  out.length = 0;
  // a satellite is dimmer than the moon or the comet; don't stack specials (taste rule)
  if (moonSt.show || (sky.comet && cometHead(cometTmp))) return out;
  const n0 = Math.floor(T / SAT_PER);
  for (let n = n0; n >= Math.max(0, n0 - 3); n--) {
    const p = satPass(n),
      u = T - p.t0;
    if (u < 0 || u > p.dur) continue;
    const f = u / p.dur,
      b = 0.3 + (p.flare ? 0.5 * Math.exp(-Math.pow((u - p.um) / 0.75, 2)) : 0);
    out.push({ x: p.x0 + (p.x1 - p.x0) * f, y: p.y0 + (p.y1 - p.y0) * f, b, flare: p.flare });
  }
  if (DEMO > 1 && out.length > 1) out.length = 1; // demo: at most one satellite at a time
  return out;
}
const satTmp = [],
  cometTmp = { x: 0, y: 0 };
export function drawSats() {
  satNow(satTmp);
  for (let q = 0; q < satTmp.length; q++) splat(satTmp[q].x, satTmp[q].y, C.sat, satTmp[q].b);
}
export function satTime(flare) {
  for (let n = 0; n < 400; n++) {
    const p = satPass(n);
    if (p.flare === flare) return p.t0 + (flare ? p.um : p.dur * 0.5);
  }
  return 0;
}

/* ---------- meteors ---------- */
export function showerOn(ms) {
  const h = hourOf(ms);
  return h >= 22 || h < 4;
}
export let forceShower = false;
export function setForceShower(v) {
  forceShower = !!v;
}
export function meteorList(out) {
  out.length = 0;
  if (T < 5) return out;
  const sh = forceShower || (sky.shower && showerOn(wall(T)));
  const per = (forceShower ? 0.3 : sh ? 28 / 5 : 28) / DEMO,
    n0 = Math.floor((T - 5) / per);
  for (let k = 0; k < 4; k++) {
    const n = n0 - k;
    if (n < 0) continue;
    const sd = n + sky.seed * 0.137,
      st = 5 + n * per + H(sd, 4) * per * 0.643,
      u = T - st;
    if (u < 0 || u > 1.05) continue;
    const x0 = 50 + H(sd, 2) * 270,
      y0 = 6 + H(sd, 3) * 45;
    let vx, vy;
    if (sh) {
      const dx = x0 - sky.rx,
        dy = y0 - sky.ry,
        l = Math.hypot(dx, dy);
      vx = dx / l;
      vy = dy / l;
    } else {
      const an = 0.38 + H(sd, 1) * 0.3;
      vx = Math.cos(an);
      vy = Math.sin(an);
    }
    out.push({ u, vx, vy, x0, y0 });
  }
  return out;
}
const metTmp = [];
export function drawMeteor() {
  meteorList(metTmp);
  for (let q = 0; q < metTmp.length; q++) {
    const m = metTmp[q],
      u = m.u,
      vx = m.vx,
      vy = m.vy;
    const e = 1 - Math.pow(1 - Math.min(1, u / 0.8), 2),
      hx = m.x0 + vx * e * 75,
      hy = m.y0 + vy * e * 75;
    const fade = (u < 0.7 ? Math.min(1, u / 0.1) : Math.max(0, 1 - (u - 0.7) / 0.35)) * 0.6,
      len = 24 * Math.min(1, u / 0.3);
    for (let s = 0; s < len; s += 0.4) splat(hx - vx * s, hy - vy * s, C.met, fade * 0.22 * (1 - s / len));
    halo(hx, hy, C.met, fade * 0.5, 1.1, 3);
  }
}

/* ---------- aurora (teal skies, 20:00-03:00): cached per 0.25 s ---------- */
let AUR = new Float32Array(GW * 60 * 3),
  auT = -99,
  auOn = false;
geometryListeners.push(() => {
  AUR = new Float32Array(GW * 60 * 3);
  auT = -99;
});
onSkyReset(() => {
  auT = -99;
});
export function auroraW() {
  if (!sky.aurora) return 0;
  const h = wc.hour;
  return h >= 20 ? sm(20, 20.5, h) : h < 3 ? 1 - sm(2.5, 3, h) : 0;
}
export function auroraUpdate(force) {
  const aw = auroraW();
  auOn = aw > 0.003;
  if (!auOn) return;
  if (!force && Math.abs(T - auT) < 0.25) return;
  auT = T;
  const o = sky.off,
    lo = C.auLo,
    hi = C.auHi;
  for (let x = 0; x < GW; x++) {
    const ci = sm(0.36, 0.68, fbm(x / 40 + T * 0.01, T * 0.02, o + 41));
    const yc = 20 + 16 * fbm(x / 90 + 3.1, T * 0.006, o + 11);
    const ray = Math.min(1.2, 0.35 + 1.1 * fbm(x / 3, T * 0.05, o + 23));
    for (let y = 0; y < 60; y++) {
      const dy = y - yc,
        pf = dy > 0 ? Math.exp(-(dy / 3.5) * (dy / 3.5)) : Math.exp(-(dy / 13) * (dy / 13));
      const w = 0.16 * ci * pf * ray * aw,
        t = clamp01(-dy / 22 + 0.25),
        q = (y * GW + x) * 3;
      AUR[q] = (lo[0] + (hi[0] - lo[0]) * t) * w;
      AUR[q + 1] = (lo[1] + (hi[1] - lo[1]) * t) * w;
      AUR[q + 2] = (lo[2] + (hi[2] - lo[2]) * t) * w;
    }
  }
}
export function drawAurora() {
  if (!auOn) return;
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < GW; x++) {
      const k = y * GW + x,
        q = k * 3;
      BR[k] += AUR[q];
      BG[k] += AUR[q + 1];
      BB[k] += AUR[q + 2];
    }
}

/* ---------- the comet (1 in 3 skies): head follows a seeded arc by week progress ---------- */
export function cometHead(out) {
  const c = sky.comet;
  if (!c) return false;
  const t = wc.wp,
    u = 1 - t;
  const bx = u * u * c.p0x + 2 * u * t * c.p1x + t * t * c.p2x;
  const by = u * u * c.p0y + 2 * u * t * c.p1y + t * t * c.p2y,
    W = GW + 24;
  out.x = ((((bx - T * 0.73) % W) + W) % W) - 12;
  out.y = by;
  return out.x > -2 && out.x < GW + 2 && out.y > -2 && out.y < SH;
}
const cmTmp = cometTmp;
export function drawComet() {
  const c = sky.comet;
  if (!c) return;
  cometHead(cmTmp);
  const hx = cmTmp.x,
    hy = cmTmp.y;
  if (hx < -45 || hx > GW + 45) return;
  const dx = hx - c.sunX,
    dy = hy - c.sunY,
    l = Math.hypot(dx, dy),
    ux = dx / l,
    uy = dy / l,
    px = -uy,
    py = ux,
    len = c.len;
  const dustB = 0.32,
    dustP = 1.3;
  for (let s = 1; s < len; s += 1) {
    // dust tail: slightly curved
    const f = s / len,
      cv2 = c.curve * f * f * 5;
    splat(hx + ux * s + px * cv2, hy + uy * s + py * cv2, C.cometH, dustB * Math.pow(1 - f, dustP));
  }
  const ca = Math.cos(0.11),
    sa = Math.sin(0.11),
    ix = ux * ca - uy * sa,
    iy = ux * sa + uy * ca,
    il = len * 1.2;
  for (let s = 1; s < il; s += 1) {
    // ion tail: straighter, bluer, dimmer
    const f = s / il;
    splat(hx + ix * s, hy + iy * s, C.ion, 0.13 * Math.pow(1 - f, 1.5));
  }
  halo(hx, hy, C.cometH, 0.22, 1.6, 5);
  splat(hx, hy, C.cometH, 0.55);
}

/* what is visible right now (used by the sampler and the moon window test) */
export function specialsNow() {
  const L = [];
  if (moonShow()) L.push('moon');
  if (sky.comet && cometHead(cmTmp)) L.push('comet');
  if (auroraW() > 0.25) L.push('aurora');
  if (satNow([]).length) L.push('satellite');
  if (meteorList([]).length) L.push('meteor');
  return L;
}
let moonShow = () => false;
export function setMoonShow(fn) {
  moonShow = fn;
}
export function resetEvents() {
  auT = -99;
}
onSkyReset(resetEvents);
