/* clock.js — sky time, wall clock, time-of-day mood, lunar phase, ISO weeks. */
import { clamp01, sm } from '../math.js';
import { C, FLAGS, TIME } from '../tokens.js';
import { GW, SH, LM, SR, SG, SB, SBR, SBG, SBB, AGR, AGG, AGB, PROF, onSkyReset } from '../framebuffer.js';

export let T = 0;                                        // sky time, seconds
export function setT(v) { T = v; }

export const CLOCK0 = FLAGS.clock ? new Date(FLAGS.clock).getTime() : Date.now();
export let clockBase = CLOCK0;
export const wall = t => clockBase + t * 1000;
export function setClockBase(ms) { clockBase = ms; }
export function setClockISO(iso) { clockBase = new Date(iso).getTime() - T * 1000; }

/* real time catches up with sky time (a hidden tab stops RAF, so T and wall(T) stop too).
   Never when the clock is pinned (?clock=) or frozen. Returns true when the clock moved. */
export function resyncClock(nowMs = Date.now()) {
  if (FLAGS.clock || FLAGS.freeze) return false;
  if (Math.abs(wall(T) - nowMs) <= TIME.morning.driftMs) return false;
  clockBase = nowMs - T * 1000;
  resetClockCache();
  return true;
}

export const WDN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const WDFULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MONFULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const two = n => (n < 10 ? '0' : '') + n;
export const fmtDate = ms => { const d = new Date(ms); return WDN[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); };
export const fmtDay = ms => { const d = new Date(ms); return WDN[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
export function fmtLeft(rem) {
  const s = Math.max(0, Math.floor(rem / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d >= 2 ? d + 'd ' + two(h) + 'h' : s >= 3600 ? Math.floor(s / 3600) + 'h' : m > 0 ? m + 'm' : '<1m';
}
export const mkDate = (y, m, d, h, mi) => { const t = new Date(y, m - 1, d, h, mi, 0, 0); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? t : null; };

export const hourOf = ms => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
export function weekProgress(ms) {
  const d = new Date(ms), day = (d.getDay() + 6) % 7, st = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day, 0, 0, 0).getTime();
  return clamp01((ms - st) / (7 * 864e5));
}

/* ISO week, local time. Returns { year, week, key }. */
export function isoWeekOf(ms) {
  const src = new Date(ms);
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 864e5));
  return { year: isoYear, week, key: isoYear + '-W' + two(week) };
}
export const isoWeekKey = ms => isoWeekOf(ms).key;
export const weekSeed = (year, week) => (Math.imul(year, 0x9E3779B1) ^ Math.imul(week, 0x85EBCA6B)) >>> 0;
export const seedForWeek = key => { const m = /^(\d+)-W(\d+)$/.exec(key); return m ? weekSeed(+m[1], +m[2]) : 1; };
/* how many whole weeks separate two ISO keys (b - a) */
export function weekDistance(a, b) {
  const pa = /^(\d+)-W(\d+)$/.exec(a), pb = /^(\d+)-W(\d+)$/.exec(b);
  if (!pa || !pb) return 0;
  const ma = +pa[1] * 53 + +pa[2], mb = +pb[1] * 53 + +pb[2];
  return mb - ma;
}
export function weekLabel(key) { const m = /^(\d+)-W(\d+)$/.exec(key); return m ? 'week ' + (+m[2]) : key; }

/* lunar phase (real-ish; 0 = new, .5 = full) */
const SYN = 29.530588853, NEWMOON = Date.UTC(2000, 0, 6, 18, 14);
export const moonAge = ms => { const a = ((ms - NEWMOON) / 864e5) % SYN; return a < 0 ? a + SYN : a; };
export const moonK = t => (1 - Math.cos(2 * Math.PI * moonAge(wall(t)) / SYN)) / 2;
export const SYNODIC = SYN;
/* The moon transits ~0.84 h later each day of age: new moon near noon, first quarter near 18h,
   full moon near midnight. It is up for a ~12 h window centred on that transit. */
export function moonTransitHour(t) { return (12 + moonAge(wall(t)) * 0.84) % 24; }
export function moonUp(t) {
  const h = hourOf(wall(t)), tr = moonTransitHour(t), d = ((h - tr + 36) % 24) - 12;   // signed hours from transit
  return Math.abs(d) <= 6;
}
/* 0..1 fade over the 20-minute edges of the window */
export function moonWindowOpacity(t) {
  const h = hourOf(wall(t)), tr = moonTransitHour(t), d = ((h - tr + 36) % 24) - 12, edge = 6 - Math.abs(d);
  if (edge <= 0) return 0;
  return clamp01(edge / (20 / 60));
}

/* wall-clock cache, refreshed 4x per second of sky time */
export const wc = { T: -99, hour: 21, wp: .4 };
export function clockTick(force) {
  if (!force && Math.abs(T - wc.T) < .25) return;
  wc.T = T; const w = wall(T); wc.hour = hourOf(w); wc.wp = weekProgress(w); moodUpdate();
}

/* time of day: keyframes multiply / add onto the base, smoothstep between them (minutes long, never a visible change) */
const KEYS = [
  [0, 1, 0, 0, 1, 1, 1], [1, 1, 0, 0, 1, 1, 1], [2, .85, 0, 0, .7, 1.1, 1], [4, .85, 0, 0, .7, 1.1, 1],
  [4.5, 1, 0, 0, 1, 1, 1], [5.5, 1.15, 0, .04, 1, .5, .65], [6.5, 1.3, 0, .08, 1, 0, 0],
  [7, 1.15, 0, 0, .8, .4, .4], [16.5, 1.15, 0, 0, .8, .4, .4], [17, 1.25, .06, 0, 1, .6, .6],
  [19.5, 1.25, .02, 0, 1, 1, 1], [21, 1, 0, 0, 1, 1, 1], [24, 1, 0, 0, 1, 1, 1]
];
const mood = { base: 1, warm: 0, cool: 0, hz: 1, f: 1, m: 1 };
function moodAt(h, out) {
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = sm(0, 1, (h - a[0]) / (b[0] - a[0]));
  out.base = a[1] + (b[1] - a[1]) * t; out.warm = a[2] + (b[2] - a[2]) * t; out.cool = a[3] + (b[3] - a[3]) * t;
  out.hz = a[4] + (b[4] - a[4]) * t; out.f = a[5] + (b[5] - a[5]) * t; out.m = a[6] + (b[6] - a[6]) * t; return out;
}
let moodKey = '';
export function moodUpdate() {
  moodAt(wc.hour, mood);
  const k = moonK(T), bm = mood.base * (1 + .12 * k);                 // a bright moon lifts the sky a little
  LM[0] = mood.f * (1 - .4 * k); LM[1] = mood.m; LM[2] = 1;
  const key = [bm, mood.warm, mood.cool, mood.hz].map(v => Math.round(v * 800)).join(',');
  if (key === moodKey) return; moodKey = key;
  const hzm = mood.hz, wa = mood.warm, ca = mood.cool, d = C.dusk, n = C.dawn;
  for (let j = 0; j < SH; j++) {
    const p = PROF[j], wr = wa * p, cr = ca * p;
    for (let i = 0; i < GW; i++) {
      const q = j * GW + i;
      SR[q] = SBR[q] * bm + AGR[q] * hzm + d[0] * wr + n[0] * cr;
      SG[q] = SBG[q] * bm + AGG[q] * hzm + d[1] * wr + n[1] * cr;
      SB[q] = SBB[q] * bm + AGB[q] * hzm + d[2] * wr + n[2] * cr;
    }
  }
}
export function resetClockCache() { wc.T = -99; moodKey = ''; }
onSkyReset(() => { resetClockCache(); });
