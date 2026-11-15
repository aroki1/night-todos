/* model/week.js — what belongs to this week's sky, and the archive rules. */
import { isoWeekKey, isoWeekOf, seedForWeek, weekDistance } from '../sky/clock.js';

/* a task's week is set when it is archived: the ISO week of its doneAt, else its deadline */
export function taskWeekKey(t) {
  return t.doneAt ? isoWeekKey(t.doneAt) : t.deadline ? isoWeekKey(t.deadline) : null;
}

/* alive always; done in the current week; missed with a deadline in the current week */
export function inCurrentWeek(t, nowMs, nowKey = isoWeekKey(nowMs)) {
  if (!t.doneAt && t.deadline > nowMs) return true;
  if (t.doneAt && isoWeekKey(t.doneAt) === nowKey) return true;
  if (!t.doneAt && t.deadline <= nowMs && isoWeekKey(t.deadline) === nowKey) return true;
  return false;
}

/* record the seed of every week from `fromKey` to `nowKey` (inclusive) that isn't recorded yet */
export function ensureWeeks(store, nowMs, fromKey = null) {
  const nowKey = isoWeekKey(nowMs);
  let key = fromKey || store.lastSeenWeek || nowKey;
  let guard = 0;
  while (weekDistance(key, nowKey) > 0 && guard++ < 520) {
    store.weeks[key] = store.weeks[key] || { seed: seedForWeek(key), archivedAt: nowMs };
    key = nextWeekKey(key);
  }
  store.weeks[nowKey] = store.weeks[nowKey] || { seed: seedForWeek(nowKey), archivedAt: null };
  return nowKey;
}
export function nextWeekKey(key) {
  const m = /^(\d+)-W(\d+)$/.exec(key);
  if (!m) return key;
  let y = +m[1],
    w = +m[2] + 1;
  if (w > 52) {
    const d = new Date(Date.UTC(y, 11, 28)); // is there a week 53?
    const w53 = isoWeekOf(Date.UTC(y, 11, 28)).week === 53;
    if (w > (w53 ? 53 : 52)) {
      y++;
      w = 1;
    }
  }
  return y + '-W' + String(w).padStart(2, '0');
}
export function previousWeekKey(key) {
  const m = /^(\d+)-W(\d+)$/.exec(key);
  if (!m) return key;
  let y = +m[1],
    w = +m[2] - 1;
  if (w < 1) {
    y--;
    const d = new Date(Date.UTC(y, 11, 28));
    w = isoWeekOf(Date.UTC(y, 11, 28)).week === 53 ? 53 : 52;
  }
  return y + '-W' + String(w).padStart(2, '0');
}

/* mark tasks that no longer belong to this week, and make sure their week has a seed */
export function archivePast(store, nowMs) {
  const nowKey = ensureWeeks(store, nowMs);
  for (const t of store.tasks) {
    if (t.week) continue;
    if (inCurrentWeek(t, nowMs, nowKey)) continue;
    const wk = taskWeekKey(t);
    if (!wk) continue;
    t.week = wk;
    store.weeks[wk] = store.weeks[wk] || { seed: seedForWeek(wk), archivedAt: nowMs };
  }
  return nowKey;
}

/* Monday ritual decision. Only the most recently finished week lifts, even if several were missed. */
export function decideRitual(lastSeenWeek, nowMs, tasks = []) {
  const nowKey = isoWeekKey(nowMs);
  if (!lastSeenWeek || lastSeenWeek === nowKey) return { run: false, from: null, to: nowKey, liftKey: null, missed: 0 };
  const liftKey = previousWeekKey(nowKey);
  const missed = Math.max(0, weekDistance(lastSeenWeek, nowKey));
  const hasShape = tasks.some(t => t.week === liftKey && t.doneAt);
  return { run: true, from: lastSeenWeek, to: nowKey, liftKey, missed, hasShape };
}

/* the archived weeks that still have done stars, newest first, at most `max` */
export function archivedWeeks(store, max = 26) {
  const out = [];
  const keys = Object.keys(store.weeks).filter(k => {
    const w = store.weeks[k];
    return w && store.tasks.some(t => t.week === k && t.doneAt);
  });
  keys.sort((a, b) => weekDistance(a, b));
  for (const k of keys.reverse().slice(0, max))
    out.push({ key: k, seed: store.weeks[k].seed, tasks: store.tasks.filter(t => t.week === k && t.doneAt) });
  return out;
}
