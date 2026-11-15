/* ui/guide.js — pure copy and state selection for first-use hints and /help. */
import { GUIDE, STEPS } from '../tokens.js';

export function onboardingHint({ taskCount = 0, hasLive = false, hasDone = false, demo = false, touch = false } = {}) {
  if (!demo && taskCount === 0) return touch ? GUIDE.firstTouch : GUIDE.first;
  if (!demo && hasLive && !hasDone) return touch ? GUIDE.finishTouch : GUIDE.finishMouse;
  if (!demo && taskCount % STEPS.barHintEvery === STEPS.barHintEvery - 1) return STEPS.barHint;
  return GUIDE.add;
}

export function helpLines(touch = false) { return touch ? GUIDE.helpTouch : GUIDE.helpDesktop; }

/* one Enter can arrive as keydown, beforeinput, a form submit and a compositionend; the gate lets it through once per window (ms) */
export function enterGate(windowMs = 350) {
  let last = -1e9;
  return ts => { if (ts - last < windowMs) return false; last = ts; return true; };
}
