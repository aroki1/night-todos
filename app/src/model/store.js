/* model/store.js — persistent data (tasks, weeks, prefs) and the week's sky view.
   This module never imports sky generation, render, ui or choreography. */
import { clamp01 } from '../math.js';
import { FLAGS } from '../tokens.js';
import { CLOCK0, wall, fmtDate, fmtDay, fmtLeft, isoWeekKey } from '../sky/clock.js';
import { GW, SH } from '../framebuffer.js';
import { inCurrentWeek, ensureWeeks, archivePast } from './week.js';

/* persistence is injected by main; the default is in-memory so tests/scenes never touch storage */
let persistence = { load: async () => null, save: async () => { } };
export function setPersistence(p) { persistence = p || { load: async () => null, save: async () => { } }; }

export const DEMO_ON = FLAGS.demo && FLAGS.dev;   // demo tasks never exist in the product
export const MAXS = 48;
const HR = 36e5;

export const store = { version: 1, tasks: [], weeks: {}, lastSeenWeek: null, prefs: { reducedMotion: 'system' } };

const DEF = [
  { n: 'hm one-pager',         gx: 268, gy: 40,  big: 1, life: .86, off: (7 * 24 + 2) * HR + 59 * 6e4 },
  { n: 'dp · knapsack + lis',  gx: 96,  gy: 62,  done: 1, link: 2,    stamp: 'done · tue 10 nov 22:05' },
  { n: 'hm weekly report',     gx: 58,  gy: 118, done: 1, link: null, stamp: 'done · mon 9 nov 18:40' },
  { n: 'os linux hw 3',        gx: 186, gy: 128, life: .13, off: 26 * HR + 59 * 6e4 },
  { n: 'patterns quiz prep',   gx: 150, gy: 84,  life: .55, off: (3 * 24 + 11) * HR },
  { n: 'read ch. 7 · os',      gx: 122, gy: 150, done: 1, link: 2,    stamp: 'done · thu 12 nov 21:10' },
  { n: 'mentor session notes', gx: 300, gy: 150, miss: 1, stamp: 'missed · wed 11 nov' }
];

export let stars = [], NS = 0, GHI = 0;
export function setNS(v) { NS = v; }
export let rolledFrom = null;
let announcer = () => { };
export function setAnnouncer(fn) { announcer = fn; }
export function announce(msg) { announcer(msg); }

const rebuildHooks = [];
export function onRebuild(fn) { rebuildHooks.push(fn); }

export function mkStar(d) {
  return Object.assign({
    gx0: d.gx, gy0: d.gy, done: 0, link: null, miss: 0, big: 0, life: 0, left: '', full: '', stamp: '', fin: null, und: null,
    on: 1, base: 1, cr: null, rm: null, rmMs: -1, mT: -1, dl: null, life0: 1, rem0: 1, lifeFix: undefined, gh: 0, ghA: 0,
    exLeft: '', baseMiss: d.miss || 0, initDone: d.done || 0,
    initLink: d.link === undefined || d.link === null ? null : d.link, initStamp: d.stamp || '',
    id: null, task: null, nx: null, ny: null
  }, d);
}
export const R = s => (s.big ? 5 : 3), CORE = s => (s.big ? 2 : 1);
export const Rb = s => (s.miss ? 0 : R(s));
export const pres = s => s.on || s.ghA > .002 || (s.rm !== null && s.rmMs >= 0 && s.rmMs < 450);
export const expAt = s => (s.dl === null ? Infinity : (s.dl - CLOCK0) / 1000);
export function lifeAt(s, t) {
  if (s.lifeFix !== undefined) return s.lifeFix;
  if (s.dl === null) return s.life;
  return s.life0 * clamp01((s.dl - wall(t)) / s.rem0);
}
export function timeStr(s, t) { const left = fmtLeft(s.dl - wall(t)); return { left, full: fmtDate(s.dl) + ' · ' + left }; }

function taskIdStar(t) {
  const s = mkStar({
    n: t.title, gx: Math.round(t.x * (GW - 1)), gy: Math.round(t.y * (SH - 1)),
    big: t.big ? 1 : 0, done: t.doneAt ? 1 : 0, baseMiss: !t.doneAt && t.deadline <= wall(0) ? 1 : 0,
    stamp: t.doneAt ? 'done · ' + fmtDate(t.doneAt) : (!t.doneAt && t.deadline <= wall(0) ? 'missed · ' + fmtDay(t.deadline) : '')
  });
  s.id = t.id; s.task = t; s.nx = t.x; s.ny = t.y;
  s.dl = t.deadline;
  s.rem0 = Math.max(1, t.deadline - (t.createdAt || t.deadline - 7 * 864e5));
  s.life0 = 1; s.life = 1;
  if (t.doneAt) s.initDone = 1;
  return s;
}

