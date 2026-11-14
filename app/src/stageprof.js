/* stageprof.js — dev-only per-stage frame timer, on with ?dev=1&prof=1 (see docs/dev/PERF-PROFILE.md).
   No clock of its own: dev/hooks.js passes performance.now in via enable(), so production never times anything.
   Call sites are `if (pf.on) pf.mark('stage')`: one boolean test when off. Marks are sequential: each one books the time since the previous mark to its stage. */
export let on = false;
let now = null, last = 0, t0 = 0, cur = null, frames = [];

export function enable(fn) { now = fn; on = true; }
export function begin() { cur = {}; t0 = last = now(); }
export function mark(k) { if (!cur) return; const t = now(); cur[k] = (cur[k] || 0) + t - last; last = t; }
export function end() { if (!cur) return; cur.total = now() - t0; frames.push(cur); cur = null; }
export function reset() { frames = []; }

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
/* {stage: {med, p95, mean}} over the recorded frames; a stage missing from a frame counts as 0 there */
export function summary() {
  const keys = new Set(); for (const f of frames) for (const k in f) keys.add(k);
  const out = { frames: frames.length };
  for (const k of keys) {
    const a = frames.map(f => f[k] || 0).sort((x, y) => x - y);
    out[k] = { med: q(a, .5), p95: q(a, .95), mean: a.reduce((s, v) => s + v, 0) / a.length };
  }
  return out;
}
/* cost of one mark() call in ms (timer overhead), measured on a scratch frame */
export function markCost(n = 20000) {
  const keep = frames; frames = []; begin(); const a = now();
  for (let i = 0; i < n; i++) mark('cal');
  const c = (now() - a) / n; cur = null; frames = keep; return c;
}
