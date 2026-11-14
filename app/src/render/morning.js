/* render/morning.js — the morning scene: its state, controls, layer order and text block.
   The hold is the M1 frame, drawn exactly as it was. The sunrise and the sunset (M2b) layer, back to front: the night (its stars, specials, past week and alive
   stars fade by their own factors, see morningNight), the horizon glow, the day or dusk sky, the sun, the far ridges and the hills + meadow
   (cached once as premultiplied layers), the flowers. M2c: nothing slides and nothing fades as a whole except the sun: the sky, the land's silhouette and its light arrive and leave grain by grain, each at its own moment (order arrays, built once per scene and geometry). Reduced motion crossfades the whole night and the whole hold. */
import { MORNING, TIME, FONT, C } from '../tokens.js';
import { GW, SH, N, BR, BG, BB, P, ctx, setGap, over, splat, halo, geometryListeners } from '../framebuffer.js';
import { T } from '../sky/clock.js';
import { SPR } from '../sky/components.js';
import { lerp, sm, clamp01 } from '../math.js';
import { drawDaySky, drawSun, drawClouds, duskPal, jitter, skyRows } from '../sky/day.js';
import { drawHills, drawGrass, hillLines } from '../sky/land.js';
import { drawMountains, drawTreeline, drawRiver, drawMist, drawGlints } from '../sky/valley.js';
import { windStep, drawLife } from '../sky/life.js';
import { drawFlora } from '../sky/flora.js';
import { weekSummary, summaryLines, flowerList, flowerLabel } from '../model/morning.js';
import { quoteFor } from '../model/quotes.js';
import { morningEvents } from '../model/timeline.js';
import { morningState, morningControls, HOLD_END, textK, bloom } from '../choreo/morning.js';
import { drawCenterWeek } from './text.js';
import * as pf from '../stageprof.js';

let base = null;
let mor = null;           // { cfg, sc, lines, st }
/* cfg: { tasks, weekKey, nowMs, season, gapMode, seed, name, t0 (sky time T at the start, s), reduced, newSeed, newWeek ('week 47'), write }
   write: a real morning (writes the summary, the name and clears morningDue); false for dev scenes */
export function morningScene() { return !!mor; }
export function morningCfg() { return mor ? mor.cfg : null; }
export function morningInfo() {
  return mor ? { season: mor.sc.season, gap: mor.cfg.gapMode, flowers: mor.sc.flowers.length, lines: mor.lines.slice(), quote: quoteFor(mor.cfg.weekKey), phase: morningNow().phase, ms: (T - mor.cfg.t0) * 1000 } : null;
}

/* the state now (a pure function of T and the control events) */
export function morningNow() {
  if (!mor) return null;
  mor.st = morningState((T - mor.cfg.t0) * 1000, morningEvents(mor.cfg.t0), mor.cfg.reduced, mor.st || {});
  return mor.st;
}
export function morningPhase() { const s = morningNow(); return s ? s.phase : null; }
/* true while something in the morning moves (the hold is still once its text is in) */
export function morningMoving() {
  const s = morningNow();
  return !!s && s.phase !== 'end' && !(s.phase === 'hold' && (s.reduced || s.r >= HOLD_END));
}
/* the name typed in the hold: the first line becomes `week 46 · <name>` */
export function setMorningName(name) {
  if (!mor) return;
  mor.cfg.name = name;
  mor.lines = summaryLines(mor.cfg.summary || weekSummary(mor.cfg.tasks, mor.cfg.weekKey, mor.cfg.nowMs), mor.cfg.weekKey, name || '', mor.cfg.away || 0);
}
/* filled by main.js; ui/* calls these */
export const morningCtl = { advance() { }, leave(name) { return false; }, cut() { } };

/* the flower under a point (grains), or -1: the nearest head within r + 2 wins */
export function morningHit(gx, gy) {
  const hs = mor && mor.sc && mor.sc.heads; if (!hs) return -1;
  let best = -1, bd = 1e9;
  for (let k = 0; k < hs.length; k++) {
    const h = hs[k], d = Math.hypot(gx - h.gx, gy - h.gy);
    if (d <= h.r + 2 && d < bd) { bd = d; best = h.i; }
  }
  return best;
}
/* ---- the flower label (M4c): a plate of grains behind two lines of text ---- */
const LB = MORNING.labelBox;
let LAB = null;                                                         // this frame's label layout, set by the grain pass, read by the text pass
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/* the text block of the morning (grains): where the plate must not go */
function textRect() {
  const T3 = MORNING.text, portrait = GW < SH, lh = T3.lineGrains, L = mor.lines.length;
  ctx.font = '400 12px ' + FONT;
  let w = ctx.measureText(quoteFor(mor.cfg.weekKey)).width;
  for (const t of mor.lines) w = Math.max(w, ctx.measureText(t).width);
  w /= 3;
  const x = portrait ? Math.round(GW / 2) : Math.round(GW * T3.x), y0 = Math.round(SH * (portrait ? T3.yPhone : T3.y));
  return { x0: portrait ? x - w / 2 : x, x1: portrait ? x + w / 2 : x + w, y0: y0 - lh / 2, y1: y0 + (L + 1) * lh + lh / 2 };
}
/* where the label of the hovered flower goes: above the head, centred; else to the side that has room, else below. Never over the text block or the sun, 2 grains inside the frame */
function labelLayout(sc) {
  const h = sc.heads && sc.heads.find(q => q.i === hoverI), f = sc.flowers[hoverI]; if (!h || !f) return null;
  const lab = flowerLabel(f), col = MORNING.label[sc.pal.species[f.pick % sc.pal.species.length]]; if (!lab.title || !col) return null;
  ctx.font = '400 12px ' + FONT; let w = ctx.measureText(lab.title).width;
  ctx.font = '400 ' + LB.subPx + 'px ' + FONT; w = Math.max(w, ctx.measureText(lab.sub).width);
  const pw = Math.ceil(w / 3) + 2 * LB.padX, ph = 2 * LB.lh + 2 * LB.pad, M = LB.margin, tr = textRect(), sun = sc.sun, sr = sun.r + LB.sunPad;
  const hx = Math.round(h.gx), hy = Math.round(h.gy), cx = v => Math.max(M, Math.min(GW - M - pw, v)), cy = v => Math.max(M, Math.min(SH - M - ph, v));
  const fits = (x, y) => {
    if (x < M || y < M || x + pw > GW - M || y + ph > SH - M) return false;
    if (x < tr.x1 + 2 && x + pw > tr.x0 - 2 && y < tr.y1 + 2 && y + ph > tr.y0 - 2) return false;
    const nx = Math.max(x, Math.min(sun.x, x + pw)), ny = Math.max(y, Math.min(sun.y, y + ph));
    return (nx - sun.x) * (nx - sun.x) + (ny - sun.y) * (ny - sun.y) > sr * sr;
  };
  const up = hy - Math.ceil(h.r) - LB.gap - ph, dn = hy + Math.ceil(h.r) + LB.gap, rx = hx + Math.ceil(h.r) + LB.gap, lx = hx - Math.ceil(h.r) - LB.gap - pw, mid = Math.round(hy - ph / 2);
  const cands = [[hx - Math.round(pw / 2), up], [rx, cy(mid)], [lx, cy(mid)], [cx(hx - Math.round(pw / 2)), up], [cx(hx - Math.round(pw / 2)), dn]];
  let at = cands.find(c => fits(c[0], c[1]));
  if (!at) at = [cx(hx - Math.round(pw / 2)), cy(up)];
  return { i: hoverI, x: at[0], y: at[1], pw, ph, col, lab, hx: h.gx, hy: h.gy, hr: h.r };
}
/* the plate: grains with a ragged 1-grain rim, a little speckled, nearly opaque; the dotted link to the head. Grain pass (the text goes on the canvas layer on top) */
function drawPlate(sc) {
  const L = LAB = labelLayout(sc); if (!L) return;
  const a = hoverAlpha(), { x, y, pw, ph, col } = L, edge = mixc(col.plate, [0, 0, 0], LB.edge);
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const rim = i === 0 || j === 0 || i === pw - 1 || j === ph - 1, hv = hh(x + i, y + j, 91);
    if (rim) { if ((i === 0 || i === pw - 1) && (j === 0 || j === ph - 1)) continue; over(x + i, y + j, edge, (hv < .75 ? .8 : .35) * LB.plate * a); continue; }
    const k = 1 + (hv - .5) * 2 * LB.speck;
    over(x + i, y + j, [col.plate[0] * k, col.plate[1] * k, col.plate[2] * k], LB.plate * a);
  }
  const px = Math.max(x, Math.min(x + pw - 1, L.hx)), py = Math.max(y, Math.min(y + ph - 1, L.hy)), dx = px - L.hx, dy = py - L.hy, len = Math.hypot(dx, dy);
  if (len > 0) for (let d = L.hr + 1.5; d < len - .5; d += LB.dot) over(Math.round(L.hx + dx / len * d), Math.round(L.hy + dy / len * d), col.line, .95 * a);
}

