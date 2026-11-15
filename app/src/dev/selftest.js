/* dev/selftest.js — parser, formatting, week membership, archive and store round-trip. */
import { parseDeadline, splitBar, extractTag, barKind, parseWhen } from '../model/parser.js';
import { newThought, hazeSlots, ageText, reviveSaid, thoughtDue, pickDue, afterAsk, thoughtMayCome } from '../model/thoughts.js';
import { pace, PACE0, fmtLeft, isoWeekKey, isoWeekOf, T, wall, clockBase, setClockBase, resyncClock } from '../sky/clock.js';
import { inCurrentWeek, archivePast, taskWeekKey, ensureWeeks, nextWeekKey, previousWeekKey, decideRitual } from '../model/week.js';
import { sanitize, isUrgent, stepsDoneBy, R, CORE, sameTag, starTag, nearestDoneIn } from '../model/store.js';
import { tagPullScore, tagSuffix } from '../model/placement.js';
import { SPR } from '../sky/components.js';
import {
  shouldStartMorning,
  isPresent,
  nextDue,
  seasonOf,
  weekSummary,
  summaryLines,
  flowerList,
  morningEnter,
  withSummary,
  withName,
  cleanName,
  weekTitle,
  nextAway,
  flowerLabel
} from '../model/morning.js';
import { QUOTES, quoteFor } from '../model/quotes.js';
import { FRAMECAP, MORNING, THOUGHT, SIZE, PLACE, PRACTICE } from '../tokens.js';
import {
  dayKey,
  prevDayKey,
  canMark,
  toggleDay,
  weekDots,
  weekCount,
  ringWeeks,
  practiceLine,
  practiceRows,
  canCreate
} from '../model/practices.js';
import { isDrag, clampScroll, stepRows } from '../model/steps.js';
import { slotCount, slotFill, slotF, stepFinishState, pulseMs, collapseK } from '../choreo/step.js';
import { condenseState, condenseMs } from '../choreo/condense.js';
import { markState, stopState } from '../choreo/practice.js';
import { morningState, morningControls, riseAt, bloom, textK, HOLD_END } from '../choreo/morning.js';
import { onboardingHint, helpLines, enterGate } from '../ui/guide.js';

