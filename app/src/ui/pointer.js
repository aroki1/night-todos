/* ui/pointer.js — mouse and touch. The first tap selects a star; a second tap within 4 s finishes it. */
import { T } from '../sky/clock.js';
import { SIZE, STEPS } from '../tokens.js';
import { UW, UH, GW, SH, BARY, cv } from '../framebuffer.js';
import { stars, NS, Rb, liveThoughts, findThought } from '../model/store.js';
import { doFinish, doUndo, doStepToggle, doStepDelete, doLetGo, undoTarget, externalUndo } from '../model/timeline.js';
import { hazeHit } from '../model/thoughts.js';
import { lab, setMouseHover, setSelIdx, setTapSelected, selIdx, mouseHover } from '../model/placement.js';
import { bar, setBarFocus, setBarCaret, undoHit, skyBtn, tryUndo, closeHelp, enterThoughtWhen, leaveThoughtWhen } from './bar.js';
import { skySwap, setThoughtHover } from '../render/compose.js';
import { setPointerGrain, clearPointerGrain } from '../sky/past.js';
import { morningPhase, morningCtl, morningHit, setMorningHover, morningHover } from '../render/morning.js';
import { wake } from './bar.js';
import { stepsLive, toggleDoneRows, sui, isDrag, clampScroll } from '../model/steps.js';

let selectedAt = -9, selWas = -1;
export function toUnits(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * UW, (e.clientY - r.top) / r.height * UH];
}
const inBtn = (px, py) => skyBtn && px >= skyBtn.x && px <= skyBtn.x + skyBtn.w && py >= skyBtn.y && py <= skyBtn.y + skyBtn.h;

export function hitStar(px, py, touch) {
  const gx = px / 3, gy = py / 3, reachPx = touch ? SIZE.touchHitPx : SIZE.mouseHitPx;
  let best = -1, bd = 1e9;
  for (let i = 0; i < NS; i++) {
    const s = stars[i]; if (!s.on) continue;
    const r = Rb(s) + reachPx / 3, L = lab[i];
    let hit = Math.abs(gx - s.gx) <= r && Math.abs(gy - s.gy) <= r;
    if (!hit && L.shown && L.bx0 !== undefined && (!s.miss || (s.miss && lab[i].vis > .2))) {
      const pad = touch ? 6 : 1;
      hit = gx >= L.bx0 - pad && gx <= L.bx1 + pad && gy >= L.by0 - pad && gy <= L.by1 + pad;
    }
    if (hit) { const d = Math.abs(gx - s.gx) + Math.abs(gy - s.gy); if (d < bd) { bd = d; best = i; } }
  }
  return best;
}
function inUndo(px, py) {
  const u = externalUndo || undoTarget;
  const by = BARY + Math.round((cv.height / (window.devicePixelRatio || 1) - BARY) / 3 * .5) * 3;
  return u && T - u.at < 5 && Math.abs(py * 3 - by) < 18 && px / 3 >= (undoHit ? undoHit.x0 : 1e9) && px / 3 <= (undoHit ? undoHit.x1 : -1e9);
}
/* a row of the selected step list under the pointer */
export function hitRow(px, py, wide) {                                  // wide (touch): the row spans the whole panel width
  const gx = px / 3, gy = py / 3;
  for (let i = 0; i < NS; i++) {
    const L = lab[i]; if (!L.shown || !L.rr) continue;
    for (let r = 0; r < L.rr.length; r++) { const q = L.rr[r]; if (gx >= q.x0 && (wide ? gx <= L.fx1 : gx <= q.x1) && gy >= q.y0 && gy < q.y1) return { si: i, r, row: q }; }
  }
  return null;
}
function clickRow(h) {
  const s = stars[h.si];
  if (h.row.k === 'hdr') toggleDoneRows(s);
  else if (h.row.sid) doStepToggle(h.si, h.row.sid, T);
  wake();
}
/* the scrollable list panel under the pointer (only a panel with more content than fits) */
export function hitPanel(px, py) {
  const gx = px / 3, gy = py / 3;
  for (let i = 0; i < NS; i++) {
    const L = lab[i]; if (!L.shown || !L.list || !(L.scrollMax > 0) || L.listK < .3 || L.pt === undefined) continue;
    if (gx >= L.fx0 && gx <= L.fx1 && gy >= L.pt && gy < L.pb) return i;
  }
  return -1;
}
/* touch: a row toggles on release; holding it for 500 ms deletes it instead (undoable); moving more than 8 px scrolls the panel and does neither */
let lp = null;
const lpClear = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
/* touch: tapping a haze slot opens "when?"; holding it lets the thought go (same undo as Delete on an empty bar) */
let tp = null;
function tpClear() { if (tp) { clearTimeout(tp.t); tp = null; } }
const hazeIdAt = (px, py) => py < BARY ? hazeHit(liveThoughts(), px / 3, py / 3, GW, SH) : null;
const unitsPerCss = () => { const r = cv.getBoundingClientRect(); return UW / r.width; };
function lpStart(h, e) {
  lpClear();
  const q = { h, fired: false, drag: false, x: e.clientX, y: e.clientY, sc: sui.sy[h.si], t: 0 };
  if (h.row.sid) q.t = setTimeout(() => { q.fired = true; doStepDelete(h.si, h.row.sid, T); wake(); }, STEPS.longPress);
  lp = q;
}
function lpMove(e) {
  const q = lp; if (!q) return;
  const dx = e.clientX - q.x, dy = e.clientY - q.y;
  if (!q.drag && !isDrag(dx, dy)) return;
  if (!q.drag) { q.drag = true; clearTimeout(q.t); }
  const L = lab[q.h.si], v = clampScroll(q.sc - dy * unitsPerCss() / 3, L ? L.scrollMax || 0 : 0);
  sui.st[q.h.si] = v; sui.sy[q.h.si] = v; wake();                       // the panel follows the finger
}
function lpEnd() { const q = lp; if (!q) return; clearTimeout(q.t); lp = null; if (!q.fired && !q.drag) clickRow(q.h); }
function selectStar(i) {
  setSelIdx(i); setForceFocus(null); setTapSelected(true); selectedAt = T; selWas = i; wake();
}
function finishOrSelect(i) {
  if (i < 0) { setSelIdx(-1); setTapSelected(false); return; }
  if (selIdx === i && T - selectedAt < 4) {
    if (doFinish(i, T, true)) { setSelIdx(-1); setTapSelected(false); wake(); }
  } else selectStar(i);
}

