/* model/practices.js — a repeating act marked by day: the day keys, what may be marked, the week's dots and the year ring.
   Pure: no store, no DOM, no clock reads (callers pass wall ms). */
import { two, isoWeekKey, weekDistance } from '../sky/clock.js';
import { PRACTICE } from '../tokens.js';

export function dayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}
/* the local day before `ms` (calendar, not 24 h minus one: DST safe) */
export function prevDayKey(ms) {
  const d = new Date(ms);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}
export function dayMs(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return NaN;
  const ms = new Date(+m[1], +m[2] - 1, +m[3], 12, 0).getTime();
  return dayKey(ms) === key ? ms : NaN;
}
export const isDayKey = k => !!k && Number.isFinite(dayMs(k));

/* today; yesterday only until yesterdayUntil (noon) local; no other day */
export function canMark(p, key, nowMs) {
  if (!key) return false;
  if (key === dayKey(nowMs)) return true;
  return key === prevDayKey(nowMs) && new Date(nowMs).getHours() < PRACTICE.yesterdayUntil;
}

/* -> a new practice with the day added or removed, days unique and sorted */
export function toggleDay(p, key) {
  const set = new Set((p.days || []).filter(isDayKey));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return Object.assign({}, p, { days: [...set].sort() });
}

function mondayNoon(ms) {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/* seven booleans, Monday..Sunday of the current ISO week */
export function weekDots(p, nowMs) {
  const start = mondayNoon(nowMs),
    set = new Set(p.days || []),
    out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(set.has(dayKey(d.getTime())));
  }
  return out;
}

/* days done in that ISO week (0..7) */
export function weekCount(p, weekKey) {
  let n = 0;
  for (const k of p.days || []) {
    const ms = dayMs(k);
    if (Number.isFinite(ms) && isoWeekKey(ms) === weekKey) n++;
  }
  return n;
}

/* the weeks from the practice's first ISO week to now (current included): [[{ key, k }] ...52 per ring] */
export function ringWeeks(p, nowMs) {
  if (!p || !Number.isFinite(p.createdAt)) return [];
  const dist = weekDistance(isoWeekKey(p.createdAt), isoWeekKey(nowMs));
  if (dist < 0) return [];
  const counts = new Map();
  for (const k of p.days || []) {
    const ms = dayMs(k);
    if (!Number.isFinite(ms)) continue;
    const wk = isoWeekKey(ms);
    counts.set(wk, (counts.get(wk) || 0) + 1);
  }
  const first = mondayNoon(p.createdAt),
    out = [];
  for (let i = 0; i <= dist; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + 7 * i);
    const key = isoWeekKey(d.getTime());
    out.push({ key, k: (counts.get(key) || 0) / 7 });
  }
  const rings = [];
  for (let i = 0; i < out.length; i += 52) rings.push(out.slice(i, i + 52));
  return rings;
}

/* how many rings the practice's life fills at `nowMs` (1 for the first 52 weeks, 2 after, ...) */
export function ringCount(p, nowMs) {
  if (!p || !Number.isFinite(p.createdAt)) return 1;
  const dist = weekDistance(isoWeekKey(p.createdAt), isoWeekKey(nowMs));
  return Math.max(1, Math.ceil((dist + 1) / 52));
}
/* the radius (grains) a label keeps clear of a practice star: its outer year ring */
export const ringReach = (p, nowMs) => Math.ceil(PRACTICE.ring1 + (ringCount(p, nowMs) - 1) * PRACTICE.ringGap) + 1;

/* `read · 5 of 7`; a title longer than 20 is cut to 19 plus `…` */
export function practiceLine(p, weekKey) {
  const t = String(p.title || ''),
    cut = t.length > 20 ? t.slice(0, 19).trimEnd() + '…' : t;
  return cut + ' · ' + weekCount(p, weekKey) + ' of 7';
}

/* the rows under a practice's label: touch always has `today`; yesterday only while it may still be marked */
export function practiceRows(p, nowMs, touch) {
  const set = new Set(p.days || []),
    tk = dayKey(nowMs),
    yk = prevDayKey(nowMs),
    out = [];
  if (touch) out.push({ k: 'practice', day: tk, text: 'today', on: set.has(tk) });
  if (canMark(p, yk, nowMs)) out.push({ k: 'practice', day: yk, text: 'yesterday', on: set.has(yk) });
  return out;
}

export const livePractices = list => (list || []).filter(p => p && !p.archivedAt);
export const clampLimit = n => (Number.isInteger(n) ? Math.max(1, Math.min(20, n)) : PRACTICE.limit);
/* the create command's decision: is there room for another live practice? */
export function canCreate(list, limit) {
  return livePractices(list).length < clampLimit(limit);
}
