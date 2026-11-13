/* choreo/ritual.js — pure Monday-ritual timeline. Rendering lives in render/ritual.js (P3). */
import { clamp01, seg } from '../math.js';

export const RITUAL = { boost: 600, lift0: 600, lift1: 3000, sky0: 1800, sky1: 3300, barIn: 2600, barOut: 3800, end: 4200, reduced: 600 };

/* ms since the ritual event; reduced motion collapses the lift to a 600 ms crossfade */
export function ritualState(ms, reduced) {
  if (ms < 0 || ms > RITUAL.end) return null;
  if (reduced) {
    return { ms, reduced: true, lift: seg(ms, 0, RITUAL.reduced), labelA: 1 - seg(ms, 0, 200), weekA: seg(ms, 0, 200) * (1 - seg(ms, 500, 600)) };
  }
  return {
    ms, reduced: false,
    boost: 1 + .15 * seg(ms, 0, 600) * (1 - seg(ms, 700, 1000)),
    lift: clamp01((ms - RITUAL.lift0) / (RITUAL.lift1 - RITUAL.lift0)),
    labelA: 1 - seg(ms, 600, 1100),
    weekA: seg(ms, 2600, 2900) * (1 - seg(ms, 3800, 4200))
  };
}

/* no-op until P3 installs the ritual controller in render/ritual.js */
export function skipRitual() { }
