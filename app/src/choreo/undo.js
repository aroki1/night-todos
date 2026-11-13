/* choreo/undo.js — undoing a finish. Pure functions of elapsed milliseconds. */
import { seg, ease } from '../math.js';

export const undoShr = (ms, d, R) => ease.out(seg(ms, Math.max(0, (R - d) * 40), Math.max(0, (R - d) * 40) + 80));

export function undoState(u, ms) {
  return {
    cold: u.cold0 * (1 - ease.inOut(seg(ms, 200, 500))),
    titleK: u.titleK0 * (1 - seg(ms, 200, 500)),
    typed: ms < 300 ? 0 : Math.floor((ms - 300) / 20) + 1,
    pipK: 1 - seg(ms, 0, 200)
  };
}

export function undoEdge(u, ms) {
  const l0 = u.lineLen0; if (l0 <= 0) return null;
  return {
    lineLen: l0 * (1 - ease.inOut(seg(ms, 0, 450))), mul: 1, ff: u.ff0 * (1 - seg(ms, 0, 100)),
    tailSign: -1, bump: 0, arrHalo: 0, miniB: 0, pulseK: 0,
    beadPeak: ms < 450 ? .55 * seg(ms, 0, 100) : .55 * (1 - seg(ms, 450, 570))
  };
}
