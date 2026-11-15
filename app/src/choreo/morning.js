/* choreo/morning.js — the weekly morning as a pure function of time.
   ms: since the morning started. ev: its control events, oldest first: [{ op: 'advance' | 'leave' | 'cut', ms, named }], same clock.
   reduced: reduced motion, fixed when the morning starts. The render reads only the state, bloom() and textK(). */
import { seg, ease } from '../math.js';
import { TIME } from '../tokens.js';

const M = TIME.morning;
const up = (t, r) => seg(t, r[0], r[1]);

/* every text row (up to 6) is fully in */
export const HOLD_END = M.hold + M.textStep * 6 + M.textIn;

/* the controls that count: advance only before the hold and before a leave; one leave; a cut only after the leave */
export function morningControls(ev) {
  let advance = null,
    leave = null,
    cut = null,
    named = false;
  for (const e of ev || []) {
    if (e.op === 'advance' && advance === null && leave === null && e.ms < M.hold) advance = e.ms;
    else if (e.op === 'leave' && leave === null) {
      leave = e.ms;
      named = !!e.named;
    } else if (e.op === 'cut' && leave !== null && cut === null && e.ms >= leave) cut = e.ms;
  }
  return { advance, leave, cut, named };
}

/* the rise clock: real time, except that an advance at `a` fast-forwards what is left of the sunrise into M.advance ms */
export function riseAt(ms, a) {
  if (a === null || ms <= a) return ms;
  const w = ms - a;
  if (w >= M.advance) return M.hold + (w - M.advance);
  return a + (M.hold - a) * ease.inOut(w / M.advance);
}

/* A, B and C at rise time r */
function rise(r, s) {
  s.phase = r < M.night ? 'night' : r < M.hold ? 'rise' : 'hold';
  s.r = r;
  s.d = -1;
  s.textIn = 1;
  s.textOut = 0;
  s.labelsK = 1 - up(r, M.labels);
  s.doneBoost = 1 + 0.15 * up(r, M.boost);
  s.bgStarsK = 1 - up(r, M.bgStars);
  s.specialsK = 1 - up(r, M.specials);
  s.missedK = 1 - up(r, M.missed);
  s.aliveK = 1 - up(r, M.alive);
  s.doneK = 1 - up(r, M.done);
  s.glowK = up(r, M.glow);
  s.dayK = ease.inOut(up(r, M.day));
  s.gapK = up(r, M.gap);
  s.sunY = ease.out(up(r, M.sun));
  s.haloK = up(r, M.sun);
  s.landK = up(r, M.land);
  s.landColorK = up(r, M.landColor);
  s.budK = up(r, M.buds);
  s.duskK = 0;
  s.newNightK = 0;
  s.newStarsK = 0;
  s.carriedK = 0;
  s.pastBoostK = 0;
  s.weekLabelK = 0;
  s.nameK = 0;
  return s;
}

/* reduced motion: A and B are one crossfade from the whole night to the whole hold frame, the text comes in with it */
function riseReduced(ms, s) {
  const k = seg(ms, 0, M.reducedRise);
  rise(HOLD_END, s);
  s.phase = k < 1 ? 'rise' : 'hold';
  s.labelsK = 1 - k;
  s.doneBoost = 1;
  s.bgStarsK = 1;
  s.specialsK = 1;
  s.missedK = 1;
  s.aliveK = 1;
  s.doneK = 1; // the night stays whole under the crossfade
  s.dayK = k;
  s.gapK = k;
  s.textIn = k;
  return s;
}