let hoverI = -1, hoverFrom = 0, hoverAt = -1e9;
function hoverAlpha() {
  const target = hoverI >= 0 ? 1 : 0, dur = target ? TIME.hoverIn : TIME.hoverOut;
  return hoverFrom + (target - hoverFrom) * clamp01((T - hoverAt) / dur);
}
export function morningHover() { return hoverI; }
/* show the label of flower i (animated), or hide it; instant skips the fade (dev shots) */
export function setMorningHover(i, instant) {
  i = i === null || i === undefined ? -1 : i;
  if (i === hoverI && !instant) return;
  if (instant) { hoverFrom = i >= 0 ? 1 : 0; hoverAt = T - (i >= 0 ? TIME.hoverIn : TIME.hoverOut); }
  else { hoverFrom = hoverAlpha(); hoverAt = T; }
  hoverI = i;
}

export function setMorningScene(cfg) { mor = { cfg }; gapLast = -1; hoverI = -1; hoverFrom = 0; build(); morningGap(morningNow()); }
export function clearMorningScene() { mor = null; gapLast = -1; setGap(MORNING.gap.night, 0, 0); }

let gapLast = -1;
/* the gap between dots follows the day: night gap -> mosaic over gapK (paper mode: a flat paper gap) */
export function morningGap(st) {
  const k = st ? st.gapK : 1;
  if (k === gapLast) return;
  gapLast = k;
  const a = MORNING.gap.night, b = MORNING.gap.paper;
  const rgb = k >= 1 ? b : k <= 0 ? a : [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  if (mor && mor.cfg.gapMode === 'paper') setGap(rgb, 0, 0);
  else setGap(rgb, k, MORNING.gap.mosaicK);
}

function build() {
  const c = mor.cfg, portrait = GW < SH;
  const horizon = Math.round(SH * (portrait ? MORNING.horizonPhone : MORNING.horizon));
  const pal = MORNING.seasons[c.season] || MORNING.seasons.autumn;
  const sunR = MORNING.sun.r * Math.min(GW, SH);
  const nudge = ((c.seed >>> 0) % 1000 / 1000 * 2 - 1) * MORNING.sun.nudge;
  mor.sc = {
    season: MORNING.seasons[c.season] ? c.season : 'autumn', pal, seed: c.seed >>> 0, portrait, horizon,
    midY: Math.round(horizon * MORNING.skyMid),
    sun: { x: GW * (MORNING.sun.x + nudge), y: SH * (portrait ? MORNING.sun.yPhone : pal.sunY), r: sunR },
    flowers: flowerList(c.tasks, c.weekKey, c.nowMs, MORNING.minGap / Math.max(1, GW))
  };
  mor.lines = summaryLines(c.summary || weekSummary(c.tasks, c.weekKey, c.nowMs), c.weekKey, c.name || '', c.away || 0);
  mor.nDone = mor.sc.flowers.filter(f => !f.bud).length;
  /* the week that is ending, as it stood on Sunday night: its done and missed stars at their own places (the night compose has no stars of it) */
  const byId = new Map(); mor.pt = [];
  for (const t of c.tasks) if (t.week === c.weekKey) { const o = { x: t.x * (GW - 1), y: t.y * (SH - 1), big: t.big ? 1 : 0, done: !!t.doneAt, src: null, link: t.link || null }; mor.pt.push(o); byId.set(t.id, o); }
  for (const o of mor.pt) if (o.done && o.link && byId.has(o.link) && byId.get(o.link).done) o.src = byId.get(o.link);
}
geometryListeners.push(() => { if (mor) build(); });

/* grain pass: the whole frame is overwritten, back to front. The hold (and reduced motion, which only ever shows the whole hold) is the M1 frame, grain for grain;
   the sunrise and the sunset are the layers */
export function drawMorning(st) {
  if (!mor) return;
  LAB = null; mor.sc.hov = null;
  if (st && !st.reduced && !(st.phase === 'hold' && st.d < 0)) { layers(st, true); easeLeave(st); return; }
  const live = !!st && !st.reduced;
  holdFrame(live, live ? clamp01((st.r - TIME.morning.hold) / MORNING.wind.rampMs) : 0, true);
}
/* the hold frame: k = the strength of its motion (0..1; live = the clock runs, else a still frame); label: the hovered flower's plate goes in */
function holdFrame(live, k, label) {
  const sc = mor.sc, WN = MORNING.wind;
  /* sky, sun, ridges, hills, tree line, river and mist never move: composed once per scene/geometry, then copied. The sun's halo shimmers: the scene is composed with and
     without it, the difference (a sparse list) is added back, scaled, every frame. The sky-only rows (before the land) give each column its open sky for the clouds and birds.
     The blades, flowers, glints, clouds and life are drawn per frame. */
  if (!base || base.sc !== sc || base.n !== BR.length) {
    const L = hillLines(sc), n = BR.length, scene = hk => { drawDaySky(sc); drawSun(sc, null, hk); drawMountains(sc); drawHills(sc, () => drawTreeline(sc, L.far)); drawRiver(sc, L.near); drawMist(sc); };
    drawDaySky(sc); drawSun(sc, null, 1);
    const sr = BR.slice(), sg = BG.slice(), sb = BB.slice();
    scene(1);
    const r1 = BR.slice(), g1 = BG.slice(), b1 = BB.slice(), top = new Int16Array(GW).fill(SH);
    for (let i = 0; i < GW; i++) { let j = 0; while (j < SH) { const q = j * GW + i; if (Math.abs(BR[q] - sr[q]) > 1e-5 || Math.abs(BG[q] - sg[q]) > 1e-5 || Math.abs(BB[q] - sb[q]) > 1e-5) break; j++; } top[i] = j; }
    scene(0);
    let m = 0; for (let q = 0; q < n; q++) if (Math.abs(r1[q] - BR[q]) + Math.abs(g1[q] - BG[q]) + Math.abs(b1[q] - BB[q]) > 1e-6) m++;
    const di = new Int32Array(m), dr = new Float32Array(m), dg = new Float32Array(m), db = new Float32Array(m);
    m = 0; for (let q = 0; q < n; q++) if (Math.abs(r1[q] - BR[q]) + Math.abs(g1[q] - BG[q]) + Math.abs(b1[q] - BB[q]) > 1e-6) { di[m] = q; dr[m] = r1[q] - BR[q]; dg[m] = g1[q] - BG[q]; db[m] = b1[q] - BB[q]; m++; }
    base = { sc, n, r: r1, g: g1, b: b1, top, di, dr, dg, db, near: L.near };
  }
  BR.set(base.r); BG.set(base.g); BB.set(base.b);
  const tt = live ? T : WN.stillT;   // k: the motion of the hold comes in after the sunrise (reduced motion: none, a still frame)
  if (k > 0) {
    const s = MORNING.sun.shimmer * Math.sin(2 * Math.PI * MORNING.sun.shimmerHz * T) * k, { di, dr, dg, db } = base;
    for (let m = 0; m < di.length; m++) { const q = di[m]; BR[q] += s * dr[m]; BG[q] += s * dg[m]; BB[q] += s * db[m]; }
  }
  drawGlints(sc, base.near, tt, live ? k : 1);
  drawClouds(sc, tt, 1, base.top);
  const W = k > 0 ? windStep(sc, T, k) : null;
  sc.hov = label && hoverI >= 0 ? { i: hoverI, k: hoverAlpha() } : null;
  drawGrass(sc, W); drawFlora(sc, null, W);
  if (k > 0) drawLife(sc, T, k, base.top);
  if (sc.hov && sc.hov.k > .01) drawPlate(sc);
}

/* leaving from the full hold: the sway does not snap to rest (the sunset's land is cached at rest). For the first easeMs of the sunset the hold frame, its wind eased out, is
   dissolved into the sunset frame grain by grain: each grain shows the hold while its own threshold is under the share still left. */
let ES = null, EH = null;
function easeLeave(st) {
  if (st.d < 0 || st.d >= MORNING.wind.easeMs || st.reduced) return;
  leaveInfo(st);
  if (LV.l0 < 1 || LV.dk0 < 1) return;
  const k0 = clamp01((LV.st.r - TIME.morning.hold) / MORNING.wind.rampMs), w = 1 - sm(0, 1, st.d / MORNING.wind.easeMs);
  if (k0 <= 0 || w <= 0) return;
  if (!ES || ES.length !== 3 * N) { ES = new Float32Array(3 * N); EH = new Float32Array(N); for (let j = 0; j < SH; j++) for (let i = 0; i < GW; i++) EH[j * GW + i] = hh(i, j, 77); }
  ES.set(BR.subarray(0, N), 0); ES.set(BG.subarray(0, N), N); ES.set(BB.subarray(0, N), 2 * N);
  holdFrame(true, k0 * w, false);
  for (let q = 0; q < N; q++) if (EH[q] >= w) { BR[q] = ES[q]; BG[q] = ES[N + q]; BB[q] = ES[2 * N + q]; }
}

/* ---- what the night keeps while the morning plays: one factor per group, read by compose ---- */
const NK = { bg: 1, spec: 1, alive: 1, labels: 1, lastKey: null, last: 1 };
export function morningNight(st) {
  const set = st.d >= 0;
  NK.bg = set ? st.newStarsK : st.bgStarsK;                      // the star field and the far constellations: dimmest first out, brightest first in
  NK.spec = set ? st.newStarsK : st.specialsK;                   // moon, aurora, comet, satellites, meteors
  NK.alive = set ? st.carriedK : st.aliveK;                      // this week's alive stars (and the carried ones coming back)
  NK.labels = set ? st.carriedK * (1 - st.dayK) : st.labelsK;
  NK.lastKey = set && mor ? mor.cfg.weekKey : null;              // last week's far constellation, brightened once
  NK.last = 1 + MORNING.rise.pastBoost * (set ? st.pastBoostK : 0);
  return NK;
}
export function morningLabelK() { return mor && mor.st ? morningNight(mor.st).labels : 1; }
/* true while the layered morning draws something over (or instead of) the night */
export function morningLayers(st) { return st.dayK > 0 || st.glowK > 0 || st.landK > 0 || st.sunY > 0; }

/* a group of night drawing that fades by k: 0 = skip it, 1 = draw it plainly, 2 = draw it, then mix with what was there (groupEnd).
   Only the rows above the land's solid part are snapshotted and mixed (the land covers the rest when everything of it is there). */
let PR = null, PG = null, PB = null;
const groupRows = () => (lay && mor && lay.sc === mor.sc && mor.st && mor.st.landK >= 1 ? lay.M.solidFrom : SH) * GW;
export function groupBegin(k) {
  if (k >= 1) return 1;
  if (k <= 0) return 0;
  if (!PR || PR.length !== N) { PR = new Float32Array(N); PG = new Float32Array(N); PB = new Float32Array(N); }
  const n = groupRows();
  PR.set(BR.subarray(0, n)); PG.set(BG.subarray(0, n)); PB.set(BB.subarray(0, n));
  return 2;
}
export function groupEnd(mode, k) {
  if (mode !== 2) return;
  const n = groupRows(), fr = BR, fg = BG, fb = BB, pr = PR, pg = PG, pb = PB;
  for (let q = 0; q < n; q++) { fr[q] = pr[q] + (fr[q] - pr[q]) * k; fg[q] = pg[q] + (fg[q] - pg[q]) * k; fb[q] = pb[q] + (fb[q] - pb[q]) * k; }
}

/* ---- the land as premultiplied layers, cached per scene and geometry ----
   Every draw function of the hold paints into BR/BG/BB with `over` or a plain set. Painted once onto black and once onto white, the two results give each grain's
   coverage (1 - (white - black)) and premultiplied colour (black): the same picture the hold paints, but now it can move and change colour on top of any sky. */
let lay = null;
function extract(draw, apron) {
  const n = N, r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n), s = new Float32Array(n), Rz = MORNING.rise;
  const sr = new Float32Array(n), sg = new Float32Array(n), sb = new Float32Array(n), SIL = Rz.sil;
  BR.fill(0, 0, n); BG.fill(0, 0, n); BB.fill(0, 0, n); draw();
  r.set(BR.subarray(0, n)); g.set(BG.subarray(0, n)); b.set(BB.subarray(0, n));
  BR.fill(1, 0, n); BG.fill(1, 0, n); BB.fill(1, 0, n); draw();
  let top = SH; const tops = new Int16Array(GW).fill(SH);          // tops: per column, the first row that is land (coverage of at least a half)
  for (let q = 0; q < n; q++) {
    const al = clamp01(1 - (BR[q] - r[q]));
    if (al <= 1e-4) continue;
    a[q] = al;
    s[q] = al * (Rz.silBase + Rz.silGain * Math.min(1.3, (0.299 * r[q] + 0.587 * g[q] + 0.114 * b[q]) / al));    // the silhouette tone of this grain, premultiplied
    const j = (q / GW) | 0, i = q - j * GW; if (j < top) top = j;
    if (al >= .5 && j < tops[i]) tops[i] = j;
  }
  if (apron) for (let i = 0; i < GW; i++) {                          // under the ridges the land runs on to the bottom of the frame, so a layer rising later never leaves a gap
    let j = SH - 1; while (j >= 0 && a[j * GW + i] < .99) j--;
    if (j < 0) continue;
    const q0 = j * GW + i;
    for (let jj = j + 1; jj < SH; jj++) { const q = jj * GW + i; r[q] = r[q0]; g[q] = g[q0]; b[q] = b[q0]; a[q] = 1; s[q] = s[q0]; }
  }
  for (let q = 0; q < n; q++) { sr[q] = SIL[0] * s[q]; sg[q] = SIL[1] * s[q]; sb[q] = SIL[2] * s[q]; }   // the silhouette picture of the layer, premultiplied
  const solid = new Int16Array(GW), rowSolid = new Uint8Array(SH);        // solid: per column, from where down every grain is fully covered; rowSolid: a row with no gaps at all
  for (let i = 0; i < GW; i++) { let j = SH; while (j > 0 && a[(j - 1) * GW + i] >= .99) j--; solid[i] = j; }
  for (let j = 0; j < SH; j++) { let q = j * GW; const e = q + GW; while (q < e && a[q] >= .99) q++; rowSolid[j] = q === e ? 1 : 0; }
  let solidFrom = SH; while (solidFrom > 0 && rowSolid[solidFrom - 1]) solidFrom--;          // from this row down every row is solid
  return { r, g, b, a, sr, sg, sb, top, tops, solid, rowSolid, solidFrom };
}
function ensureLay() {
  const sc = mor.sc;
  if (lay && lay.sc === sc && lay.n === N) return lay;
  const n = N, kr = BR.slice(0, n), kg = BG.slice(0, n), kb = BB.slice(0, n);       // whatever is in the frame survives the building
  const L = hillLines(sc);
  lay = {
    sc, n,
    A: extract(() => drawMountains(sc), true),
    B: extract(() => { drawHills(sc, () => drawTreeline(sc, L.far)); drawRiver(sc, L.near); drawMist(sc); drawGrass(sc); }, false)
  };
  /* where the land (at rest) first covers each column: the sun is never drawn below it, and it starts low enough to be hidden by it */
  const clip = new Int16Array(GW), r = sc.sun.r;
  for (let i = 0; i < GW; i++) clip[i] = Math.min(lay.A.tops[i], lay.B.tops[i]);
  let hid = 0;
  for (let i = Math.max(0, Math.floor(sc.sun.x - r)); i <= Math.min(GW - 1, Math.ceil(sc.sun.x + r)); i++) hid = Math.max(hid, clip[i] + Math.sqrt(Math.max(0, r * r - (i - sc.sun.x) * (i - sc.sun.x))));
  lay.clip = clip; lay.sunHid = hid + 1;
  lay.M = mergeLay(lay.A, lay.B); lay.ord = grainOrders(sc); lay.skyTab = skyTable(sc);
  BR.set(kr); BG.set(kg); BB.set(kb);
  return lay;
}

