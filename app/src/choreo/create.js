/* choreo/create.js — a new star assembling. Pure timeline values. */
import { seg, ease } from '../math.js';

export const CREATE = { settle: .9, labelStartMs: 700, labelStepMs: 18, motesMs: 400 };

/* brightness borrowed from nearby background stars while the new star condenses */
export function dimForCreate(ms) {
  return .15 * (ms < 200 ? ease.out(ms / 200) : ms < 700 ? 1 : 1 - ease.inOut(seg(ms, 700, 1100)));
}
