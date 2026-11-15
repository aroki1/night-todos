/* ui/bar.js — the bottom bar, its hidden real <input>, undo row and counter. */
import { clamp01, seg, css, mixTo } from '../math.js';
import {
  TXT,
  K,
  C,
  FLAGS,
  SIZE,
  STEPS,
  MORNING,
  TIME,
  GUIDE,
  BARML,
  THOUGHT,
  PRACTICE,
  isReduced,
  setReducedPref,
  getReducedPref
} from '../tokens.js';
import { ctx, cv, P, SH, ROWS, BARY, UW, UH, GW, dpr, geometryListeners } from '../framebuffer.js';
import { T, wall, fmtDate, fmtDay, fmtLeft, WDN, two } from '../sky/clock.js';
import { parseBar, parseStepAnswer, extractTag, barKind, parseWhen } from '../model/parser.js';
import { morningEnter } from '../model/morning.js';
import {
  stars,
  NS,
  GHI,
  MAXS,
  store,
  saveSoon,
  DEMO_ON,
  rebuildStars,
  announce,
  liveThoughts,
  findThought,
  addThought,
  newId,
  findPractice
} from '../model/store.js';
import { undoTarget, externalUndo, doCreate, doCondense, doStepAdd, doLetGo, doPracticeStop, applyImport } from '../model/timeline.js';
import { canCreate, clampLimit, livePractices, dayKey } from '../model/practices.js';
import { newThought, hazeSlots, ageText, afterAsk } from '../model/thoughts.js';
import { placeNew, selIdx, setSelIdx, setMouseHover } from '../model/placement.js';
import { setThoughtSel } from '../render/compose.js';
import { condenseMs } from '../choreo/condense.js';
import { morningPhase, morningCtl } from '../render/morning.js';
import { onboardingHint, helpLines, enterGate } from './guide.js';

export const bar = {
  text: '',
  caret: 0,
  focus: false,
  last: -9,
  title: '',
  tag: null,
  big: false,
  res: null,
  pv: '',
  pvWarn: false,
  gOn: false,
  gA0: 0,
  gT0: -9,
  gCommit: -1,
  blink: -9,
  gpos: null,
  ctr: 0,
  out: null,
  steps: [],
  help: false,
  helpLines: null,
  thought: null,
  letGo: false,
  thoughtHover: null,
  thoughtBack: false,
  backAt: -9e9,
  firstStep: null,
  firstStepSi: -1
};
/* step mode: a selected live star turns the bar into "step for <title>"; Enter adds a step to it */
export function stepTarget() {
  const s = selIdx >= 0 ? stars[selIdx] : null;
  return s && s.on && !s.done && !s.miss && !s.gh && !s.practice ? selIdx : -1;
}
export let undoHit = null,
  skyBtn = null,
  msAvg = 0;
export let wake = () => {};
export function setWake(fn) {
  wake = fn;
}
let input = null,
  composing = false;

function touchLayout() {
  return typeof window !== 'undefined' && ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || window.innerWidth < 700);
}
export function closeHelp() {
  if (!bar.help) return false;
  bar.help = false;
  bar.helpLines = null;
  wake();
  return true;
}

/* the input lies over the bar on touch devices, so a tap lands on it natively (Firefox Android won't raise the keyboard for a programmatic focus) */
function overlayWanted() {
  return (
    typeof window !== 'undefined' &&
    ((window.matchMedia && matchMedia('(pointer: coarse)').matches) || ((navigator.maxTouchPoints || 0) > 0 && window.innerWidth < 700))
  );
}
export function placeBarInput() {
  if (!input || !cv) return;
  const on = overlayWanted();
  input.classList.toggle('over', on);
  const st = input.style;
  if (!on) {
    st.left = st.top = st.width = st.height = st.bottom = '';
    return;
  }
  const r = cv.getBoundingClientRect(),
    k = r.height / UH;
  st.left = r.left + 'px';
  st.top = r.top + BARY * k + 'px';
  st.bottom = 'auto';
  st.width = r.width + 'px';
  st.height = Math.max(1, (UH - BARY) * k) + 'px';
}
geometryListeners.push(placeBarInput);

/* one Enter can come as keydown, beforeinput, form submit or the end of a composition: the gate lets one through. Mid-composition it waits for compositionend
   (or 150 ms: an Enter that never ends the composition still submits what is in the input) */
const gate = enterGate();
let pendingEnter = null;
/* more than one line is only for a new star (Shift+Enter, or a pasted list); "when?", step mode and commands stay one line */
function multiOK() {
  const mp = morningPhase();
  return !bar.thought && stepTarget() < 0 && !(mp && mp !== 'end') && !bar.text.trim().startsWith('/');
}
function syncFromInput() {
  if (input.value.indexOf('\n') >= 0 && (bar.thought || stepTarget() >= 0 || input.value.trimStart().startsWith('/'))) {
    const ask = stepTarget() >= 0 && bar.firstStepSi === stepTarget();
    input.value = input.value.replace(/\s*\n+\s*/g, ask ? ', ' : ' ');
  }
  bar.text = input.value.slice(0, SIZE.maxBar);
  bar.caret = input.selectionStart == null ? bar.text.length : Math.min(bar.text.length, input.selectionStart);
  if (bar.text !== '') bar.letGo = false;
  if (bar.thoughtBack) bar.backAt = T; // typing counts as doing something
  bar.last = T;
}
function fireEnter(ts) {
  pendingEnter = null;
  if (!gate(ts)) return;
  syncFromInput();
  submitBar();
}
function onEnter(ts, midComposition) {
  if (!(composing || midComposition)) return fireEnter(ts);
  if (pendingEnter) return;
  pendingEnter = {
    ts,
    t: setTimeout(() => {
      if (pendingEnter) fireEnter(pendingEnter.ts);
    }, 150)
  };
}

