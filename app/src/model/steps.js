/* model/steps.js — steps inside a task: counts, the displayed slot fill, the selected list rows, and the cached
   geometry of the orbit. No drawing here and no grid state: geometry is relative to the star, so it only rebuilds
   when the slot count or the star size changes. The data change and the events live in model/timeline.js. */
import { rng, hstr } from '../math.js';
import { STEPS } from '../tokens.js';
import { wall } from '../sky/clock.js';
import { ROWS, SH } from '../framebuffer.js';
import { stars, NS, stepsDoneBy, isBehind } from './store.js';
import { slotCount, slotFill, stepFinishState } from '../choreo/step.js';

export const hasSteps = s => !!(s.steps && s.steps.length);
export const stepsLive = s => hasSteps(s) && s.on && !s.done && !s.miss && !s.gh && !s.practice;
export const stepsHint = s => !hasSteps(s) && s.on && !s.done && !s.miss && !s.gh && !s.practice;   // a selected star like this shows the dim "+ step" row
export const doneCount = s => { let d = 0; for (const t of s.steps) if (t.doneAt) d++; return d; };
export const nextIdx = s => s.steps.findIndex(t => !t.doneAt);
const key = s => s.id || s.n;
const ell = t => (t.length > 22 ? t.slice(0, 21) + '…' : t);
/* row pitch of the selected list in grains: compact on desktop, 11 grains (at least 32 CSS px at dpr 2) on touch */
export const isTouchLayout = () => ROWS - SH > 20;
export const rowPitch = () => (isTouchLayout() ? STEPS.rowStepTouch : STEPS.rowStep);
/* the list panel's maximum height in grains: 40% of the sky; on desktop also at most 6 rows (the done header and 5 open rows) */
export const panelMax = () => {
  const p = rowPitch(), cap = Math.floor(SH * STEPS.panelFrac);
  return Math.max(3 * p, isTouchLayout() ? cap : Math.min(cap, STEPS.panelRows * p));
};
/* a touch that moved more than 8 px is a scroll, not a tap */
export const isDrag = (dx, dy) => Math.hypot(dx, dy) > STEPS.dragPx;
export const clampScroll = (v, max) => (v < 0 ? 0 : v > max ? max : v);

/* ---------- per frame: flags the renderer reads (pacing comes from the one rule in store.js isUrgent) ---------- */
export function stepsUpdate(T) {
  let anim = false;
  const now = wall(T);
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (!stepsLive(s)) { s.stepBehind = false; s.stepReady = false; continue; }
    const n = s.steps.length;
    s.stepBehind = isBehind(s, now, s.life);
    s.stepReady = stepsDoneBy(s, now) === n;
    if (s.sev && (T - s.sev.t0) * 1000 < 1600) anim = true;
  }
  return anim;
}

/* ---------- the displayed fill: a pure function of T, the data and the last step event (derived in replay) ---------- */
export function stepView(s, T, dist) {
  const n = s.steps.length, to = slotFill(stepsDoneBy(s, wall(T)), n), ev = s.sev;
  if (!ev || T < ev.t0 || (T - ev.t0) * 1000 > 1600) return { fill: to, st: null, slot: -1 };
  const st = stepFinishState((T - ev.t0) * 1000, { reduced: ev.reduced, dist, undo: ev.dir < 0 });
  return { fill: ev.lo + (ev.hi - ev.lo) * st.k, st, slot: ev.slot };
}

/* ---------- label text ---------- */
export function stepsLine2(s, hov) {
  const n = s.steps.length, d = doneCount(s), nx = nextIdx(s), left = s.left || '';
  const head = hov ? (nx >= 0 ? 'next: ' + ell(s.steps[nx].text) + ' · ' : 'ready · ') : '';
  return head + d + '/' + n + ' · ' + left;
}

