/* ui/bar.js — the bottom bar, its hidden real <input>, undo row and counter. */
import { clamp01, seg, css, mixTo } from '../math.js';
import { TXT, K, C, FLAGS, SIZE, STEPS, MORNING, TIME, setReducedPref, getReducedPref } from '../tokens.js';
import { ctx, cv, P, SH, ROWS, BARY, UW, dpr } from '../framebuffer.js';
import { T, wall, fmtDate, fmtLeft } from '../sky/clock.js';
import { parseDeadline, splitBar } from '../model/parser.js';
import { morningEnter } from '../model/morning.js';
import { stars, NS, GHI, MAXS, store, saveSoon, DEMO_ON, rebuildStars } from '../model/store.js';
import { undoTarget, externalUndo, doCreate, doStepAdd, applyImport } from '../model/timeline.js';
import { placeNew, selIdx, setSelIdx } from '../model/placement.js';
import { morningPhase, morningCtl } from '../render/morning.js';

export const bar = {
  text: '', caret: 0, focus: false, last: -9, title: '', big: false, res: null, pv: '', pvWarn: false,
  gOn: false, gA0: 0, gT0: -9, gCommit: -1, blink: -9, gpos: null, ctr: 0, out: null, steps: []
};
/* step mode: a selected live star turns the bar into "step for <title>"; Enter adds a step to it */
export function stepTarget() {
  const s = selIdx >= 0 ? stars[selIdx] : null;
  return s && s.on && !s.done && !s.miss && !s.gh ? selIdx : -1;
}
export let undoHit = null, skyBtn = null, msAvg = 0;
export let wake = () => {};
export function setWake(fn) { wake = fn; }
let input = null, composing = false;

export function initBar(inputEl) {
  input = inputEl;
  input.setAttribute('maxlength', String(SIZE.maxBar));
  input.value = '';
  input.addEventListener('input', () => {
    if (composing) return;
    bar.text = input.value.slice(0, SIZE.maxBar);
    bar.caret = input.selectionStart == null ? bar.text.length : Math.min(bar.caretMax(), input.selectionStart);
    bar.last = T; wake();
  });
  input.addEventListener('keydown', onInputKey);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; bar.text = input.value.slice(0, SIZE.maxBar); bar.caret = bar.text.length; bar.last = T; wake(); });
  input.addEventListener('select', () => { bar.caret = input.selectionStart || 0; });
  input.addEventListener('click', () => { bar.caret = input.selectionStart || 0; });
}
bar.caretMax = () => bar.text.length;

export function setBarFocus(v) {
  bar.focus = !!v;
  if (!input) return;
  if (v) {
    input.value = bar.text;
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    try { input.setSelectionRange(bar.caret, bar.caret); } catch (_) { }
    bar.blink = T; wake();
  } else {
    input.blur();
    bar.caret = bar.text.length;
  }
}
export function setBarCaret() { if (input) { try { input.setSelectionRange(bar.caret, bar.caret); } catch (_) { } } }

function onInputKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const mp = morningPhase();
    if (mp && mp !== 'end') {
      if (mp === 'set') morningCtl.cut();
      else if (mp === 'hold' && bar.text !== '') { bar.text = ''; bar.caret = 0; input.value = ''; }   // the first Esc clears what was typed
      else { setBarFocus(false); morningCtl.leave(''); }
      wake(); return;
    }
    if (stepTarget() >= 0) { bar.text = ''; bar.caret = 0; input.value = ''; setSelIdx(-1); }     // step mode: Esc deselects, the bar returns to normal
    setBarFocus(false); wake(); return;
  }
  if (e.key === 'Enter') { e.preventDefault(); submitBar(); return; }
  if (e.key === 'Tab') { e.preventDefault(); return; }
  bar.blink = T;
  // arrows/backspace/etc. are handled natively; recompute the caret after the event
  setTimeout(() => { if (bar.focus) { bar.caret = Math.min(bar.caretMax(), input.selectionStart || 0); wake(); } }, 0);
}