export function initBar(inputEl) {
  input = inputEl;
  input.setAttribute('maxlength', String(SIZE.maxBar));
  input.value = '';
  input.addEventListener('input', () => {
    syncFromInput();
    wake();
  }); // composing or not: the canvas shows the word as it is typed
  input.addEventListener('keydown', onInputKey);
  input.addEventListener('beforeinput', e => {
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      e.preventDefault();
      onEnter(e.timeStamp, e.isComposing);
    }
  });
  if (input.form)
    input.form.addEventListener('submit', e => {
      e.preventDefault();
      onEnter(e.timeStamp, false);
    });
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', e => {
    composing = false;
    syncFromInput();
    wake();
    if (pendingEnter) {
      clearTimeout(pendingEnter.t);
      fireEnter(e.timeStamp);
    }
  });
  input.addEventListener('focus', () => {
    if (!bar.focus) {
      bar.focus = true;
      bar.help = false;
      bar.blink = T;
      wake();
    }
  }); // a native tap on the overlay focuses it
  input.addEventListener('blur', () => {
    if (bar.focus && input.classList.contains('over')) {
      bar.focus = false;
      bar.caret = bar.text.length;
      wake();
    }
  });
  input.addEventListener('select', () => {
    bar.caret = input.selectionStart || 0;
  });
  input.addEventListener('click', () => {
    bar.caret = input.selectionStart || 0;
  });
  placeBarInput();
}
bar.caretMax = () => bar.text.length;

export function setBarFocus(v) {
  bar.focus = !!v;
  if (!input) return;
  if (v) {
    bar.help = false;
    if (bar.thoughtBack) bar.backAt = T;
    input.value = bar.text;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    try {
      input.setSelectionRange(bar.caret, bar.caret);
    } catch (_) {}
    bar.blink = T;
    wake();
  } else {
    input.blur();
    bar.caret = bar.text.length;
  }
}
export function setBarCaret() {
  if (input) {
    try {
      input.setSelectionRange(bar.caret, bar.caret);
    } catch (_) {}
  }
}

function onInputKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const mp = morningPhase();
    if (mp && mp !== 'end') {
      if (mp === 'set') morningCtl.cut();
      else if (mp === 'hold' && bar.text !== '') {
        bar.text = '';
        bar.caret = 0;
        input.value = '';
      } // the first Esc clears what was typed
      else {
        setBarFocus(false);
        morningCtl.leave('');
      }
      wake();
      return;
    }
    if (bar.thought) {
      leaveThoughtWhen('later');
      setBarFocus(false);
      wake();
      return;
    } // "when?" esc: later, the thought stays
    if (stepTarget() >= 0) {
      bar.text = '';
      bar.caret = 0;
      input.value = '';
      setSelIdx(-1);
    } // step mode: Esc deselects, the bar returns to normal
    setBarFocus(false);
    wake();
    return;
  }
  if (bar.thought && bar.text === '' && (e.key === 'Delete' || e.key === 'Backspace')) {
    // an empty answer: let go?
    e.preventDefault();
    bar.letGo = true;
    wake();
    return;
  }
  if ((e.key === 'Enter' || e.keyCode === 13) && e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (multiOK() && input.value.length < SIZE.maxBar) {
      input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
      syncFromInput();
      bar.blink = T;
      wake();
    }
    return;
  }
  if (e.key === 'Enter' || e.keyCode === 13) {
    e.preventDefault();
    onEnter(e.timeStamp, e.isComposing || e.keyCode === 229);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    return;
  }
  bar.blink = T;
  // arrows/backspace/etc. are handled natively; recompute the caret after the event
  setTimeout(() => {
    if (bar.focus) {
      bar.caret = Math.min(bar.caretMax(), input.selectionStart || 0);
      wake();
    }
  }, 0);
}