/* ---- grain orders (M2c) ----
   Each use has an order o(i, j) in 0..1 = mix(direction, noise, share): a grain switches when the phase progress passes its o, over a short ramp of its own
   (MORNING.grain.rampMs). The noise is a stable hash of the grain and the week's seed, plus a soft blotchy part so the front reads as light, not as static. */
const hh = (i, j, s) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + s) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function grainOrders(sc) {
  const G = MORNING.grain, hz = sc.horizon, sx = sc.sun.x, kx = Math.max(sx, GW - 1 - sx, 1), n = N, sd = sc.seed | 0;
  const O = { sky: stag(n, 8), top: stag(n, 9), sil: stag(n, 10), dis: stag(n, 11), light: stag(n, 12) };
  const nz = (i, j, salt) => {                                         // white hash, mixed with a smooth value noise of cells G.blob grains wide
    const x = i / G.blob, y = j / G.blob, ix = Math.floor(x), iy = Math.floor(y), s2 = sd + salt + 7;
    let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hh(ix, iy, s2), b = hh(ix + 1, iy, s2), c = hh(ix, iy + 1, s2), d = hh(ix + 1, iy + 1, s2);
    return lerp(hh(i, j, sd + salt), a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy, G.blobShare);
  };
  for (let j = 0; j < SH; j++) for (let i = 0; i < GW; i++) {
    const q = j * GW + i, up = j < hz ? (hz - j) / hz : 0, top = j < hz ? j / hz : 1, h = j / Math.max(1, SH - 1);
    const dx = Math.abs(i - sx) / kx, dy = j > hz ? (j - hz) / Math.max(1, SH - hz) : 0;
    O.sky[q] = clamp01(lerp(up, nz(i, j, 11), G.noiseMix));            // the day sky: from the horizon upward
    O.top[q] = clamp01(lerp(top, nz(i, j, 23), G.noiseMix));           // the dusk fronts and the sky leaving: from the top down
    O.sil[q] = clamp01(lerp(1 - h, nz(i, j, 37), G.silNoise));         // the silhouette appearing: almost random, a little bottom-up
    O.dis[q] = clamp01(lerp(h, nz(i, j, 37), G.silNoise));             // ... and dissolving into the night: a little top-down
    O.light[q] = clamp01(lerp(G.lightDx * dx + G.lightDy * dy, nz(i, j, 53), G.noiseMix));   // the light on the land: from the sun outward (far ridges first, the near meadow last)
  }
  /* per row, the first and the last order of the sky arriving (lo, hi) and of the sky leaving (tlo, thi): a row none of whose grains has started (or all of which are done) is skipped */
  O.rowLo = new Float32Array(SH).fill(1); O.rowHi = new Float32Array(SH); O.rowTLo = new Float32Array(SH).fill(1); O.rowTHi = new Float32Array(SH);
  for (let j = 0; j < SH; j++) for (let i = 0, q = j * GW; i < GW; i++, q++) {
    const a = O.sky[q], b = O.top[q];
    if (a < O.rowLo[j]) O.rowLo[j] = a; if (a > O.rowHi[j]) O.rowHi[j] = a;
    if (b < O.rowTLo[j]) O.rowTLo[j] = b; if (b > O.rowTHi[j]) O.rowTHi[j] = b;
  }
  return O;
}
/* the sky gradient at each stop of the dusk (the season's own, gold, rose, violet): palette e at rows e*SH.., 3 floats a row */
function skyTable(sc) {
  const n = MORNING.dusk.stops.length, tab = new Float32Array((n + 1) * SH * 3), P = [null, null, null];
  for (let e = 0; e <= n; e++) skyRows(sc, duskPal(sc, e / n, P), tab, e * SH * 3);
  return tab;
}
/* the ramp of a grain as a share of its phase's duration */
const M3 = TIME.morning, RAMP = MORNING.grain.rampMs;
const rampOf = r => Math.min(1, RAMP / (r[1] - r[0]));
const R_DAY = rampOf(M3.day), R_OUT = rampOf(M3.newNight), R_SIL = rampOf(M3.land), R_DIS = rampOf(M3.landSink), R_LIT = rampOf(M3.landColor), R_DARK = rampOf(M3.landDark);
const R_DUSK = Math.min(1, RAMP / ((M3.dusk[1] - M3.dusk[0]) / MORNING.dusk.stops.length));
/* per frame, shared by the passes */
const V = { set: false, ps: 0, om: 0, inv: 1, os: null, lc: 0, lom: 0, linv: 1, ol: null, full: false, leave: false, l0: 1, lc0: 1, osr: null, omR: 0, invR: 1, lomR: 0, linvR: 1 };
const gk = (p, o, om, inv) => { const t = (p - o * om) * inv; return t <= 0 ? 0 : t >= 1 ? 1 : t; };
/* how much of the land is there at grain (i, j): the flowers keep to it */
function keep(i, j) {
  if (i < 0 || j < 0 || i >= GW || j >= SH) return 0;
  const q = j * GW + i;
  if (V.leave) return gk(V.l0, V.osr[q], V.omR, V.invR) * (1 - gk(V.ps, V.os[q], V.om, V.inv));      // the sunset of a land that had only partly risen: what was there, then leaving
  const t = gk(V.ps, V.os[q], V.om, V.inv); return V.set ? 1 - t : t;
}

