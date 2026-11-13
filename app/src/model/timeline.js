/* model/timeline.js — the session event log (finish, undo, create, import, ritual).
   Events are never persisted; the store keeps only durable state. */
import { isReduced, SIZE } from '../tokens.js';
import { wall, fmtDate, fmtDay } from '../sky/clock.js';
import { GW, SH } from '../framebuffer.js';
import {
  stars, NS, setNS, MAXS, DEMO_ON, mkStar, expAt, lifeAt, timeStr, nearestDone,
  addTask, removeTask, markDone, clearDone, announce, newId,
  snapshotData, restoreData, replaceData, onRebuild, rebuildStars
} from './store.js';
import { finishState, edgeState } from '../choreo/finish.js';
import { undoState, undoEdge } from '../choreo/undo.js';

export let events = [], undoTarget = null, externalUndo = null;
export const FS = new Array(SIZE.maxStars).fill(null), US = new Array(SIZE.maxStars).fill(null);
export let pipTotal = 7, pipLastT = -1e9;
export function setPipTotals(n, t) { pipTotal = n; pipLastT = t; }

onRebuild(() => resetTimeline());
export function resetTimeline() {
  events = []; undoTarget = null; externalUndo = null;
  FS.fill(null); US.fill(null);
}

export function makeFin(si, at, hov) {
  const s = stars[si], link = s.link;
  const ts = s.dl !== null ? timeStr(s, at) : { left: s.left, full: s.full };
  const o = { t0: at, link, reduced: isReduced(), hov, urgent: lifeAt(s, at) < .25, line2: hov ? ts.full : ts.left };
  o.n2 = o.line2.length; o.tEnd = o.reduced ? 0 : 300 + o.n2 * 28; o.len = 0; o.path = 0; o.D = 0;
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
    s.on = s.base ? 1 : 0; s.cr = null; s.rm = null; s.miss = s.baseMiss; s.mT = -1;
  }
  undoTarget = null;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e]; if (ev.at > t) break;
    if (ev.type === 'create') { const s = stars[ev.si]; s.on = 1; s.cr = { t0: ev.at, reduced: ev.reduced }; undoTarget = { si: ev.si, at: ev.at, type: 'add' }; }
    else if (ev.type === 'finish') {
      const s = stars[ev.si]; if (!s.on || s.done || s.miss || ev.at >= expAt(s)) continue;
      s.link = nearestDone(ev.si); s.done = 1; s.und = null; s.fin = makeFin(ev.si, ev.at, ev.hov); s.stamp = 'done · ' + fmtDate(wall(ev.at));
      undoTarget = { si: ev.si, at: ev.at, type: 'fin' };
    } else if (ev.type === 'undo') {
      if (!undoTarget || ev.at - undoTarget.at > 5) continue;
      const s = stars[undoTarget.si];
      if (undoTarget.type === 'add') { s.on = 0; s.rm = { t0: ev.at }; s.cr = null; }
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
  if (s && s.task) {
    if (u.type === 'add') removeTask(s.task); else clearDone(s.task);
  }
  announce('undone');
  return true;
}
export function doCreate(title, gx, gy, big, dlMs, at) {
  if (stars.length >= MAXS) return -1;
  const s = mkStar({ n: title, gx, gy, big: big ? 1 : 0, base: 0, on: 0 });
  s.dl = dlMs; s.rem0 = Math.max(1, dlMs - wall(at)); s.life0 = 1; s.life = 1;
  s.id = DEMO_ON ? null : newId();
  if (!DEMO_ON) {
    const t = {
      id: s.id, title, createdAt: wall(at), deadline: dlMs, big: big ? 1 : 0,
      x: gx / (GW - 1), y: gy / (SH - 1), doneAt: null, link: null, week: null
    };
    addTask(t); s.task = t; s.nx = t.x; s.ny = t.y;
  }
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
export function undoDescriptor() { return externalUndo || undoTarget; }