const shortWhen = ms => {
  const d = new Date(ms);
  return WDN[d.getDay()] + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
};
function whenPreview(w) {
  if (w.kind === 'later') return '';
  if (w.kind === 'bad') return w.err === 'past' ? "that's already gone" : "can't read that";
  const ms = w.date.getTime();
  return w.kind === 'remind' ? '→ remind ' + shortWhen(ms) : '→ ' + fmtDay(ms) + ' · ' + fmtLeft(ms - wall(T));
}
export function barParse() {
  if (bar.thought) {
    // "when?": the answer is not a task's title, deadline and steps
    bar.title = '';
    bar.tag = null;
    bar.big = false;
    bar.steps = [];
    bar.res = null;
    const w = parseWhen(bar.text, wall(T));
    bar.pvWarn = w.kind === 'bad';
    bar.pv = whenPreview(w);
    return;
  }
  const st = stepTarget();
  if (st >= 0) {
    // step mode: the text is a step (or, right after "steps?", a comma list), not a new star
    bar.title = '';
    bar.tag = null;
    bar.big = false;
    bar.steps = [];
    bar.res = null;
    const n = bar.firstStepSi === st ? Math.min(STEPS.maxSteps, parseStepAnswer(bar.text).length) : 0;
    bar.pv = n ? '→ ' + n + (n === 1 ? ' step' : ' steps') : '';
    bar.pvWarn = false;
    return;
  }
  const p = parseBar(bar.text, wall(T));
  bar.title = p.title.slice(0, SIZE.maxTitle);
  bar.tag = p.tag;
  bar.big = p.big;
  bar.steps = p.steps.slice(0, STEPS.maxSteps).map(x => x.slice(0, STEPS.maxText));
  bar.res = p.res;
  const r = bar.res;
  bar.pvWarn = !!(r && r.err);
  const ns = bar.steps.length;
  bar.pv = !r
    ? ''
    : r.ok
      ? '→ ' +
        fmtDate(r.date.getTime()) +
        ' · ' +
        fmtLeft(r.date.getTime() - wall(T)) +
        (bar.tag ? ' · #' + bar.tag : '') +
        (ns ? ' · ' + ns + (ns === 1 ? ' step' : ' steps') : '')
      : r.err === 'past'
        ? "that's already gone"
        : "can't read that";
  if (morningPhase() === 'hold' && !(r && r.ok)) {
    bar.pv = '';
    bar.pvWarn = false;
  }
}
export function ghostAlphaNow() {
  if (bar.gCommit >= 0) return 1 - seg((T - bar.gCommit) * 1000, 550, 900);
  const k = bar.gOn ? seg(T - bar.gT0, 0, 0.25) : seg(T - bar.gT0, 0, 0.2);
  return bar.gOn ? bar.gA0 + (1 - bar.gA0) * k : bar.gA0 * (1 - k);
}
export function barTick() {
  barParse();
  /* a said thought's condense has ended: its new star is selected in step mode and the bar offers its first step */
  if (bar.firstStep && T >= bar.firstStep.at) {
    const si = bar.firstStep.si,
      s = stars[si];
    bar.firstStep = null;
    if (s && !s.done && !s.miss) {
      // the create event replays in this same frame
      setSelIdx(si);
      bar.firstStepSi = si;
      bar.text = '';
      bar.caret = 0;
      if (input) input.value = '';
      if (!touchLayout()) setBarFocus(true);
      wake();
    }
  }
  if (bar.firstStepSi >= 0 && (selIdx !== bar.firstStepSi || bar.thought)) bar.firstStepSi = -1;
  const want = bar.gCommit < 0 && bar.title !== '' && !!(bar.res && bar.res.ok) && stars.length < MAXS;
  if (bar.text === '' && bar.gCommit < 0) bar.gpos = null;
  if (bar.gCommit >= 0 && T - bar.gCommit > 0.95) {
    bar.gCommit = -1;
    bar.gOn = false;
    bar.gA0 = 0;
    bar.gT0 = T;
    bar.gpos = null;
  }
  if (bar.gCommit < 0 && want !== bar.gOn) {
    bar.gA0 = ghostAlphaNow();
    bar.gOn = want;
    bar.gT0 = T;
  }
  if (want && !bar.gpos) bar.gpos = placeNew(bar.title, bar.ctr, bar.big, bar.tag);
  const g = stars[GHI];
  g.ghA = ghostAlphaNow();
  g.n = bar.title;
  g.big = bar.big ? 1 : 0;
  g.life = 1;
  if (bar.gpos) {
    g.gx = bar.gpos.gx;
    g.gy = bar.gpos.gy;
  }
}

/* ---------- commands ---------- */
async function runCommand(cmd) {
  document.documentElement.setAttribute('data-cmd', cmd);
  const [name, ...rest] = cmd.slice(1).trim().split(/\s+/);
  const arg = rest.join(' ');
  if (name === 'help') {
    bar.help = true;
    bar.helpLines = null;
    bar.text = '';
    bar.caret = 0;
    if (input) {
      input.value = '';
      input.blur();
    }
    bar.focus = false;
    announce(helpLines(touchLayout()).join('. '));
    wake();
    return true;
  }
  if (name === 'motion') {
    if (['on', 'off', 'system'].includes(arg)) {
      setReducedPref(arg);
      store.prefs.reducedMotion = arg;
      saveSoon();
      bar.out = { text: 'motion ' + arg, t0: T };
      bar.text = '';
      if (input) input.value = '';
      bar.focus = false;
      if (input) input.blur();
      wake();
      return true;
    }
    bar.out = { text: '/motion on|off|system', t0: T };
    bar.text = '';
    if (input) input.value = '';
    wake();
    return true;
  }
  if (name === 'export') {
    exportStore();
    bar.text = '';
    if (input) input.value = '';
    bar.focus = false;
    if (input) input.blur();
    wake();
    return true;
  }
  if (name === 'import') {
    pickImport();
    bar.text = '';
    if (input) input.value = '';
    bar.focus = false;
    if (input) input.blur();
    wake();
    return true;
  }
  if (name === 'practice') return practiceCommand(arg);
  bar.out = { text: 'unknown command', t0: T };
  bar.text = '';
  if (input) input.value = '';
  wake();
  return true;
}

