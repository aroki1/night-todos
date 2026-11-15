/* model/store.js — persistent data (tasks, weeks, prefs) and the week's sky view.
   This module never imports sky generation, render, ui or choreography. */
import { clamp01, rng } from '../math.js';
import { FLAGS, URGENT, PACE, STEPS, SIZE, PRACTICE } from '../tokens.js';
import { CLOCK0, wall, fmtDate, fmtDay, fmtLeft, isoWeekKey, mkDate } from '../sky/clock.js';
import { GW, SH } from '../framebuffer.js';
import { inCurrentWeek, ensureWeeks, archivePast } from './week.js';
import { nextDue, nextAway } from './morning.js';
import { newThought } from './thoughts.js';
import { dayKey, isDayKey } from './practices.js';

/* persistence is injected by main; the default is in-memory so tests/scenes never touch storage */
let persistence = { load: async () => null, save: async () => {} };
export function setPersistence(p) {
  persistence = p || { load: async () => null, save: async () => {} };
}

export const STEPS_SCENE = FLAGS.scene === 'steps' && FLAGS.dev; // dev scene for the step visuals
export const DEMO_ON = (FLAGS.demo || STEPS_SCENE) && FLAGS.dev; // demo tasks never exist in the product
export const THOUGHTS_DEMO = FLAGS.dev && FLAGS.thoughts !== null && FLAGS.thoughts > 0; // synthetic thoughts, in memory only
export const PRACTICES_DEMO = FLAGS.dev && FLAGS.practices !== null && FLAGS.practices > 0; // synthetic practices, in memory only
export const MAXS = 48;
const HR = 36e5;

export const store = {
  version: 1,
  tasks: [],
  thoughts: [],
  practices: [],
  useMs: 0,
  lastAskUse: 0,
  weeks: {},
  lastSeenWeek: null,
  morningDue: null,
  morningAway: 0,
  prefs: { reducedMotion: 'system', practiceLimit: PRACTICE.limit }
};

const DEF = [
  { n: 'hm one-pager', gx: 268, gy: 40, big: 1, life: 0.86, off: (7 * 24 + 2) * HR + 59 * 6e4 },
  { n: 'dp · knapsack + lis', gx: 96, gy: 62, done: 1, link: 2, stamp: 'done · tue 10 nov 22:05' },
  { n: 'hm weekly report', gx: 58, gy: 118, done: 1, link: null, stamp: 'done · mon 9 nov 18:40' },
  { n: 'os linux hw 3', gx: 186, gy: 128, life: 0.13, off: 26 * HR + 59 * 6e4 },
  { n: 'patterns quiz prep', gx: 150, gy: 84, life: 0.55, off: (3 * 24 + 11) * HR },
  { n: 'read ch. 7 · os', gx: 122, gy: 150, done: 1, link: 2, stamp: 'done · thu 12 nov 21:10' },
  { n: 'mentor session notes', gx: 300, gy: 150, miss: 1, stamp: 'missed · wed 11 nov' }
];

/* dev scene for steps: fake step arrays live on these demo tasks only. Positions are fractions of the sky. */
const named = (a, d) => a.map((t, i) => ({ id: 's' + i, text: t, doneAt: i < d ? 1.78e12 + i * 36e5 : null }));
const STEP_DEF = [
  {
    n: 'hm one-pager',
    nx: 0.4,
    ny: 0.22,
    big: 1,
    lifeFix: 0.86,
    off: (4 * 24 + 3) * HR,
    steps: named(['outline', 'draft intro', 'tables and figures', 'proofread'], 1)
  },
  {
    n: 'os linux hw 3',
    nx: 0.2,
    ny: 0.6,
    lifeFix: 0.3,
    off: 26 * HR + 59 * 6e4,
    steps: named(['read ch. 4', 'set up the vm', 'cron task', 'shell scripts', 'write report', 'submit'], 1)
  },
  {
    n: 'lit review',
    nx: 0.62,
    ny: 0.56,
    lifeFix: 0.5,
    off: (3 * 24 + 5) * HR,
    steps: named(
      Array.from({ length: 20 }, (_, i) => 'paper ' + (i + 1) + ' notes'),
      13
    )
  },
  {
    n: 'slides deck',
    nx: 0.82,
    ny: 0.24,
    lifeFix: 0.6,
    off: (2 * 24 + 4) * HR,
    steps: named(['outline', 'slide draft', 'figures', 'rehearse', 'export pdf'], 5)
  },
  { n: 'call dentist', nx: 0.46, ny: 0.84, lifeFix: 0.7, off: 20 * HR }
];
export let stars = [],
  NS = 0,
  GHI = 0;
