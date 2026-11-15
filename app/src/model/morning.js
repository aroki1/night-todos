/* model/morning.js — when the weekly morning is due and when it may start. Pure: no store, no DOM, no clock reads. */
import { TIME } from '../tokens.js';
import { clamp01, hstr } from '../math.js';
import { isoWeekKey, weekDistance, weekLabel, WDN } from '../sky/clock.js';
import { previousWeekKey } from './week.js';
import { splitBar, parseDeadline } from './parser.js';
import { practiceLine } from './practices.js';

/* the week whose morning is still unseen, after the app learns it is now `nowMs` and the last week it saw was `prevWeek`.
   A new week makes the most recent finished week due (an older unseen one is replaced). Same week: keep what was due. */
export function nextDue(prevWeek, nowMs, due) {
  const nowKey = isoWeekKey(nowMs);
  if (!prevWeek || weekDistance(prevWeek, nowKey) <= 0) return due || null;
  return previousWeekKey(nowKey);
}

/* is the user here and free? s: { visible, focused, busy, barText, sinceInput, sinceShown } (ms on one clock).
   Visible + focused, nothing else playing, the bar not holding text, and either a pause (no input for idleMs) or the page
   was just shown (less than shownMs ago). Shared by the weekly morning and thoughts coming back. */
export function isPresent(s) {
  if (!s || !s.visible || !s.focused || s.busy || s.barText) return false;
  return s.sinceInput >= TIME.morning.idleMs || s.sinceShown <= TIME.morning.shownMs;
}
/* the morning may start now; `due` is the unseen week. */
export function shouldStartMorning(s) {
  return !!s.due && isPresent(s);
}

/* season by the month of the wall date (northern hemisphere) */
export function seasonOf(ms) {
  const m = new Date(ms).getMonth();
  return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
}

/* a task alive now that already existed during `weekKey` carries over into the new week */
function carries(t, weekKey, nowMs) {
  return !t.week && !t.doneAt && t.deadline > nowMs && Number.isFinite(t.createdAt) && weekDistance(isoWeekKey(t.createdAt), weekKey) >= 0;
}

/* the numbers of the morning: done and missed in that week, alive tasks carrying over, steps finished during that week,
   and the done tasks by tag (untagged is ''). */
export function weekSummary(tasks, weekKey, nowMs, practices) {
  let done = 0, missed = 0, carried = 0, steps = 0; const tags = {};
  for (const t of tasks) {
    if (t.week === weekKey) {
      if (t.doneAt) { done++; const k = typeof t.tag === 'string' ? t.tag : ''; tags[k] = (tags[k] || 0) + 1; }
      else missed++;
    }
    else if (carries(t, weekKey, nowMs)) carried++;
    for (const s of t.steps || []) if (s && s.doneAt && isoWeekKey(s.doneAt) === weekKey) steps++;
  }
  const out = { done, missed, carried, steps, tags };
  const live = (practices || []).filter(p => p && !p.archivedAt);
  if (live.length) {                                          // one line per live practice, at most 5, the 5th carries `· +N`
    const lines = live.slice(0, 5).map(p => practiceLine(p, weekKey));
    if (live.length > 5) lines[4] += ' · +' + (live.length - 5) + ' practices';
    out.practice = lines;
  }
  return out;
}

/* the tag line: only for 2+ tags; the tags by count, highest first, untagged as `other` last, at most 4 entries then +N */
function tagLine(tags) {
  if (!tags || typeof tags !== 'object') return '';
  const keys = Object.keys(tags);
  if (keys.length < 2) return '';
  const named = keys.filter(k => k !== '').sort((a, b) => tags[b] - tags[a] || (a < b ? -1 : a > b ? 1 : 0));
  const rows = named.map(k => k + ' ' + tags[k]);
  if (Object.prototype.hasOwnProperty.call(tags, '')) rows.push('other ' + tags['']);
  if (!rows.length) return '';
  const shown = rows.slice(0, 4);
  return shown.join(' · ') + (rows.length > 4 ? ' · +' + (rows.length - 4) : '');
}

/* the title of a week: `week 46`, or `week 46 · <name>` when named */
export function weekTitle(weekKey, name = '') { return weekLabel(weekKey) + (name ? ' · ' + name : ''); }

/* how many weeks the user was away, after the app learns it is now `nowMs` and the last week it saw was `prevWeek`.
   A new week sets it (1 = last week, the normal case); the same week keeps what was there. */
export function nextAway(prevWeek, nowMs, away) {
  const nowKey = isoWeekKey(nowMs);
  if (!prevWeek || weekDistance(prevWeek, nowKey) <= 0) return away || 0;
  return weekDistance(prevWeek, nowKey);
}