/* /practice <title> [#tag] | /practice (the list) | /practice stop <name> | /practice limit <n> */
function practiceCommand(arg) {
  const end = () => {
    bar.text = '';
    bar.caret = 0;
    if (input) {
      input.value = '';
      input.blur();
    }
    bar.focus = false;
    wake();
  };
  const out = text => {
    bar.out = { text, t0: T };
  };
  const a = String(arg || '').trim();
  if (!a) {
    const live = livePractices(store.practices),
      names = live.map(p => p.title);
    bar.help = true;
    bar.helpLines = [
      'practices',
      names.length ? names.join(' · ') : 'none yet',
      'mark: click the star',
      'stop: /practice stop <name>',
      'limit: /practice limit <n>'
    ];
    announce(
      (names.length ? names.join('. ') : 'no practices yet') +
        '. mark: click the star. stop: slash practice stop. limit: slash practice limit.'
    );
    end();
    return true;
  }
  const [sub, ...rest] = a.split(/\s+/),
    tail = rest.join(' ');
  if (sub.toLowerCase() === 'stop') {
    const q = tail.trim().toLowerCase(),
      live = livePractices(store.practices);
    if (!q) {
      out('/practice stop <name>');
      end();
      return true;
    }
    const m = live.filter(p => p.title.toLowerCase().startsWith(q));
    if (m.length === 1) {
      doPracticeStop(m[0], T);
      out('stopped ' + m[0].title);
    } else if (!m.length) out('no practice named ' + tail.trim());
    else out('which? ' + m.map(p => p.title).join(' · '));
    end();
    return true;
  }
  if (sub.toLowerCase() === 'limit') {
    const n = Number(tail.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 20) {
      store.prefs.practiceLimit = clampLimit(n);
      saveSoon();
      out('practice limit ' + store.prefs.practiceLimit);
    } else out('practice limit 1..20');
    end();
    return true;
  }
  const ex = extractTag(a),
    title = ex.text.slice(0, SIZE.maxTitle),
    limit = clampLimit(store.prefs.practiceLimit);
  if (!title) {
    out('/practice <title>');
    end();
    return true;
  }
  if (!canCreate(store.practices, limit)) {
    out(PRACTICE.full.replace('{n}', String(limit)));
    end();
    return true;
  }
  const pos = placeNew(title, bar.ctr, false, ex.tag);
  store.practices.push({
    id: newId(),
    title,
    tag: ex.tag,
    x: pos.gx / (GW - 1),
    y: pos.gy / (SH - 1),
    createdAt: wall(T),
    days: [],
    archivedAt: null
  });
  saveSoon();
  rebuildStars();
  bar.ctr++;
  announce('practice: ' + title);
  out('practice: ' + title);
  end();
  return true;
}

function exportStore() {
  const data = {
    version: 1,
    tasks: store.tasks,
    thoughts: store.thoughts,
    practices: store.practices,
    useMs: store.useMs,
    lastAskUse: store.lastAskUse,
    weeks: store.weeks,
    lastSeenWeek: store.lastSeenWeek,
    prefs: store.prefs,
    exportedAt: new Date(wall(T)).toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date(wall(T));
  a.href = URL.createObjectURL(blob);
  a.download =
    'night-sky-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  bar.out = { text: 'exported', t0: T };
}
function pickImport() {
  const f = document.createElement('input');
  f.type = 'file';
  f.accept = 'application/json,.json';
  f.addEventListener('change', () => {
    const file = f.files && f.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(String(rd.result));
        const n = applyImport(raw, T);
        if (n !== null) rebuildStars();
        bar.out = { text: n === null ? "can't read that file" : 'imported · ' + n + ' stars', t0: T };
      } catch (_) {
        bar.out = { text: "can't read that file", t0: T };
      }
      wake();
    };
    rd.readAsText(file);
  });
  f.click();
}

function clearBar() {
  bar.text = '';
  bar.caret = 0;
  bar.letGo = false;
  if (input) input.value = '';
}

/* a coming back ended with `outcome`: record it on the thought (only thoughts that actually came back advance a step) */
function settleThought(id, outcome) {
  const th = findThought(id);
  if (!th) return;
  Object.assign(th, afterAsk(th, wall(T), store.useMs, outcome));
  saveSoon();
}
/* enter "when?" for a thought: the bar asks the question; `focus` false leaves the input closed until Enter.
   `back` marks a thought that came back by itself: leaving it unanswered is `ignored`, Esc is `later`. */