/* D at d ms after the leave. s holds the A..C state at the leave; every day value runs down from there */
function set(d, s, named) {
  const old = 1 - up(d, M.oldOut); // what was left of the old night goes quickly
  s.labelsK *= old;
  s.bgStarsK *= old;
  s.specialsK *= old;
  s.missedK *= old;
  s.aliveK *= old;
  s.doneK *= old;
  s.doneBoost = 1 + (s.doneBoost - 1) * old;
  s.textOut = up(d, M.textOut);
  s.nameK = named ? 1 - up(d, M.nameOut) : 0;
  s.sunY *= 1 - ease.inOut(up(d, M.sunSet));
  s.haloK *= 1 - up(d, M.sunSet);
  s.duskK = up(d, M.dusk);
  s.newNightK = up(d, M.newNight);
  s.dayK *= 1 - ease.inOut(s.newNightK);
  s.landColorK *= 1 - up(d, M.landDark);
  s.landK *= 1 - up(d, M.landSink);
  s.glowK *= 1 - up(d, M.dusk);
  s.gapK *= 1 - up(d, M.gapBack);
  s.newStarsK = up(d, M.newStars);
  s.carriedK = up(d, M.carried);
  s.pastBoostK = Math.sin(Math.PI * up(d, M.pastBoost));
  s.weekLabelK = seg(d, M.week[0], M.week[1]) * (1 - seg(d, M.week[2], M.week[3]));
  s.d = d;
  return s;
}

/* reduced motion: D is one crossfade to the whole new night, then `week N` for M.reducedWeek ms */
function setReduced(d, s, named) {
  const k = seg(d, 0, M.reducedSet),
    w0 = M.reducedSet,
    w1 = w0 + M.reducedWeek;
  s.labelsK = 0;
  s.bgStarsK = 0;
  s.specialsK = 0;
  s.missedK = 0;
  s.aliveK = 0;
  s.doneK = 0;
  s.doneBoost = 1;
  s.textOut = k;
  s.nameK = named ? 1 - k : 0;
  s.dayK *= 1 - k;
  s.gapK *= 1 - k;
  s.newNightK = 1;
  s.newStarsK = 1;
  s.carriedK = 1;
  s.pastBoostK = 0;
  s.weekLabelK = seg(d, w0, w0 + 150) * (1 - seg(d, w1 - 150, w1));
  s.d = d;
  return s;
}

/* the whole state at `ms`. `s` may be a reused object */
export function morningState(ms, ev, reduced, s = {}) {
  const c = morningControls(ev);
  s.reduced = !!reduced;
  if (c.leave === null || ms < c.leave) return reduced ? riseReduced(ms, s) : rise(riseAt(ms, c.advance), s);
  if (reduced) riseReduced(c.leave, s);
  else rise(riseAt(c.leave, c.advance), s);
  const end = reduced ? M.reducedSet + M.reducedWeek : M.end;
  let d = ms - c.leave;
  const cutting = c.cut !== null && ms > c.cut;
  if (cutting) {
    // a cut fast-forwards what is left of D into M.cut ms
    const dc = c.cut - c.leave,
      w = ms - c.cut;
    d = w >= M.cut ? end : dc + (end - dc) * ease.inOut(w / M.cut);
  }
  if (reduced) setReduced(d, s, c.named);
  else set(d, s, c.named);
  if (cutting) s.weekLabelK = 0;
  s.phase = d >= end ? 'end' : 'set';
  return s;
}

/* flower i of n (in the order they were finished): stem and head 0..1. The stagger shrinks so the last head is open by the hold */
export function bloom(s, i, n, out = { stem: 0, head: 0 }) {
  if (s.reduced) {
    out.stem = 1;
    out.head = 1;
    return out;
  }
  const step = n > 1 ? Math.min(M.bloomStep, (M.hold - M.bloom0 - M.stem - M.head) / (n - 1)) : 0,
    s0 = M.bloom0 + step * i;
  out.stem = seg(s.r, s0, s0 + M.stem);
  out.head = seg(s.r, s0 + M.stem, s0 + M.stem + M.head);
  if (s.d >= 0) {
    // the sunset closes the heads in reverse order; stems stay
    const g = n > 1 ? Math.min(M.bloomStep, (M.close[1] - M.close[0] - M.closeHead) / (n - 1)) : 0,
      c0 = M.close[0] + g * (n - 1 - i);
    out.head *= 1 - seg(s.d, c0, c0 + M.closeHead);
  }
  return out;
}

/* text row i (0 = the week line, then the summary rows, a blank row, the quote, its author): 0..1 */
export function textK(s, i) {
  const a = s.reduced ? s.textIn : seg(s.r, M.hold + M.textStep * i, M.hold + M.textStep * i + M.textIn);
  return a * (1 - s.textOut);
}
