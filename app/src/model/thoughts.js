/* model/thoughts.js — thoughts (text without a deadline): the item, their haze slots and their age. Pure:
   no store, no DOM, no clock reads. */
import { hstr } from '../math.js';
import { SIZE, THOUGHT, TIME } from '../tokens.js';

/* -> { id, text, tag, createdAt, saidAt, taskId, goneAt, remindAt, askedAt, askUse, step, usedMs, big? } (`big: 1` only when written with a `!`) */
export function newThought(text, tag, nowMs, id, useMs, big) {
  const o = {
    id: id || null,
    text: String(text === null || text === undefined ? '' : text)
      .trim()
      .slice(0, SIZE.maxTitle),
    tag: tag || null,
    createdAt: nowMs,
    saidAt: null,
    taskId: null,
    goneAt: null,
    remindAt: null,
    askedAt: null,
    askUse: Number.isFinite(useMs) ? useMs : 0,
    step: 0,
    usedMs: 0
  };
  if (big) o.big = 1;
  return o;
}

/* is this live thought due at `nowMs` of wall time / `useMs` of app use?
   a reminder at its time, else step 0 by app use since `askUse`, else (step 1..4) by calendar time since `askedAt`. */
export function thoughtDue(t, nowMs, useMs) {
  if (!t || t.saidAt || t.goneAt) return false;
  if (Number.isFinite(t.remindAt) && nowMs >= t.remindAt) return true;
  const step = Math.max(0, Math.min(4, t.step | 0));
  if (step === 0) return Number.isFinite(t.askUse) && useMs - t.askUse >= TIME.thought.firstUseMs;
  return Number.isFinite(t.askedAt) && nowMs - t.askedAt >= TIME.thought.gapMs[step - 1];
}
const isRemind = (t, nowMs) => Number.isFinite(t.remindAt) && nowMs >= t.remindAt;
const byAge = (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/* the thought that should come back now: a due reminder first (earliest), then the oldest due thought, but not the one that
   came back last while another is due. `store.lastAskUse` gates all but reminders to one per perUseMs of app use. -> id | null */
export function pickDue(thoughts, nowMs, useMs, lastAskUse) {
  const live = (thoughts || []).filter(t => t && !t.saidAt && !t.goneAt);
  const remind = live.filter(t => isRemind(t, nowMs)).sort((a, b) => a.remindAt - b.remindAt || byAge(a, b));
  const gateOpen = !Number.isFinite(lastAskUse) || useMs - lastAskUse >= TIME.thought.perUseMs;
  const plain = gateOpen ? live.filter(t => !isRemind(t, nowMs) && thoughtDue(t, nowMs, useMs)).sort(byAge) : [];
  let list = remind.concat(plain);
  if (list.length > 1) {
    let last = null;
    for (const t of live) if (Number.isFinite(t.askedAt) && (!last || t.askedAt > last.askedAt)) last = t;
    if (last) list = list.filter(t => t.id !== last.id);
  }
  return list.length ? list[0].id : null;
}

/* the thought after it came back and the user chose `outcome` ('said' | 'remind' | 'later' | 'ignored' | 'gone').
   later / ignored advance step (max 4) and clear the reminder; remind keeps step and its remindAt; said / gone end it. Pure. */
export function afterAsk(t, nowMs, useMs, outcome) {
  const o = Object.assign({}, t);
  if (outcome === 'said') {
    o.saidAt = nowMs;
    o.remindAt = null;
    o.usedMs = Math.max(0, nowMs - o.createdAt);
  } else if (outcome === 'gone') {
    o.goneAt = nowMs;
    o.remindAt = null;
    o.usedMs = Math.max(0, nowMs - o.createdAt);
  } else if (outcome === 'remind') {
    /* the caller set remindAt; step stays */
  } else if (outcome === 'later' || outcome === 'ignored') {
    o.step = Math.min(4, Math.max(0, o.step | 0) + 1);
    o.remindAt = null;
  }
  return o;
}

/* may a coming back play? The caller adds the presence rule (isPresent in model/morning.js). Pure. */
export function thoughtMayCome(s) {
  return !!s && !s.morning && !s.busy && !s.barText && !s.when && !s.selected && !!s.visible && !!s.focused;
}

/* a said thought's star was undone: the thought is back as haze. Returns it, or null when no thought was said into that task. */
export function reviveSaid(list, taskId) {
  if (!taskId) return null;
  const th = (list || []).find(t => t.taskId === taskId && t.saidAt);
  if (!th) return null;
  th.saidAt = null;
  th.taskId = null;
  th.usedMs = 0;
  return th;
}

const mixHash = h => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}; // ids that differ in their last character still land far apart

/* per thought an { id, x, w } in grains: x is the patch's whole-grain centre, w the width (THOUGHT.patchW).
   A slot is chosen once per id (near the id's hash) and remembered for the session, so the others never move when a thought
   is said, let go or comes back; only a new thought takes the free place nearest its hash. Patches never overlap while there is room. */
const memo = new Map();
let memoGw = -1;
export function hazeSlots(list, gw) {
  const w = THOUGHT.patchW,
    lo = Math.ceil(Math.max(w / 2, 1)),
    hi = Math.max(lo, Math.floor(gw - lo)),
    items = list || [];
  if (gw !== memoGw) {
    memo.clear();
    memoGw = gw;
  }
  const kept = [],
    x = new Map(),
    free = (v, d) => kept.every(k => Math.abs(v - k) >= d);
  for (const t of items) {
    const m = memo.get(t.id);
    if (m !== undefined && free(m, w + THOUGHT.patchGap)) {
      kept.push(m);
      x.set(t.id, m);
    }
  }
  for (const t of items) {
    if (x.has(t.id)) continue;
    const pref = Math.round(lo + (mixHash(hstr(t.id)) / 4294967296) * (hi - lo));
    let best = -1,
      bd = Infinity;
    for (const d of [w + THOUGHT.patchGap, w]) {
      // the gap first, then touching
      for (let v = lo; v <= hi; v++)
        if (free(v, d) && Math.abs(v - pref) < bd) {
          bd = Math.abs(v - pref);
          best = v;
        }
      if (best >= 0) break;
    }
    if (best < 0) {
      let md = -1;
      for (let v = lo; v <= hi; v++) {
        const m = kept.reduce((a, k) => Math.min(a, Math.abs(v - k)), 1e9);
        if (m > md) {
          md = m;
          best = v;
        }
      }
    } // no room: the least crowded grain
    memo.set(t.id, best);
    kept.push(best);
    x.set(t.id, best);
  }
  return items.map(t => ({ id: t.id, x: x.get(t.id), w })).sort((a, b) => a.x - b.x);
}

/* the thought under a grain: its haze slot within the band above the bar. -> id | null */
export function hazeHit(list, gx, gy, gw, sh) {
  const top = sh - THOUGHT.bandY,
    bot = top + THOUGHT.bandH;
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
