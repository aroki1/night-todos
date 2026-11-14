/* model/timeline.js — the session event log (finish, undo, create, import, morning controls).
   Events are never persisted; the store keeps only durable state. */
import { isReduced, SIZE, STEPS } from '../tokens.js';
import { wall, fmtDate, fmtDay } from '../sky/clock.js';
import { GW, SH } from '../framebuffer.js';
import {
  stars, NS, setNS, MAXS, DEMO_ON, mkStar, expAt, lifeAt, isUrgent, isBehind, stepsDoneBy, touchSave, timeStr, nearestDone,
  addTask, removeTask, markDone, clearDone, announce, newId,
  snapshotData, restoreData, replaceData, onRebuild, rebuildStars
} from './store.js';
import { finishState, edgeState } from '../choreo/finish.js';
import { undoState, undoEdge } from '../choreo/undo.js';
import { slotCount, slotFill } from '../choreo/step.js';
import { stepView } from './steps.js';

export let events = [], undoTarget = null, externalUndo = null;
export const FS = new Array(SIZE.maxStars).fill(null), US = new Array(SIZE.maxStars).fill(null);
export let pipTotal = 7, pipLastT = -1e9;
export function setPipTotals(n, t) { pipTotal = n; pipLastT = t; }

onRebuild(() => resetTimeline());
export function resetTimeline() {
  events = []; undoTarget = null; externalUndo = null;
  FS.fill(null); US.fill(null);
}

export function makeFin(si, at0, hov) {
  const s = stars[si], link = s.link, hasSteps = !!(s.steps && s.steps.length), fold = hasSteps && !isReduced() ? STEPS.collapse / 1000 : 0, at = at0 + fold;
  const ts = s.dl !== null ? timeStr(s, at) : { left: s.left, full: s.full };
  const o = { t0: at, link, reduced: isReduced(), hov, urgent: isUrgent(s, wall(at), lifeAt(s, at)), line2: hov ? ts.full : ts.left };
  o.n2 = o.line2.length; o.tEnd = o.reduced ? 0 : 300 + o.n2 * 28; o.len = 0; o.path = 0; o.D = 0;
  /* a task with steps first folds its orbit into the core (400 ms; a 250 ms fade when reduced), then the usual finish runs.
     t0 is shifted by the fold, so the whole finish stays a pure function of ms; col0 is the click. Open steps stay in the data. */
  o.colMs = hasSteps ? (o.reduced ? 250 : STEPS.collapse) : 0; o.col0 = at0;
  o.behind = isBehind(s, wall(at), lifeAt(s, at), false);
  if (link !== null) {
    const g = edgeGeomStore(stars[link], s);
    o.len = g.len; o.path = g.path; o.D = Math.min(1200, Math.max(520, g.len * 11));
    if (o.reduced) { o.chargeMs = 0; o.travelMs = 0; o.arriveMs = 300; }
    else {
      const pf = stars[link].fin, parentArr = pf ? pf.t0 + pf.arriveMs / 1000 : -1e9;
      o.chargeMs = Math.max(450, (parentArr - at) * 1000);
      o.travelMs = o.chargeMs + 250; o.arriveMs = o.travelMs + o.D;
    }
  } else o.arriveMs = o.reduced ? 250 : 650;
  return o;
}
import { edgeGeom as edgeGeomStore } from './store.js';

export function makeUnd(s, at) {
  const fin = s.fin, ms = (at - fin.t0) * 1000, fst = finishState(fin, ms), es = fin.link !== null ? edgeState(fin, ms) : null;
  return { t0: at, fin, link: fin.link, cold0: fst.haloCold, titleK0: fst.titleK, lineLen0: es ? es.lineLen : 0, ff0: es ? es.ff : 0, pipWasOn: ms >= fin.arriveMs };
}