export function barParse() {
  const p = splitBar(bar.text);
  const title = p.title.slice(0, SIZE.maxTitle), dls = p.dls;
  bar.title = title; bar.big = p.big;
  bar.steps = p.steps.slice(0, STEPS.maxSteps).map(x => x.slice(0, STEPS.maxText));
  bar.res = dls !== null && dls.trim() !== '' ? parseDeadline(dls, new Date(wall(T))) : null;
  const r = bar.res; bar.pvWarn = !!(r && r.err);
  const ns = bar.steps.length;
  bar.pv = !r ? '' : r.ok ? '→ ' + fmtDate(r.date.getTime()) + ' · ' + fmtLeft(r.date.getTime() - wall(T)) + (ns ? ' · ' + ns + (ns === 1 ? ' step' : ' steps') : '') : r.err === 'past' ? "that's already gone" : "can't read that";
  if (morningPhase() === 'hold' && !(r && r.ok)) { bar.pv = ''; bar.pvWarn = false; }
}
export function ghostAlphaNow() {
  if (bar.gCommit >= 0) return 1 - seg((T - bar.gCommit) * 1000, 550, 900);
  const k = bar.gOn ? seg(T - bar.gT0, 0, .25) : seg(T - bar.gT0, 0, .2);
  return bar.gOn ? bar.gA0 + (1 - bar.gA0) * k : bar.gA0 * (1 - k);
}
export function barTick() {
  barParse();
  const want = bar.gCommit < 0 && bar.title !== '' && !!(bar.res && bar.res.ok) && stars.length < MAXS;
  if (bar.text === '' && bar.gCommit < 0) bar.gpos = null;
  if (bar.gCommit >= 0 && T - bar.gCommit > .95) { bar.gCommit = -1; bar.gOn = false; bar.gA0 = 0; bar.gT0 = T; bar.gpos = null; }
  if (bar.gCommit < 0 && want !== bar.gOn) { bar.gA0 = ghostAlphaNow(); bar.gOn = want; bar.gT0 = T; }
  if (want && !bar.gpos) bar.gpos = placeNew(bar.title, bar.ctr, bar.big);
  const g = stars[GHI]; g.ghA = ghostAlphaNow(); g.n = bar.title; g.big = bar.big ? 1 : 0; g.life = 1;
  if (bar.gpos) { g.gx = bar.gpos.gx; g.gy = bar.gpos.gy; }
}

/* ---------- commands ---------- */
async function runCommand(cmd) {
  document.documentElement.setAttribute('data-cmd', cmd);
  const [name, ...rest] = cmd.slice(1).trim().split(/\s+/);
  const arg = rest.join(' ');
  if (name === 'motion') {
    if (['on', 'off', 'system'].includes(arg)) {
      setReducedPref(arg); store.prefs.reducedMotion = arg; saveSoon();
      bar.out = { text: 'motion ' + arg, t0: T }; bar.text = ''; if (input) input.value = '';
      bar.focus = false; if (input) input.blur(); wake(); return true;
    }
    bar.out = { text: '/motion on|off|system', t0: T }; bar.text = ''; if (input) input.value = ''; wake(); return true;
  }
  if (name === 'export') { exportStore(); bar.text = ''; if (input) input.value = ''; bar.focus = false; if (input) input.blur(); wake(); return true; }
  if (name === 'import') { pickImport(); bar.text = ''; if (input) input.value = ''; bar.focus = false; if (input) input.blur(); wake(); return true; }
  bar.out = { text: 'unknown command', t0: T }; bar.text = ''; if (input) input.value = ''; wake(); return true;
}

