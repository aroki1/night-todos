/* ui/keys.js — keyboard: n / / to write, Tab to move, Enter to finish, z to undo. */
import { T } from '../sky/clock.js';
import { stars, NS } from '../model/store.js';
import { doFinish, doUndo } from '../model/timeline.js';
import { focus, selIdx, mouseHover, setSelIdx, setMouseHover, setForceFocus } from '../model/placement.js';
import { bar, setBarFocus, setBarCaret, tryUndo } from './bar.js';
import { skipRitual } from '../render/ritual.js';
import { wake } from './bar.js';

export function aliveByGx() {
  return stars.map((s, i) => i).filter(i => stars[i].on && !stars[i].done && !stars[i].miss).sort((a, b) => stars[a].gx - stars[b].gx);
}
export function finishFocused() {
  const i = focus;
  if (i >= 0 && doFinish(i, T, true)) { setSelIdx(-1); wake(); }
}
export function bindKeys() {
  window.addEventListener('keydown', e => {
    if (bar.focus) return;                                  // the real input handles everything
    skipRitual();
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) { e.preventDefault(); tryUndo(doUndo); }
      return;
    }
    const k = e.key;
    if (k === 'n' || k === '/') {
      e.preventDefault(); setBarFocus(true); setBarCaret(); setSelIdx(-1); setMouseHover(-1); wake();
    } else if (k === 'Tab') {
      e.preventDefault();
      const l = aliveByGx(); if (!l.length) return;
      let q = l.indexOf(selIdx); q = e.shiftKey ? (q <= 0 ? l.length - 1 : q - 1) : (q + 1) % l.length;
      setSelIdx(l[q]); setMouseHover(-1); wake();
    } else if (k === 'Enter') {
      if (focus >= 0) finishFocused();
    } else if (k === 'Escape') {
      if (bar.text !== '') { bar.text = ''; bar.caret = 0; bar.last = T; }
      setSelIdx(-1); setForceFocus(null); wake();
    } else if (k === 'z' || k === 'Z') {
      tryUndo(doUndo);
    }
  });
}