export function replay(t) {
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    s.done = s.initDone; s.link = s.initLink; s.fin = null; s.und = null; s.stamp = s.initStamp;
    s.on = s.base ? 1 : 0; s.cr = null; s.rm = null; s.miss = s.baseMiss; s.mT = -1; s.sev = null;
  }
  undoTarget = null;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e]; if (ev.at > t) break;
    if (ev.type === 'create') { const s = stars[ev.si]; s.on = 1; s.cr = { t0: ev.at, reduced: ev.reduced }; undoTarget = { si: ev.si, at: ev.at, type: 'add' }; }
    else if (ev.type === 'finish') {
      const s = stars[ev.si]; if (!s.on || s.done || s.miss || ev.at >= expAt(s)) continue;
      s.link = nearestDone(ev.si); s.done = 1; s.und = null; s.fin = makeFin(ev.si, ev.at, ev.hov); s.stamp = 'done · ' + fmtDate(wall(ev.at));
      undoTarget = { si: ev.si, at: ev.at, type: 'fin' };
    } else if (ev.type === 'step') {                                   // a step finished / reopened / added / deleted: the data is already committed
      const s = stars[ev.si];
      if (ev.dir) s.sev = { t0: ev.at, dir: ev.dir, reduced: ev.reduced, slot: ev.slot, lo: ev.lo, hi: ev.hi };
      undoTarget = { si: ev.si, at: ev.at, type: 'step', ev };
    } else if (ev.type === 'undo') {
      if (!undoTarget || ev.at - undoTarget.at > 5) continue;
      const s = stars[undoTarget.si];
      if (undoTarget.type === 'step') { const u = undoTarget.ev; if (u.dir) s.sev = { t0: ev.at, dir: -u.dir, reduced: isReduced(), slot: u.slot, lo: u.lo, hi: u.hi }; }
      else if (undoTarget.type === 'add') { s.on = 0; s.rm = { t0: ev.at }; s.cr = null; }
      else { s.und = makeUnd(s, ev.at); s.done = 0; s.link = null; s.fin = null; }
      undoTarget = null;
    }
  }
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.on && !s.done && !s.baseMiss && s.dl !== null) {
      const ea = expAt(s);
      if (t >= ea) { s.miss = 1; s.mT = (t - ea) * 1000; s.stamp = 'missed · ' + fmtDay(s.dl); }
    }
  }
}

export function pushEvent(ev) { events.push(ev); events.sort((a, b) => a.at - b.at); }

/* the morning's controls (advance, leave, cut). Kept apart from `events`: a rebuild (import, rollover) must not drop them */
let mev = [];
export function pushMorning(op, at, named = false) { mev.push({ op, at, named: !!named }); }
export function morningEvents(t0) { return mev.map(e => ({ op: e.op, ms: (e.at - t0) * 1000, named: e.named })); }
export function clearMorning() { mev = []; }

export function doFinish(si, at, hov) {
  const s = stars[si];
  if (!s || !s.on || s.done || s.miss || at >= expAt(s)) return false;
  const linkIdx = nearestDone(si);
  pushEvent({ type: 'finish', at, si, hov: !!hov });
  if (s.task) markDone(s.task, wall(at), linkIdx !== null && linkIdx >= 0 && stars[linkIdx].task ? stars[linkIdx].task.id : null);
  announce('finished ' + s.n);
  return true;
}
export function doUndo(at) {
  if (externalUndo && at - externalUndo.at <= 5) {
    restoreData(externalUndo.snapshot); externalUndo = null; rebuildStars(); return true;
  }
  const u = undoTarget;
  if (!u || at - u.at > 5) return false;
  pushEvent({ type: 'undo', at });
  const s = stars[u.si];
  if (u.type === 'step') undoStep(s, u.ev);
  else if (s && s.task) {
    if (u.type === 'add') removeTask(s.task); else clearDone(s.task);
  }
  announce('undone');
  return true;
}
export function doCreate(title, gx, gy, big, dlMs, at, stepTexts) {
  if (stars.length >= MAXS) return -1;
  const s = mkStar({ n: title, gx, gy, big: big ? 1 : 0, base: 0, on: 0 });
  s.dl = dlMs; s.rem0 = Math.max(1, dlMs - wall(at)); s.life0 = 1; s.life = 1;
  s.id = DEMO_ON ? null : newId();
  if (!DEMO_ON) {
    const t = {
      id: s.id, title, createdAt: wall(at), deadline: dlMs, big: big ? 1 : 0,
      x: gx / (GW - 1), y: gy / (SH - 1), doneAt: null, link: null, week: null, steps: mkSteps(stepTexts)
    };
    addTask(t); s.task = t; s.nx = t.x; s.ny = t.y; s.steps = t.steps;
  } else if (stepTexts && stepTexts.length) s.steps = mkSteps(stepTexts);
  stars.push(s); setNS(stars.length); pushEvent({ type: 'create', at, si: stars.length - 1, reduced: isReduced() });
  announce('added ' + title + ', due ' + fmtDay(dlMs));
  return NS - 1;
}
export function applyImport(raw, atT) {
  const snapshot = snapshotData();
  const n = replaceData(raw);
  if (n === null) return null;
  rebuildStars();
  externalUndo = { at: atT, type: 'import', n, snapshot };
  return n;
}