/* ---------- the selected list: rows and their UI state ---------- */
export const sui = { rowHover: -1, rowStar: -1, open: new Set(), st: new Float32Array(64), sy: new Float32Array(64) };   // st: scroll target, sy: displayed scroll (grains), per star index
/* kinds: hdr (N done, collapsed), done, next, open, more. `num` is the 1-5 key of an open row; `sid` the step id. */
export function stepRows(s) {
  const rows = [], done = [], open = [];
  for (const t of s.steps) (t.doneAt ? done : open).push(t);
  if (done.length) {
    rows.push({ k: 'hdr', text: done.length + ' done', sid: null, num: 0 });
    if (sui.open.has(key(s))) {
      const shown = done.slice(-STEPS.maxDoneRows);
      if (done.length > shown.length) rows.push({ k: 'more', text: '+' + (done.length - shown.length) + ' earlier', sid: null, num: 0 });
      for (const t of shown) rows.push({ k: 'done', text: ell(t.text), sid: t.id, num: 0 });
    }
  }
  open.forEach((t, q) => rows.push({ k: q === 0 ? 'next' : 'open', text: ell(t.text), sid: t.id, num: q < STEPS.maxOpenRows ? q + 1 : 0 }));   // every open row; the panel scrolls
  return rows;
}
export function toggleDoneRows(s) { const k = key(s); if (sui.open.has(k)) sui.open.delete(k); else sui.open.add(k); }

/* ---------- geometry: a tilted orbit ---------- */
const gcache = new Map();
export function stepGeom(s) {
  const K = slotCount(s.steps.length), big = s.big ? 1 : 0, k = key(s);
  let g = gcache.get(k);
  if (!g || g.K !== K || g.big !== big) { g = buildA(K, big); g.K = K; g.big = big; gcache.set(k, g); }
  return g;
}
/* how far the orbit reaches from the star centre, so labels and neighbours can keep clear of it */
export function stepExtent(s) { return stepsLive(s) ? stepGeom(s) : null; }

/* Table of the unit orbit by arclength fraction u (from the top, clockwise): X, Y (tilted), Z (depth, + is near). */
const TAB = 360;
function buildA(K, big) {
  const S = STEPS, rx = big ? S.rxBig : S.rx, ry = rx * S.ratio, tl = S.tilt * Math.PI / 180, cs = Math.cos(tl), sn = Math.sin(tl);
  const M = 720, cum = new Float32Array(M + 1);
  for (let j = 1; j <= M; j++) {
    const a0 = -Math.PI / 2 + 2 * Math.PI * (j - 1) / M, a1 = -Math.PI / 2 + 2 * Math.PI * j / M;
    cum[j] = cum[j - 1] + Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), ry * (Math.sin(a1) - Math.sin(a0)));
  }
  const per = cum[M], tx = new Float32Array(TAB + 1), ty = new Float32Array(TAB + 1), tz = new Float32Array(TAB + 1);
  let q = 0;
  for (let j = 0; j <= TAB; j++) {
    const target = per * j / TAB;
    while (q < M - 1 && cum[q + 1] < target) q++;
    const f = (target - cum[q]) / Math.max(1e-9, cum[q + 1] - cum[q]), th = -Math.PI / 2 + 2 * Math.PI * (q + f) / M;
    const x = rx * Math.cos(th), y = ry * Math.sin(th);
    tx[j] = x * cs - y * sn; ty[j] = x * sn + y * cs; tz[j] = Math.sin(th);
  }
  const N = Math.round(per * S.sampPerGrain), u = new Float32Array(N), jx = new Float32Array(N), jy = new Float32Array(N),
    amp = new Float32Array(N), ph = new Float32Array(N), fq = new Float32Array(N), r = rng(hstr('orbit' + K + big));
  for (let i = 0; i < N; i++) {
    u[i] = (i + (r() - .5) * .8) / N; jx[i] = (r() - .5) * 2 * S.jit; jy[i] = (r() - .5) * 2 * S.jit;
    const h = r(); amp[i] = .12 + 1.6 * h * h * h; ph[i] = r() * 6.2832; fq[i] = 6.2832 / (S.shimmer[0] + r() * (S.shimmer[1] - S.shimmer[0]));
  }
  const ext = Math.abs(rx * cs) + 1.5, extV = Math.hypot(rx * sn, ry * cs) + 1.5;
  return { rx, ry, per, tx, ty, tz, N, u, jx, jy, amp, ph, fq, extL: ext, extR: ext, extV };
}
/* orbit position at fraction u (wraps) into out = [x, y, z] */
export function orbAt(g, u, out) {
  u -= Math.floor(u); const f = u * TAB, j = f | 0, a = f - j;
  out[0] = g.tx[j] + (g.tx[j + 1] - g.tx[j]) * a; out[1] = g.ty[j] + (g.ty[j + 1] - g.ty[j]) * a; out[2] = g.tz[j] + (g.tz[j + 1] - g.tz[j]) * a;
}