export function setNS(v) {
  NS = v;
}
export let rolledFrom = null;
let announcer = () => {};
export function setAnnouncer(fn) {
  announcer = fn;
}
export function announce(msg) {
  announcer(msg);
}

/* thoughts that are neither said (turned into a star) nor let go, oldest first. */
export function liveThoughts() {
  return store.thoughts
    .filter(t => !t.saidAt && !t.goneAt)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function addThought(t) {
  store.thoughts.push(t);
  saveSoon();
  return t;
}
export function findThought(id) {
  return store.thoughts.find(t => t.id === id) || null;
}

/* dev: ?thoughts=n adds n synthetic thoughts in memory (like demo); the store is not persisted in that mode */
const DEMO_THOUGHTS = [
  'learn the pumping lemma',
  'ask ana about the lab',
  'redraw the sky',
  'read the rest of ch. 3',
  'fix the loop pedal',
  'plan the spring term',
  'call the landlord',
  'outline the essay'
];
function demoThoughts() {
  if (!THOUGHTS_DEMO) return;
  const now = wall(0),
    n = Math.min(24, FLAGS.thoughts | 0);
  store.thoughts = [];
  for (let i = 0; i < n; i++) {
    const t = DEMO_THOUGHTS[i % DEMO_THOUGHTS.length] + (i >= DEMO_THOUGHTS.length ? ' ' + (i + 1) : '');
    store.thoughts.push(newThought(t, i % 4 === 0 ? 'study' : null, now - i * 30 * HR, 'd' + i, store.useMs));
  }
}

/* dev: ?practices=n adds n synthetic practices in memory (no save) with seeded days over the last 20 weeks */
const DEMO_PRACTICES = ['read 20 min', 'gym', 'meditate', 'practice scales', 'walk', 'journal', 'stretch'];
function demoPractices() {
  if (!PRACTICES_DEMO) return;
  const now = wall(0),
    n = Math.min(20, FLAGS.practices | 0);
  store.practices = [];
  for (let i = 0; i < n; i++) {
    const r = rng(4242 + i),
      days = [];
    const span = i === 1 ? 420 : 140; // the second is a year and a half old, so the ring shows two rings
    for (let k = 0; k < span; k++) if (r() < 0.45) days.push(dayKey(now - k * 864e5));
    store.practices.push({
      id: 'p' + i,
      title: DEMO_PRACTICES[i % DEMO_PRACTICES.length],
      tag: i % 3 === 0 ? 'study' : null,
      x: 0.1 + r() * 0.8,
      y: 0.16 + r() * 0.56,
      createdAt: now - span * 864e5,
      days: [...new Set(days)].sort(),
      archivedAt: null
    });
  }
}
export function addPractice(p) {
  store.practices.push(p);
  saveSoon();
  return p;
}
export function findPractice(id) {
  return store.practices.find(p => p.id === id) || null;
}

const rebuildHooks = [];
export function onRebuild(fn) {
  rebuildHooks.push(fn);
}

export function mkStar(d) {
  return Object.assign(
    {
      gx0: d.gx,
      gy0: d.gy,
      done: 0,
      link: null,
      miss: 0,
      big: 0,
      life: 0,
      left: '',
      full: '',
      stamp: '',
      fin: null,
      und: null,
      on: 1,
      base: 1,
      cr: null,
      rm: null,
      rmMs: -1,
      mT: -1,
      dl: null,
      life0: 1,
      rem0: 1,
      lifeFix: undefined,
      gh: 0,
      ghA: 0,
      exLeft: '',
      baseMiss: d.miss || 0,
      initDone: d.done || 0,
      initLink: d.link === undefined || d.link === null ? null : d.link,
      initStamp: d.stamp || '',
      id: null,
      task: null,
      nx: null,
      ny: null
    },
    d
  );
}
export const R = s => (s.big ? SIZE.starRBig : SIZE.starR),
  CORE = s => (s.big ? SIZE.starCoreBig : SIZE.starCore);
export const Rb = s => (s.miss ? 0 : R(s));
export const pres = s => s.on || s.ghA > 0.002 || (s.rm !== null && s.rmMs >= 0 && s.rmMs < 450);
export const expAt = s => (s.dl === null ? Infinity : (s.dl - CLOCK0) / 1000);
export function lifeAt(s, t) {
  if (s.lifeFix !== undefined) return s.lifeFix;
  if (s.dl === null) return s.life;
  return s.life0 * clamp01((s.dl - wall(t)) / s.rem0);
}
/* steps done by wall time `now` (doneAt is the event time, so a replay at any T counts the same) */
export function stepsDoneBy(s, now) {
  let d = 0;
  if (s.steps) for (const t of s.steps) if (t.doneAt && t.doneAt <= now) d++;
  return d;
}
/* pacing: the share of time used outruns the share of steps done by more than the margin. Only a live task with steps. */
export function isBehind(s, now, life = s.life, live = true) {
  const n = s.steps ? s.steps.length : 0;
  return n > 0 && (!live || (!s.done && !s.miss)) && 1 - life > stepsDoneBy(s, now) / n + PACE.margin;
}
/* the one urgency rule: low life fraction OR little absolute time left OR behind on steps. `now` is wall ms; `life` defaults to s.life */
export function isUrgent(s, now, life = s.life) {
  return life < URGENT.life || (s.dl !== null && s.dl - now < URGENT.leftMs) || isBehind(s, now, life);
}
export function timeStr(s, t) {
  const left = fmtLeft(s.dl - wall(t));
  return { left, full: fmtDate(s.dl) + ' · ' + left };
}

function taskIdStar(t) {
  const s = mkStar({
    n: t.title,
    gx: Math.round(t.x * (GW - 1)),
    gy: Math.round(t.y * (SH - 1)),
    big: t.big ? 1 : 0,
    done: t.doneAt ? 1 : 0,
    baseMiss: !t.doneAt && t.deadline <= wall(0) ? 1 : 0,
    stamp: t.doneAt ? 'done · ' + fmtDate(t.doneAt) : !t.doneAt && t.deadline <= wall(0) ? 'missed · ' + fmtDay(t.deadline) : ''
  });
  s.id = t.id;
  s.task = t;
  s.nx = t.x;
  s.ny = t.y;
  if (!t.steps) t.steps = [];
  s.steps = t.steps; // the task's own array: mutations persist with the task
  s.dl = t.deadline;
  s.rem0 = Math.max(1, t.deadline - (t.createdAt || t.deadline - 7 * 864e5));
  s.life0 = 1;
  s.life = 1;
  if (t.doneAt) s.initDone = 1;
  return s;
}

/* a live practice joins the star list: no deadline, never done, never missed, never urgent */
export function practiceStar(p) {
  const s = mkStar({ n: p.title, gx: Math.round(p.x * (GW - 1)), gy: Math.round(p.y * (SH - 1)), big: 0 });
  s.id = p.id;
  s.practice = p.id;
  s.pdata = p;
  s.dl = null;
  s.life = 1;
  s.nx = p.x;
  s.ny = p.y;
  return s;
}
function addPracticeStars() {
  for (const p of store.practices) if (!p.archivedAt) stars.push(practiceStar(p));
}

export function rebuildStars(nowMs) {
  if (DEMO_ON) {
    const defs = STEPS_SCENE
      ? STEP_DEF.map(d => Object.assign({}, d, { gx: Math.round(d.nx * (GW - 1)), gy: Math.round(d.ny * (SH - 1)) }))
      : DEF;
    if (!STEPS_SCENE && FLAGS.steps === '1')
      for (const d of defs)
        if (!d.done && !d.miss && !d.steps)
          d.steps = named(
            d.n === 'os linux hw 3'
              ? ['read ch. 4', 'set up the vm', 'cron task', 'shell scripts', 'write report', 'submit']
              : d.n === 'hm one-pager'
                ? ['outline', 'draft intro', 'tables and figures', 'proofread']
                : ['skim', 'problems', 'review'],
            1
          );
    stars = defs.map(d => {
      const s = mkStar(d);
      if (d.off !== undefined) {
        s.dl = CLOCK0 + d.off;
        s.rem0 = d.off;
        s.life0 = d.life === undefined ? 1 : d.life;
      }
      return s;
    });
    addPracticeStars();
    GHI = stars.length;
    stars.push(mkStar({ n: '', gx: 0, gy: 0, gh: 1, on: 0, base: 0 }));
    NS = stars.length;
    for (const fn of rebuildHooks) fn();
    return;
  }
  const now = nowMs === undefined ? wall(0) : nowMs,
    nowKey = isoWeekKey(now);
  const here = store.tasks.filter(t => inCurrentWeek(t, now, nowKey));
  stars = here.map(taskIdStar);
  const byId = new Map(stars.map((s, i) => [s.id, i]));
  for (const s of stars) {
    const lid = s.task.link;
    s.initLink = lid && byId.has(lid) ? byId.get(lid) : null;
    s.link = s.initLink;
  }
  addPracticeStars();
  GHI = stars.length;
  stars.push(mkStar({ n: '', gx: 0, gy: 0, gh: 1, on: 0, base: 0 }));
  NS = stars.length;
  for (const fn of rebuildHooks) fn();
}

export function syncStarPositions() {
  for (const s of stars) {
    if (s.task) {
      s.gx = Math.round(s.task.x * (GW - 1));
      s.gy = Math.round(s.task.y * (SH - 1));
    } else if (s.pdata) {
      s.gx = Math.round(s.pdata.x * (GW - 1));
      s.gy = Math.round(s.pdata.y * (SH - 1));
    } else if (STEPS_SCENE && s.nx !== null && !s.gh) {
      s.gx = Math.round(s.nx * (GW - 1));
      s.gy = Math.round(s.ny * (SH - 1));
    }
  }
}

/* a star's area of life: the task's tag; a dev demo star may carry its own. Missing / null / '' = untagged. */
export const starTag = s => (s && s.task && s.task.tag) || (s && s.pdata && s.pdata.tag) || (s && s.tag) || '';
export const sameTag = (a, b) => (a || '') === (b || '');
/* the nearest done star of the same tag. Untagged stars still link only to untagged ones. -> index | null */
export function nearestDoneIn(list, si) {
  const s = list[si];
  if (!s) return null;
  const tag = starTag(s);
  let best = null,
    bd = 1e9;
  for (let j = 0; j < list.length; j++) {
    const o = list[j];
    if (j === si || !o || !o.done || !sameTag(starTag(o), tag)) continue;
    const d = Math.hypot(o.gx - s.gx, o.gy - s.gy);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}
export function nearestDone(si) {
  return nearestDoneIn(stars, si);
}
export function edgeGeom(f, t) {
  const dx = t.gx - f.gx,
    dy = t.gy - f.gy,
    len = Math.hypot(dx, dy),
    ux = dx / len,
    uy = dy / len;
  const sA = R(f) + 1,
    sB = len - (R(t) + 1);
  return { ax: f.gx, ay: f.gy, ux, uy, len, sA, sB, path: Math.max(0.1, sB - sA) };
}

/* ---------- store mutations (timeline calls these through commit) ---------- */
export function addTask(t) {
  store.tasks.push(t);
  saveSoon();
}
export function removeTask(t) {
  const k = store.tasks.indexOf(t);
  if (k >= 0) store.tasks.splice(k, 1);
  saveSoon();
}
export const touchSave = () => saveSoon();
export function markDone(t, ms, linkId) {
  t.doneAt = ms;
  t.link = linkId || null;
  t.week = null;
  saveSoon();
}
export function clearDone(t) {
  t.doneAt = null;
  t.link = null;
  t.week = null;
  saveSoon();
}

/* ---------- persistence ---------- */
let saveTimer = 0,
  dirty = false;
export function saveSoon() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    flushSave();
  }, 300);
}
export function flushSave() {
  if (!dirty) return;
  dirty = false;
  persistence.save({
    version: 1,
    tasks: store.tasks,
    thoughts: store.thoughts,
    practices: store.practices,
    useMs: store.useMs,
    lastAskUse: store.lastAskUse,
    weeks: store.weeks,
    lastSeenWeek: store.lastSeenWeek,
    morningDue: store.morningDue,
    morningAway: store.morningAway,
    prefs: store.prefs
  });
}

