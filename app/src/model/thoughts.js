/* model/thoughts.js — thoughts (text without a deadline): the item, their haze slots and their age. Pure:
   no store, no DOM, no clock reads. */
import { hstr } from '../math.js';
import { SIZE, THOUGHT } from '../tokens.js';

/* -> { id, text, tag, createdAt, saidAt, taskId, goneAt, remindAt, step, usedMs } */
export function newThought(text, tag, nowMs, id) {
  return {
    id: id || null,
    text: String(text === null || text === undefined ? '' : text).trim().slice(0, SIZE.maxTitle),
    tag: tag || null,
    createdAt: nowMs,
    saidAt: null,
    taskId: null,
    goneAt: null,
    remindAt: null,
    step: 0,
    usedMs: 0
  };
}

/* a said thought's star was undone: the thought is back as haze. Returns it, or null when no thought was said into that task. */
export function reviveSaid(list, taskId) {
  if (!taskId) return null;
  const th = (list || []).find(t => t.taskId === taskId && t.saidAt);
  if (!th) return null;
  th.saidAt = null; th.taskId = null; th.usedMs = 0;
  return th;
}

const mixHash = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };   // ids that differ in their last character still land far apart

/* per thought an { id, x, w } in grains: x is the patch's whole-grain centre, w the width (THOUGHT.patchW).
   A slot is chosen once per id (near the id's hash) and remembered for the session, so the others never move when a thought
   is said, let go or comes back; only a new thought takes the free place nearest its hash. Patches never overlap while there is room. */
const memo = new Map(); let memoGw = -1;
export function hazeSlots(list, gw) {
  const w = THOUGHT.patchW, lo = Math.ceil(Math.max(w / 2, 1)), hi = Math.max(lo, Math.floor(gw - lo)), items = list || [];
  if (gw !== memoGw) { memo.clear(); memoGw = gw; }
  const kept = [], x = new Map(), free = (v, d) => kept.every(k => Math.abs(v - k) >= d);
  for (const t of items) { const m = memo.get(t.id); if (m !== undefined && free(m, w + THOUGHT.patchGap)) { kept.push(m); x.set(t.id, m); } }
  for (const t of items) {
    if (x.has(t.id)) continue;
    const pref = Math.round(lo + (mixHash(hstr(t.id)) / 4294967296) * (hi - lo));
    let best = -1, bd = Infinity;
    for (const d of [w + THOUGHT.patchGap, w]) {                       // the gap first, then touching
      for (let v = lo; v <= hi; v++) if (free(v, d) && Math.abs(v - pref) < bd) { bd = Math.abs(v - pref); best = v; }
      if (best >= 0) break;
    }
    if (best < 0) { let md = -1; for (let v = lo; v <= hi; v++) { const m = kept.reduce((a, k) => Math.min(a, Math.abs(v - k)), 1e9); if (m > md) { md = m; best = v; } } }   // no room: the least crowded grain
    memo.set(t.id, best); kept.push(best); x.set(t.id, best);
  }
  return items.map(t => ({ id: t.id, x: x.get(t.id), w })).sort((a, b) => a.x - b.x);
}

/* the thought under a grain: its haze slot within the band above the bar. -> id | null */
export function hazeHit(list, gx, gy, gw, sh) {
  const top = sh - THOUGHT.bandY, bot = top + THOUGHT.bandH;
  if (gy < top || gy >= bot) return null;
  const half = THOUGHT.patchW / 2;
  for (const q of hazeSlots(list, gw)) if (gx >= q.x - half && gx <= q.x + half) return q.id;
  return null;
}

/* 'today' | '1 day' | 'N days' | 'N weeks' */
export function ageText(createdAt, nowMs) {
  const d = Math.floor(Math.max(0, nowMs - createdAt) / 864e5);
  if (d < 1) return 'today';
  if (d < 7) return d + (d === 1 ? ' day' : ' days');
  const w = Math.floor(d / 7);
  return w + (w === 1 ? ' week' : ' weeks');
}
