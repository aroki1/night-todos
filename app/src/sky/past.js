/* sky/past.js — archived weeks become distant constellations. They must read as sky, not UI. */
import { rng, clamp01 } from '../math.js';
import { C, SIZE } from '../tokens.js';
import { GW, SH, splat, geometryListeners } from '../framebuffer.js';
import { T, wall, isoWeekKey, weekLabel, weekDistance } from './clock.js';
import { store } from '../model/store.js';
import { archivedWeeks } from '../model/week.js';
import { weekTitle } from '../model/morning.js';

let past = [];
let hoverKey = null, hoverSince = -99, hoverAlpha = 0;
let pointerX = -1e9, pointerY = -1e9;
let skipKey = null;

export function setPastSkip(key) { skipKey = key; for (const p of past) p.hidden = p.key === key; }
export function setPointerGrain(x, y) { pointerX = x; pointerY = y; }
export function clearPointerGrain() { pointerX = -1e9; pointerY = -1e9; }

function shapeFor(tasks, currentKey) {
  const pts = tasks.map(t => ({ x: t.x * (GW - 1), y: t.y * (SH - 1) }));
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const byId = new Map(tasks.map((t, i) => [t.id, i]));
  const rel = pts.map(p => ({ x: (p.x - cx) * SIZE.pastScale, y: (p.y - cy) * SIZE.pastScale }));
  const links = [];
  for (const t of tasks) {
    if (!t.link || !byId.has(t.link)) continue;
    const a = byId.get(t.link), b = byId.get(t.id);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  return { rel, links, pts, cx, cy };
}

export function rebuildPast() {
  const currentKey = isoWeekKey(wall(T));
  const weeks = archivedWeeks(store, SIZE.pastMaxWeeks);
  const anchors = [];
  past = [];
  for (const w of weeks) {
    const shape = shapeFor(w.tasks, currentKey);
    if (!shape.rel.length) continue;
    const r = rng((w.seed ^ 0x9E3779B9) >>> 0);
    let ax = null, ay = null;
    for (let k = 0; k < 220; k++) {
      const x = 8 + r() * (GW - 16), y = 8 + r() * (SH * (1 - SIZE.pastBottomBand) - 16);
      let ok = true;
      for (const a of anchors) if (Math.hypot(a.x - x, a.y - y) < SIZE.pastMinGap) { ok = false; break; }
      if (ok) { ax = x; ay = y; break; }
    }
    if (ax === null) { ax = 8 + r() * (GW - 16); ay = 8 + r() * (SH * (1 - SIZE.pastBottomBand) - 16); }
    anchors.push({ x: ax, y: ay });
    const age = Math.max(0, weekDistance(w.key, currentKey));
    past.push({ hidden: w.key === skipKey, tasks: w.tasks, key: w.key, label: weekLabel(w.key), age, ax, ay, shape, n: w.tasks.length, a: Math.max(.05, .22 * Math.pow(.88, age)), la: .035 * Math.pow(.88, age) });
  }
}
geometryListeners.push(rebuildPast);

/* k: the morning's fade of every constellation; boostKey: the one week brightened by `boost` (the week just left). The plain night draws with the defaults */
export function drawPast(k = 1, boostKey = null, boost = 1) {
  if (k <= 0) return;
  for (const p of past) {
    if (p.hidden) continue;
    const kk = boostKey !== null && p.key === boostKey ? k * boost : k, la = p.la * kk, pa = p.a * kk;
    const W = GW + 24;
    let ox = p.ax - T * .73;
    ox = ((ox % W) + W) % W - 12;
    // draw wrapped copies so a constellation drifts like the far layer
    for (const shift of [0, -W, W]) {
      const bx = ox + shift;
      if (bx < -40 || bx > GW + 40) continue;
      for (const l of p.shape.links) {
        const a = p.shape.rel[l[0]], b = p.shape.rel[l[1]];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / .5));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          splat(bx + a.x + dx * t, p.ay + a.y + dy * t, C.line, la);
        }
      }
      for (const s of p.shape.rel) splat(bx + s.x, p.ay + s.y, C.done, pa);
    }
  }
}

/* hover: pointer within 4 grains of any of its stars; one dim line, 150 ms fade in */
export function updatePastHover(dt) {
  let found = null;
  if (pointerX > -1e8) {
    const W = GW + 24;
    for (const p of past) {
      if (p.hidden) continue;
      let ox = p.ax - T * .73; ox = ((ox % W) + W) % W - 12;
      for (const shift of [0, -W, W]) {
        const bx = ox + shift;
        if (bx < -40 || bx > GW + 40) continue;
        for (const s of p.shape.rel) {
          if (Math.hypot(pointerX - (bx + s.x), pointerY - (p.ay + s.y)) <= 4) { found = { p, bx }; break; }
        }
        if (found) break;
      }
      if (found) break;
    }
  }
  if (found) {
    if (hoverKey !== found.p.key) { hoverKey = found.p.key; hoverSince = T; }
    hoverAlpha = clamp01((T - hoverSince) / .15);
    hoverInfo = { text: weekTitle(found.p.key, (store.weeks[found.p.key] && store.weeks[found.p.key].name) || '') + ' · ' + found.p.n + ' stars', x: Math.max(2, Math.min(GW - 30, found.bx + 6)), y: Math.max(4, Math.min(SH - 8, found.p.ay + 6)), a: hoverAlpha };
  } else {
    if (hoverAlpha > 0) { hoverAlpha = Math.max(0, hoverAlpha - dt / .15); if (hoverInfo) hoverInfo.a = hoverAlpha; }
    if (hoverAlpha <= 0) { hoverKey = null; hoverInfo = null; }
  }
  return found ? hoverAlpha < 1 : hoverAlpha > 0;                       // true while the fade is still moving
}
export let hoverInfo = null;
export function pastHoverInfo() { return hoverInfo; }

/* one week's shape at its far-field anchor (the morning looks up the week it just left) */
export function pastFor(key) { return past.find(p => p.key === key) || null; }
export function pastDrift(p) { const W = GW + 24; return ((p.ax - T * .73) % W + W) % W - 12; }
export function resetPastHover() { hoverKey = null; hoverInfo = null; hoverAlpha = 0; }