function exportStore() {
  const data = { version: 1, tasks: store.tasks, weeks: store.weeks, lastSeenWeek: store.lastSeenWeek, prefs: store.prefs, exportedAt: new Date(wall(T)).toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date(wall(T));
  a.href = URL.createObjectURL(blob);
  a.download = 'night-sky-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  bar.out = { text: 'exported', t0: T };
}
function pickImport() {
  const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json';
  f.addEventListener('change', () => {
    const file = f.files && f.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(String(rd.result));
        const n = applyImport(raw, T);
        if (n !== null) rebuildStars();
        bar.out = { text: n === null ? "can't read that file" : 'imported · ' + n + ' stars', t0: T };
      } catch (_) { bar.out = { text: "can't read that file", t0: T }; }
      wake();
    };
    rd.readAsText(file);
  });
  f.click();
}

export function submitBar() {
  barParse();
  const mp = morningPhase();
  if (mp && mp !== 'end') return submitMorning(mp);
  if (bar.text.trim().startsWith('/')) return runCommand(bar.text.trim());
  const sel = stepTarget();
  if (sel >= 0) {                                                  // step mode: the whole text is one step; a full list quietly refuses
    const tx = bar.text.trim(); if (!tx) return false;
    if (!doStepAdd(sel, tx, T)) return false;
    bar.out = { text: bar.text, t0: T }; bar.text = ''; bar.caret = 0; if (input) input.value = '';
    bar.last = T; wake(); return true;
  }
  const r = bar.res;
  if (bar.title === '' || !r || !r.ok || stars.length >= MAXS) return false;
  const pos = bar.gpos || placeNew(bar.title, bar.ctr, bar.big);
  doCreate(bar.title, pos.gx, pos.gy, bar.big, r.date.getTime(), T, bar.steps);
  bar.ctr++; bar.out = { text: bar.text, t0: T }; bar.gpos = pos; bar.gCommit = T; bar.gOn = true;
  bar.text = ''; bar.caret = 0; if (input) input.value = '';
  setBarFocus(false); wake(); return true;
}
/* Enter during the morning: before the hold it hurries the sunrise; in the hold the text names the week, or adds a task when it
   parses with a deadline (morningEnter decides); then the sunset starts. The new star assembles near the end of the sunset. */
function submitMorning(mp) {
  if (mp === 'night' || mp === 'rise') { morningCtl.advance(); wake(); return true; }
  if (mp !== 'hold') return false;
  const m = morningEnter(bar.text, wall(T));
  if (m.kind === 'cmd') return runCommand(bar.text.trim());
  if (m.kind === 'task') {
    const r = bar.res;
    if (bar.title === '' || !r || !r.ok || stars.length >= MAXS) return false;
    morningCtl.leave('');
    const pos = placeNew(bar.title, bar.ctr, bar.big);
    doCreate(bar.title, pos.gx, pos.gy, bar.big, r.date.getTime(), T + TIME.morning.createAt / 1000, bar.steps);
    bar.ctr++;
  } else morningCtl.leave(m.kind === 'name' ? m.name : '');
  bar.out = { text: bar.text, t0: T }; bar.text = ''; bar.caret = 0; if (input) input.value = '';
  setBarFocus(false); wake(); return true;
}
export function tryUndo(doUndoFn) {
  const u = externalUndo || undoTarget;
  if (u && T - u.at < 5) { doUndoFn(T); wake(); return true; }
  return false;
}

/* ---------- drawing ---------- */
function dot(gx, gy, col, alpha) {
  ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fillRect(gx * P, gy * P, Math.max(1, P - Math.max(1, Math.round(dpr))), Math.max(1, P - Math.max(1, Math.round(dpr))));
}
function pipColor(k, arr) {
  if (k >= arr.length || arr[k] > T) return K.pipOff;
  const e = (T - arr[k]) * 1000;
  return e < 80 ? mixTo([0, 0, 0], K.pipOff, C.core, e / 80) : e < 280 ? mixTo([0, 0, 0], C.core, C.done, (e - 80) / 200) : C.done;
}
/* the text cut with an ellipsis so it is at most maxW wide in the current font (units of the bar) */
export function fitText(t, maxW) {
  if (ctx.measureText(t).width <= maxW) return t;
  let n = t.length; while (n > 1 && ctx.measureText(t.slice(0, n).trimEnd() + '…').width > maxW) n--;
  return t.slice(0, n).trimEnd() + '…';
}
export function barPlaceholder() {
  if (morningPhase() === 'hold') return MORNING.text.name;
  const st = stepTarget();
  if (st >= 0) { const n = stars[st].n; return 'step for ' + (n.length > 28 ? n.slice(0, 27) + '…' : n); }
  const any = DEMO_ON ? true : store.tasks.length > 0;
  if (!DEMO_ON && store.tasks.length % STEPS.barHintEvery === STEPS.barHintEvery - 1) return STEPS.barHint;
  return any ? 'title, deadline' : 'add your first star — title, deadline';
}

