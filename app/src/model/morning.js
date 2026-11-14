/* model/morning.js — when the weekly morning is due and when it may start. Pure: no store, no DOM, no clock reads. */
import { TIME } from '../tokens.js';
import { clamp01, hstr } from '../math.js';
import { isoWeekKey, weekDistance, weekLabel } from '../sky/clock.js';
import { previousWeekKey } from './week.js';

/* the week whose morning is still unseen, after the app learns it is now `nowMs` and the last week it saw was `prevWeek`.
   A new week makes the most recent finished week due (an older unseen one is replaced). Same week: keep what was due. */
export function nextDue(prevWeek, nowMs, due) {
  const nowKey = isoWeekKey(nowMs);
  if (!prevWeek || weekDistance(prevWeek, nowKey) <= 0) return due || null;
  return previousWeekKey(nowKey);
}

/* the morning may start now. s: { due, visible, focused, busy, barText, sinceInput, sinceShown } (ms on one clock).
   The user must be here (visible + focused), nothing else may be playing, the bar must not hold text,
   and either they paused (no input for idleMs) or the page was just shown (less than shownMs ago). */
export function shouldStartMorning(s) {
  if (!s.due || !s.visible || !s.focused || s.busy || s.barText) return false;
  return s.sinceInput >= TIME.morning.idleMs || s.sinceShown <= TIME.morning.shownMs;
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

/* the numbers of the morning: done and missed in that week, alive tasks carrying over, steps finished during that week */
export function weekSummary(tasks, weekKey, nowMs) {
  let done = 0, missed = 0, carried = 0, steps = 0;
  for (const t of tasks) {
    if (t.week === weekKey) { if (t.doneAt) done++; else missed++; }
    else if (carries(t, weekKey, nowMs)) carried++;
    for (const s of t.steps || []) if (s && s.doneAt && isoWeekKey(s.doneAt) === weekKey) steps++;
  }
  return { done, missed, carried, steps };
}

/* the text lines of the morning (voice: docs/specs/SPEC-morning.md section 9). away = weeks the user was away (0 = normal) */
export function summaryLines(sum, weekKey, name = '', away = 0) {
  const out = [weekLabel(weekKey) + (name ? ' · ' + name : '')];
  if (away >= 2) { out.push(away + ' weeks away'); return out; }
  if (!sum.done && !sum.missed && !sum.carried) { out.push('a quiet week'); return out; }
  const parts = [sum.done ? sum.done + ' done' : 'nothing finished'];
  if (sum.missed) parts.push(sum.missed + ' missed');
  if (sum.carried) parts.push(sum.carried + ' carry over');
  out.push(parts.join(' · '));
  if (sum.steps) out.push(sum.steps + (sum.steps === 1 ? ' step' : ' steps'));
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
    return { id: t.id, title: t.title, x: clamp01(t.x), depth: clamp01(1 - t.y), big: t.big ? 1 : 0, petals: st.length ? Math.max(4, Math.min(8, n)) : 0, pick: hstr(t.id), order: i, bud, doneAt: t.doneAt || null };
  };
  const out = done.map((t, i) => mk(t, i, false)).concat(buds.map((t, i) => mk(t, done.length + i, true)));
  spreadX(out, minGap);
  return out;
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