export function enterThoughtWhen(id, focus, back) {
  if (bar.thought && bar.thought !== id) leaveThoughtWhen('ignored');
  const same = bar.thought === id;
  bar.thought = id;
  if (!same || back) {
    bar.thoughtBack = !!back;
    bar.backAt = back ? T : -9e9;
  }
  bar.letGo = false;
  bar.thoughtHover = null;
  bar.firstStepSi = -1;
  setSelIdx(-1);
  setMouseHover(-1);
  setThoughtSel(id);
  clearBar();
  bar.last = T;
  if (focus) setBarFocus(true);
  wake();
}
export function leaveThoughtWhen(outcome) {
  if (!bar.thought) return false;
  const id = bar.thought,
    wasBack = bar.thoughtBack;
  bar.thought = null;
  bar.thoughtBack = false;
  bar.backAt = -9e9;
  bar.letGo = false;
  bar.firstStepSi = -1;
  setThoughtSel(null);
  clearBar();
  if (wasBack && outcome) settleThought(id, outcome);
  wake();
  return true;
}
/* a thought was written: keep it, clear the bar, ask "when?" and stay focused */
function keepThought() {
  const text = bar.title.slice(0, SIZE.maxTitle);
  if (!text) return false;
  const th = newThought(text, bar.tag, wall(T), newId(), store.useMs, bar.big);
  addThought(th);
  bar.out = { text: bar.text, t0: T };
  enterThoughtWhen(th.id, true);
  announce('thought kept');
  return true;
}
/* Enter in "when?": say, remind, later, or (on an empty bar) let go */
function submitWhen() {
  if (bar.letGo && bar.text === '') return letGoNow();
  const now = wall(T),
    w = parseWhen(bar.text, now);
  if (w.kind === 'bad') return false;
  const th = findThought(bar.thought);
  if (!th) {
    leaveThoughtWhen();
    return false;
  }
  if (w.kind === 'later') {
    leaveThoughtWhen('later');
    setBarFocus(false);
    return true;
  }
  if (w.kind === 'remind') {
    th.remindAt = w.date.getTime();
    th.usedMs = Math.max(0, now - th.createdAt);
    saveSoon();
    announce('remind ' + shortWhen(th.remindAt));
    leaveThoughtWhen('remind');
    setBarFocus(false);
    return true;
  }
  const big = w.big || !!th.big; // a `!` on the thought or on the answer
  const pos = placeNew(th.text, bar.ctr, big, th.tag);
  const slot = hazeSlots(liveThoughts(), GW).find(p => p.id === th.id); // where its haze is now: the condense starts there
  const si = doCreate(th.text, pos.gx, pos.gy, big, w.date.getTime(), T, w.steps, th.tag);
  if (si < 0) return false;
  if (slot) doCondense(th.id, si, slot.x, SH - THOUGHT.bandY + THOUGHT.bandH / 2, T);
  th.saidAt = now;
  th.taskId = stars[si] ? stars[si].id : null;
  th.usedMs = Math.max(0, now - th.createdAt);
  saveSoon();
  bar.ctr++;
  bar.out = { text: bar.text, t0: T };
  bar.gpos = pos;
  bar.firstStepSi = -1;
  if (!w.steps.length) bar.firstStep = { si, at: T + condenseMs(isReduced()) / 1000 }; // when the condense ends: ask for its steps
  announce('said: ' + th.text);
  leaveThoughtWhen('said');
  setBarFocus(false);
  return true;
}
function letGoNow() {
  const th = findThought(bar.thought);
  bar.letGo = false;
  if (!th) {
    leaveThoughtWhen();
    return false;
  }
  doLetGo(th, T);
  bar.out = { text: th.text, t0: T };
  leaveThoughtWhen('gone');
  setBarFocus(false);
  return true;
}

export function submitBar() {
  barParse();
  const mp = morningPhase();
  if (mp && mp !== 'end') return submitMorning(mp);
  if (bar.text.trim().startsWith('/')) {
    bar.firstStepSi = -1;
    const r = runCommand(bar.text.trim());
    leaveThoughtWhen();
    return r;
  }
  const sel = stepTarget();
  if (sel >= 0) {
    // step mode: the whole text is one step; a full list quietly refuses
    const tx = bar.text.trim();
    if (bar.firstStepSi === sel) {
      // "steps?": a comma list; an empty Enter skips
      const list = parseStepAnswer(tx);
      if (!list.length) {
        bar.firstStepSi = -1;
        clearBar();
        setSelIdx(-1);
        setBarFocus(false);
        wake();
        return true;
      }
      let n = 0;
      for (const x of list) if (doStepAdd(sel, x, T)) n++;
      if (!n) return false;
      bar.firstStepSi = -1;
      bar.out = { text: bar.text, t0: T };
      clearBar();
      bar.last = T;
      wake();
      return true;
    }
    if (!tx) return false;
    if (!doStepAdd(sel, tx, T)) return false;
    bar.firstStepSi = -1;
    bar.out = { text: bar.text, t0: T };
    bar.text = '';
    bar.caret = 0;
    if (input) input.value = '';
    bar.last = T;
    wake();
    return true;
  }
  if (bar.thought) return submitWhen();
  if (barKind(bar.text, wall(T)) === 'thought') return keepThought();
  const r = bar.res;
  if (bar.title === '' || !r || !r.ok || stars.length >= MAXS) return false;
  const pos = bar.gpos || placeNew(bar.title, bar.ctr, bar.big, bar.tag);
  const si = doCreate(bar.title, pos.gx, pos.gy, bar.big, r.date.getTime(), T, bar.steps, bar.tag);
  const ask = si >= 0 && bar.steps.length === 0; // no steps given: the bar asks for them
  bar.ctr++;
  bar.out = { text: bar.text, t0: T };
  bar.gpos = pos;
  bar.gCommit = T;
  bar.gOn = true;
  bar.text = '';
  bar.caret = 0;
  if (input) input.value = '';
  bar.firstStepSi = -1;
  if (ask) bar.firstStep = { si, at: T };
  else setBarFocus(false);
  wake();
  return true;
}
/* Enter during the morning: before the hold it hurries the sunrise; in the hold the text names the week, or adds a task when it
   parses with a deadline (morningEnter decides); then the sunset starts. The new star assembles near the end of the sunset. */
