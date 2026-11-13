/* choreo/expire.js — a deadline passing: the label swaps <1m -> missed sequentially. Pure. */
import { seg } from '../math.js';

/* The label swap is sequential, never a crossfade: 100 ms out, then 100 ms in. */
export function expireSwap(ms) {
  return {
    leftA: 1 - seg(ms, 900, 1000),
    missedA: seg(ms, 1000, 1100),
    leftGone: ms >= 1000,
    missedOn: ms >= 1000
  };
}
