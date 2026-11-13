/* dev/selftest.js — parser, formatting, week membership, archive and store round-trip. */
import { parseDeadline } from '../model/parser.js';
import { fmtLeft, isoWeekKey, isoWeekOf } from '../sky/clock.js';
import { inCurrentWeek, archivePast, taskWeekKey, ensureWeeks, nextWeekKey, previousWeekKey, decideRitual } from '../model/week.js';
import { sanitize } from '../model/store.js';

export function selfTest() {
  const now = new Date(2026, 10, 13, 21, 0, 0), at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).getTime(), D = 864e5;
  const cases = [
    ['today', at(2026, 11, 13, 23, 59)], ['tonight', at(2026, 11, 13, 23, 59)], ['tomorrow', at(2026, 11, 14, 23, 59)], ['TMR', at(2026, 11, 14, 23, 59)], ['  tomorrow 9  ', at(2026, 11, 14, 9, 0)], ['tmr 6:30pm', at(2026, 11, 14, 18, 30)],
    ['fri', at(2026, 11, 13, 23, 59)], ['Friday', at(2026, 11, 13, 23, 59)], ['fri 22:00', at(2026, 11, 13, 22, 0)], ['fri 18:00', at(2026, 11, 20, 18, 0)], ['sat', at(2026, 11, 14, 23, 59)], ['sun', at(2026, 11, 15, 23, 59)], ['mon', at(2026, 11, 16, 23, 59)],
    ['wed 9am', at(2026, 11, 18, 9, 0)], ['thurs', at(2026, 11, 19, 23, 59)], ['tue 18', at(2026, 11, 17, 18, 0)],
    ['nov 20', at(2026, 11, 20, 23, 59)], ['20 nov', at(2026, 11, 20, 23, 59)], ['20.11', at(2026, 11, 20, 23, 59)], ['2026-11-20', at(2026, 11, 20, 23, 59)], ['november 20 18:00', at(2026, 11, 20, 18, 0)], ['nov 13', at(2026, 11, 13, 23, 59)],
    ['nov 2', at(2027, 11, 2, 23, 59)], ['2 nov', at(2027, 11, 2, 23, 59)], ['2.11', at(2027, 11, 2, 23, 59)], ['2026-12-01 8', at(2026, 12, 1, 8, 0)], ['20.11 6pm', at(2026, 11, 20, 18, 0)],
    ['+3d', now.getTime() + 3 * D], ['+5h', now.getTime() + 5 * 36e5], ['+90m', now.getTime() + 90 * 6e4],
    ['sat 18', at(2026, 11, 14, 18, 0)], ['sat 6pm', at(2026, 11, 14, 18, 0)], ['sat 6:30pm', at(2026, 11, 14, 18, 30)], ['sat 12am', at(2026, 11, 14, 0, 0)], ['sat 12pm', at(2026, 11, 14, 12, 0)], ['nov 20 7:05', at(2026, 11, 20, 7, 5)], ['20 nov 18:00', at(2026, 11, 20, 18, 0)],
    ['', 'unreadable'], ['soon', 'unreadable'], ['fri 25:00', 'unreadable'], ['sat 13pm', 'unreadable'], ['nov 31', 'unreadable'], ['2026-02-30', 'unreadable'], ['18', 'unreadable'], ['sat 18:00 now', 'unreadable'], ['+3x', 'unreadable'], ['nov', 'unreadable'],
    ['today 9', 'past'], ['+0m', 'past'], ['2026-11-02', 'past'], ['today 21:00', 'past'], ['2026-11-13 20:59', 'past']
  ];
  let pass = 0, fail = 0; const failed = [];
  const ok = (cond, label) => { if (cond) pass++; else { fail++; failed.push(label); } };
  for (const [inp, exp] of cases) {
    const r = parseDeadline(inp, now);
    ok(typeof exp === 'number' ? (r.ok && r.date.getTime() === exp) : r.err === exp, 'parse ' + inp);
  }
  const fl = [[0, '<1m'], [59e3, '<1m'], [60e3, '1m'], [3599e3, '59m'], [3600e3, '1h'], [26.99 * 36e5, '26h'], [47.9 * 36e5, '47h'], [(2 * 24 + 2) * 36e5, '2d 02h'], [(6 * 24 + 2.99) * 36e5, '6d 02h']];
  for (const [ms, exp] of fl) ok(fmtLeft(ms) === exp, 'fmtLeft ' + ms);

  /* ISO weeks */
  ok(isoWeekKey(new Date(2026, 10, 9, 12)) === '2026-W46', 'iso week 46');
  ok(isoWeekKey(new Date(2026, 10, 14, 12)) === '2026-W46', 'iso week saturday');
  ok(nextWeekKey('2026-W46') === '2026-W47', 'next week');
  ok(previousWeekKey('2026-W47') === '2026-W46', 'previous week');
  ok(isoWeekOf(Date.UTC(2026, 0, 1, 12)).key === '2026-W01', 'first week');

  /* week membership */
  const nowMs = new Date(2026, 10, 14, 12).getTime();
  const mk = o => Object.assign({ id: 'x', title: 't', createdAt: nowMs - D, deadline: nowMs + D, big: 0, x: .5, y: .4, doneAt: null, link: null, week: null }, o);
  ok(inCurrentWeek(mk({ deadline: nowMs + 2 * D }), nowMs), 'alive is this week');
  ok(inCurrentWeek(mk({ doneAt: nowMs - D, deadline: nowMs + D }), nowMs), 'done this week');
  ok(inCurrentWeek(mk({ deadline: nowMs - D }), nowMs), 'missed this week');
  ok(!inCurrentWeek(mk({ doneAt: new Date(2026, 9, 28, 12).getTime(), deadline: nowMs + D }), nowMs), 'done earlier is past');
  ok(!inCurrentWeek(mk({ deadline: new Date(2026, 10, 1, 12).getTime() }), nowMs), 'missed earlier is past');
  ok(taskWeekKey(mk({ doneAt: new Date(2026, 10, 9, 12).getTime(), deadline: nowMs + D })) === '2026-W46', 'task week from doneAt');

  /* archive */
  const st = { version: 1, tasks: [mk({ deadline: new Date(2026, 10, 2, 12).getTime() }), mk({ doneAt: new Date(2026, 10, 10, 12).getTime() })], weeks: {}, lastSeenWeek: '2026-W45', prefs: { reducedMotion: 'system' } };
  archivePast(st, nowMs);
  ok(st.tasks[0].week === '2026-W45', 'archived missed week');
  ok(st.tasks[1].week === null, 'current done stays');
  ensureWeeks(st, nowMs, '2026-W45');
  ok(!!st.weeks['2026-W46'] && !!st.weeks['2026-W45'], 'weeks recorded');

  /* store round-trip (valid + corrupt) */
  const good = { version: 1, tasks: [{ id: 'a', title: 'read', createdAt: nowMs - D, deadline: nowMs + D, big: 1, x: .2, y: .3, doneAt: null, link: null, week: null }], weeks: { '2026-W45': { seed: 1, archivedAt: nowMs } }, lastSeenWeek: '2026-W46', prefs: { reducedMotion: 'off' } };
  const sanitized = sanitize(good);
  ok(sanitized && sanitized.tasks.length === 1 && sanitized.tasks[0].title === 'read' && sanitized.prefs.reducedMotion === 'off', 'store round-trip');
  const round = sanitize(JSON.parse(JSON.stringify(good)));
  ok(round && round.tasks[0].x === .2 && round.weeks['2026-W45'].seed === 1, 'store JSON round-trip');
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
  ok(rd.run && rd.liftKey === '2026-W45' && rd.to === '2026-W46', 'ritual W45 -> W46');
  ok(!decideRitual('2026-W46', fixNow).run, 'no ritual same week');
  const rd2 = decideRitual('2026-W42', fixNow);
  ok(rd2.run && rd2.liftKey === '2026-W45' && rd2.missed === 4, 'only most recent week lifts');
  ok(!decideRitual(null, fixNow).run, 'first launch has no ritual');

  /* archive is idempotent */
  const st2 = { version: 1, tasks: [mk({ deadline: F(2026, 11, 2, 12) })], weeks: {}, lastSeenWeek: '2026-W45', prefs: { reducedMotion: 'system' } };
  archivePast(st2, fixNow); const before = JSON.stringify(st2.tasks[0]);
  archivePast(st2, fixNow); ok(JSON.stringify(st2.tasks[0]) === before, 'archive is idempotent');

  /* past brightness formula */
  const bright = age => Math.max(.05, .22 * Math.pow(.88, age));
  ok(Math.abs(bright(1) - .1936) < 1e-9, 'past brightness age 1');
  ok(Math.abs(bright(6) - .1022) < 1e-4, 'past brightness age 6');
  ok(bright(20) === .05, 'past brightness floor');

  /* store deep round-trip */
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(deepEq(sanitize(JSON.parse(JSON.stringify(good))), sanitize(good)), 'store deep round-trip');

  return { pass, fail, total: pass + fail, failed };
}