/* the text lines of the morning. away = weeks the user was away (0 = normal) */
export function summaryLines(sum, weekKey, name = '', away = 0) {
  const out = [weekTitle(weekKey, name)];
  if (away >= 2) { out.push(away + ' weeks away'); return out; }
  if (!sum.done && !sum.missed && !sum.carried) out.push('a quiet week');
  else {
    const parts = [sum.done ? sum.done + ' done' : 'nothing finished'];
    if (sum.missed) parts.push(sum.missed + ' missed');
    if (sum.carried) parts.push(sum.carried + ' carry over');
    out.push(parts.join(' · '));
    if (sum.steps) out.push(sum.steps + (sum.steps === 1 ? ' step' : ' steps'));
    const tl = tagLine(sum.tags);
    if (tl) out.push(tl);
  }
  if (sum.practice) for (const l of sum.practice) out.push(l);
  return out;
}

/* one flower per task finished in `weekKey` (ordered by doneAt), then one bud per carried-over task.
   x: the star's x (0..1), pushed apart to at least `minGap` (0..1 units); depth: 0 near .. 1 far (a higher star stands farther back).
   petals: done steps clamped to 4..8 when the task has steps, else 0 (= the species default). pick: a stable hash for the species. */
export function flowerList(tasks, weekKey, nowMs, minGap = 0) {
  const done = tasks.filter(t => t.week === weekKey && t.doneAt).sort((a, b) => a.doneAt - b.doneAt);
  const buds = tasks.filter(t => carries(t, weekKey, nowMs));
  const mk = (t, i, bud) => {
    const st = t.steps || [], n = st.filter(s => s && s.doneAt).length;
    return { id: t.id, title: t.title, x: clamp01(t.x), depth: clamp01(1 - t.y), big: t.big ? 1 : 0, petals: st.length ? Math.max(4, Math.min(8, n)) : 0, nSteps: st.length, nDone: n, pick: hstr(t.id), order: i, bud, doneAt: t.doneAt || null };
  };
  const out = done.map((t, i) => mk(t, i, false)).concat(buds.map((t, i) => mk(t, done.length + i, true)));
  spreadX(out, minGap);
  return out;
}

/* the hover label of a flower: { title, sub }. sub: `finished wed`, plus ` · 4 of 6 steps` when the task had steps; a bud: `carries over`.
   A title longer than 28 characters is cut to 27 plus `…`. */
export function flowerLabel(f) {
  if (!f) return { title: '', sub: '' };
  const title = String(f.title || ''), t = title.length > 28 ? title.slice(0, 27) + '…' : title;
  if (f.bud) return { title: t, sub: 'carries over' };
  const day = Number.isFinite(f.doneAt) ? WDN[new Date(f.doneAt).getDay()] : '';
  let sub = day ? 'finished ' + day : 'finished';
  if (f.nSteps > 0) sub += ' · ' + (f.nDone | 0) + ' of ' + f.nSteps + (f.nSteps === 1 ? ' step' : ' steps');
  return { title: t, sub };
}

/* a week name: trimmed, at most 32 characters (sanitizeWeeks in store.js keeps the same rule) */
export function cleanName(s) { return String(s === null || s === undefined ? '' : s).trim().slice(0, 32).trim(); }

/* Enter in the bar during the morning hold. A '/' command runs as usual; text that parses with a deadline is a task;
   any other text names the week; empty text just lets the morning go. */
export function morningEnter(text, nowMs) {
  const tx = String(text === null || text === undefined ? '' : text).trim();
  if (!tx) return { kind: 'none' };
  if (tx[0] === '/') return { kind: 'cmd' };
  const p = splitBar(tx);
  const r = p.dls !== null && p.dls.trim() !== '' ? parseDeadline(p.dls, new Date(nowMs)) : null;
  if (p.title !== '' && r && r.ok) return { kind: 'task' };
  return { kind: 'name', name: cleanName(tx) };
}

/* a week entry with its summary: written once, when its sunrise starts, so the Atlas keeps these numbers. Returns a new object */
export function withSummary(entry, sum) {
  if (entry && entry.summary) return entry;
  return Object.assign({}, entry || {}, { summary: { done: sum.done, missed: sum.missed, carried: sum.carried, steps: sum.steps } });
}
/* a week entry with a new name (an empty name removes it). Returns a new object */
export function withName(entry, name) {
  const o = Object.assign({}, entry || {}), n = cleanName(name);
  if (n) o.name = n; else delete o.name;
  return o;
}

/* push x apart to at least g, keeping everything inside [g/2, 1 - g/2] when it fits */
function spreadX(list, g) {
  if (g <= 0 || list.length < 2) return;
  const s = list.slice().sort((a, b) => a.x - b.x || a.order - b.order);
  for (let i = 1; i < s.length; i++) if (s[i].x < s[i - 1].x + g) s[i].x = s[i - 1].x + g;
  const hi = 1 - g / 2;
  if (s[s.length - 1].x > hi) {
    s[s.length - 1].x = hi;
    for (let i = s.length - 2; i >= 0; i--) if (s[i].x > s[i + 1].x - g) s[i].x = s[i + 1].x - g;
  }
  for (const f of s) f.x = clamp01(f.x);
}