export function rebuildStars(nowMs) {
  if (DEMO_ON) {
    stars = DEF.map(d => { const s = mkStar(d); if (d.off !== undefined) { s.dl = CLOCK0 + d.off; s.rem0 = d.off; s.life0 = d.life; } return s; });
    GHI = stars.length; stars.push(mkStar({ n: '', gx: 0, gy: 0, gh: 1, on: 0, base: 0 })); NS = stars.length;
    for (const fn of rebuildHooks) fn();
    return;
  }
  const now = nowMs === undefined ? wall(0) : nowMs, nowKey = isoWeekKey(now);
  const here = store.tasks.filter(t => inCurrentWeek(t, now, nowKey));
  stars = here.map(taskIdStar);
  const byId = new Map(stars.map((s, i) => [s.id, i]));
  for (const s of stars) {
    const lid = s.task.link;
    s.initLink = lid && byId.has(lid) ? byId.get(lid) : null;
    s.link = s.initLink;
  }
  GHI = stars.length; stars.push(mkStar({ n: '', gx: 0, gy: 0, gh: 1, on: 0, base: 0 })); NS = stars.length;
  for (const fn of rebuildHooks) fn();
}

export function syncStarPositions() {
  for (const s of stars) if (s.task) { s.gx = Math.round(s.task.x * (GW - 1)); s.gy = Math.round(s.task.y * (SH - 1)); }
}

export function nearestDone(si) {
  const s = stars[si]; let best = null, bd = 1e9;
  for (let j = 0; j < NS; j++) {
    if (j === si || !stars[j].done) continue;
    const d = Math.hypot(stars[j].gx - s.gx, stars[j].gy - s.gy);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}
export function edgeGeom(f, t) {
  const dx = t.gx - f.gx, dy = t.gy - f.gy, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const sA = R(f) + 1, sB = len - (R(t) + 1);
  return { ax: f.gx, ay: f.gy, ux, uy, len, sA, sB, path: Math.max(.1, sB - sA) };
}

/* ---------- store mutations (timeline calls these through commit) ---------- */
export function addTask(t) { store.tasks.push(t); saveSoon(); }
export function removeTask(t) { const k = store.tasks.indexOf(t); if (k >= 0) store.tasks.splice(k, 1); saveSoon(); }
export function markDone(t, ms, linkId) { t.doneAt = ms; t.link = linkId || null; t.week = null; saveSoon(); }
export function clearDone(t) { t.doneAt = null; t.link = null; t.week = null; saveSoon(); }

/* ---------- persistence ---------- */
let saveTimer = 0, dirty = false;
export function saveSoon() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; flushSave(); }, 300);
}
export function flushSave() {
  if (!dirty) return;
  dirty = false;
  persistence.save({ version: 1, tasks: store.tasks, weeks: store.weeks, lastSeenWeek: store.lastSeenWeek, prefs: store.prefs });
}

export function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || (raw.version !== undefined && raw.version !== 1)) return null;
  const tasks = raw.tasks.filter(t => t && typeof t.title === 'string' && Number.isFinite(t.deadline)).map(t => ({
    id: typeof t.id === 'string' ? t.id : newId(),
    title: t.title,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : t.deadline - 7 * 864e5,
    deadline: t.deadline,
    big: t.big ? 1 : 0,
    x: clamp01(Number.isFinite(t.x) ? t.x : .5),
    y: clamp01(Number.isFinite(t.y) ? t.y : .4),
    doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null,
    link: typeof t.link === 'string' ? t.link : null,
    week: typeof t.week === 'string' ? t.week : null
  }));
  return {
    version: 1, tasks,
    weeks: raw.weeks && typeof raw.weeks === 'object' ? raw.weeks : {},
    lastSeenWeek: typeof raw.lastSeenWeek === 'string' ? raw.lastSeenWeek : null,
    prefs: { reducedMotion: (raw.prefs && ['on', 'off', 'system'].includes(raw.prefs.reducedMotion)) ? raw.prefs.reducedMotion : 'system' }
  };
}

export async function loadModel() {
  const raw = await persistence.load();
  const data = sanitize(raw);
  if (data) Object.assign(store, data);
  if (!DEMO_ON) {
    const now = wall(0);
    const prevSeen = store.lastSeenWeek;
    archivePast(store, now);
    ensureWeeks(store, now, prevSeen || isoWeekKey(now));
    const nowKey = isoWeekKey(now);
    rolledFrom = prevSeen && prevSeen !== nowKey ? prevSeen : null;
    store.lastSeenWeek = nowKey;
    saveSoon();
  } else ensureWeeks(store, wall(0));
  rebuildStars();
  return store;
}

export function snapshotData() {
  return JSON.parse(JSON.stringify({ tasks: store.tasks, weeks: store.weeks, lastSeenWeek: store.lastSeenWeek, prefs: store.prefs }));
}
export function restoreData(snap) {
  store.tasks = snap.tasks; store.weeks = snap.weeks; store.lastSeenWeek = snap.lastSeenWeek; store.prefs = snap.prefs;
  saveSoon();
}
export function replaceData(raw) {
  const data = sanitize(raw);
  if (!data) return null;
  Object.assign(store, data);
  ensureWeeks(store, wall(0));
  store.lastSeenWeek = isoWeekKey(wall(0));
  saveSoon();
  return data.tasks.length;
}

let idCounter = 0;
export function newId() { return 't' + Math.floor(wall(0)).toString(36) + '-' + (idCounter++).toString(36); }