/* tasks saved before steps existed load with steps: []. Junk steps are dropped, never the task. */
export function sanitizeSteps(a) {
  if (!Array.isArray(a)) return [];
  const out = [],
    seen = new Set();
  for (const t of a) {
    if (out.length >= STEPS.maxSteps) break;
    if (!t || typeof t.text !== 'string' || !t.text.trim()) continue;
    let id = typeof t.id === 'string' && t.id ? t.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, text: t.text.trim().slice(0, STEPS.maxText), doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null });
  }
  return out;
}
/* a task or thought tag: letters, digits and `-`, 1..16 chars, lowercase; anything else is null */
const TAG_RE = /^[A-Za-z0-9-]{1,16}$/;
export function cleanTag(v) {
  return typeof v === 'string' && TAG_RE.test(v) ? v.toLowerCase() : null;
}
const numOrNull = v => (Number.isFinite(v) ? v : null);
/* a thought without text or a creation time is dropped; step is a whole number 0..4; the rest is a number or null */
export function sanitizeThoughts(a) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const t of a) {
    if (!t || typeof t !== 'object' || typeof t.text !== 'string' || !t.text.trim() || !Number.isFinite(t.createdAt)) continue;
    const th = {
      id: typeof t.id === 'string' && t.id ? t.id : newId(),
      text: t.text.trim().slice(0, SIZE.maxTitle),
      tag: cleanTag(t.tag),
      createdAt: t.createdAt,
      saidAt: numOrNull(t.saidAt),
      taskId: typeof t.taskId === 'string' ? t.taskId : null,
      goneAt: numOrNull(t.goneAt),
      remindAt: numOrNull(t.remindAt),
      askedAt: numOrNull(t.askedAt),
      askUse: Number.isFinite(t.askUse) && t.askUse >= 0 ? t.askUse : 0,
      step: Number.isInteger(t.step) ? Math.max(0, Math.min(4, t.step)) : 0,
      usedMs: Number.isFinite(t.usedMs) ? t.usedMs : 0
    };
    if (t.big) th.big = 1; // absent when the thought was not written big, so old stores round-trip as they were
    out.push(th);
  }
  return out;
}
/* practices: a title and a valid creation time are required; days are valid local keys, unique and sorted; tag per the tag rule */
export function sanitizePractices(a) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const p of a) {
    if (!p || typeof p !== 'object' || typeof p.title !== 'string' || !p.title.trim()) continue;
    const days = [];
    if (Array.isArray(p.days)) for (const k of p.days) if (isDayKey(k) && !days.includes(k)) days.push(k);
    days.sort();
    out.push({
      id: typeof p.id === 'string' && p.id ? p.id : newId(),
      title: p.title.trim().slice(0, SIZE.maxTitle),
      tag: cleanTag(p.tag),
      x: clamp01(Number.isFinite(p.x) ? p.x : 0.5),
      y: clamp01(Number.isFinite(p.y) ? p.y : 0.4),
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : wall(0),
      days,
      archivedAt: numOrNull(p.archivedAt)
    });
  }
  return out;
}
/* week entries pass through as they are; only `name` and `summary` are checked, and a key that was absent is never added */
function sanitizeWeeks(w) {
  if (!w || typeof w !== 'object') return {};
  const out = {};
  for (const k of Object.keys(w)) {
    const e = w[k];
    if (!e || typeof e !== 'object') {
      out[k] = e;
      continue;
    }
    const c = Object.assign({}, e);
    if ('name' in c) {
      const n = typeof c.name === 'string' ? c.name.trim().slice(0, 32) : '';
      if (n) c.name = n;
      else delete c.name;
    }
    if ('summary' in c) {
      const s = c.summary,
        okN = v => Number.isInteger(v) && v >= 0;
      if (s && typeof s === 'object' && okN(s.done) && okN(s.missed) && okN(s.carried) && okN(s.steps)) {
        const sum = { done: s.done, missed: s.missed, carried: s.carried, steps: s.steps };
        if ('tags' in s && s.tags && typeof s.tags === 'object' && !Array.isArray(s.tags)) {
          // an old snapshot has no tags: no tag line
          const tags = {};
          let n = 0,
            okT = true;
          for (const k of Object.keys(s.tags)) {
            if (n >= 20) break;
            const kk = k === '' ? '' : cleanTag(k);
            if (kk === null || !okN(s.tags[k])) {
              okT = false;
              break;
            }
            tags[kk] = s.tags[k];
            n++;
          }
          if (okT) sum.tags = tags;
        }
        c.summary = sum;
      } else delete c.summary;
    }
    out[k] = c;
  }
  return out;
}
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || (raw.version !== undefined && raw.version !== 1)) return null;
  const tasks = raw.tasks
    .filter(t => t && typeof t.title === 'string' && Number.isFinite(t.deadline))
    .map(t => {
      const o = {
        id: typeof t.id === 'string' ? t.id : newId(),
        title: t.title,
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : t.deadline - 7 * 864e5,
        deadline: t.deadline,
        big: t.big ? 1 : 0,
        x: clamp01(Number.isFinite(t.x) ? t.x : 0.5),
        y: clamp01(Number.isFinite(t.y) ? t.y : 0.4),
        doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null,
        link: typeof t.link === 'string' ? t.link : null,
        week: typeof t.week === 'string' ? t.week : null,
        steps: sanitizeSteps(t.steps)
      };
      const tag = cleanTag(t.tag); // absent when the task had none, so an old store round-trips byte for byte
      if (tag) o.tag = tag;
      return o;
    });
  return {
    version: 1,
    tasks,
    thoughts: sanitizeThoughts(raw.thoughts),
    practices: sanitizePractices(raw.practices),
    useMs: Number.isFinite(raw.useMs) && raw.useMs >= 0 ? raw.useMs : 0,
    lastAskUse: Number.isFinite(raw.lastAskUse) && raw.lastAskUse >= 0 ? raw.lastAskUse : 0,
    weeks: sanitizeWeeks(raw.weeks),
    lastSeenWeek: typeof raw.lastSeenWeek === 'string' ? raw.lastSeenWeek : null,
    morningDue: typeof raw.morningDue === 'string' && /^\d{4}-W\d{2}$/.test(raw.morningDue) ? raw.morningDue : null,
    morningAway: Number.isInteger(raw.morningAway) && raw.morningAway >= 0 && raw.morningAway <= 520 ? raw.morningAway : 0,
    prefs: {
      reducedMotion: raw.prefs && ['on', 'off', 'system'].includes(raw.prefs.reducedMotion) ? raw.prefs.reducedMotion : 'system',
      practiceLimit: Number.isInteger(raw.prefs && raw.prefs.practiceLimit)
        ? Math.max(1, Math.min(20, raw.prefs.practiceLimit))
        : PRACTICE.limit
    }
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
    store.morningAway = nextAway(prevSeen, now, store.morningAway);
    store.morningDue = nextDue(prevSeen, now, store.morningDue);
    store.lastSeenWeek = nowKey;
    saveSoon();
  } else ensureWeeks(store, wall(0));
  demoThoughts();
  demoPractices();
  rebuildStars();
  return store;
}