export function selfTest() {
  const now = new Date(2026, 10, 13, 21, 0, 0),
    at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).getTime(),
    D = 864e5;
  const cases = [
    ['today', at(2026, 11, 13, 23, 59)],
    ['tonight', at(2026, 11, 13, 23, 59)],
    ['tomorrow', at(2026, 11, 14, 23, 59)],
    ['TMR', at(2026, 11, 14, 23, 59)],
    ['  tomorrow 9  ', at(2026, 11, 14, 9, 0)],
    ['tmr 6:30pm', at(2026, 11, 14, 18, 30)],
    ['fri', at(2026, 11, 13, 23, 59)],
    ['Friday', at(2026, 11, 13, 23, 59)],
    ['fri 22:00', at(2026, 11, 13, 22, 0)],
    ['fri 18:00', at(2026, 11, 20, 18, 0)],
    ['sat', at(2026, 11, 14, 23, 59)],
    ['sun', at(2026, 11, 15, 23, 59)],
    ['mon', at(2026, 11, 16, 23, 59)],
    ['wed 9am', at(2026, 11, 18, 9, 0)],
    ['thurs', at(2026, 11, 19, 23, 59)],
    ['tue 18', at(2026, 11, 17, 18, 0)],
    ['nov 20', at(2026, 11, 20, 23, 59)],
    ['20 nov', at(2026, 11, 20, 23, 59)],
    ['20.11', at(2026, 11, 20, 23, 59)],
    ['2026-11-20', at(2026, 11, 20, 23, 59)],
    ['november 20 18:00', at(2026, 11, 20, 18, 0)],
    ['nov 13', at(2026, 11, 13, 23, 59)],
    ['nov 2', at(2027, 11, 2, 23, 59)],
    ['2 nov', at(2027, 11, 2, 23, 59)],
    ['2.11', at(2027, 11, 2, 23, 59)],
    ['2026-12-01 8', at(2026, 12, 1, 8, 0)],
    ['20.11 6pm', at(2026, 11, 20, 18, 0)],
    ['+3d', now.getTime() + 3 * D],
    ['+5h', now.getTime() + 5 * 36e5],
    ['+90m', now.getTime() + 90 * 6e4],
    ['sat 18', at(2026, 11, 14, 18, 0)],
    ['sat 6pm', at(2026, 11, 14, 18, 0)],
    ['sat 6:30pm', at(2026, 11, 14, 18, 30)],
    ['sat 12am', at(2026, 11, 14, 0, 0)],
    ['sat 12pm', at(2026, 11, 14, 12, 0)],
    ['nov 20 7:05', at(2026, 11, 20, 7, 5)],
    ['20 nov 18:00', at(2026, 11, 20, 18, 0)],
    ['', 'unreadable'],
    ['soon', 'unreadable'],
    ['fri 25:00', 'unreadable'],
    ['sat 13pm', 'unreadable'],
    ['nov 31', 'unreadable'],
    ['2026-02-30', 'unreadable'],
    ['18', 'unreadable'],
    ['sat 18:00 now', 'unreadable'],
    ['+3x', 'unreadable'],
    ['nov', 'unreadable'],
    ['today 9', 'past'],
    ['+0m', 'past'],
    ['2026-11-02', 'past'],
    ['today 21:00', 'past'],
    ['2026-11-13 20:59', 'past']
  ];
  let pass = 0,
    fail = 0;
  const failed = [];
  const ok = (cond, label) => {
    if (cond) pass++;
    else {
      fail++;
      failed.push(label);
    }
  };
  for (const [inp, exp] of cases) {
    const r = parseDeadline(inp, now);
    ok(typeof exp === 'number' ? r.ok && r.date.getTime() === exp : r.err === exp, 'parse ' + inp);
  }
  ok(
    onboardingHint() === 'add your first star — title, deadline' && onboardingHint({ touch: true }) === 'add — title, deadline',
    'guide: an empty store asks for the first star'
  );
  ok(
    onboardingHint({ taskCount: 1, hasLive: true }) === 'click a star to finish' &&
      onboardingHint({ taskCount: 1, hasLive: true, touch: true }) === 'tap twice to finish',
    'guide: first live star teaches finish for pointer and touch'
  );
  ok(
    onboardingHint({ taskCount: 2, hasLive: true, hasDone: true }) === 'title, deadline / step / step' &&
      onboardingHint({ taskCount: 4, hasDone: true }) === 'title, deadline',
    'guide: normal and step syntax hints after first finish'
  );
  ok(
    helpLines(false)[0] === 'help' &&
      helpLines(false).some(x => x.includes('/export')) &&
      helpLines(true).some(x => x.includes('tap a star twice')),
    'guide: help covers data and touch'
  );
  const fl = [
    [0, '<1m'],
    [59e3, '<1m'],
    [60e3, '1m'],
    [3599e3, '59m'],
    [3600e3, '1h'],
    [26.99 * 36e5, '26h'],
    [47.9 * 36e5, '47h'],
    [(2 * 24 + 2) * 36e5, '2d 02h'],
    [(6 * 24 + 2.99) * 36e5, '6d 02h']
  ];
  for (const [ms, exp] of fl) ok(fmtLeft(ms) === exp, 'fmtLeft ' + ms);

  /* ISO weeks */
  ok(isoWeekKey(new Date(2026, 10, 9, 12)) === '2026-W46', 'iso week 46');
  ok(isoWeekKey(new Date(2026, 10, 14, 12)) === '2026-W46', 'iso week saturday');
  ok(nextWeekKey('2026-W46') === '2026-W47', 'next week');
  ok(previousWeekKey('2026-W47') === '2026-W46', 'previous week');
  ok(isoWeekOf(Date.UTC(2026, 0, 1, 12)).key === '2026-W01', 'first week');

  /* week membership */
  const nowMs = new Date(2026, 10, 14, 12).getTime();
  const mk = o =>
    Object.assign(
      { id: 'x', title: 't', createdAt: nowMs - D, deadline: nowMs + D, big: 0, x: 0.5, y: 0.4, doneAt: null, link: null, week: null },
      o
    );
  ok(inCurrentWeek(mk({ deadline: nowMs + 2 * D }), nowMs), 'alive is this week');
  ok(inCurrentWeek(mk({ doneAt: nowMs - D, deadline: nowMs + D }), nowMs), 'done this week');
  ok(inCurrentWeek(mk({ deadline: nowMs - D }), nowMs), 'missed this week');
  ok(!inCurrentWeek(mk({ doneAt: new Date(2026, 9, 28, 12).getTime(), deadline: nowMs + D }), nowMs), 'done earlier is past');
  ok(!inCurrentWeek(mk({ deadline: new Date(2026, 10, 1, 12).getTime() }), nowMs), 'missed earlier is past');
  ok(taskWeekKey(mk({ doneAt: new Date(2026, 10, 9, 12).getTime(), deadline: nowMs + D })) === '2026-W46', 'task week from doneAt');

  /* archive */
  const st = {
    version: 1,
    tasks: [mk({ deadline: new Date(2026, 10, 2, 12).getTime() }), mk({ doneAt: new Date(2026, 10, 10, 12).getTime() })],
    weeks: {},
    lastSeenWeek: '2026-W45',
    prefs: { reducedMotion: 'system' }
  };
  archivePast(st, nowMs);
  ok(st.tasks[0].week === '2026-W45', 'archived missed week');
  ok(st.tasks[1].week === null, 'current done stays');
  ensureWeeks(st, nowMs, '2026-W45');
  ok(!!st.weeks['2026-W46'] && !!st.weeks['2026-W45'], 'weeks recorded');

  /* store round-trip (valid + corrupt) */
  const good = {
    version: 1,
    tasks: [
      { id: 'a', title: 'read', createdAt: nowMs - D, deadline: nowMs + D, big: 1, x: 0.2, y: 0.3, doneAt: null, link: null, week: null }
    ],
    weeks: { '2026-W45': { seed: 1, archivedAt: nowMs } },
    lastSeenWeek: '2026-W46',
    prefs: { reducedMotion: 'off' }
  };
  const sanitized = sanitize(good);
  ok(
    sanitized && sanitized.tasks.length === 1 && sanitized.tasks[0].title === 'read' && sanitized.prefs.reducedMotion === 'off',
    'store round-trip'
  );
  const round = sanitize(JSON.parse(JSON.stringify(good)));
  ok(round && round.tasks[0].x === 0.2 && round.weeks['2026-W45'].seed === 1, 'store JSON round-trip');
  ok(sanitize({ tasks: 'nope' }) === null, 'corrupt store rejected');
  ok(sanitize({ version: 1, tasks: [{ title: 3 }] }) !== null, 'junk tasks are dropped, store survives');
  ok(sanitize({ version: 2, tasks: [] }) === null, 'unknown version is corrupt');

  /* golden fixtures: now = Fri 2026-11-13 21:00 local, week 2026-W46 */
  const F = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
  const fx = {
    a: { deadline: F(2026, 11, 20, 23, 59) },
    b: { doneAt: F(2026, 11, 12, 18), deadline: F(2026, 11, 20, 23, 59) },
    c: { doneAt: F(2026, 11, 6, 12), deadline: F(2026, 11, 20, 23, 59) },
    d: { deadline: F(2026, 11, 11, 23, 59) },
    e: { deadline: F(2026, 11, 4, 23, 59) },
    f: { doneAt: F(2026, 11, 9, 0, 0), deadline: F(2026, 11, 20) },
    g: { doneAt: F(2026, 11, 8, 23, 59), deadline: F(2026, 11, 20) },
    h: { createdAt: F(2026, 10, 28), deadline: F(2026, 11, 14, 12) },
    i: { createdAt: F(2026, 11, 10), deadline: F(2026, 11, 13, 20, 59) }
  };
  const fixNow = F(2026, 11, 13, 21, 0);
  const on = k => inCurrentWeek(Object.assign(mk({}), fx[k]), fixNow);
  ok(on('a'), 'fixture a alive on sky');
  ok(on('b'), 'fixture b done W46 on sky');
  ok(!on('c') && taskWeekKey(Object.assign(mk({}), fx.c)) === '2026-W45', 'fixture c archived W45');
  ok(on('d'), 'fixture d missed W46 on sky');
  ok(!on('e') && taskWeekKey(Object.assign(mk({}), fx.e)) === '2026-W45', 'fixture e archived');
  ok(on('f'), 'fixture f monday 00:00 inclusive');
  ok(!on('g') && taskWeekKey(Object.assign(mk({}), fx.g)) === '2026-W45', 'fixture g sunday 23:59 W45');
  ok(on('h'), 'fixture h alive always');
  ok(on('i'), 'fixture i just missed, on sky');
  ok(isoWeekKey(F(2026, 12, 31, 12)) === '2026-W53', '2026-12-31 W53');
  ok(isoWeekKey(F(2027, 1, 1, 12)) === '2026-W53', '2027-01-01 W53');
  ok(isoWeekKey(F(2027, 1, 3, 12)) === '2026-W53', '2027-01-03 W53');
  ok(isoWeekKey(F(2027, 1, 4, 12)) === '2027-W01', '2027-01-04 W01');
  ok(isoWeekKey(F(2025, 12, 29, 12)) === '2026-W01', '2025-12-29 W01');
  ok(isoWeekKey(F(2026, 11, 15, 23)) === '2026-W46', '2026-11-15 W46');
  ok(isoWeekKey(F(2026, 11, 16, 0)) === '2026-W47', '2026-11-16 W47');
  const rd = decideRitual('2026-W45', fixNow);
  ok(rd.run && rd.liftKey === '2026-W45' && rd.to === '2026-W46', 'rollover W45 -> W46');
  ok(!decideRitual('2026-W46', fixNow).run, 'no morning same week');
  const rd2 = decideRitual('2026-W42', fixNow);
  ok(rd2.run && rd2.liftKey === '2026-W45' && rd2.missed === 4, 'only most recent week lifts');
  ok(!decideRitual(null, fixNow).run, 'first launch has no morning');

  /* archive is idempotent */
  const st2 = {
    version: 1,
    tasks: [mk({ deadline: F(2026, 11, 2, 12) })],
    weeks: {},
    lastSeenWeek: '2026-W45',
    prefs: { reducedMotion: 'system' }
  };
  archivePast(st2, fixNow);
  const before = JSON.stringify(st2.tasks[0]);
  archivePast(st2, fixNow);
  ok(JSON.stringify(st2.tasks[0]) === before, 'archive is idempotent');

  /* past brightness formula */
  const bright = age => Math.max(0.05, 0.22 * Math.pow(0.88, age));
  ok(Math.abs(bright(1) - 0.1936) < 1e-9, 'past brightness age 1');
  ok(Math.abs(bright(6) - 0.1022) < 1e-4, 'past brightness age 6');
  ok(bright(20) === 0.05, 'past brightness floor');

  /* store deep round-trip */
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(deepEq(sanitize(JSON.parse(JSON.stringify(good))), sanitize(good)), 'store deep round-trip');

  /* urgency: life fraction OR absolute time left (URGENT.leftMs = 1 h) */
  const uNow = fixNow,
    MIN = 6e4;
  ok(isUrgent({ dl: uNow + 3 * MIN, life: 1 }, uNow), 'urgent: 3-min task right after creation');
  ok(!isUrgent({ dl: uNow + 7 * D, life: 1 }, uNow), 'not urgent: 7-day task just created');
  ok(isUrgent({ dl: uNow + 30 * MIN, life: (30 * MIN) / (7 * D) }, uNow), 'urgent: 7-day task with 30 min left');
  ok(!isUrgent({ dl: uNow + 2 * 36e5, life: 1 }, uNow), 'not urgent: 2 h task just created');
  ok(isUrgent({ dl: uNow + 3 * D, life: 0.2 }, uNow), 'urgent: low life fraction still counts');
  ok(!isUrgent({ dl: null, life: 1 }, uNow), 'not urgent: no deadline, full life');

  /* steps: slot fill by count, the finish moment */
  ok(slotCount(4) === 4 && slotCount(20) === 8, 'steps: K = min(n, 8)');
  ok(slotFill(1, 4) === 1 && slotFill(13, 20) === 5.2 && slotFill(5, 5) === 5 && slotFill(0, 0) === 0, 'steps: filled = done * K / n');
  ok(slotF(5.2, 4) === 1 && Math.abs(slotF(5.2, 5) - 0.2) < 1e-9 && slotF(5.2, 6) === 0, 'steps: slot f is clamp(filled - i)');
  ok(pulseMs(5) === 180 && pulseMs(20) === 220 && pulseMs(100) === 400, 'steps: pulse 11 ms/grain, clamp 180-400');
  const f0 = stepFinishState(60, { dist: 12 }),
    f1 = stepFinishState(200, { dist: 12 }),
    f2 = stepFinishState(2000, { dist: 12 });
  ok(f0.dim > 0 && f0.k === 0 && f1.flash > 0 && f2.active === false && f2.k === 1, 'steps: finish stages');
  ok(
    stepFinishState(125, { reduced: true }).k === 0.5 &&
      stepFinishState(100, { undo: true, dist: 12 }).k > 0 &&
      stepFinishState(500, { undo: true, dist: 12 }).k === 0,
    'steps: reduced crossfade and undo'
  );
  ok(
    collapseK(0) === 1 && collapseK(400) === 0 && collapseK(200) === 0.5 && collapseK(125, true) === 0.5,
    'steps: the orbit folds in 400 ms (250 ms fade when reduced)'
  );

  /* steps: pacing is part of isUrgent. behind = n > 0 && (1 - life) > doneAt(now) / n + 0.3 */
  const mkSt = (n, doneAts) => Array.from({ length: n }, (_, k) => ({ id: 's' + k, text: 'x', doneAt: doneAts[k] || null }));
  const sd = (n, d, life) => ({
    dl: uNow + 7 * D,
    life,
    steps: mkSt(
      n,
      Array.from({ length: d }, () => uNow - 1)
    )
  });
  ok(
    isUrgent(sd(6, 1, 0.3), uNow) && !isUrgent(sd(4, 1, 0.86), uNow) && !isUrgent(sd(20, 13, 0.5), uNow) && !isUrgent(sd(5, 5, 0.6), uNow),
    'steps: behind makes a task urgent'
  );
  ok(!isUrgent(sd(4, 1, 0.45), uNow) && isUrgent(sd(4, 1, 0.44), uNow), 'steps: pace margin edge (0.3)');
  ok(
    isUrgent({ dl: uNow + 7 * D, life: 0.5, steps: mkSt(4, [uNow + 1e3, uNow + 1e3, uNow + 1e3]) }, uNow) &&
      !isUrgent({ dl: uNow + 7 * D, life: 0.5, steps: mkSt(4, [uNow - 1, uNow - 1, uNow - 1]) }, uNow),
    'steps: done count is taken at the event time'
  );
  ok(stepsDoneBy({ steps: mkSt(3, [5, 9]) }, 7) === 1 && stepsDoneBy({}, 7) === 0, 'steps: stepsDoneBy');
  ok(
    !isUrgent({ dl: uNow + 7 * D, life: 0.6, done: 1, steps: mkSt(6, []) }, uNow) &&
      !isUrgent({ dl: uNow + 7 * D, life: 0.9, steps: [] }, uNow),
    'steps: finished or step-less tasks never pace-urgent'
  );

  /* steps: the bar. title, deadline / step / step */
  const sp = splitBar('hm one-pager, fri / outline / draft'),
    pd = parseDeadline(sp.dls, now);
  ok(
    sp.title === 'hm one-pager' &&
      sp.steps.length === 2 &&
      sp.steps[0] === 'outline' &&
      sp.steps[1] === 'draft' &&
      pd.ok &&
      pd.date.getTime() === at(2026, 11, 13, 23, 59),
    'bar: "hm one-pager, fri / outline / draft" = 2 steps'
  );
  const sx = splitBar('x, 20/11');
  ok(
    sx.steps.length === 0 &&
      sx.title === 'x' &&
      parseDeadline(sx.dls, now).ok &&
      parseDeadline(sx.dls, now).date.getTime() === at(2026, 11, 20, 23, 59),
    'bar: "x, 20/11" = 0 steps and 20 Nov'
  );
  ok(
    splitBar('x, fri 18:00 / a 20/11 / b').steps.join('|') === 'a 20/11|b' &&
      splitBar('a, b, fri / c, d').title === 'a, b' &&
      splitBar('a, b, fri / c, d').steps[0] === 'c, d',
    'bar: commas in steps and titles'
  );
  ok(
    splitBar('a / b, fri').steps.length === 0 &&
      splitBar('a / b, fri').title === 'a / b' &&
      splitBar('x, fri /').steps.length === 0 &&
      splitBar('x, fri /').dls.trim() === 'fri',
    'bar: a slash in the title or a trailing slash makes no steps'
  );
  ok(
    splitBar('x, fri / a !').big && splitBar('x, fri / a !').steps.join() === 'a' && splitBar('no deadline yet').steps.length === 0,
    'bar: ! still makes it big'
  );
  const bgE = splitBar('make a course, today !'),
    bgL = splitBar('! make a course, today'),
    bgN = splitBar('!make a course, today'),
    bgP = splitBar('make a course, today');
  ok(
    bgE.big === true &&
      bgE.title === 'make a course' &&
      bgL.big === true &&
      bgL.title === 'make a course' &&
      bgL.dls.trim() === 'today' &&
      bgN.big === true &&
      bgN.title === 'make a course' &&
      bgP.big === false,
    'bar: ! at the start or the end makes it big and leaves the title'
  );
  const bgS = splitBar('! x, fri / a / b');
  ok(
    bgS.big &&
      bgS.title === 'x' &&
      bgS.steps.join() === 'a,b' &&
      splitBar('!').title === '' &&
      barKind('! learn x', 5) === 'thought' &&
      barKind('! make a course, today', now.getTime()) === 'task' &&
      splitBar('wow! x, fri').big === false,
    'bar: leading ! with steps, a lone !, a ! inside a word'
  );
  ok(
    parseWhen('! fri', now.getTime()).big === true &&
      parseWhen('fri !', now.getTime()).big === true &&
      parseWhen('!fri', now.getTime()).big === true &&
      parseWhen('fri', now.getTime()).big === false &&
      parseWhen('! fri / a', now.getTime()).steps.join() === 'a',
    'when: ! at the start or the end'
  );
  const bigTh = newThought('learn x', null, 5, 'b1', 0, true),
    smTh = newThought('learn x', null, 5, 'b2', 0, false);
  ok(
    bigTh.big === 1 &&
      !('big' in smTh) &&
      sanitize({ version: 1, tasks: [], thoughts: [bigTh, smTh] })
        .thoughts.map(t => t.big || 0)
        .join() === '1,0',
    'thought: big survives the store, absent when not big'
  );
  const bigTask = {
    id: 'bg',
    title: 'make a course',
    createdAt: nowMs - D,
    deadline: nowMs + D,
    big: 1,
    x: 0.2,
    y: 0.3,
    doneAt: null,
    link: null,
    week: null,
    steps: []
  };
  const bigRt = sanitize(JSON.parse(JSON.stringify({ version: 1, tasks: [bigTask, Object.assign({}, bigTask, { id: 'sm', big: 0 })] })));
  ok(bigRt.tasks[0].big === 1 && bigRt.tasks[1].big === 0, 'store: big round-trips through save and sanitize');
  ok(
    R({ big: 1 }) === SIZE.starRBig &&
      R({ big: 0 }) === 3 &&
      CORE({ big: 1 }) === SIZE.starCoreBig &&
      CORE({ big: 0 }) === 1 &&
      SIZE.starRBig === 7 &&
      SPR[1].n > SPR[0].n &&
      Math.max(...SPR[1].I) === 7 &&
      Math.max(...SPR[0].I) === 3 &&
      SPR[1].CH.every(c => c <= 7) &&
      SPR[1].DD.filter(d => d === -1).length === 4,
    'star: big is 7 grains (normal 3), the sprite follows the tokens'
  );

  /* steps: loading an old store (golden fixture): tasks saved before steps existed load with steps: [] and lose nothing */
  const OLD =
    '{"version":1,"tasks":[{"id":"t1","title":"read ch. 7","createdAt":1783000000000,"deadline":1784000000000,"big":1,"x":0.2,"y":0.3,"doneAt":null,"link":null,"week":null},' +
    '{"id":"t2","title":"dp set","createdAt":1783000000000,"deadline":1783500000000,"big":0,"x":0.6,"y":0.5,"doneAt":1783400000000,"link":"t1","week":"2026-W45"}],' +
    '"weeks":{"2026-W45":{"seed":5,"archivedAt":3}},"lastSeenWeek":"2026-W46","prefs":{"reducedMotion":"on"}}';
  const oldRaw = JSON.parse(OLD),
    loadedOld = sanitize(oldRaw);
  ok(
    loadedOld && loadedOld.tasks.length === 2 && loadedOld.tasks.every(t => Array.isArray(t.steps) && t.steps.length === 0),
    'golden: old store loads with steps: []'
  );
  ok(
    deepEq(
      loadedOld.tasks.map(t => {
        const c = Object.assign({}, t);
        delete c.steps;
        return c;
      }),
      oldRaw.tasks
    ) &&
      deepEq(loadedOld.weeks, oldRaw.weeks) &&
      loadedOld.lastSeenWeek === '2026-W46' &&
      loadedOld.prefs.reducedMotion === 'on',
    'golden: old store loses nothing'
  );
  const withSteps = {
    version: 1,
    tasks: [
      Object.assign({}, oldRaw.tasks[0], {
        steps: [
          { id: 'a', text: 'outline', doneAt: 5 },
          { id: 'b', text: '  ', doneAt: null },
          { id: 'c', text: 'draft', doneAt: 'x' },
          null,
          { id: 'a', text: 'dup', doneAt: null }
        ]
      })
    ],
    weeks: {},
    lastSeenWeek: null,
    prefs: {}
  };
  const ws = sanitize(withSteps).tasks[0].steps;
  ok(
    ws.length === 3 && ws[0].doneAt === 5 && ws[1].doneAt === null && ws[1].text === 'draft' && ws[2].text === 'dup' && ws[2].id !== 'a',
    'store: junk steps are dropped, the task survives, ids stay unique'
  );
  const ws1 = sanitize(withSteps);
  ok(deepEq(sanitize(JSON.parse(JSON.stringify(ws1))), ws1), 'store: steps round-trip');
  ok(
    sanitize({
      version: 1,
      tasks: [
        Object.assign({}, oldRaw.tasks[0], { steps: Array.from({ length: 30 }, (_, k) => ({ id: 'q' + k, text: 's' + k, doneAt: null })) })
      ]
    }).tasks[0].steps.length === 20,
    'store: at most 20 steps per task'
  );
  /* steps: the list scrolls (no '+k more' row), a move over 8 px is a drag and not a tap */
  ok(!isDrag(0, 8) && !isDrag(5, 6) && isDrag(0, 8.5) && isDrag(9, 0) && !isDrag(0, 0), 'steps: drag threshold is 8 px');
  ok(clampScroll(-3, 40) === 0 && clampScroll(55, 40) === 40 && clampScroll(12, 40) === 12, 'steps: scroll clamps to the content');
  const lr = stepRows({ id: 'zz', n: 'zz', steps: Array.from({ length: 9 }, (_, k) => ({ id: 'w' + k, text: 'row ' + k, doneAt: null })) });
  ok(
    lr.length === 9 && !lr.some(r => r.k === 'more') && lr.filter(r => r.num > 0).length === 5,
    'steps: every open row is listed, no +k more row, keys 1-5 only on the first five'
  );

  /* morning M0: local week boundary, due rule, presence rule, store fields, clock resync */
  ok(
    isoWeekKey(at(2026, 11, 15, 23, 59)) === '2026-W46' && isoWeekKey(at(2026, 11, 16, 0, 0)) === '2026-W47',
    'week: a new week starts at local Monday 00:00'
  );
  ok(
    isoWeekKey(at(2027, 1, 3, 23, 59)) === '2026-W53' && isoWeekKey(at(2027, 1, 4, 0, 0)) === '2027-W01',
    'week: local year boundary W53 -> W01'
  );
  const t47 = at(2026, 11, 16, 9, 0);
  ok(nextDue(null, t47, null) === null, 'due: first use has no morning');
  ok(nextDue('2026-W46', t47, null) === '2026-W46', 'due: a new week makes the last week due');
  ok(nextDue('2026-W47', t47, '2026-W46') === '2026-W46', 'due: survives a reload in the same week');
  ok(nextDue('2026-W47', t47, null) === null, 'due: same week, nothing due');
  ok(nextDue('2026-W43', t47, null) === '2026-W46', 'due: away for weeks, the most recent finished week is due');
  ok(nextDue('2026-W45', t47, '2026-W44') === '2026-W46', 'due: a newer week replaces an unseen older one');
  ok(nextDue('2026-W48', t47, null) === null, 'due: a clock that went back makes nothing due');
  ok(nextDue('2026-W53', at(2027, 1, 4, 9, 0), null) === '2026-W53', 'due: year boundary');
  const pr = { due: '2026-W46', visible: true, focused: true, busy: false, barText: false, sinceInput: 5000, sinceShown: 60000 };
  ok(shouldStartMorning(pr), 'presence: idle and present starts the morning');
  ok(
    [{ due: null }, { visible: false }, { focused: false }, { busy: true }, { barText: true }].every(
      d => !shouldStartMorning(Object.assign({}, pr, d))
    ),
    'presence: not due, hidden, unfocused, busy or typing never starts'
  );
  ok(!shouldStartMorning(Object.assign({}, pr, { sinceInput: 500 })), 'presence: never interrupts an action in progress');
  ok(shouldStartMorning(Object.assign({}, pr, { sinceInput: 500, sinceShown: 1000 })), 'presence: starts right after the page is shown');
  ok(
    shouldStartMorning(Object.assign({}, pr, { sinceInput: 1500 })) &&
      shouldStartMorning(Object.assign({}, pr, { sinceInput: 0, sinceShown: 2000 })),
    'presence: boundaries are inclusive'
  );
  ok(
    sanitize({ version: 1, tasks: [], morningDue: '2026-W46' }).morningDue === '2026-W46' &&
      [42, 'soon', '2026-46', undefined, null].every(v => sanitize({ version: 1, tasks: [], morningDue: v }).morningDue === null),
    'store: morningDue keeps only a week key'
  );
  const wk = sanitize({
    version: 1,
    tasks: [],
    weeks: {
      '2026-W45': { seed: 5, archivedAt: 3, name: '  moving day  ', summary: { done: 7, missed: 2, carried: 3, steps: 12 } },
      '2026-W44': { seed: 4, archivedAt: 2, name: 7, summary: { done: -1, missed: 0, carried: 0, steps: 0 } },
      '2026-W43': { seed: 3, archivedAt: 1, name: 'x'.repeat(40), summary: { done: 1, missed: 0, carried: 0 } }
    }
  });
  const w45 = wk.weeks['2026-W45'],
    w44 = wk.weeks['2026-W44'],
    w43 = wk.weeks['2026-W43'];
  ok(
    w45.name === 'moving day' &&
      deepEq(w45.summary, { done: 7, missed: 2, carried: 3, steps: 12 }) &&
      w45.seed === 5 &&
      !('name' in w44) &&
      !('summary' in w44) &&
      w44.seed === 4 &&
      w43.name.length === 32 &&
      !('summary' in w43),
    'store: week name and summary are checked, bad ones dropped'
  );
  ok(deepEq(sanitize(JSON.parse(JSON.stringify(wk))), wk), 'store: week name and summary round-trip');
  const cb0 = clockBase;
  setClockBase(1e12 - T * 1000);
  const rs1 = resyncClock(1e12 + 60000),
    w1 = wall(T),
    rs2 = resyncClock(1e12 + 61000);
  setClockBase(cb0);
  ok(rs1 && Math.abs(w1 - (1e12 + 60000)) < 1 && !rs2, 'clock: resync after a 60 s gap, not within 2 s');
  /* smart frame cap: pace() */
  const runPace = (st, ms, work, frames, lateEvery = 0) => {
    for (let i = 0; i < frames; i++) st = pace(st, lateEvery && i % lateEvery === lateEvery - 1 ? ms * 2 : ms, work);
    return st;
  };
  ok(!runPace(PACE0, 16.7, 40, 600).capped, 'pace: a 60 Hz display never caps, however slow');
  ok(!runPace(PACE0, 8.33, 2, 600).capped, 'pace: 120 Hz with light work stays uncapped');
  const pcap = runPace(PACE0, 8.33, 12, FRAMECAP.window + 5);
  ok(pcap.capped, 'pace: 120 Hz with heavy work caps within the window');
  ok(runPace(PACE0, 8.33, 2, 400, 3).capped, 'pace: late frames alone cap');
  const p1 = pace(runPace(PACE0, 8.33, 2, 200), 8.33, 60);
  ok(!p1.capped && !pace(p1, 60, 2).capped, 'pace: a single slow frame does not flip it');
  const pc1 = runPace(pcap, 8.33, 2, Math.floor(FRAMECAP.calmMs / 8.33) - 40);
  ok(pc1.capped, 'pace: calm for less than calmMs stays capped');
  ok(!runPace(pcap, 8.33, 2, Math.ceil(FRAMECAP.calmMs / 8.33) + 120).capped, 'pace: calm for calmMs uncaps');
  ok(runPace(pcap, 8.33, 12, 2000).capped, 'pace: stays capped while the work stays heavy');

  /* morning M5: every season has every field the drawing reads, its species have colours and labels, its life kinds have odds */
  {
    const S = MORNING.seasons,
      names = ['autumn', 'summer', 'spring', 'winter'],
      num = ['sunY', 'snow', 'bladeH', 'patchy', 'roll', 'mist', 'mistDy', 'glint', 'dew', 'blossom', 'sunR', 'halo'];
    const col = c => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite);
    ok(
      names.every(n => {
        const s = S[n];
        return (
          s &&
          s.sky.length === 3 &&
          s.sky.every(col) &&
          s.grass.length === 4 &&
          s.grass.every(col) &&
          col(s.stem) &&
          s.foliage.length === 4 &&
          s.foliage.every(col) &&
          num.every(f => Number.isFinite(s[f])) &&
          s.species.length > 0 &&
          s.species.every(sp => MORNING.flowers[sp] && MORNING.label[sp]) &&
          Array.isArray(MORNING.life.kinds[n]) &&
          MORNING.life.kinds[n].every(kd => MORNING.life.p[kd] > 0 && Number.isFinite(MORNING.life.salt[kd]))
        );
      }) && Object.keys(S).length === names.length,
      'morning: every season has every field the drawing reads'
    );
  }
  /* morning M1: season, summary, lines, flower list */
  ok(
    Array.from({ length: 12 }, (_, m) => seasonOf(new Date(2026, m, 15, 12).getTime())).join() ===
      'winter,winter,spring,spring,spring,summer,summer,summer,autumn,autumn,autumn,winter',
    'morning: season by month'
  );
  const W = new Date(2026, 10, 2, 0, 0).getTime(),
    Dm = 864e5,
    nowM = W + 15 * Dm; // Mon 2 Nov 2026 = start of 2026-W45; now = Tue 17 Nov (W47)
  const mst = (k, d) => Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, text: 's' + i, doneAt: i < d ? W + Dm : null }));
  const mt = (id, o) =>
    Object.assign(
      {
        id,
        title: id,
        createdAt: W - 8 * Dm,
        deadline: W + 5 * Dm,
        big: 0,
        x: 0.5,
        y: 0.4,
        doneAt: null,
        link: null,
        week: null,
        steps: []
      },
      o
    );
  const MT = [
    mt('a', { doneAt: W + 2 * Dm, week: '2026-W45', x: 0.5, y: 0.3, steps: mst(10, 2) }),
    mt('b', { doneAt: W + 1 * Dm, week: '2026-W45', x: 0.501, y: 0.2 }),
    mt('c', { doneAt: W + 3 * Dm, week: '2026-W45', x: 0.9, steps: mst(10, 9) }),
    mt('m', { week: '2026-W45' }),
    mt('o', { doneAt: W - 3 * Dm, week: '2026-W44' }),
    mt('l', { x: 0.2, deadline: nowM + Dm }),
    mt('f', { createdAt: W + 9 * Dm, deadline: nowM + Dm })
  ];
  ok(deepEq(weekSummary(MT, '2026-W45', nowM), { done: 3, missed: 1, carried: 1, steps: 11, tags: { '': 3 } }), 'morning: week summary');
  const WT = [
    mt('a', { doneAt: W + Dm, week: '2026-W45', tag: 'study' }),
    mt('b', { doneAt: W + Dm, week: '2026-W45', tag: 'work' }),
    mt('c', { doneAt: W + Dm, week: '2026-W45' }),
    mt('d', { doneAt: W + Dm, week: '2026-W45', tag: 'study' })
  ];
  ok(deepEq(weekSummary(WT, '2026-W45', nowM).tags, { study: 2, work: 1, '': 1 }), 'morning: done tasks counted by tag, untagged as empty');
  const FL = flowerList(MT, '2026-W45', nowM, 0.05);
  ok(
    FL.map(f => f.id).join() === 'b,a,c,l' && FL.map(f => f.bud).join() === 'false,false,false,true',
    'morning: flowers by doneAt, then buds; missed and other weeks left out'
  );
  const fa = FL.find(f => f.id === 'a');
  ok(
    FL.map(f => f.petals).join() === '0,4,8,0' && Math.abs(fa.depth - 0.7) < 1e-9 && FL[0].pick === FL[0].pick >>> 0,
    'morning: petals from steps, depth from y, a stable pick'
  );
  ok(
    FL.every(f => f.x >= 0 && f.x <= 1) &&
      FL.slice()
        .sort((p, q) => p.x - q.x)
        .every((f, i, s) => i === 0 || f.x - s[i - 1].x >= 0.05 - 1e-9),
    'morning: stems pushed at least minGap apart'
  );
  ok(
    summaryLines({ done: 3, missed: 1, carried: 1, steps: 11 }, '2026-W45').join('|') ===
      'week 45|3 done · 1 missed · 1 carry over|11 steps',
    'morning: summary line'
  );
  ok(summaryLines({ done: 0, missed: 0, carried: 0, steps: 0 }, '2026-W45').join('|') === 'week 45|a quiet week', 'morning: a quiet week');
  ok(
    summaryLines({ done: 0, missed: 2, carried: 3, steps: 0 }, '2026-W45').join('|') ===
      'week 45|nothing finished · 2 missed · 3 carry over',
    'morning: nothing finished'
  );
  ok(
    summaryLines({ done: 7, missed: 0, carried: 0, steps: 1 }, '2026-W45', 'moving day').join('|') === 'week 45 · moving day|7 done|1 step',
    'morning: name and one step'
  );
  ok(summaryLines({ done: 7, missed: 0, carried: 0, steps: 4 }, '2026-W45', '', 3).join('|') === 'week 45|3 weeks away', 'morning: away');
  const TL = t => summaryLines({ done: 5, missed: 0, carried: 0, steps: 0, tags: t }, '2026-W45').join('|');
  ok(TL({ study: 3, work: 2 }) === 'week 45|5 done|study 3 · work 2', 'morning: a tag line for two tags');
  ok(TL({ study: 1, work: 3, '': 2 }) === 'week 45|5 done|work 3 · study 1 · other 2', 'morning: untagged is other, last');
  ok(TL({ a: 6, b: 5, c: 4, d: 3, e: 2, '': 1 }) === 'week 45|5 done|a 6 · b 5 · c 4 · d 3 · +2', 'morning: at most four tags, then +N');
  ok(
    TL({ study: 4 }) === 'week 45|5 done' &&
      summaryLines({ done: 5, missed: 0, carried: 0, steps: 0, tags: { study: 3, work: 2 } }, '2026-W45', '', 3).join('|') ===
        'week 45|3 weeks away',
    'morning: one tag or an away week has no tag line'
  );

  /* morning M2: the timeline, the controls, reduced motion, name or task, week entries */
  const ms0 = morningState(0, [], false);
  ok(
    ms0.phase === 'night' && ms0.dayK === 0 && ms0.labelsK === 1 && ms0.bgStarsK === 1 && ms0.sunY === 0 && textK(ms0, 0) === 0,
    'morning: starts as the whole night'
  );
  const ms1 = morningState(1000, [], false);
  ok(ms1.phase === 'night' && ms1.labelsK === 0 && Math.abs(ms1.doneBoost - 1.15) < 1e-9, 'morning: labels out, done stars +15% by 1000');
  const ms3 = morningState(3000, [], false);
  ok(
    ms3.phase === 'rise' &&
      ms3.specialsK === 0 &&
      ms3.missedK === 0 &&
      Math.abs(ms3.bgStarsK - 0.5) < 1e-9 &&
      ms3.sunY === 0 &&
      ms3.doneK === 1,
    'morning: mid sunrise'
  );
  const ms75 = morningState(7500, [], false),
    bl = bloom(ms75, 6, 7);
  ok(
    ms75.phase === 'hold' &&
      ms75.dayK === 1 &&
      ms75.sunY === 1 &&
      ms75.landColorK === 1 &&
      ms75.budK === 1 &&
      ms75.doneK === 0 &&
      ms75.gapK === 1 &&
      textK(ms75, 0) === 0 &&
      bl.stem === 1 &&
      bl.head === 1,
    'morning: the hold, every flower open'
  );
  const b57 = bloom(morningState(5700, [], false), 0, 7);
  ok(
    Math.abs(b57.stem - 0.5) < 1e-9 && b57.head === 0 && bloom(morningState(9000, [], false), 29, 30).head === 1,
    'morning: stems grow first; 30 flowers are open by the hold'
  );
  ok(textK(morningState(HOLD_END, [], false), 5) === 1 && textK(morningState(7700, [], false), 1) === 0, 'morning: text rows 200 ms apart');
  const adv = [{ op: 'advance', ms: 2000 }];
  ok(
    morningState(1999, adv, false).r === 1999 &&
      morningState(2400, adv, false).phase === 'hold' &&
      morningState(2400, adv, false).dayK === 1 &&
      Math.abs(riseAt(2200, 2000) - 4750) < 1e-9,
    'morning: advance fast-forwards the sunrise in 400 ms'
  );
  ok(
    JSON.stringify(morningState(9000, [{ op: 'advance', ms: 8000 }], false)) === JSON.stringify(morningState(9000, [], false)) &&
      JSON.stringify(morningState(5000, [{ op: 'cut', ms: 3000 }], false)) === JSON.stringify(morningState(5000, [], false)),
    'morning: advance in the hold and cut before a leave do nothing'
  );
  const lv = [{ op: 'leave', ms: 9000 }];
  ok(
    morningState(9000, lv, false).phase === 'set' &&
      textK(morningState(9000, lv, false), 0) === 1 &&
      textK(morningState(9600, lv, false), 0) === 0,
    'morning: text out 600 ms after the leave'
  );
  ok(
    Math.abs(morningState(13500, lv, false).sunY - 0.5) < 1e-9 &&
      morningState(15000, lv, false).dayK === 0 &&
      morningState(17500, lv, false).newStarsK === 1 &&
      morningState(18500, lv, false).weekLabelK === 1,
    'morning: sunset, new night, week label'
  );
  ok(
    morningState(19499, lv, false).phase === 'set' && morningState(19500, lv, false).phase === 'end',
    'morning: ends 10500 ms after the leave'
  );
  ok(
    Math.abs(morningState(9900, [{ op: 'leave', ms: 9000, named: true }], false).nameK - 0.5) < 1e-9 &&
      morningState(9900, lv, false).nameK === 0,
    'morning: a typed name stays until 1200'
  );
  const cl = morningState(11000, lv, false);
  ok(
    bloom(cl, 6, 7).head === 0 && bloom(cl, 0, 7).head === 1 && bloom(cl, 6, 7).stem === 1,
    'morning: heads close in reverse order, stems stay'
  );
  const early = morningState(3000, [{ op: 'leave', ms: 3000 }], false);
  ok(
    early.phase === 'set' && early.sunY === 0 && bloom(early, 0, 7).head === 0 && early.dayK < 0.2,
    'morning: a leave during the sunrise starts the sunset from there'
  );
  const cut = [
    { op: 'leave', ms: 9000 },
    { op: 'cut', ms: 10000 }
  ];
  ok(
    morningState(10300, cut, false).phase === 'set' &&
      morningState(10300, cut, false).weekLabelK === 0 &&
      morningState(10600, cut, false).phase === 'end',
    'morning: a cut ends the sunset 600 ms later'
  );
  const rd4 = morningState(400, [], true);
  ok(
    rd4.phase === 'rise' &&
      Math.abs(rd4.dayK - 0.5) < 1e-9 &&
      rd4.bgStarsK === 1 &&
      rd4.sunY === 1 &&
      Math.abs(textK(rd4, 0) - 0.5) < 1e-9 &&
      Math.abs(textK(rd4, 5) - 0.5) < 1e-9 &&
      morningState(800, [], true).phase === 'hold',
    'morning: reduced motion rises as one 800 ms crossfade'
  );
  const rl = [{ op: 'leave', ms: 1000 }];
  ok(
    Math.abs(morningState(1400, rl, true).dayK - 0.5) < 1e-9 &&
      morningState(1400, rl, true).newStarsK === 1 &&
      morningState(1950, rl, true).weekLabelK === 1 &&
      morningState(3300, rl, true).phase === 'end',
    'morning: reduced motion sets as a crossfade, then week N'
  );
  ok(
    JSON.stringify(morningState(12345, lv, false)) === JSON.stringify(morningState(12345, lv, false)) &&
      morningControls([
        { op: 'leave', ms: 5 },
        { op: 'leave', ms: 9 }
      ]).leave === 5,
    'morning: pure; the first leave counts'
  );
  const nowE = new Date(2026, 10, 16, 9, 0).getTime(); // Mon 16 Nov 2026 09:00
  ok(
    morningEnter('', nowE).kind === 'none' && morningEnter('   ', nowE).kind === 'none' && morningEnter('/motion off', nowE).kind === 'cmd',
    'morning enter: empty and commands'
  );
  ok(
    morningEnter('essay, fri', nowE).kind === 'task' && morningEnter('  essay, fri  ', nowE).kind === 'task',
    'morning enter: a deadline makes a task'
  );
  ok(
    morningEnter('moving day', nowE).name === 'moving day' &&
      morningEnter('slow, quiet', nowE).name === 'slow, quiet' &&
      morningEnter('x'.repeat(40), nowE).name.length === 32,
    'morning enter: anything else names the week'
  );
  const wE = { seed: 5, archivedAt: 1 },
    S1 = { done: 1, missed: 0, carried: 2, steps: 3 };
  ok(
    JSON.stringify(withSummary(wE, S1)) === JSON.stringify({ seed: 5, archivedAt: 1, summary: S1 }) &&
      !wE.summary &&
      withSummary({ seed: 5, summary: S1 }, { done: 9, missed: 9, carried: 9, steps: 9 }).summary.done === 1 &&
      withSummary(undefined, S1).summary.carried === 2,
    'week entry: the summary is written once'
  );
  ok(
    withName({ seed: 5, name: 'a' }, '  b  ').name === 'b' &&
      !('name' in withName({ seed: 5, name: 'a' }, '   ')) &&
      cleanName(' ' + 'y'.repeat(40)).length === 32,
    'week entry: name'
  );

  /* morning M3: lines, title, away */
  ok(
    QUOTES.length === 52 &&
      QUOTES.every(q => typeof q === 'string' && q.length > 0 && q.length <= 90 && q === q.toLowerCase()) &&
      new Set(QUOTES).size === 52,
    'quotes: 52 unique lowercase lines, at most 90 characters'
  );
  ok(
    quoteFor('2026-W01') === 'begin where you are.' &&
      quoteFor('2026-W53') === QUOTES[51] &&
      quoteFor('2026-W52') === QUOTES[51] &&
      quoteFor('bad') === QUOTES[0],
    'quotes: by ISO week, 53 reuses 52'
  );
  ok(weekTitle('2026-W46') === 'week 46' && weekTitle('2026-W46', 'moving day') === 'week 46 · moving day', 'week title');
  const tA = new Date(2026, 10, 16, 9, 0).getTime(); // Mon 16 Nov 2026 = 2026-W47
  ok(
    nextAway('2026-W46', tA, 0) === 1 &&
      nextAway('2026-W44', tA, 0) === 3 &&
      nextAway('2026-W47', tA, 3) === 3 &&
      nextAway(null, tA, 0) === 0,
    'away: weeks since the last seen week; same week keeps it'
  );
  ok(
    sanitize({ version: 1, tasks: [], morningAway: 3 }).morningAway === 3 &&
      [-1, 1.5, 'x', 999, undefined].every(v => sanitize({ version: 1, tasks: [], morningAway: v }).morningAway === 0),
    'store: morningAway is a small whole number'
  );
  ok(
    summaryLines({ done: 2, missed: 0, carried: 0, steps: 0 }, '2026-W46', '', 3).join('|') === 'week 46|3 weeks away' &&
      summaryLines({ done: 2, missed: 0, carried: 0, steps: 0 }, '2026-W46', '', 1).join('|') === 'week 46|2 done',
    'summary: away from 2 weeks only'
  );

  /* morning M4: the flower label */
  const wed = new Date(2026, 10, 18, 12).getTime(); // Wed 18 Nov 2026
  {
    const a = flowerLabel({ title: 'essay', doneAt: wed, bud: false });
    ok(a.title === 'essay' && a.sub === 'finished wed', 'flower label: title, and the day it was finished');
  }
  {
    const a = flowerLabel({ title: 'essay', doneAt: wed, bud: false, nSteps: 6, nDone: 4 });
    ok(a.sub === 'finished wed · 4 of 6 steps', 'flower label: the steps done of all when the task had steps');
  }
  ok(
    flowerLabel({ title: 'carry 0', doneAt: null, bud: true }).sub === 'carries over' &&
      flowerLabel({ title: 'carry 0', doneAt: wed, bud: true }).title === 'carry 0',
    'flower label: a bud says it carries over'
  );
  ok(
    flowerLabel({ title: 'x'.repeat(40), doneAt: wed, bud: false }).title === 'x'.repeat(27) + '…',
    'flower label: a long title is cut to 28 characters'
  );
  {
    const g = enterGate(350);
    ok(g(1000) && !g(1100) && !g(1349) && g(1400) && g(2000), 'enter gate: one Enter through per window, later ones pass');
  }

  /* thoughts: the tag, the bar kind, the "when?" answer */
  const tg1 = extractTag('essay #Study, fri'),
    tg2 = extractTag('a #toolongtagnameeeee'),
    tg3 = extractTag('#x thought');
  ok(tg1.text === 'essay, fri' && tg1.tag === 'study', 'tag: "essay #Study, fri" -> "essay, fri", study');
  ok(tg2.tag === null && tg2.text === 'a #toolongtagnameeeee', 'tag: more than 16 chars is no tag');
  ok(tg3.tag === 'x' && tg3.text === 'thought', 'tag: at the start of the text');
  const nw = now.getTime();
  ok(barKind('', nw) === 'empty' && barKind('/help', nw) === 'cmd', 'bar kind: empty and command');
  ok(
    barKind('essay, fri', nw) === 'task' &&
      barKind('learn the pumping lemma', nw) === 'thought' &&
      barKind('essay,', nw) === 'thought' &&
      barKind('x #study', nw) === 'thought',
    'bar kind: task, thought, trailing comma, tag only'
  );
  ok(barKind('essay, blah', nw) === 'bad' && barKind('x, today 9', nw) === 'bad', 'bar kind: unreadable and past are bad');
  const pw0 = parseWhen('', nw),
    pw1 = parseWhen('fri', nw),
    pw2 = parseWhen('fri / a / b !', nw);
  ok(pw0.kind === 'later' && pw1.kind === 'say' && pw1.date.getTime() === at(2026, 11, 13, 23, 59), 'when: empty is later, fri is say');
  ok(pw2.kind === 'say' && pw2.steps.join('|') === 'a|b' && pw2.big === true, 'when: steps and the trailing !');
  const pw3 = parseWhen('remind +2h', nw),
    pw4 = parseWhen('r tomorrow', nw);
  ok(
    pw3.kind === 'remind' &&
      pw3.date.getTime() === nw + 2 * 36e5 &&
      pw4.kind === 'remind' &&
      pw4.date.getTime() === at(2026, 11, 14, 23, 59),
    'when: remind and r'
  );
  ok(parseWhen('remind yesterday', nw).kind === 'bad' && parseWhen('blah', nw).kind === 'bad', 'when: bad deadlines stay bad');
  const th0 = newThought('  learn x  ', 'study', 5, 'i1');
  ok(th0.text === 'learn x' && th0.tag === 'study' && th0.createdAt === 5 && th0.saidAt === null && th0.step === 0, 'thought: the item');
  const ths = sanitize({
    version: 1,
    tasks: [],
    thoughts: [
      { id: 'p', text: '  learn x  ', tag: 'STUDY', createdAt: 5, step: 9, usedMs: 2 },
      { id: 'q', createdAt: 9 },
      { id: 'r', text: 'ok', tag: 'bad tag!', createdAt: 7, step: 3 }
    ]
  }).thoughts;
  ok(
    ths.length === 2 && ths[0].text === 'learn x' && ths[0].tag === 'study' && ths[0].step === 4,
    'thought: sanitize keeps a good one, clamps step, cleans the tag'
  );
  ok(
    ths[1].id === 'r' && ths[1].tag === null && ths[1].step === 3 && ths[1].saidAt === null,
    'thought: no tag becomes null, timestamps default to null'
  );
  const tagged = sanitize({ version: 1, tasks: [Object.assign({}, good.tasks[0], { tag: 'Study' })] }).tasks[0];
  ok(
    tagged.tag === 'study' && sanitize(JSON.parse(JSON.stringify({ version: 1, tasks: [tagged] }))).tasks[0].tag === 'study',
    'store: task.tag survives a round trip'
  );
  const hlist = Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i }));
  const hs = hazeSlots(hlist, 404),
    hs2 = hazeSlots(hlist, 404);
  ok(hs.length === 12 && hs.every(q => q.x >= 0 && q.x < 404), 'haze: 12 slots inside 404 grains');
  ok(
    hs.every((q, i) => hs.every((p, j) => i === j || Math.abs(q.x - p.x) >= THOUGHT.patchW)),
    'haze: no overlapping patches'
  );
  ok(JSON.stringify(hs.map(q => [q.id, q.x])) === JSON.stringify(hs2.map(q => [q.id, q.x])), 'haze: stable for the same ids');
  {
    const a = hazeSlots(hlist, 404),
      b = hazeSlots(
        hlist.filter(q => q.id !== 'h3' && q.id !== 'h7'),
        404
      ),
      c = hazeSlots(hlist.concat([{ id: 'hnew' }]), 404);
    ok(
      b.every(q => q.x === a.find(p => p.id === q.id).x),
      'haze: the others keep their slots when thoughts leave'
    );
    ok(
      c.filter(q => q.id !== 'hnew').every(q => q.x === a.find(p => p.id === q.id).x),
      'haze: a new thought moves no existing slot'
    );
  }
  {
    const l = [
        { id: 'a', saidAt: 5, taskId: 'T1', usedMs: 9 },
        { id: 'b', saidAt: null, taskId: null, usedMs: 0 }
      ],
      r = reviveSaid(l, 'T1');
    ok(
      r && r.id === 'a' && r.saidAt === null && r.taskId === null && reviveSaid(l, 'T1') === null && reviveSaid(l, null) === null,
      "undo of a said thought's star: the thought is haze again (saidAt, taskId cleared)"
    );
  }
  ok(
    ageText(nw - 36e5, nw) === 'today' &&
      ageText(nw - D, nw) === '1 day' &&
      ageText(nw - 3 * D, nw) === '3 days' &&
      ageText(nw - 14 * D, nw) === '2 weeks',
    'thought: age text'
  );
  const cc = { x0: 100, y0: 150, x1: 160, y1: 40, reduced: false },
    c0 = condenseState(cc, 0),
    c1 = condenseState(cc, THOUGHT.condenseMs),
    c9 = condenseState(cc, THOUGHT.condenseMs + THOUGHT.holdMs);
  ok(
    c0.scale === 1 && !c0.on && Math.abs(c1.px - 160) < 1e-6 && Math.abs(c1.py - 40) < 1e-6 && !c9.on,
    'condense: starts at the haze, lands on the star, ends'
  );
  ok(
    condenseMs(false) >= 900 &&
      condenseMs(false) <= 1300 &&
      condenseMs(true) === 250 &&
      condenseState({ ...cc, reduced: true }, 250).hazeA === 0,
    'condense: 900-1300 ms, 250 ms when reduced'
  );

  /* thoughts coming back (L2): the app-use clock, the calendar gaps, the gate, the picks and the outcomes */
  const tb = (id, o) =>
    Object.assign(
      {
        id,
        text: id,
        tag: null,
        createdAt: nw - 30 * D,
        saidAt: null,
        taskId: null,
        goneAt: null,
        remindAt: null,
        askedAt: null,
        askUse: 0,
        step: 0,
        usedMs: 0
      },
      o
    );
  const HU = 36e5,
    U2 = 2 * HU;
  ok(pickDue([tb('a')], nw, U2 - 1, 0) === null && pickDue([tb('a')], nw, U2, 0) === 'a', 'back: nothing before 2 h of use, due at 2 h');
  ok(
    pickDue([tb('a'), tb('b')], nw, U2 + HU - 1, U2) === null && pickDue([tb('a'), tb('b')], nw, U2 + HU, U2) === 'a',
    'back: at most one per hour of use (the oldest due)'
  );
  ok(pickDue([tb('r', { remindAt: nw - 1 })], nw, 0, 0) === 'r', 'back: a due reminder ignores the gate');
  ok(pickDue([tb('r1', { remindAt: nw - 100 }), tb('r2', { remindAt: nw - 200 })], nw, 0, 0) === 'r2', 'back: the earliest reminder wins');
  ok(pickDue([tb('a'), tb('b')], nw, 1e9, 0) === 'a', 'back: then the oldest createdAt');
  ok(
    pickDue([tb('s1', { step: 1, askedAt: nw - D })], nw, 1e9, 0) === 's1' &&
      pickDue([tb('s1', { step: 1, askedAt: nw - D + 1 })], nw, 1e9, 0) === null,
    'back: step 1 after 1 day'
  );
  ok(
    pickDue([tb('s2', { step: 2, askedAt: nw - 3 * D })], nw, 1e9, 0) === 's2' &&
      pickDue([tb('s2', { step: 2, askedAt: nw - 3 * D + 1 })], nw, 1e9, 0) === null,
    'back: step 2 after 3 days'
  );
  ok(
    pickDue([tb('s4', { step: 4, askedAt: nw - 14 * D })], nw, 1e9, 0) === 's4' &&
      pickDue([tb('s4', { step: 4, askedAt: nw - 14 * D + 1 })], nw, 1e9, 0) === null,
    'back: step 4 repeats every 14 days'
  );
  const aLast = tb('old', { step: 2, askedAt: nw - 5 * D }),
    bLast = tb('last', { step: 2, askedAt: nw - 3 * D });
  ok(
    pickDue([aLast, bLast], nw, 1e9, 0) === 'old' && pickDue([bLast], nw, 1e9, 0) === 'last',
    'back: never the last one asked while another is due'
  );
  ok(
    afterAsk(tb('x', { step: 0 }), nw, 0, 'later').step === 1 && afterAsk(tb('x', { step: 4 }), nw, 0, 'ignored').step === 4,
    'back: later and ignored advance the step, capped at 4'
  );
  const rem = afterAsk(tb('x', { step: 2, remindAt: nw + 5 }), nw, 0, 'remind');
  ok(
    rem.step === 2 && rem.remindAt === nw + 5 && rem.saidAt === null && rem.goneAt === null,
    'back: remind keeps the step and its remindAt'
  );
  ok(afterAsk(tb('x'), nw, 0, 'said').saidAt === nw && afterAsk(tb('x'), nw, 0, 'gone').goneAt === nw, 'back: said and gone end it');
  const us = sanitize({
    version: 1,
    tasks: [],
    useMs: 1234,
    lastAskUse: 99,
    thoughts: [{ id: 'x', text: 't', createdAt: 5, askedAt: 7, askUse: 3, step: 9, remindAt: 'x' }]
  });
  ok(
    us.useMs === 1234 &&
      us.lastAskUse === 99 &&
      us.thoughts[0].askedAt === 7 &&
      us.thoughts[0].askUse === 3 &&
      us.thoughts[0].step === 4 &&
      us.thoughts[0].remindAt === null,
    'store: useMs, lastAskUse and the thought ask fields survive'
  );
  const ub = sanitize({
    version: 1,
    tasks: [],
    useMs: -1,
    lastAskUse: 'x',
    thoughts: [{ id: 'y', text: 't', createdAt: 5, askedAt: 'x', askUse: -5 }]
  });
  ok(
    ub.useMs === 0 && ub.lastAskUse === 0 && ub.thoughts[0].askedAt === null && ub.thoughts[0].askUse === 0,
    'store: bad app-use values become defaults'
  );
  const okS = { morning: false, busy: false, barText: false, when: false, selected: false, visible: true, focused: true };
  ok(
    thoughtMayCome(okS) &&
      ['morning', 'busy', 'barText', 'when', 'selected'].every(k => !thoughtMayCome(Object.assign({}, okS, { [k]: true }))) &&
      !thoughtMayCome(Object.assign({}, okS, { visible: false })) &&
      !thoughtMayCome(Object.assign({}, okS, { focused: false })),
    'back: no coming back in the morning, while busy, typing, answering, or with a star selected'
  );
  const okP = { visible: true, focused: true, busy: false, barText: false, sinceInput: 5000, sinceShown: 99999 };
  ok(
    isPresent(okP) && !isPresent(Object.assign({}, okP, { barText: true })) && !isPresent(Object.assign({}, okP, { busy: true })),
    'presence: shared idle/shown rule; text or busy blocks it'
  );
  ok(
    thoughtDue(tb('d', { remindAt: nw }), nw, 0) && !thoughtDue(tb('d', { saidAt: nw - 1 }), nw, 1e9),
    'back: said thoughts are never due'
  );

  /* groups by tag (L3): same-tag links, the placement pull, the morning tag line, the snapshot */
  ok(
    sameTag('study', 'study') && !sameTag('study', 'work') && sameTag(null, undefined) && sameTag('', null),
    'tag: missing tags are the one untagged value'
  );
  const nd = [
    { gx: 10, gy: 10, done: 1, task: { tag: 'study' } },
    { gx: 13, gy: 10, done: 1, task: {} },
    { gx: 12, gy: 10, done: 0, task: { tag: 'study' } },
    { gx: 30, gy: 10, done: 1, task: { tag: 'work' } }
  ];
  ok(nearestDoneIn(nd, 2) === 0, 'tag: a tagged star links to the nearest done of its tag, not the closer untagged one');
  const nd2 = [
    { gx: 10, gy: 10, done: 1, task: { tag: 'study' } },
    { gx: 14, gy: 10, done: 0, task: {} },
    { gx: 20, gy: 10, done: 1, task: {} }
  ];
  ok(nearestDoneIn(nd2, 1) === 2, 'tag: an untagged star links only to untagged done stars');
  const nd3 = [
    { gx: 10, gy: 10, done: 1, task: { tag: 'study' } },
    { gx: 14, gy: 10, done: 0, task: { tag: 'work' } }
  ];
  ok(
    nearestDoneIn(nd3, 1) === null &&
      nearestDoneIn(
        [
          { gx: 0, gy: 0, done: 0, tag: 'x' },
          { gx: 5, gy: 0, done: 1, tag: 'x' }
        ],
        0
      ) === 1,
    'tag: no same-tag done is null; a dev star tag counts'
  );
  ok(
    starTag({ task: { tag: 'study' } }) === 'study' && starTag({ tag: 'work' }) === 'work' && starTag({}) === '',
    'tag: a task tag or a dev star tag'
  );
  ok(
    'sun 15 nov 19:00 · 10m' + tagSuffix('study') === 'sun 15 nov 19:00 · 10m · #study' &&
      tagSuffix('') === '' &&
      tagSuffix(undefined) === '',
    'tag: a full label line 2 carries the star tag, untagged adds nothing'
  );
  const cen = { gx: 100, gy: 100 },
    rad = PLACE.tagRadius * 404;
  ok(
    tagPullScore({ gx: 100 + rad - 2, gy: 100 }, cen, 404) === 0 &&
      tagPullScore({ gx: 100 + rad + 10, gy: 100 }, cen, 404) > 0 &&
      tagPullScore({ gx: 100 + rad + 20, gy: 100 }, cen, 404) > tagPullScore({ gx: 100 + rad + 10, gy: 100 }, cen, 404),
    'tag: the placement pull is 0 inside the radius and grows outside'
  );
  const wgt = sanitize({
    version: 1,
    tasks: [],
    weeks: { '2026-W45': { summary: { done: 1, missed: 0, carried: 0, steps: 0, tags: { study: 2, work: 1, '': 3 } } } }
  });
  ok(deepEq(wgt.weeks['2026-W45'].summary.tags, { study: 2, work: 1, '': 3 }), 'store: the week summary keeps its tags');
  const wbt = sanitize({
    version: 1,
    tasks: [],
    weeks: { '2026-W45': { summary: { done: 1, missed: 0, carried: 0, steps: 0, tags: { 'bad tag': 1 } } } }
  });
  const wbt2 = sanitize({
    version: 1,
    tasks: [],
    weeks: { '2026-W45': { summary: { done: 1, missed: 0, carried: 0, steps: 0, tags: { study: -1 } } } }
  });
  ok(
    !('tags' in wbt.weeks['2026-W45'].summary) && !('tags' in wbt2.weeks['2026-W45'].summary) && wbt.weeks['2026-W45'].summary.done === 1,
    'store: bad tag counts are dropped, the summary stays'
  );

  /* practices (L4a): day keys, the noon rule, toggles, the week, the ring, the line, rows, sanitize and the limit */
  ok(
    dayKey(new Date(2026, 10, 16, 23, 59).getTime()) === '2026-11-16' &&
      dayKey(new Date(2026, 10, 17, 0, 1).getTime()) === '2026-11-17' &&
      prevDayKey(new Date(2026, 10, 16, 0, 1).getTime()) === '2026-11-15',
    'practice: day keys across midnight'
  );
  const mon11 = new Date(2026, 10, 16, 11, 59).getTime(),
    mon12 = new Date(2026, 10, 16, 12, 0).getTime();
  const pp = { days: [] };
  ok(
    canMark(pp, '2026-11-16', mon11) &&
      canMark(pp, '2026-11-15', mon11) &&
      !canMark(pp, '2026-11-15', mon12) &&
      !canMark(pp, '2026-11-14', mon11) &&
      canMark(pp, '2026-11-16', mon12),
    'practice: today any time, yesterday until noon only'
  );
  const tgg = toggleDay({ id: 'p', days: ['2026-11-16'] }, '2026-11-18');
  ok(
    tgg.days.join() === '2026-11-16,2026-11-18' && toggleDay(tgg, '2026-11-16').days.join() === '2026-11-18',
    'practice: toggle adds and removes, sorted'
  );
  const pwed = new Date(2026, 10, 18, 12).getTime();
  const pw = { id: 'p', title: 'read', createdAt: new Date(2026, 10, 16, 12).getTime(), days: ['2026-11-16', '2026-11-18', '2026-11-22'] };
  ok(
    weekDots(pw, pwed).join() === 'true,false,true,false,false,false,true' && weekCount(pw, '2026-W47') === 3,
    'practice: week dots Monday..Sunday and the week count'
  );
  const r3 = ringWeeks(Object.assign({}, pw, { createdAt: new Date(2026, 10, 2, 12).getTime() }), pwed);
  ok(
    r3.length === 1 && r3[0].length === 3 && r3[0][2].key === '2026-W47' && Math.abs(r3[0][2].k - 3 / 7) < 1e-9,
    'practice: 3 weeks, current week included'
  );
  const start60 = new Date(2026, 10, 16, 12);
  start60.setDate(start60.getDate() - 58 * 7); // 60 weeks inclusive
  const r60 = ringWeeks(Object.assign({}, pw, { createdAt: start60.getTime() }), pwed);
  ok(r60.length === 2 && r60[0].length === 52 && r60[1].length === 8, 'practice: 60 weeks split into 52 + 8');
  ok(
    practiceLine(pw, '2026-W47') === 'read · 3 of 7' &&
      practiceLine({ title: 'x'.repeat(25) }, '2026-W47') === 'x'.repeat(19) + '… · 0 of 7',
    'practice: the line, title cut to 20'
  );
  ok(
    practiceRows(pw, mon11, true)
      .map(r => r.text)
      .join() === 'today,yesterday' &&
      practiceRows(pw, mon12, true)
        .map(r => r.text)
        .join() === 'today' &&
      practiceRows(pw, mon11, false)
        .map(r => r.text)
        .join() === 'yesterday' &&
      practiceRows(pw, mon12, false).length === 0,
    'practice: touch today + yesterday, desktop yesterday until noon'
  );
  const mk0 = markState(0, true, false),
    mk1 = markState(250, true, false),
    um = markState(0, false, false),
    mr = markState(75, true, true);
  ok(
    mk0.flash > 0.9 &&
      mk0.lift > 0.9 &&
      mk0.lit === 0 &&
      mk1.flash === 0 &&
      mk1.lit === 1 &&
      um.lift < -0.9 &&
      um.flash === 0 &&
      mr.flash === 0 &&
      mr.lift === 0 &&
      Math.abs(mr.lit - 0.5) < 1e-9,
    'practice choreo: a mark flashes and lifts, an unmark reverses, reduced motion is a plain 150 ms fade'
  );
  const sp0 = stopState(0, -1, false),
    sp1 = stopState(600, -1, false),
    su = stopState(0, 1, false),
    sr = stopState(75, -1, true);
  ok(
    sp0.p === 0 && sp1.p === 1 && su.p === 1 && stopState(600, 1, false).p === 0 && sr.p === 0 && Math.abs(sr.a - 0.5) < 1e-9,
    'practice choreo: the stop thins grain by grain in 600 ms, undo reverses, reduced fades'
  );
  ok(
    canCreate([{ archivedAt: null }], 5) &&
      !canCreate(
        Array.from({ length: 5 }, () => ({ archivedAt: null })),
        5
      ) &&
      canCreate([{ archivedAt: 1 }, { archivedAt: 1 }], 1),
    'practice: the limit counts live practices only'
  );
  const psan = sanitize({
    version: 1,
    tasks: [],
    prefs: { practiceLimit: 99 },
    practices: [
      {
        id: 'p1',
        title: ' read ',
        tag: 'Study',
        x: -1,
        y: 2,
        createdAt: 5,
        days: ['2026-11-16', '2026-02-30', '2026-11-16', '2026-11-18'],
        archivedAt: null
      }
    ]
  });
  ok(
    psan.practices.length === 1 &&
      psan.practices[0].title === 'read' &&
      psan.practices[0].tag === 'study' &&
      psan.practices[0].x === 0 &&
      psan.practices[0].y === 1 &&
      psan.practices[0].days.join() === '2026-11-16,2026-11-18' &&
      psan.prefs.practiceLimit === 20,
    'practice: sanitize keeps valid days, drops junk, clamps the limit'
  );
  ok(
    sanitize({ version: 1, tasks: [], prefs: { practiceLimit: 'x' } }).prefs.practiceLimit === PRACTICE.limit &&
      sanitize({ version: 1, tasks: [], prefs: { practiceLimit: 0 } }).prefs.practiceLimit === 1,
    'practice: a bad limit becomes the default, 0 clamps to 1'
  );
  const P2 = [
    { id: 'q', title: 'read', createdAt: 1, days: ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08'], archivedAt: null },
    { id: 'g', title: 'gym', createdAt: 1, days: [], archivedAt: null }
  ];
  const wpr = weekSummary([], '2026-W45', new Date(2026, 10, 9, 12).getTime(), P2);
  ok(
    wpr.practice.join('|') === 'read · 4 of 7|gym · 0 of 7' &&
      summaryLines(wpr, '2026-W45').slice(-2).join('|') === 'read · 4 of 7|gym · 0 of 7',
    'practice: the morning adds a line per live practice'
  );
  const P6 = Array.from({ length: 6 }, (_, i) => ({ id: 's' + i, title: 'p' + i, createdAt: 1, days: [], archivedAt: null }));
  const w6 = weekSummary([], '2026-W45', new Date(2026, 10, 9, 12).getTime(), P6);
  ok(
    w6.practice.length === 5 &&
      w6.practice[4].endsWith('+1 practices') &&
      summaryLines(w6, '2026-W45', '', 3).join('|') === 'week 45|3 weeks away',
    'practice: five lines then +N, none in an away week'
  );
  return { pass, fail, total: pass + fail, failed };
}
