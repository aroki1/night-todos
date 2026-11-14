/* choreo/step.js — finishing one step inside a task. Pure functions of elapsed milliseconds.
   Imports only math and tokens. Also home of the small rules that decide what the slots show. */
import { clamp01, seg, ease } from '../math.js';
import { STEPS } from '../tokens.js';

/* ---------- the rules ---------- */
export const slotCount = n => Math.min(n, STEPS.maxSlots);
/* filled slots, by count (not by which step): done * K / n */
export const slotFill = (done, n) => (n > 0 ? done * slotCount(n) / n : 0);
/* brightness of slot i: a partial slot is a brightness lerp */
export const slotF = (filled, i) => clamp01(filled - i);

/* ---------- the moment ---------- */
/* Stage list (ms). `dim` is how far the slot dims in anticipation, `flash` the peak of the white flash,
   `p0` when the pulse leaves the slot, `lift` the +15% on the parent's core. */
export const STAGE = { antic: 120, f0: 120, fPeak: 190, f1: 450, dim: .3, flash: .85, p0: 170, lift: .15, hold: 300 };
export const UNDO_MS = 500, REDUCED_MS = 250;
/* pulse duration for a path of `dist` grains: 11 ms per grain, clamped 180..400 */
export const pulseMs = dist => Math.max(180, Math.min(400, dist * 11));
export const endMs = dist => STAGE.p0 + pulseMs(dist) + STAGE.hold;

/* the orbit folding into the core when a task is finished with its steps (k: 1 = full orbit, 0 = gone) */
export const collapseK = (ms, reduced) => 1 - (reduced ? seg(ms, 0, REDUCED_MS) : ease.inOut(seg(ms, 0, STEPS.collapse)));

const IDLE = { active: false, k: 1, dim: 0, flash: 0, pulseP: -1, lift: 0, ms: 0 };

/* k: how far the slot has become "done" (0..1). dim: anticipation dip. flash: white flash level.
   pulseP: 0..1 along the path from slot to the parent's core (-1 when no pulse). lift: arrival lift on the core.
   o = { reduced, dist, undo }. With undo, ms runs 0..500 and the whole thing plays backwards. */
export function stepFinishState(ms, o) {
  const S = STAGE, dist = o && o.dist ? o.dist : 12, D = pulseMs(dist);
  if (o && o.reduced) {
    const t = o.undo ? 1 - seg(ms, 0, REDUCED_MS) : seg(ms, 0, REDUCED_MS);
    return { active: ms < REDUCED_MS, k: t, dim: 0, flash: 0, pulseP: -1, lift: 0, ms };
  }
  const total = S.p0 + D + S.hold;
  let t = ms;
  if (o && o.undo) { if (ms >= UNDO_MS) return { active: false, k: 0, dim: 0, flash: 0, pulseP: -1, lift: 0, ms }; t = total * (1 - ms / UNDO_MS); }
  else if (ms >= total) return IDLE;
  if (t < 0) return { active: true, k: 0, dim: 0, flash: 0, pulseP: -1, lift: 0, ms };
  const k = ease.inOut(seg(t, S.f0, S.f1));
  const dim = t < S.f0 ? S.dim * ease.out(seg(t, 0, S.antic)) : S.dim * (1 - seg(t, S.f0, S.f0 + 90));
  const up = seg(t, S.f0, S.fPeak), down = ease.out(seg(t, S.fPeak, S.f1));
  const flash = S.flash * ease.out(up) * (1 - down);
  const pp = seg(t, S.p0, S.p0 + D), pulseP = t >= S.p0 && pp < 1 ? pp : -1;
  const arr = S.p0 + D, lift = t >= arr ? S.lift * (1 - ease.out(seg(t, arr, arr + S.hold))) : 0;
  return { active: true, k, dim, flash, pulseP, lift, ms };
}