export function snapshotData() {
  return JSON.parse(
    JSON.stringify({
      tasks: store.tasks,
      thoughts: store.thoughts,
      practices: store.practices,
      useMs: store.useMs,
      lastAskUse: store.lastAskUse,
      weeks: store.weeks,
      lastSeenWeek: store.lastSeenWeek,
      prefs: store.prefs
    })
  );
}
export function restoreData(snap) {
  store.tasks = snap.tasks;
  store.thoughts = snap.thoughts || [];
  store.practices = snap.practices || [];
  store.useMs = Number.isFinite(snap.useMs) ? snap.useMs : 0;
  store.lastAskUse = Number.isFinite(snap.lastAskUse) ? snap.lastAskUse : 0;
  store.weeks = snap.weeks;
  store.lastSeenWeek = snap.lastSeenWeek;
  store.prefs = snap.prefs;
  saveSoon();
}
/* app-use clock: add real elapsed time while the tab is visible and focused. Each step is capped at 1 s, and the normal
   debounce saves it at most once a second (not on every frame). */
export function advanceUseMs(ms) {
  const add = Math.min(1000, Math.max(0, Number(ms) || 0));
  if (add <= 0) return;
  const sec = Math.floor(store.useMs / 1000);
  store.useMs += add;
  if (Math.floor(store.useMs / 1000) !== sec) saveSoon();
}
export function replaceData(raw) {
  const data = sanitize(raw);
  if (!data) return null;
  const due = store.morningDue,
    away = store.morningAway;
  Object.assign(store, data);
  store.morningDue = due;
  store.morningAway = away;
  ensureWeeks(store, wall(0));
  store.lastSeenWeek = isoWeekKey(wall(0));
  saveSoon();
  return data.tasks.length;
}

let idCounter = 0;
export function newId() {
  return 't' + Math.floor(wall(0)).toString(36) + '-' + (idCounter++).toString(36);
}
