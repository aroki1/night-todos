/* ui/pointer.js — mouse and touch. The first tap selects a star; a second tap within 4 s finishes it. */
import { T } from '../sky/clock.js';
import { SIZE } from '../tokens.js';
import { UW, UH, BARY, cv } from '../framebuffer.js';
import { stars, NS, Rb } from '../model/store.js';
import { doFinish, doUndo, undoTarget, externalUndo } from '../model/timeline.js';
import { lab, setMouseHover, setSelIdx, setTapSelected, selIdx, mouseHover } from '../model/placement.js';
import { bar, setBarFocus, setBarCaret, undoHit, skyBtn, tryUndo } from './bar.js';
import { skySwap } from '../render/compose.js';
import { setPointerGrain, clearPointerGrain } from '../sky/past.js';
import { skipRitual } from '../render/ritual.js';
import { wake } from './bar.js';

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
  cv.addEventListener('mousemove', e => {
    const [px, py] = toUnits(e);
    if (skyBtn) skyBtn.hover = inBtn(px, py);
    setMouseHover(hitStar(px, py, false));
    setPointerGrain(px / 3, py / 3);
    const onUndo = inUndo(px, py);
    cv.style.cursor = (mouseHover >= 0 || inBtn(px, py) || onUndo) ? 'pointer' : (py >= BARY) ? 'text' : 'default';
  });
  cv.addEventListener('mouseleave', () => { setMouseHover(-1); setPointerGrain(-1e9, -1e9); });
  cv.addEventListener('click', e => {
    if (e.pointerType === 'touch') return;             // handled by pointerdown
    const [px, py] = toUnits(e);
    skipRitual();
    if (inBtn(px, py)) { skySwap(11, T); wake(); return; }
    if (inUndo(px, py)) { tryUndo(doUndo); return; }
    if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
    setBarFocus(false);
    setTapSelected(false);
    const i = hitStar(px, py, false);
    if (i >= 0) { setSelIdx(i); if (doFinish(i, T, true)) { setSelIdx(-1); wake(); } }
    else setSelIdx(-1);
  });
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const [px, py] = toUnits(e);
    skipRitual();
    if (inBtn(px, py)) { skySwap(11, T); wake(); return; }
    if (inUndo(px, py)) { tryUndo(doUndo); wake(); return; }
    if (py >= BARY) { setBarFocus(true); setBarCaret(); wake(); return; }
    setBarFocus(false);
    const i = hitStar(px, py, true);
    if (i < 0) { setSelIdx(-1); setTapSelected(false); wake(); return; }
    finishOrSelect(i);
  });
}
