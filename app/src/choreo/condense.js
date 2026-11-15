/* choreo/condense.js — saying a thought: its haze pulls into a point, the point travels up to where the new star is placed,
   rests there while the normal creation (motes, core) finishes the star. Pure functions of elapsed milliseconds.
   c = { x0, y0, x1, y1, reduced }: x0, y0 the haze slot, x1, y1 the star's grain. The star's creation event sits at ms = condenseMs(reduced). */
import { seg, ease, lerp } from '../math.js';
import { THOUGHT } from '../tokens.js';

export const condenseMs = reduced => (reduced ? THOUGHT.condenseReducedMs : THOUGHT.condenseMs);

/* -> { scale, hazeA, on, px, py, pb, warm }
   scale: the haze's grains' distance from the slot centre (1 -> 0); hazeA: its brightness multiplier; on: is the point drawn; px, py: the point; pb: its brightness; warm: 0 violet-grey .. 1 ivory */
export function condenseState(c, ms) {
  if (c.reduced) return { scale: 1, hazeA: 1 - seg(ms, 0, THOUGHT.condenseReducedMs), on: false, px: c.x0, py: c.y0, pb: 0, warm: 0 };
  const dur = THOUGHT.condenseMs,
    g = ease.inOut(seg(ms, 0, THOUGHT.gatherMs));
  const p = ease.inOut(seg(ms, THOUGHT.travelFrom, dur));
  const o = { scale: 1 - g, hazeA: (1 + 0.6 * g) * (1 - seg(ms, THOUGHT.gatherMs * 0.7, THOUGHT.gatherMs)) };
  o.px = lerp(c.x0, c.x1, p) + THOUGHT.arc * Math.sin(Math.PI * p) * (c.x1 >= c.x0 ? 1 : -1);
  o.py = lerp(c.y0, c.y1, p);
  o.warm = ease.out(seg(ms, THOUGHT.gatherMs * 0.5, dur));
  const hold = dur + THOUGHT.holdMs;
  o.pb = THOUGHT.pointA * seg(ms, THOUGHT.gatherMs * 0.4, THOUGHT.gatherMs) * (1 - seg(ms, hold - THOUGHT.holdFade, hold));
  o.on = ms < hold && o.pb > 0.002;
  return o;
}