/* ---- the leave (M4b) ----
   The sunrise brings a grain in by one order (O.sky, O.sil, the light by O.light) and the sunset takes it out by another (O.top, O.dis, the light by its own ramp).
   When the leave comes before the sunrise is done, a grain's state at the leave is its rise state and the sunset only removes what is there: t = t(rise at the leave) * (1 - t(set, normalised progress)).
   The progress is the value now over the value at the leave, so a whole sunrise gives exactly the old sunset. LV: the state at the leave. */
const LV = { key: '', l0: 1, lc0: 1, dk0: 1, st: {} };
function leaveInfo(st) {
  if (st.d < 0) { LV.l0 = 1; LV.lc0 = 1; LV.dk0 = 1; return LV; }
  const ev = morningEvents(mor.cfg.t0), c = morningControls(ev), key = c.leave + ':' + mor.cfg.t0 + ':' + (mor.sc.seed >>> 0);
  if (key !== LV.key) {
    LV.key = key;
    const s0 = morningState(c.leave, ev, false, LV.st);                                       // d = 0: the state the sunset starts from
    LV.l0 = s0.landK; LV.lc0 = Math.pow(s0.landColorK, MORNING.rise.landTone); LV.dk0 = Math.min(1, s0.dayK);
  }
  return LV;
}