/* ---------- steps: finish / reopen / add / delete are events; the data change is committed here, the choreography is derived in replay ---------- */
const stepLive = s => !!s && s.on && !s.done && !s.miss && !s.gh && !!s.steps;
export function mkSteps(texts) {
  const out = [];
  for (const x of texts || []) { const text = String(x).trim().slice(0, STEPS.maxText); if (text && out.length < STEPS.maxSteps) out.push({ id: newId(), text, doneAt: null }); }
  return out;
}
/* toggle the step with id `sid`: finish it, or reopen it */
export function doStepToggle(si, sid, at) {
  const s = stars[si]; if (!stepLive(s) || at >= expAt(s)) return false;
  const t = s.steps.find(q => q.id === sid); if (!t) return false;
  const n = s.steps.length, K = slotCount(n), cur = stepView(s, at, 12).fill, fin = !t.doneAt, prev = t.doneAt;
  t.doneAt = fin ? Math.round(wall(at)) : null; touchSave();
  const to = slotFill(stepsDoneBy(s, Infinity), n), slot = Math.max(0, Math.min(K - 1, Math.ceil(fin ? to : cur) - 1));
  pushEvent({ type: 'step', kind: fin ? 'fin' : 'reopen', at, si, sid, dir: fin ? 1 : -1, slot, lo: Math.min(cur, to), hi: Math.max(cur, to), reduced: isReduced(), prev, text: t.text });
  announce((fin ? 'step done: ' : 'step reopened: ') + t.text);
  return true;
}
export function doStepNext(si, at) {
  const s = stars[si]; if (!stepLive(s)) return false;
  const t = s.steps.find(q => !q.doneAt); return t ? doStepToggle(si, t.id, at) : false;
}
export function doStepAdd(si, text, at) {
  const s = stars[si]; if (!stepLive(s) || at >= expAt(s)) return false;
  const tx = String(text).trim().slice(0, STEPS.maxText);
  if (!tx || s.steps.length >= STEPS.maxSteps) return false;
  const t = { id: newId(), text: tx, doneAt: null };
  s.steps.push(t); touchSave();
  pushEvent({ type: 'step', kind: 'add', at, si, sid: t.id, dir: 0, text: tx });
  announce('step added: ' + tx);
  return true;
}
export function doStepDelete(si, sid, at) {
  const s = stars[si]; if (!stepLive(s)) return false;
  const k = s.steps.findIndex(q => q.id === sid); if (k < 0) return false;
  const [t] = s.steps.splice(k, 1); touchSave();
  pushEvent({ type: 'step', kind: 'del', at, si, sid, dir: 0, index: k, step: t, text: t.text });
  announce('step removed: ' + t.text);
  return true;
}
/* undo of a step event (inside the 5 s window): the reverse data change; replay derives the reverse choreography */
function undoStep(s, e) {
  if (!s || !s.steps) return;
  if (e.kind === 'fin' || e.kind === 'reopen') { const t = s.steps.find(q => q.id === e.sid); if (t) t.doneAt = e.prev; }
  else if (e.kind === 'add') { const k = s.steps.findIndex(q => q.id === e.sid); if (k >= 0) s.steps.splice(k, 1); }
  else if (e.kind === 'del') s.steps.splice(Math.min(e.index, s.steps.length), 0, e.step);
  touchSave();
}
