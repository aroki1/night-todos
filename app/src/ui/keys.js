/* ui/keys.js — keyboard: n / / to write, Tab to move, Enter to finish, z to undo. */
import { T } from '../sky/clock.js';
import { stars, NS, liveThoughts } from '../model/store.js';
import { doFinish, doUndo, doStepNext, doStepToggle, doStepDelete } from '../model/timeline.js';
import { focus, selIdx, mouseHover, setSelIdx, setMouseHover, setForceFocus, lab } from '../model/placement.js';
import { bar, setBarFocus, setBarCaret, tryUndo, stepTarget, closeHelp, enterThoughtWhen, leaveThoughtWhen } from './bar.js';
import { morningPhase, morningCtl } from '../render/morning.js';
import { wake } from './bar.js';
import { stepsLive, stepRows, sui } from '../model/steps.js';

export function aliveByGx() {
  return stars.map((s, i) => i).filter(i => stars[i].on && !stars[i].done && !stars[i].miss).sort((a, b) => stars[a].gx - stars[b].gx);
}
export function finishFocused() {
  const i = focus;
  if (i >= 0 && doFinish(i, T, true)) { setSelIdx(-1); wake(); }
}
/* the morning owns the keyboard. A-B: Space or Enter hurries the sunrise, Esc leaves. C: Esc leaves, Enter opens the bar,
   any other printable key opens the bar and lands in it (no preventDefault). D: Esc cuts the sunset short */
function morningKey(e, mp) {
  const k = e.key, mod = e.ctrlKey || e.metaKey || e.altKey;
  if (mp === 'night' || mp === 'rise') {
    if (k === ' ' || k === 'Enter') { e.preventDefault(); morningCtl.advance(); }
    else if (k === 'Escape') { e.preventDefault(); morningCtl.leave(''); }
  } else if (mp === 'hold') {
    if (k === 'Escape') { e.preventDefault(); morningCtl.leave(''); }
    else if (k === 'Enter') { e.preventDefault(); setBarFocus(true); setBarCaret(); }
    else if (k.length === 1 && k !== ' ' && !mod) setBarFocus(true);
  } else if (mp === 'set' && k === 'Escape') { e.preventDefault(); morningCtl.cut(); }
  wake();
}
export function bindKeys() {
  window.addEventListener('keydown', e => {
    if (bar.focus) return;                                  // the real input handles everything
    if (bar.help && e.key === 'Escape') { e.preventDefault(); closeHelp(); return; }
    const mp = morningPhase();
    if (mp && mp !== 'end') { morningKey(e, mp); return; }       // night interactions are off during the morning
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) { e.preventDefault(); tryUndo(doUndo); }
      return;
    }
    const k = e.key;
    if (selIdx >= 0 && stars[selIdx] && stepsLive(stars[selIdx])) {              // a selected star with steps: Space finishes the next step, 1-5 toggle rows
      if (k === ' ') { e.preventDefault(); doStepNext(selIdx, T); wake(); return; }
      if (k >= '1' && k <= '5') {
        const row = stepRows(stars[selIdx]).find(r => r.num === +k);
        if (row) { doStepToggle(selIdx, row.sid, T); wake(); }
        return;
      }
      if (k === 'Delete' || k === 'Backspace') {                                  // hover a row and press Delete: remove that step (undoable)
        const L = lab[selIdx], q = sui.rowStar === selIdx && L && L.rr ? L.rr[sui.rowHover] : null;
        if (q && q.sid) { e.preventDefault(); doStepDelete(selIdx, q.sid, T); sui.rowHover = -1; wake(); }
        return;
      }
    }
    if (bar.thought && (k === 'Delete' || k === 'Backspace')) {                   // a Tab-selected thought: let go? (the input then asks to confirm)
      e.preventDefault(); bar.letGo = true; setBarFocus(true); setBarCaret(); wake(); return;
    }
    if (k === 'n' || k === '/') {
      e.preventDefault(); leaveThoughtWhen(); setBarFocus(true); setBarCaret(); if (stepTarget() < 0) setSelIdx(-1); setMouseHover(-1); wake();
    } else if (k === 'Tab') {
      e.preventDefault();
      const l = aliveByGx(), ths = liveThoughts(), n = l.length + ths.length; if (!n) return;
      let cur = -1;
      if (bar.thought) { const j = ths.findIndex(t => t.id === bar.thought); if (j >= 0) cur = l.length + j; }
      else if (selIdx >= 0) cur = l.indexOf(selIdx);
      const q = e.shiftKey ? (cur <= 0 ? n - 1 : cur - 1) : (cur + 1) % n;
      setMouseHover(-1);
      if (q < l.length) { leaveThoughtWhen(); setSelIdx(l[q]); }
      else { setSelIdx(-1); enterThoughtWhen(ths[q - l.length].id, false); }
      wake();
    } else if (k === 'Enter') {
      if (bar.thought) { setBarFocus(true); setBarCaret(); wake(); return; }
      if (focus >= 0) finishFocused();
    } else if (k === 'Escape') {
      if (bar.text !== '') { bar.text = ''; bar.caret = 0; bar.last = T; }
      leaveThoughtWhen();
      setSelIdx(-1); setForceFocus(null); wake();
    } else if (k === 'z' || k === 'Z') {
      tryUndo(doUndo);
    }
  });
}