export function drawBar() {
  const barRows = ROWS - SH;
  const by = BARY + Math.round(barRows * .5) * 3;
  const pipRow = SH + Math.round(barRows * .45);
  const timerRow = SH + barRows - 6;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = TXT.bg; ctx.fillRect(0, SH * P, cv.width, cv.height - SH * P);
  ctx.fillStyle = TXT.rule; ctx.fillRect(0, SH * P, cv.width, Math.max(1, Math.round(dpr)));
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0); ctx.textBaseline = 'middle';
  ctx.font = '500 12px ' + '"IBM Plex Mono", ui-monospace, Consolas, monospace';
  ctx.fillStyle = TXT.ink2; ctx.fillText('›', 18, by);
  // counter: pips fill at the arrival of each connection (measured first: the placeholder must stop before it)
  const arr = [];
  for (let i = 0; i < NS; i++) { const s = stars[i]; if (s.done && s.on) arr.push(s.fin ? s.fin.t0 + s.fin.arriveMs / 1000 : -1e9); }
  arr.sort((a, b) => a - b);
  let cnt = 0; for (let i = 0; i < arr.length; i++) if (arr[i] <= T) cnt++;
  const cs = cnt + ' / ' + pipTotalNow; ctx.font = '500 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  const cw = ctx.measureText(cs).width;
  const typing = bar.focus || bar.text !== '';
  const ext = externalUndo, u = ext || undoTarget;
  let ua = u ? (T - u.at < 5 ? 1 : 1 - seg(T - u.at, 5, 5.3)) : 0;
  if (typing) ua = 0;
  undoHit = null;
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  let textW = 0;
  if (bar.text !== '') { ctx.fillStyle = TXT.ink; ctx.fillText(bar.text, 33, by); textW = ctx.measureText(bar.text).width; }
  if (bar.out) {                                                    // Enter: the text slides up one grain and fades
    const ms = (T - bar.out.t0) * 1000;
    if (ms < 80) { const k = seg(ms, 0, 80); ctx.globalAlpha = 1 - k; ctx.fillStyle = TXT.ink; ctx.fillText(bar.out.text, 33, by - 3 * k); ctx.globalAlpha = 1; }
    else if (ms > 600) bar.out = null;
  }
  if (bar.focus && ((((T - bar.blink) * 1.1) % 1 + 1) % 1) < .5) {
    const cx = Math.round((33 + ctx.measureText(bar.text.slice(0, bar.caret)).width) / 3) * 3;
    ctx.fillStyle = TXT.ink2; ctx.fillRect(cx, by - 9, 6, 18);
  }
  if (bar.text === '') {
    const pa = (1 - ua) * (bar.out ? seg(T - bar.out.t0, .4, .55) : 1);
    if (pa > 0) {
      ctx.globalAlpha = pa; ctx.fillStyle = TXT.dim;
      const pipsX = (Math.floor((UW - 30 - cw) / 3) - pipTotalNow * 3) * 3, rightX = Math.min(pipsX, FLAGS.dev ? Math.floor((UW - 48 - cw - pipTotalNow * 9 - 54) / 3) * 3 - 6 : 1e9);
      ctx.fillText(fitText(barPlaceholder(), rightX - 15 - 51), 51, by); ctx.globalAlpha = 1;       // never into the pips, the counter or the sky button
    }
  }
  if (bar.pv && bar.text !== '') {                                   // live preview after a pause
    const pa = seg(T - bar.last, .15, .27);
    if (pa > 0) { ctx.globalAlpha = pa; ctx.fillStyle = bar.pvWarn ? TXT.warn : TXT.dim; ctx.fillText(bar.pv, Math.round((33 + textW) / 3) * 3 + 9, by); ctx.globalAlpha = 1; }
  }
  if (ua > 0 && u) {
    let t, label;
    if (ext) { t = ext.n + ' stars'; label = 'imported · '; }
    else if (u.type === 'step') { t = u.ev.text; if (t.length > 28) t = t.slice(0, 27) + '…'; label = { fin: 'step done · ', reopen: 'step reopened · ', add: 'step added · ', del: 'step removed · ' }[u.ev.kind]; }
    else { t = stars[u.si].n; if (t.length > 28) t = t.slice(0, 27) + '…'; label = u.type === 'add' ? 'added · ' : 'finished · '; }
    ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace'; ctx.globalAlpha = ua;
    const parts = [[label, TXT.dim], [t, TXT.ink2], ['    ', TXT.dim], ['undo', TXT.ink2], ['  ', TXT.dim], ['z', TXT.dim]];
    let x = 51;
    for (let p = 0; p < parts.length; p++) {
      ctx.fillStyle = parts[p][1]; ctx.fillText(parts[p][0], x, by);
      const w = ctx.measureText(parts[p][0]).width;
      if (p === 3) undoHit = { x0: x / 3, x1: (x + w) / 3 };
      x += w;
    }
    const wgr = Math.ceil((x - 51) / 3), rem = Math.ceil(wgr * (1 - clamp01((T - u.at) / 5)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let g = 0; g < rem; g++) dot(17 + g, timerRow, TXT.dim, ua);
    ctx.globalAlpha = 1;
    ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  }
  ctx.font = '500 12px "IBM Plex Mono", ui-monospace, Consolas, monospace'; ctx.fillStyle = TXT.ink2;
  ctx.fillText(cs, Math.floor((UW - 18 - cw) / 3) * 3, by);
  let vac = -1, vk = 0;
  for (let i = 0; i < NS; i++) { const s = stars[i]; if (!s.done && s.und && US_now(i) && s.und.pipWasOn) { vac = cnt; vk = US_now(i).pipK; } }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const total = pipTotalNow;
  for (let k = 0; k < total; k++) {
    const gx = Math.floor((UW - 30 - cw) / 3) - (total - k) * 3;
    let c = pipColor(k, arr); if (k === vac && vk > 0) c = mixTo([0, 0, 0], K.pipOff, C.done, vk);
    const pa = k === total - 1 && T >= pipLastTNow && T - pipLastTNow < .2 ? seg(T - pipLastTNow, 0, .2) : 1;
    dot(gx, pipRow, css(c), pa); dot(gx, pipRow + 1, css(c), pa);
  }
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0); ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  if (FLAGS.dev) {
    const bx = Math.floor((UW - 48 - cw - total * 9 - 54) / 3) * 3;
    skyBtn = { x: bx - 6, y: BARY + 10, w: 66, h: 40 };
    ctx.fillStyle = skyBtn.hover ? TXT.ink2 : TXT.dim; ctx.fillText('↻ sky', bx, by);
  } else skyBtn = null;
  if (FLAGS.debug) {
    ctx.fillStyle = TXT.dim; ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
    ctx.fillText(msAvg.toFixed(1) + ' ms/frame · P' + P + ' D' + Math.max(1, Math.round(dpr)) + ' dpr' + dpr, 9, 12);
  }
}
import { pipTotal as pipTotalNow, pipLastT as pipLastTNow, US } from '../model/timeline.js';
const US_now = i => US[i];
export function barAnimating() {
  return bar.gCommit >= 0 || T - bar.last < .5 || T - bar.gT0 < .3 || (bar.out && T - bar.out.t0 < .7) || (undoTarget && T - undoTarget.at < 5.4);
}