function submitMorning(mp) {
  if (mp === 'night' || mp === 'rise') {
    morningCtl.advance();
    wake();
    return true;
  }
  if (mp !== 'hold') return false;
  const m = morningEnter(bar.text, wall(T));
  if (m.kind === 'cmd') return runCommand(bar.text.trim());
  if (m.kind === 'task') {
    const r = bar.res;
    if (bar.title === '' || !r || !r.ok || stars.length >= MAXS) return false;
    morningCtl.leave('');
    const pos = placeNew(bar.title, bar.ctr, bar.big, bar.tag);
    doCreate(bar.title, pos.gx, pos.gy, bar.big, r.date.getTime(), T + TIME.morning.createAt / 1000, bar.steps, bar.tag);
    bar.ctr++;
  } else morningCtl.leave(m.kind === 'name' ? m.name : '');
  bar.out = { text: bar.text, t0: T };
  bar.text = '';
  bar.caret = 0;
  if (input) input.value = '';
  setBarFocus(false);
  wake();
  return true;
}
export function tryUndo(doUndoFn) {
  const u = externalUndo || undoTarget;
  if (u && T - u.at < 5) {
    doUndoFn(T);
    wake();
    return true;
  }
  return false;
}

/* ---------- drawing ---------- */
function dot(gx, gy, col, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.fillRect(gx * P, gy * P, Math.max(1, P - Math.max(1, Math.round(dpr))), Math.max(1, P - Math.max(1, Math.round(dpr))));
}
function pipColor(k, arr) {
  if (k >= arr.length || arr[k] > T) return K.pipOff;
  const e = (T - arr[k]) * 1000;
  return e < 80 ? mixTo([0, 0, 0], K.pipOff, C.core, e / 80) : e < 280 ? mixTo([0, 0, 0], C.core, C.done, (e - 80) / 200) : C.done;
}
/* the text cut with an ellipsis so it is at most maxW wide in the current font (units of the bar) */
export function fitText(t, maxW) {
  if (ctx.measureText(t).width <= maxW) return t;
  let n = t.length;
  while (n > 1 && ctx.measureText(t.slice(0, n).trimEnd() + '…').width > maxW) n--;
  return t.slice(0, n).trimEnd() + '…';
}
export function barPlaceholder() {
  if (morningPhase() === 'hold') return MORNING.text.name;
  if (bar.help) return GUIDE.open;
  if (bar.thought) {
    if (bar.letGo && bar.text === '') return GUIDE.letGo;
    if (bar.thoughtBack) {
      const th = findThought(bar.thought),
        age = th ? ageText(th.createdAt, wall(T)) : 'today';
      return GUIDE.whenBack.replace('{age}', age === 'today' ? 'today' : age + ' ago');
    }
    return touchLayout() ? GUIDE.whenTouch : GUIDE.when;
  }
  const st = stepTarget();
  if (st >= 0) {
    if (bar.firstStepSi === st) return touchLayout() ? GUIDE.firstStepTouch : GUIDE.firstStep;
    const n = stars[st].n;
    return 'step for ' + (n.length > 28 ? n.slice(0, 27) + '…' : n);
  }
  return onboardingHint({
    taskCount: store.tasks.length,
    hasLive: stars.some(s => s.on && !s.done && !s.miss && !s.gh),
    hasDone: store.tasks.some(t => Number.isFinite(t.doneAt)),
    demo: DEMO_ON,
    touch: touchLayout()
  });
}

function drawHelpPanel() {
  if (!bar.help) return;
  const lines = bar.helpLines || helpLines(touchLayout()),
    o = GUIDE.panel;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  let textW = 0;
  for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width);
  const w = Math.min(UW - o.margin * 6, Math.ceil((textW + o.padX * 6) / 3) * 3);
  const hG = o.padY * 2 + lines.length * o.row,
    xG = o.margin,
    yG = Math.max(o.margin, SH - o.margin - hG);
  const x1G = Math.min(Math.floor(UW / 3) - o.margin, xG + Math.ceil(w / 3));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let gy = yG; gy < yG + hG; gy++)
    for (let gx = xG; gx < x1G; gx++) {
      const edge = gx === xG || gx === x1G - 1 || gy === yG || gy === yG + hG - 1;
      dot(gx, gy, edge ? TXT.rule : TXT.bg, o.alpha);
    }
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? TXT.ink : TXT.ink2;
    ctx.fillText(lines[i], xG * 3 + o.padX * 3, (yG + o.padY + i * o.row + Math.floor(o.row / 2)) * 3);
  }
}