/* a Float32Array of n whose start sits k * 320 bytes into its page. The land pass reads 8 arrays and writes 3 at the same index: arrays that all start on a page boundary
   map to the same cache sets (4K aliasing), eleven streams on an 8-way cache thrash, and the pass ran 5x slower. Staggered, they do not. */
const stag = (n, k) => new Float32Array(new ArrayBuffer(n * 4 + 4096), k * 320, n);
/* the ridges and the hills + meadow as ONE layer (B over A, premultiplied): both switch at the same grain at the same moment, so they composite once */
function mergeLay(A, B) {
  const n = N, M = { r: stag(n, 1), g: stag(n, 2), b: stag(n, 3), a: stag(n, 4), sr: stag(n, 5), sg: stag(n, 6), sb: stag(n, 7) };
  for (let q = 0; q < n; q++) {
    const ia = 1 - B.a[q];
    M.a[q] = B.a[q] + A.a[q] * ia;
    M.r[q] = B.r[q] + A.r[q] * ia; M.g[q] = B.g[q] + A.g[q] * ia; M.b[q] = B.b[q] + A.b[q] * ia;
    M.sr[q] = B.sr[q] + A.sr[q] * ia; M.sg[q] = B.sg[q] + A.sg[q] * ia; M.sb[q] = B.sb[q] + A.sb[q] * ia;
  }
  /* the tails of halos and mist leave float32 denormals in the layers: every arithmetic op on one costs ~100 cycles, which is most of a frame. Flush them to zero. */
  for (const k of ['r', 'g', 'b', 'a', 'sr', 'sg', 'sb']) { const v = M[k]; for (let q = 0; q < n; q++) if (v[q] < 1e-9) v[q] = 0; }
  M.top = Math.min(A.top, B.top);
  const rowSolid = new Uint8Array(SH);
  for (let j = 0; j < SH; j++) { let q = j * GW; const e = q + GW; while (q < e && M.a[q] >= .99) q++; rowSolid[j] = q === e ? 1 : 0; }
  let from = SH; while (from > 0 && rowSolid[from - 1]) from--;
  M.solidFrom = from;                                                  // from this row down every grain is fully covered
  return M;
}

