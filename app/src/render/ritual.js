/* render/ritual.js — draws the Monday ritual from the pure timeline in choreo/ritual.js.
   Owns no data: just {t0, key} describing the active ritual. Everything drawn is a function of T - t0. */
import { ease, seg } from '../math.js';
import { C, SIZE, TXT, FONT, isReduced } from '../tokens.js';
import { GW, SH, ctx, P, over, splat } from '../framebuffer.js';
import { T } from '../sky/clock.js';
import { SPR } from '../sky/components.js';
import { pastFor, pastDrift, setPastSkip } from '../sky/past.js';
import { RITUAL, ritualState } from '../choreo/ritual.js';
import { drawCenterWeek } from './text.js';

let rit = null, swapped = false, swapFn = null;

export function ritualActive() { return !!rit; }
export function ritualInfo() { return rit ? { key: rit.key, week: rit.week, ms: (T - rit.t0) * 1000, swapped } : null; }

/* cfg: { key: week being lifted, week: label for the new week, newSeed }; swap(seed, atT, dur) crossfades the sky */
export function startRitual(cfg, swap) {
  rit = { t0: cfg.t0 === undefined ? T : cfg.t0, key: cfg.key, week: cfg.week, newSeed: cfg.newSeed, reduced: isReduced() };
  swapFn = swap; swapped = false;
  setPastSkip(cfg.key);
}
export function skipRitual() {
  if (!rit) return;
  rit.t0 = T - (RITUAL.end + 50) / 1000;
}
function finish() { setPastSkip(null); rit = null; swapped = false; }

/* called once per frame before compose; may trigger the sky crossfade once */
export function ritualTick() {
  if (!rit) return;
  const ms = (T - rit.t0) * 1000;
  const swapAt = rit.reduced ? 0 : RITUAL.sky0;
  if (!swapped && ms >= swapAt) {
    swapped = true;
    swapFn(rit.newSeed, rit.t0 + swapAt / 1000, rit.reduced ? RITUAL.reduced / 1000 : 1.5);
  }
  if (ms > RITUAL.end) finish();
}

function drawShape(p, st) {
  const sh = p.shape, e = ease.inOut(st.lift), k = 1 + (SIZE.pastScale - 1) * e;
  const tx = pastDrift(p), ty = p.ay;
  const boost = st.boost || 1;
  const bs = (1 - e) * 1 + e * p.a, bl = (1 - e) * .11 + e * p.la;
  const pos = sh.pts.map((q, i) => {
    const sx = q.x, sy = q.y;                                   // current-week position (scale 1)
    const ex = tx + sh.rel[i].x, ey = ty + sh.rel[i].y;          // far-field position (scale .32)
    return { x: sx + (ex - sx) * e, y: sy + (ey - sy) * e };
  });
  for (const l of sh.links) {
    const a = pos[l[0]], b = pos[l[1]], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / .5));
    for (let i = 0; i <= n; i++) splat(a.x + dx * i / n, a.y + dy * i / n, C.line, bl * boost);
  }
  for (let i = 0; i < pos.length; i++) {
    const q = pos[i], big = p.tasks[i] && p.tasks[i].big ? 1 : 0;
    const x = Math.round(q.x), y = Math.round(q.y);
    const lvl = k > .7 ? big : (k > .45 && big ? 0 : -1);       // big -> small -> single splat
    if (lvl < 0) { splat(q.x, q.y, C.done, Math.min(1, bs * boost)); continue; }
    const SP = SPR[lvl];
    for (let n = 0; n < SP.n; n++) {
      const dd = SP.DD[n]; if (dd === -1) continue;
      over(x + SP.I[n], y + SP.J[n], SP.I[n] === 0 && SP.J[n] === 0 ? C.core : C.done, Math.min(1, bs * boost));
    }
  }
}

/* grain pass (inside compose, before sprites) */
export function drawRitual() {
  if (!rit) return;
  const p = pastFor(rit.key); if (!p) return;
  const st = ritualState((T - rit.t0) * 1000, rit.reduced); if (!st) return;
  if (st.reduced) { const a = st.lift; p.hidden = false; return; }
  drawShape(p, st);
}

/* text pass (after the blit) */
export function drawRitualText() {
  if (!rit) return;
  const st = ritualState((T - rit.t0) * 1000, rit.reduced); if (!st) return;
  const p = pastFor(rit.key);
  if (p && !st.reduced && st.labelA > .01) {
    ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
    ctx.textBaseline = 'middle'; ctx.font = '400 12px ' + FONT; ctx.fillStyle = TXT.dim;
    ctx.globalAlpha = st.labelA * .8;
    p.tasks.forEach((t, i) => {
      const q = p.shape.pts[i], txt = t.title.length > 22 ? t.title.slice(0, 21) + '…' : t.title;
      ctx.fillText(txt, (q.x + 5) * 3, q.y * 3 + 1);
    });
    ctx.globalAlpha = 1;
  }
  drawCenterWeek(rit.week, st.weekA);
}