export function drawBar() {
  const barRows = ROWS - SH;
  const by = BARY + Math.round(barRows * 0.5) * 3;
  const pipRow = SH + Math.round(barRows * 0.45);
  const timerRow = SH + barRows - 6;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = TXT.bg;
  ctx.fillRect(0, SH * P, cv.width, cv.height - SH * P);
  ctx.fillStyle = TXT.rule;
  ctx.fillRect(0, SH * P, cv.width, Math.max(1, Math.round(dpr)));
  drawHelpPanel();
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '500 12px ' + '"IBM Plex Mono", ui-monospace, Consolas, monospace';
  /* several lines grow the bar upward: the last line sits on the bar row, the earlier ones stack above it on a panel (at most BARML.max rows) */
  const allLines = bar.text.split('\n'),
    lines = allLines.slice(-BARML.max),
    nL = lines.length,
    cut = allLines.length - nL,
    rowY = j => by - BARML.row * (nL - 1 - j);
  if (nL > 1) {
    const top = by - BARML.row * (nL - 1) - BARML.row / 2;
    ctx.globalAlpha = BARML.alpha;
    ctx.fillStyle = TXT.bg;
    ctx.fillRect(0, top, UW, BARY - top);
    ctx.globalAlpha = 1;
    ctx.fillStyle = TXT.rule;
    ctx.fillRect(0, top, UW, 1);
  }
  ctx.fillStyle = TXT.ink2;
  ctx.fillText('›', 18, rowY(0));
  /* the asked thought (or the hovered one) names itself above its haze: text in the dim label ink, the age dimmer, centred on the patch, clear of the bar and the haze */
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  const lt = bar.thought ? findThought(bar.thought) : bar.thoughtHover ? findThought(bar.thoughtHover) : null;
  const lq = lt ? hazeSlots(liveThoughts(), GW).find(p => p.id === lt.id) : null;
  if (lt && lq) {
    const age = ' · ' + ageText(lt.createdAt, wall(T)),
      room = Math.min(UW - 18, 270);
    const head = fitText(lt.text, Math.max(60, room - ctx.measureText(age).width));
    const hw = ctx.measureText(head).width,
      aw = ctx.measureText(age).width,
      lw = hw + aw;
    const lx = Math.max(9, Math.min(UW - 9 - lw, lq.x * 3 - lw / 2)),
      ly = (SH - THOUGHT.bandY - 6) * 3;
    ctx.fillStyle = TXT.ink2;
    ctx.globalAlpha = THOUGHT.labelAlpha;
    ctx.fillText(head, lx, ly);
    ctx.fillStyle = TXT.dim;
    ctx.globalAlpha = THOUGHT.ageAlpha;
    ctx.fillText(age, lx + hw, ly);
    ctx.globalAlpha = 1;
  }
  // counter: pips fill at the arrival of each connection (measured first: the placeholder must stop before it)
  const arr = [];
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.done && s.on) arr.push(s.fin ? s.fin.t0 + s.fin.arriveMs / 1000 : -1e9);
  }
  arr.sort((a, b) => a - b);
  let cnt = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= T) cnt++;
  const cs = cnt + ' / ' + pipTotalNow;
  ctx.font = '500 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  const cw = ctx.measureText(cs).width;
  const typing = bar.focus || bar.text !== '';
  const ext = externalUndo,
    u = ext || undoTarget;
  let ua = u ? (T - u.at < 5 ? 1 : 1 - seg(T - u.at, 5, 5.3)) : 0;
  if (typing) ua = 0;
  undoHit = null;
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  let textW = 0;
  const pvJ = cut > 0 ? nL - 1 : 0; // the preview sits after the first line (the title), or the last visible one
  if (bar.text !== '') {
    ctx.fillStyle = TXT.ink;
    for (let j = 0; j < nL; j++) ctx.fillText(lines[j], 33, rowY(j));
    textW = ctx.measureText(lines[pvJ]).width;
  }
  if (bar.out) {
    // Enter: the text slides up one grain and fades
    const ms = (T - bar.out.t0) * 1000;
    if (ms < 80) {
      const k = seg(ms, 0, 80);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = TXT.ink;
      ctx.fillText(bar.out.text.split('\n')[0], 33, by - 3 * k);
      ctx.globalAlpha = 1;
    } else if (ms > 600) bar.out = null;
  }
  if (bar.focus && ((((T - bar.blink) * 1.1) % 1) + 1) % 1 < 0.5) {
    const before = bar.text.slice(0, bar.caret).split('\n'),
      cj = before.length - 1 - cut;
    if (cj >= 0) {
      const cx = Math.round((33 + ctx.measureText(before[before.length - 1]).width) / 3) * 3;
      ctx.fillStyle = TXT.ink2;
      ctx.fillRect(cx, rowY(cj) - 9, 6, 18);
    }
  }
  if (bar.text === '') {
    const pa = (1 - ua) * (bar.out ? seg(T - bar.out.t0, 0.4, 0.55) : 1);
    if (pa > 0) {
      ctx.globalAlpha = pa;
      ctx.fillStyle = TXT.dim;
      const pipsX = (Math.floor((UW - 30 - cw) / 3) - pipTotalNow * 3) * 3,
        rightX = Math.min(pipsX, FLAGS.dev ? Math.floor((UW - 48 - cw - pipTotalNow * 9 - 54) / 3) * 3 - 6 : 1e9);
      ctx.fillText(fitText(barPlaceholder(), rightX - 15 - 51), 51, by);
      ctx.globalAlpha = 1; // never into the pips, the counter or the sky button
    }
  }
  if (bar.pv && bar.text !== '') {
    // live preview after a pause
    const pa = seg(T - bar.last, 0.15, 0.27);
    if (pa > 0) {
      ctx.globalAlpha = pa;
      ctx.fillStyle = bar.pvWarn ? TXT.warn : TXT.dim;
      const px = Math.round((33 + textW) / 3) * 3 + 9;
      ctx.fillText(fitText(bar.pv, Math.max(30, UW - 18 - cw - pipTotalNow * 9 - 20 - px)), px, rowY(pvJ));
      ctx.globalAlpha = 1;
    }
  }
  if (ua > 0 && u) {
    let t, label;
    if (ext) {
      t = ext.n + ' stars';
      label = 'imported · ';
    } else if (u.type === 'thought') {
      t = u.th.text;
      if (t.length > 28) t = t.slice(0, 27) + '…';
      label = 'let go · ';
    } else if (u.type === 'practice') {
      const p = findPractice(u.pid),
        day = u.day === dayKey(wall(T)) ? 'today' : 'yesterday';
      t = (p ? p.title : 'practice') + ' · ' + day + ' ' + (u.on ? '✓' : '·');
      if (t.length > 28) t = t.slice(0, 27) + '…';
      label = '';
    } else if (u.type === 'practiceStop') {
      t = u.name;
      if (t.length > 28) t = t.slice(0, 27) + '…';
      label = 'stopped · ';
    } else if (u.type === 'step') {
      t = u.ev.text;
      if (t.length > 28) t = t.slice(0, 27) + '…';
      label = { fin: 'step done · ', reopen: 'step reopened · ', add: 'step added · ', del: 'step removed · ' }[u.ev.kind];
    } else {
      t = stars[u.si].n;
      if (t.length > 28) t = t.slice(0, 27) + '…';
      label = u.type === 'add' ? 'added · ' : 'finished · ';
    }
    ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
    ctx.globalAlpha = ua;
    const parts = [
      [label, TXT.dim],
      [t, TXT.ink2],
      ['    ', TXT.dim],
      ['undo', TXT.ink2],
      ['  ', TXT.dim],
      ['z', TXT.dim]
    ];
    let x = 51;
    for (let p = 0; p < parts.length; p++) {
      ctx.fillStyle = parts[p][1];
      ctx.fillText(parts[p][0], x, by);
      const w = ctx.measureText(parts[p][0]).width;
      if (p === 3) undoHit = { x0: x / 3, x1: (x + w) / 3 };
      x += w;
    }
    const wgr = Math.ceil((x - 51) / 3),
      rem = Math.ceil(wgr * (1 - clamp01((T - u.at) / 5)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let g = 0; g < rem; g++) dot(17 + g, timerRow, TXT.dim, ua);
    ctx.globalAlpha = 1;
    ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  }
  ctx.font = '500 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  ctx.fillStyle = TXT.ink2;
  ctx.fillText(cs, Math.floor((UW - 18 - cw) / 3) * 3, by);
  let vac = -1,
    vk = 0;
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (!s.done && s.und && US_now(i) && s.und.pipWasOn) {
      vac = cnt;
      vk = US_now(i).pipK;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const total = pipTotalNow;
  for (let k = 0; k < total; k++) {
    const gx = Math.floor((UW - 30 - cw) / 3) - (total - k) * 3;
    let c = pipColor(k, arr);
    if (k === vac && vk > 0) c = mixTo([0, 0, 0], K.pipOff, C.done, vk);
    const pa = k === total - 1 && T >= pipLastTNow && T - pipLastTNow < 0.2 ? seg(T - pipLastTNow, 0, 0.2) : 1;
    dot(gx, pipRow, css(c), pa);
    dot(gx, pipRow + 1, css(c), pa);
  }
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
  if (FLAGS.dev) {
    const bx = Math.floor((UW - 48 - cw - total * 9 - 54) / 3) * 3;
    skyBtn = { x: bx - 6, y: BARY + 10, w: 66, h: 40 };
    ctx.fillStyle = skyBtn.hover ? TXT.ink2 : TXT.dim;
    ctx.fillText('↻ sky', bx, by);
  } else skyBtn = null;
  if (FLAGS.debug) {
    ctx.fillStyle = TXT.dim;
    ctx.font = '400 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
    ctx.fillText(msAvg.toFixed(1) + ' ms/frame · P' + P + ' D' + Math.max(1, Math.round(dpr)) + ' dpr' + dpr, 9, 12);
  }
}
import { pipTotal as pipTotalNow, pipLastT as pipLastTNow, US } from '../model/timeline.js';
const US_now = i => US[i];
export function barAnimating() {
  return (
    bar.gCommit >= 0 ||
    T - bar.last < 0.5 ||
    T - bar.gT0 < 0.3 ||
    (bar.out && T - bar.out.t0 < 0.7) ||
    (undoTarget && T - undoTarget.at < 5.4)
  );
}