/* the land over the frame, grain by grain: each grain is there by V.os / V.ps (the silhouette) and has its colour by V.ol / V.lc (the light).
   Where every grain is there (landK = 1) and the light is all on or all off, the solid rows are plain copies.
   The grain loops live in small per-row functions: a long loop inside one big function stayed in V8's slow tier (4x slower; OSR did not kick in). */
const clamp1 = x => .5 * (Math.abs(x) - Math.abs(x - 1) + 1);             // clamp01 without branches (the grains are random: branches would miss)
function landPass(M) {
  const { top, solidFrom, r, g, b, a, sr, sg, sb } = M, { os, ol, ps, om, inv, lc, lom, linv, set, full } = V, fr = BR, fg = BG, fb = BB;
  let jS = SH;
  if (V.leave) { for (let j = Math.max(0, top); j < SH; j++) { const o = j * GW; rowLeave(o, o + GW, a, r, g, b, sr, sg, sb, V.ol, os, V.osr, ps, om, inv, lc / V.lc0 || 0, lom, linv, V.l0, V.omR, V.invR, V.lc0, V.lomR, V.linvR, fr, fg, fb); } return; }
  if (full && (lc >= 1 || lc <= 0)) {
    jS = Math.max(top, solidFrom);
    const q0 = jS * GW, q1 = SH * GW, on = lc >= 1;
    fr.set((on ? r : sr).subarray(q0, q1), q0); fg.set((on ? g : sg).subarray(q0, q1), q0); fb.set((on ? b : sb).subarray(q0, q1), q0);
  }
  for (let j = Math.max(0, top); j < jS; j++) {
    const o = j * GW;
    if (full) { if (j >= solidFrom) rowSolid(o, o + GW, r, g, b, sr, sg, sb, ol, lc, lom, linv, fr, fg, fb); else rowSettled(o, o + GW, a, r, g, b, sr, sg, sb, ol, lc, lom, linv, fr, fg, fb); }
    else if (lc <= 0) rowSil(o, o + GW, a, sr, sg, sb, os, ps, om, inv, set ? -1 : 1, set ? 1 : 0, fr, fg, fb);
    else rowFading(o, o + GW, a, r, g, b, sr, sg, sb, ol, os, ps, om, inv, lc, lom, linv, set ? -1 : 1, set ? 1 : 0, fr, fg, fb);
  }
}
/* rows that are fully covered, every grain there: the colour replaces the frame (no coverage, no read of the frame) */
function rowSolid(q0, q1, r, g, b, sr, sg, sb, ol, lc, lom, linv, fr, fg, fb) {
  for (let q = q0; q < q1; q++) {
    const u = clamp1((lc - ol[q] * lom) * linv);
    fr[q] = sr[q] + (r[q] - sr[q]) * u; fg[q] = sg[q] + (g[q] - sg[q]) * u; fb[q] = sb[q] + (b[q] - sb[q]) * u;
  }
}
/* the silhouette alone (no light yet or any more) arriving or leaving */
function rowSil(q0, q1, a, sr, sg, sb, os, ps, om, inv, sgn, t0, fr, fg, fb) {
  for (let q = q0; q < q1; q++) {
    const al = a[q]; if (al <= 0) continue;
    const t = t0 + sgn * clamp1((ps - os[q] * om) * inv), ia = 1 - al * t;
    fr[q] = fr[q] * ia + sr[q] * t; fg[q] = fg[q] * ia + sg[q] * t; fb[q] = fb[q] * ia + sb[q] * t;
  }
}
/* every grain of the row is there (t = 1): its colour is the light's */
function rowSettled(q0, q1, a, r, g, b, sr, sg, sb, ol, lc, lom, linv, fr, fg, fb) {
  for (let q = q0; q < q1; q++) {
    const al = a[q]; if (al <= 0) continue;
    const u = clamp1((lc - ol[q] * lom) * linv), ia = 1 - al;
    fr[q] = fr[q] * ia + sr[q] + (r[q] - sr[q]) * u; fg[q] = fg[q] * ia + sg[q] + (g[q] - sg[q]) * u; fb[q] = fb[q] * ia + sb[q] + (b[q] - sb[q]) * u;
  }
}
/* the sunset of a land that had not fully risen (M4b): t = what the rise had brought by the leave (osr, l0) times what the sunset has not yet taken (os, ps); the light the same way (lc0 at the leave, lcn = its share now) */
function rowLeave(q0, q1, a, r, g, b, sr, sg, sb, ol, os, osr, ps, om, inv, lcn, lom, linv, l0, omR, invR, lc0, lomR, linvR, fr, fg, fb) {
  for (let q = q0; q < q1; q++) {
    const al = a[q]; if (al <= 0) continue;
    const t = clamp1((l0 - osr[q] * omR) * invR) * (1 - clamp1((ps - os[q] * om) * inv)), u = clamp1((lc0 - ol[q] * lomR) * linvR) * clamp1((lcn - ol[q] * lom) * linv), ia = 1 - al * t;
    fr[q] = fr[q] * ia + (sr[q] + (r[q] - sr[q]) * u) * t; fg[q] = fg[q] * ia + (sg[q] + (g[q] - sg[q]) * u) * t; fb[q] = fb[q] * ia + (sb[q] + (b[q] - sb[q]) * u) * t;
  }
}
/* the silhouette is arriving (or leaving): each grain by its own t */
function rowFading(q0, q1, a, r, g, b, sr, sg, sb, ol, os, ps, om, inv, lc, lom, linv, sgn, t0, fr, fg, fb) {
  for (let q = q0; q < q1; q++) {
    const al = a[q]; if (al <= 0) continue;
    const t = t0 + sgn * clamp1((ps - os[q] * om) * inv), u = clamp1((lc - ol[q] * lom) * linv), ia = 1 - al * t;
    fr[q] = fr[q] * ia + (sr[q] + (r[q] - sr[q]) * u) * t; fg[q] = fg[q] * ia + (sg[q] + (g[q] - sg[q]) * u) * t; fb[q] = fb[q] * ia + (sb[q] + (b[q] - sb[q]) * u) * t;
  }
}

/* the sky, grain by grain, over the rows above `rows`: each grain takes the day sky (rise: from the horizon up) or leaves it for the night (set: from the top down);
   the dusk is a front per stage, from the top down. The colour of a grain is its row's gradient at its own dusk stage. */