export function bindPointer() {
  const barInput = document.getElementById('bar-input');
  if (barInput) barInput.addEventListener('pointerdown', e => {       // touch: the input lies over the bar; the sky button and the undo word stay buttons
    const [px, py] = toUnits(e);
    if (inBtn(px, py)) { e.preventDefault(); skySwap(11, T); wake(); }
    else if (inUndo(px, py)) { e.preventDefault(); tryUndo(doUndo); wake(); }
  });
  cv.addEventListener('mousemove', e => {
    const [px, py] = toUnits(e);
    const mp = morningPhase();
    if (mp && mp !== 'end') {                             // the morning: no star hover; a flower shows its label in the hold
      setMouseHover(-1); sui.rowHover = -1;
      if (py >= BARY) { setMorningHover(-1); cv.style.cursor = 'text'; return; }
      const i = mp === 'hold' ? morningHit(px / 3, py / 3) : -1;
      setMorningHover(i);
      cv.style.cursor = i >= 0 ? 'pointer' : 'default';
      return;
    }
    if (skyBtn) skyBtn.hover = inBtn(px, py);
    const thId = hazeIdAt(px, py);
    bar.thoughtHover = thId; setThoughtHover(thId);
    setMouseHover(thId ? -1 : hitStar(px, py, false));
    const hr = hitRow(px, py); sui.rowHover = hr ? hr.r : -1; sui.rowStar = hr ? hr.si : -1;
    setPointerGrain(px / 3, py / 3);
    const onUndo = inUndo(px, py);
    cv.style.cursor = (mouseHover >= 0 || thId || hr || inBtn(px, py) || onUndo) ? 'pointer' : (py >= BARY) ? 'text' : 'default';
  });
  cv.addEventListener('mouseleave', () => { setMouseHover(-1); setMorningHover(-1); bar.thoughtHover = null; setThoughtHover(null); setPointerGrain(-1e9, -1e9); });
  cv.addEventListener('click', e => {
    if (e.pointerType === 'touch') return;             // handled by pointerdown
    const [px, py] = toUnits(e);
    if (py < BARY) closeHelp();
    const mp = morningPhase();
    if (mp && mp !== 'end') {                             // the morning: the bar still opens; a click on the sky only hurries the sunrise
      if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
      if (mp === 'night' || mp === 'rise') morningCtl.advance();
      wake(); return;
    }
    if (inBtn(px, py)) { skySwap(11, T); wake(); return; }
    if (inUndo(px, py)) { tryUndo(doUndo); return; }
    const thId = hazeIdAt(px, py);
    if (thId) { enterThoughtWhen(thId, true); wake(); return; }        // a thought: "when?" with the bar focused
    if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
    setBarFocus(false);
    leaveThoughtWhen();
    setTapSelected(false);
    const hr = hitRow(px, py);
    if (hr) { clickRow(hr); return; }
    const i = hitStar(px, py, false);
    if (i >= 0 && stepsLive(stars[i])) {                                                    // a star with steps: the first click selects, its steps finish it; clicking it again finishes the task
      if (selIdx === i) { if (doFinish(i, T, true)) setSelIdx(-1); } else setSelIdx(i);
      wake(); return;
    }
    if (i >= 0) { setSelIdx(i); if (doFinish(i, T, true)) { setSelIdx(-1); wake(); } }
    else setSelIdx(-1);
  });
  cv.addEventListener('pointerup', e => {
    if (tp) { const q = tp, moved = isDrag(e.clientX - q.x, e.clientY - q.y); tpClear(); if (!moved) { enterThoughtWhen(q.id, true); wake(); } return; }
    lpEnd();
  });
  cv.addEventListener('pointercancel', () => { lpClear(); tpClear(); });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    lpMove(e);
    if (tp && isDrag(e.clientX - tp.x, e.clientY - tp.y)) tpClear();
  });
  cv.addEventListener('wheel', e => {                                    // desktop: the wheel scrolls the panel under the pointer
    const mp = morningPhase();
    if (mp && mp !== 'end') return;
    const [px, py] = toUnits(e), si = hitPanel(px, py); if (si < 0) return;
    e.preventDefault();
    const L = lab[si], d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1) * unitsPerCss() / 3;
    sui.st[si] = clampScroll(sui.st[si] + d, L.scrollMax); wake();
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const [px, py] = toUnits(e);
    if (py < BARY) closeHelp();
    const mp = morningPhase();
    if (mp && mp !== 'end') {                             // the morning: the bar still opens; in the hold a tap toggles a flower's label
      if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
      if (mp === 'night' || mp === 'rise') morningCtl.advance();
      else if (mp === 'hold') {
        const i = morningHit(px / 3, py / 3);
        setMorningHover(i >= 0 && i !== morningHover() ? i : -1);
      }
      wake(); return;
    }
    if (inBtn(px, py)) { skySwap(11, T); wake(); return; }
    if (inUndo(px, py)) { tryUndo(doUndo); wake(); return; }
    const thId = hazeIdAt(px, py);
    if (thId) {                                                     // tap opens "when?", a long press lets it go
      tpClear();
      const held = thId;
      tp = { id: thId, x: e.clientX, y: e.clientY, t: 0 };
      tp.t = setTimeout(() => {
        const th = findThought(held);
        tpClear();
        if (th) { doLetGo(th, T); leaveThoughtWhen(); wake(); }
      }, STEPS.longPress);
      return;
    }
    if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
    setBarFocus(false);
    leaveThoughtWhen();
    const hr = hitRow(px, py, true);
    if (hr) { lpStart(hr, e); return; }
    const i = hitStar(px, py, true);
    if (i < 0) { setSelIdx(-1); setTapSelected(false); wake(); return; }
    if (stepsLive(stars[i])) {                                                              // first tap selects (the list opens); the second tap on the star finishes the task
      if (selIdx === i) { if (doFinish(i, T, true)) { setSelIdx(-1); setTapSelected(false); } } else selectStar(i);
      wake(); return;
    }
    finishOrSelect(i);
  });
}
