/* choreo/practice.js — pure timelines of a practice star: marking a day (the grain flashes, the core lifts) and stopping it (the star thins out).
   Functions of time and inputs only; render reads them. */
import { seg, ease } from '../math.js';
import { PRACTICE } from '../tokens.js';

/* ms since a day was marked (`on`) or unmarked; -> { lit 0..1 (the day grain), flash 0..1 (extra white), lift -1..1 (core, signed), end (ms) }
   reduced motion: no flash, no lift, a plain fade of the grain. */
export function markState(ms, on, reduced) {
  if (reduced) {
    const k = seg(ms, 0, PRACTICE.reducedMs);
    return { lit: on ? k : 1 - k, flash: 0, lift: 0, end: PRACTICE.reducedMs };
  }
  const k = ease.out(seg(ms, 0, PRACTICE.flashMs * 0.5)),
    env = 1 - ease.inOut(seg(ms, 0, PRACTICE.flashMs));
  return { lit: on ? k : 1 - k, flash: on ? env : 0, lift: (on ? 1 : -1) * env, end: PRACTICE.flashMs };
}

/* ms since the practice was stopped (dir -1) or the stop was undone (dir +1); -> { p 0..1 share of grains gone, a 0..1 overall alpha, end (ms) }
   a grain with threshold h (0..1) is gone while h < p. reduced: every grain stays and the whole star fades in 150 ms. */
export function stopState(ms, dir, reduced) {
  const len = reduced ? PRACTICE.reducedMs : PRACTICE.thinMs,
    k = seg(ms, 0, len),
    g = dir < 0 ? k : 1 - k;
  return reduced ? { p: 0, a: 1 - g, end: len } : { p: g, a: 1, end: len };
}