function skyPass(sc, st, Ly, rows, dk) {
  if (dk <= 0) return;
  const O = Ly.ord, tab = Ly.skyTab, J = jitter(), set = st.d >= 0, n = MORNING.dusk.stops.length, dusk = st.duskK > 0, top = O.top;
  let e = 0, x = 0; if (dusk) { const X = Math.min(1, st.duskK) * n; e = Math.min(n - 1, X | 0); x = X - e; }
  const d0 = set ? LV.dk0 : 1, part = set && d0 < 1;                                      // part: the leave came before the day sky was all there (M4b)
  const oa = set ? top : O.sky, R = set ? R_OUT : R_DAY, om = 1 - R, inv = 1 / R, pr = set ? (part ? 1 - dk / d0 : 1 - dk) : dk, omD = 1 - R_DUSK, invD = 1 / R_DUSK, sgn = set ? -1 : 1, t0 = set ? 1 : 0;
  for (let j = 0, je = Math.min(SH, rows); j < je; j++) {
    if (set ? (pr - O.rowTHi[j] * om) * inv >= 1 : pr <= O.rowLo[j] * om) continue;           // no grain of this row is on the day sky
    if (part && d0 <= O.rowLo[j] * (1 - R_DAY)) continue;                                       // ... or never was
    const a0 = (e * SH + j) * 3, b0 = ((e + 1) * SH + j) * 3, ar = tab[a0], ag = tab[a0 + 1], ab = tab[a0 + 2], o = j * GW;
    if (part) rowSkyL(o, o + GW, oa, top, O.sky, J, BR, BG, BB, pr, om, inv, d0, 1 - R_DAY, 1 / R_DAY, dusk, x, omD, invD, ar, ag, ab, tab[b0] - ar, tab[b0 + 1] - ag, tab[b0 + 2] - ab);
    else rowSky(o, o + GW, oa, top, J, BR, BG, BB, pr, om, inv, sgn, t0, dusk, x, omD, invD, ar, ag, ab, tab[b0] - ar, tab[b0 + 1] - ag, tab[b0 + 2] - ab);
  }
}
/* the sunset sky of a sunrise that was not done at the leave: a grain's day sky is what the rise had brought (osky, d0) times what the sunset has not yet taken */
function rowSkyL(q0, q1, oa, top, osky, J, fr, fg, fb, pr, om, inv, d0, omR, invR, dusk, x, omD, invD, ar, ag, ab, dr, dg, db) {
  for (let q = q0; q < q1; q++) {
    const t = clamp1((d0 - osky[q] * omR) * invR) * (1 - clamp1((pr - oa[q] * om) * inv));
    let r = ar, g = ag, bl = ab;
    if (dusk) { const m = clamp1((x - top[q] * omD) * invD); r += dr * m; g += dg * m; bl += db * m; }
    const u = J[q] * t, it = 1 - t; fr[q] = fr[q] * it + r * u; fg[q] = fg[q] * it + g * u; fb[q] = fb[q] * it + bl * u;
  }
}
function rowSky(q0, q1, oa, top, J, fr, fg, fb, pr, om, inv, sgn, t0, dusk, x, omD, invD, ar, ag, ab, dr, dg, db) {
  for (let q = q0; q < q1; q++) {
    const t = t0 + sgn * clamp1((pr - oa[q] * om) * inv);
    let r = ar, g = ag, bl = ab;
    if (dusk) { const m = clamp1((x - top[q] * omD) * invD); r += dr * m; g += dg * m; bl += db * m; }
    const u = J[q] * t, it = 1 - t; fr[q] = fr[q] * it + r * u; fg[q] = fg[q] * it + g * u; fb[q] = fb[q] * it + bl * u;
  }
}

/* the horizon warming under the night: the day's horizon colour mixed in over the bottom of the sky */
function glow(sc, k, rows) {
  const G = MORNING.rise.glow, hz = sc.horizon, c = sc.pal.sky[2], j0 = Math.floor(hz * G.from);
  for (let j = j0, je = Math.min(SH, rows); j < je; j++) {
    const p = Math.pow(sm(hz * G.from, hz, j), G.pow) * G.peak * k; if (p <= 0) continue;
    for (let i = 0, d = j * GW; i < GW; i++, d++) { BR[d] += (c[0] - BR[d]) * p; BG[d] += (c[1] - BG[d]) * p; BB[d] += (c[2] - BB[d]) * p; }
  }
}

const SUN = { y: 0, haloK: 1, fade: 1, clip: null, core: [0, 0, 0], limb: [0, 0, 0], halo: [0, 0, 0] };
const FO = { dy: 0, dark: 0, bud: 1, shadow: 1, bloom: null, keep: null };
const BLM = { stem: 0, head: 0 };
const mix3 = (o, a, b, t) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; };

/* the sunrise and the sunset, back to front, onto what is in the frame (the night; bare: nothing, the day sky is set) */
function layers(st, bare) {
  const sc = mor.sc, Rz = MORNING.rise, Ly = ensureLay(), dk = bare ? 1 : Math.min(1, st.dayK), set = st.d >= 0, full = st.landK >= 1;
  if (pf.on) pf.mark('m.pre');
  const rows = full ? Ly.M.solidFrom : SH;                            // from this row down the hills and meadow cover everything: nothing behind needs drawing
  const lv = leaveInfo(st);
  if ((!set || lv.dk0 < 1) && dk < 1 && st.glowK > 0) glow(sc, st.glowK, rows);
  if (pf.on) pf.mark('m.glow');
  skyPass(sc, st, Ly, rows, dk);
  if (pf.on) pf.mark('m.sky');
  if (st.sunY > 0) {
    const S = MORNING.sun, D = MORNING.dusk.sun, dkk = st.duskK;
    SUN.y = lerp(Ly.sunHid, sc.sun.y, st.sunY); SUN.haloK = st.haloK; SUN.clip = Ly.clip; SUN.fade = set ? (lv.dk0 > 0 ? Math.min(1, st.dayK / lv.dk0) : 0) : 1;      // at dusk the sun goes out with the day
    SUN.haloK *= SUN.fade;
    mix3(SUN.core, S.core, D.core, dkk); mix3(SUN.limb, S.limb, D.limb, dkk); mix3(SUN.halo, S.halo, D.halo, dkk);
    drawSun(sc, SUN);
  }
  drawClouds(sc, T, dk, null);                                          // thin day clouds over the sky and the sun; the land comes after and covers them
  if (pf.on) pf.mark('m.sun');
  if (st.landK <= 0) return;
  const lc = Math.pow(st.landColorK, Rz.landTone), R = set ? R_DIS : R_SIL, RL = set ? R_DARK : R_LIT, O = Ly.ord;
  const part = set && (lv.l0 < 1 || lv.lc0 < 1);
  V.set = set; V.ps = set ? (lv.l0 > 0 ? 1 - st.landK / lv.l0 : 1) : st.landK; V.om = 1 - R; V.inv = 1 / R; V.os = set ? O.dis : O.sil;
  V.lc = lc; V.lom = 1 - RL; V.linv = 1 / RL; V.ol = O.light; V.full = full && !part;
  V.leave = part; V.l0 = lv.l0; V.lc0 = lv.lc0; V.osr = O.sil; V.omR = 1 - R_SIL; V.invR = 1 / R_SIL; V.lomR = 1 - R_LIT; V.linvR = 1 / R_LIT;
  landPass(Ly.M);
  if (pf.on) pf.mark('m.land');
  FO.dy = 0; FO.dark = 1 - lc; FO.bud = st.budK; FO.shadow = st.sunY; FO.keep = V.full ? null : keep;
  FO.bloom = FO.bloom || (i => bloom(mor.st, i, mor.nDone, BLM));
  drawFlora(sc, FO);
  if (pf.on) pf.mark('m.flora');
}

let NR = null, NG = null, NB = null;
/* the night was just composed into BR/BG/BB. Reduced motion: keep it, paint the whole hold over it, mix the two by dayK. Otherwise: the layers over the night */
export function blendMorning(st) {
  LAB = null; mor.sc.hov = null;
  if (!st.reduced) { layers(st); easeLeave(st); return; }
  if (!NR || NR.length !== N) { NR = new Float32Array(N); NG = new Float32Array(N); NB = new Float32Array(N); }
  NR.set(BR.subarray(0, N)); NG.set(BG.subarray(0, N)); NB.set(BB.subarray(0, N));
  drawMorning(st);
  const k = st.dayK, j = 1 - k;
  for (let q = 0; q < N; q++) { BR[q] = NR[q] * j + BR[q] * k; BG[q] = NG[q] * j + BG[q] * k; BB[q] = NB[q] * j + BB[q] * k; }
}

/* grain pass inside the night compose: the week that is ending as it stood on Sunday night, its done stars and lines brightening once, its missed stars as ash.
   Positions come from the week's own tasks (the night compose has no stars of it). */
export function drawMorningNight() {
  if (!mor || !mor.st) return;
  const st = mor.st, dk = st.doneK, mk = st.missedK, Rz = MORNING.rise;
  if ((dk <= 0 && mk <= 0) || !mor.pt.length) return;
  const bo = clamp01((st.doneBoost - 1) / Rz.boostMax), hb = 1 + Rz.boostHalo * bo;
  if (dk > 0) for (const o of mor.pt) {
    if (!o.done || !o.src) continue;
    const a = o.src, dx = o.x - a.x, dy = o.y - a.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / .5));
    for (let i = 0; i <= n; i++) { const e = i * len / n; if (e < 4 || e > len - 4) continue; splat(a.x + dx * i / n, a.y + dy * i / n, C.line, .11 * st.doneBoost * dk); }
  }
  for (const o of mor.pt) {
    const x = Math.round(o.x), y = Math.round(o.y);
    if (o.done) {
      if (dk <= 0) continue;
      halo(x, y, C.cold, .26 * dk * hb, o.big ? 7.5 : 5.5, o.big ? 22 : 16); halo(x, y, C.core, .45 * dk * hb, 1.5, 4);
      const SP = SPR[o.big];
      for (let m = 0; m < SP.n; m++) over(x + SP.I[m], y + SP.J[m], SP.I[m] === 0 && SP.J[m] === 0 ? C.core : SP.DD[m] === -1 ? C.glint : C.done, dk);
    } else {
      if (mk <= 0) continue;
      halo(x, y, C.ash, .06 * mk, 2, 5);
      over(x, y, C.ash, mk); over(x - 1, y, C.ash, .5 * mk); over(x + 1, y, C.ash, .5 * mk); over(x, y - 1, C.ash, .5 * mk); over(x, y + 1, C.ash, .5 * mk);
    }
  }
}

/* text pass (after the blit): summary lines, a blank line, the quote. Desktop: top-left. Phone: top, centred. 12 px like the night:
   the grain is 3 px, so a larger size would crowd the sky and read as a second UI. */
export function drawMorningText() {
  if (!mor) return;
  const st = morningNow();
  const T3 = MORNING.text, portrait = GW < SH, lh = T3.lineGrains * 3;
  const x = portrait ? Math.round(GW / 2) * 3 : Math.round(GW * T3.x) * 3, y0 = Math.round(SH * (portrait ? T3.yPhone : T3.y)) * 3;
  if (st.phase !== 'hold' && hoverI >= 0) { hoverI = -1; hoverFrom = 0; hoverAt = T; }   // leaving the hold clears the hover
  const L = mor.lines.length;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle'; ctx.textAlign = portrait ? 'center' : 'left'; ctx.font = '400 12px ' + FONT; ctx.globalAlpha = 1;
  mor.lines.forEach((t, i) => {
    const a = i === 0 ? Math.max(textK(st, 0), st.nameK) : textK(st, i);
    if (a <= .01) return;
    ctx.globalAlpha = a; ctx.fillStyle = i === 0 ? T3.ink : T3.dim; ctx.fillText(t, x, y0 + i * lh);
  });
  const q = quoteFor(mor.cfg.weekKey), yq = y0 + (L + 1) * lh;
  const aq = textK(st, L + 1);
  if (aq > .01) { ctx.globalAlpha = aq; ctx.fillStyle = T3.dim; ctx.fillText(q, x, yq); }
  ctx.globalAlpha = 1;
  if (st.phase === 'hold' && hoverI >= 0 && LAB && LAB.i === hoverI) {         // the hovered/tapped flower: its title and when it was finished, on the plate
    const a = hoverAlpha(), { x: px, y: py, pw, col, lab } = LAB, cx = (px + pw / 2) * 3, r0 = (py + LB.pad) * 3, rh = LB.lh * 3;
    if (a > .01) {
      ctx.textAlign = 'center'; ctx.globalAlpha = a;
      ctx.font = '400 12px ' + FONT; ctx.fillStyle = col.ink; ctx.fillText(lab.title, cx, r0 + rh / 2 + 1);
      ctx.font = '400 ' + LB.subPx + 'px ' + FONT; ctx.fillStyle = col.dim; ctx.fillText(lab.sub, cx, r0 + rh * 1.5 + 1);
      ctx.globalAlpha = 1; ctx.textAlign = portrait ? 'center' : 'left'; ctx.font = '400 12px ' + FONT;
    }
  }
  drawCenterWeek(mor.cfg.newWeek, st.weekLabelK);
  ctx.textAlign = 'left';
}
