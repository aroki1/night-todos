/* main.js — boot, geometry, the loop, resize and visibility. */
import { FLAGS, FPS, TIME, isReduced, setReducedPref, LAYOUT, SIZE } from './tokens.js';
import { initCanvas, configure, cv, GW, SH, ROWS, dpr, blit } from './framebuffer.js';
import { setT, T, wall, clockTick, isoWeekKey, seedForWeek, weekLabel, resyncClock } from './sky/clock.js';
import { archivePast } from './model/week.js';
import { setMorningScene, clearMorningScene, morningScene, morningNow, morningPhase, morningCfg, morningCtl, setMorningName, drawMorningText, morningLabelK } from './render/morning.js';
import { makeSky } from './sky/sky.js';
import { cloudsForce, cloudReset, setCloudPace } from './sky/clouds.js';
import { store, loadModel, flushSave, saveSoon, syncStarPositions, rebuildStars, stars, NS, DEMO_ON, THOUGHTS_DEMO, advanceUseMs, findThought, isUrgent, setAnnouncer, setPersistence } from './model/store.js';
import { shouldStartMorning, isPresent, nextDue, nextAway, seasonOf, weekSummary, withSummary, withName, cleanName } from './model/morning.js';
import { pickDue, thoughtMayCome } from './model/thoughts.js';
import { doFinish, doUndo, pushMorning, clearMorning } from './model/timeline.js';
import { initBar, bar, setWake, drawBar, barTick, barAnimating, undoHit, enterThoughtWhen, leaveThoughtWhen } from './ui/bar.js';
import { drawLabels, drawGroupTag, drawPastHover } from './render/text.js';
import { setGhostInfo } from './model/placement.js';
import { bindKeys, finishFocused } from './ui/keys.js';
import { bindPointer, toUnits, hitStar } from './ui/pointer.js';
import { prepare, compose, setFrozen, setFrozenForce, isAnimating, skySwap } from './render/compose.js';
import { computeFocus, updateHover, clearWidthCache, setForceFocus, setMouseHover, setSelIdx, selIdx, lab } from './model/placement.js';
import { updatePastHover, rebuildPast, resetPastHover, setPointerGrain, setPastSkip } from './sky/past.js';
import { notifyUrgent, notifyMissed, isTauri, loadStore, saveStore } from './platform.js';
import { moonSt } from './sky/moon.js';
import * as pf from './stageprof.js';

let raf = 0, lastTs = 0, lastRenderTs = -1e9, lastInput = -1e9, textReady = true, running = false, booted = false, sceneFrozen = false;
const missedAnnounced = new Set();
const INPUT_ACTIVE_MS = 300;   // after a pointer move or key press the loop renders at the active rate for this long

function computeGeometry() {
  const vw = window.innerWidth, vh = window.innerHeight, ratio = window.devicePixelRatio || 1;
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || vw < 700;
  const barRows = touch ? LAYOUT.barRowsTouch : LAYOUT.barRowsDesktop;
  // One grain is P device px = P/ratio CSS px (P is rounded to whole device px, so it is not always 3 CSS px,
  // e.g. dpr 1.25 -> 4/1.25 = 3.2). Size the grid in real CSS grains so canvas + bar never exceed the viewport.
  const g = Math.max(3, Math.round(3 * ratio)) / ratio;
  const gw = Math.max(LAYOUT.minGrainsW, Math.floor(vw / g));
  const sh = Math.max(LAYOUT.minGrainsH, Math.floor((vh - barRows * g) / g));
  return { gw, sh, rows: sh + barRows, ratio };
}
function applyGeometry() {
  const g = computeGeometry();
  configure(g.gw, g.sh, g.rows - g.sh, g.ratio);
  clearWidthCache();
  cloudReset();
  syncStarPositions();
  rebuildPast();
  clockTick(true);
  cloudsForce();
}

function renderNow(force) {
  if (FLAGS.dev) window.__nsRenders = (window.__nsRenders || 0) + 1;     // dev only: render counter for perf checks
  if (pf.on) pf.begin();
  setFrozenForce(!!force);
  barTick();
  setGhostInfo({ title: bar.title, gCommit: bar.gCommit });
  if (pf.on) pf.mark('pre');
  prepare(); compose(); blit();
  if (textReady) {                                                                   // no canvas text until the fonts are in
    if (morningScene()) { drawLabelsFaded(morningLabelK()); if (pf.on) { pf.mark('text.labels'); pf.mark('text.pastHover'); } }
    else {
      drawLabels(); drawGroupTag(); if (pf.on) pf.mark('text.labels');
      drawPastHover(); if (pf.on) pf.mark('text.pastHover');
    }
    drawMorningText(); if (pf.on) pf.mark('text.morning');
    drawBar(); if (pf.on) pf.mark('text.bar');
  }
  setFrozenForce(false);
  updateAria();
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.miss && s.mT >= 0 && !missedAnnounced.has(i)) { missedAnnounced.add(i); announce(s.n + ' missed'); }
  }
  if (pf.on) { pf.mark('post'); pf.end(); }
}
/* the labels while the morning plays: the night's own labels, faded by k (the night closes on them, the sunset gives them back) */
function drawLabelsFaded(k) {
  if (k <= .01) return;
  const keep = [];
  for (let i = 0; i < NS; i++) { const L = lab[i]; if (!L.shown) continue; keep.push(L.a1, L.a2, L.a3, L.hintK, L.listK); L.a1 *= k; L.a2 *= k; L.a3 *= k; L.hintK *= k; L.listK *= k; }
  drawLabels();
  for (let i = 0, q = 0; i < NS; i++) { const L = lab[i]; if (!L.shown) continue; L.a1 = keep[q]; L.a2 = keep[q + 1]; L.a3 = keep[q + 2]; L.hintK = keep[q + 3]; L.listK = keep[q + 4]; q += 5; }
}
function updateAria() {
  let done = 0, total = 0;
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.gh) continue;
    if (!s.on) continue;
    if (s.on && !s.miss) total++;
    if (s.done) done++;
  }
  const el = document.getElementById('sky');
  if (el) el.setAttribute('aria-label', done + ' of ' + total + ' done this week');
}
let announceTimer = 0;
function announce(msg) {
  const el = document.getElementById('live');
  if (!el) return;
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = msg; }, 30);
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  const raw = Math.max(0, ts - lastTs);
  const dt = Math.min(.05, raw / 1000); lastTs = ts;
  setT(T + dt);
  useTick(raw);
  if (resyncClock()) checkRollover();
  morningTick(ts);
  thoughtTick(ts);
  computeFocus();
  const hm = updateHover(dt), pm = updatePastHover(dt);
  const active = isAnimating() || barAnimating() || hm || pm || ts - lastInput < INPUT_ACTIVE_MS;
  /* active: every RAF (the display rate). idle: at most FPS.idle renders/s; the still morning hold runs at FPS.morning unless reduced motion.
     3 ms of slack so a 60 Hz display gets 4 frames, not 5 */
  const fps = morningPhase() === 'hold' && !isReduced() ? FPS.morning : FPS.idle;
  if (!active && ts - lastRenderTs < 1000 / fps - 3) return;
  lastRenderTs = ts;
  setCloudPace(active ? 0 : 2);
  renderNow(false);
  desktopNotify();
}

function startLoop() {
  if (running) return;
  running = true; lastTs = 0; lastRenderTs = -1e9;
  raf = requestAnimationFrame(loop);
}
function stopLoop() { running = false; cancelAnimationFrame(raf); }

/* one notification per task when it becomes urgent, and one when its deadline passes */
const urgentSent = new Set();
function desktopNotify() {
  if (!isTauri) return;
  const now = wall(T);
  for (const s of stars) {
    const t = s.task; if (!t || t.doneAt) continue;
    if (isUrgent(s, now) && s.life > 0) { if (!urgentSent.has(t.id)) { urgentSent.add(t.id); notifyUrgent(t, now); } }
    if (t.deadline <= now) notifyMissed(t);
  }
}

const api = {
  canvas: () => cv,
  render(force) { renderNow(!!force); },
  freeze(t, doRender = true) {
    stopLoop();
    setFrozen(true);
    sceneFrozen = true;
    if (t !== null && t !== undefined) setT(t);
    if (doRender) renderNow(true);
  },
  stop() { stopLoop(); },
  frame() { setCloudPace(0); renderNow(false); },                       // dev: one active-rate frame (what the loop does when not idle), for ns.profRun
  prepareCompose() { prepare(); compose(); },
  showMorning(cfg, o = {}) {
    beginMorning(cfg);
    if (o.leaveMs !== null && o.leaveMs !== undefined) leaveMorning(cfg.t0 + o.leaveMs / 1000, '');
    renderNow(true); return true;
  },
  hideMorning() { clearMorningScene(); clearMorning(); setPastSkip(null); renderNow(true); return true; },
  clickSky() { skySwap(11, T); renderNow(false); },
  clickUndo() {
    const u = undoHit;
    if (!u) return;
    api.freeze(T);
    doUndo(T);
    renderNow(false);
  },
  finishAt(pxUnit, pyUnit) {
    const i = hitStar(pxUnit, pyUnit, false);
    if (i >= 0) { setSelIdx(i); doFinish(i, T, true); setSelIdx(-1); renderNow(false); }
  },
  askNow() {                                                    // dev: run the pick and deliver, ignoring presence
    const id = pickDue(store.thoughts, wall(T), store.useMs, store.lastAskUse);
    return id ? deliverThought(id) : null;
  }
};

function applyScenes() {
  const ns = window.ns;
  if (!ns) return;
  const at = FLAGS.at;
  let tFreeze = FLAGS.t, freeze = FLAGS.freeze;
  const sname = FLAGS.star;
  if (FLAGS.scene === 'finish' || FLAGS.scene === 'urgent') {
    const nm = sname || (FLAGS.scene === 'urgent' ? 'os linux hw 3' : 'patterns quiz prep');
    ns.finish(nm, 2.0, false);
    tFreeze = 2.0 + (at === null ? 850 : at) / 1000; freeze = true;
  } else if (FLAGS.scene === 'overlap') {
    ns.finish('patterns quiz prep', 2.0, false); ns.finish('os linux hw 3', 2.3, false);
    tFreeze = 2.0 + (at === null ? 1200 : at) / 1000; freeze = true;
  } else if (FLAGS.scene === 'undo') {
    ns.finish(sname || 'patterns quiz prep', 2.0, false); ns.undo(4.0);
    tFreeze = 4.0 + (at === null ? 350 : at) / 1000; freeze = true;
  } else if (FLAGS.scene === 'labels') {
    ns.move('hm one-pager', 394, 40); ns.move('os linux hw 3', 62, 90); ns.move('patterns quiz prep', 392, 124); freeze = true;
  } else if (FLAGS.scene === 'occlusion') {
    ns.move('os linux hw 3', 123, 73); ns.finish('patterns quiz prep', 2.0, false);
    tFreeze = 2.0 + (at === null ? 2600 : at) / 1000; freeze = true;
  } else if (FLAGS.scene === 'expire') {
    const s = stars.find(x => x.n.indexOf('os linux hw 3') >= 0);
    if (s) { s.dl = wall(0) + 2000; s.lifeFix = .13; }
    tFreeze = 2.0 + (at === null ? 400 : at) / 1000; freeze = true;
  } else if (FLAGS.scene === 'steps') {                           // step visuals: ?scene=steps, &live=1 to run in real time
    const q = new URLSearchParams(location.search), t0 = FLAGS.t || 3;
    setT(t0); freeze = q.get('live') !== '1'; tFreeze = t0;
    if (q.get('stepfin')) { ns.stepsFinish(q.get('stepfin'), t0); tFreeze = t0 + (at === null ? 200 : at) / 1000; }
    if (q.get('stepundo')) { ns.stepsUndo(q.get('stepundo'), t0); tFreeze = t0 + (at === null ? 200 : at) / 1000; }
    if (q.get('sel')) ns.select(q.get('sel'));
  } else if (FLAGS.scene === 'crossfade') {
    ns.skySwap(FLAGS.devSeed || 11, tFreeze);
    tFreeze += (at === null ? 450 : at) / 1000; freeze = true;
  }
  if (FLAGS.tags) ns.tagDemo();                                                                                           // dev: ?tags=1 gives the demo stars tags
  if (new URLSearchParams(location.search).get('select')) ns.select(new URLSearchParams(location.search).get('select'));   // dev: ?select=<title> selects a star
  if (FLAGS.hover !== null) ns.hover(FLAGS.hover);
  if (FLAGS.script) { ns.script(FLAGS.script); document.documentElement.setAttribute('data-ready', '1'); return true; }
  if (FLAGS.bench) {
    const r = ns.bench(FLAGS.frames);
    document.title = 'bench ' + JSON.stringify(r) + ' P' + 3;
    return true;
  }
  if (FLAGS.dev && new URLSearchParams(location.search).get('weeks')) {
    ns.injectWeeks(+new URLSearchParams(location.search).get('weeks') || 6);
    freeze = true;
  }
  if (FLAGS.morning) {      // dev: ?morning=1 [&at=<ms>&leave=<ms>&away=<n>&season=&gap=paper|mosaic&flowers=&buds=], frozen unless &live=1
    const q = new URLSearchParams(location.search);
    ns.morning({ season: FLAGS.season, gap: FLAGS.gap, flowers: FLAGS.flowers, buds: FLAGS.buds, at: FLAGS.at, away: FLAGS.away, leave: q.has('leave') ? +q.get('leave') : null });
    freeze = q.get('live') !== '1';
  }
  if (freeze) api.freeze(tFreeze);
  return false;
}

/* a rollover while the app is open (Sunday -> Monday) runs the same path live */
let liveWeek = null, shownAt = 0;
function checkRollover() {
  const now = wall(T), key = isoWeekKey(now);
  if (liveWeek === null) { liveWeek = key; return; }
  if (key === liveWeek || DEMO_ON || morningScene()) return;
  const from = liveWeek; liveWeek = key;
  archivePast(store, now); store.morningAway = nextAway(from, now, store.morningAway); store.morningDue = nextDue(from, now, store.morningDue); store.lastSeenWeek = key; flushSave();
  rebuildStars(now); rebuildPast();
}

/* the weekly morning. beginMorning starts any morning (real or dev); the controls are timeline events, so the state stays a pure function of T */
function beginMorning(cfg) {
  clearMorning();
  setSelIdx(-1); setMouseHover(-1);
  setMorningScene(cfg);
  setPastSkip(cfg.weekKey);
}
/* the real morning of week `key` (from the store): its summary is written once, now */
function startRealMorning(key) {
  const now = wall(T), nowKey = isoWeekKey(now);
  const w = store.weeks[key] || { seed: seedForWeek(key), archivedAt: now };
  store.weeks[key] = withSummary(w, weekSummary(store.tasks, key, now)); saveSoon();
  makeSky(seedForWeek(key)); cloudsForce(); rebuildPast();
  beginMorning({ tasks: store.tasks, weekKey: key, nowMs: now, season: seasonOf(now), gapMode: 'mosaic', seed: seedForWeek(key),
    name: store.weeks[key].name || '', summary: store.weeks[key].summary, away: store.morningAway || 0, t0: T, reduced: isReduced(), newSeed: seedForWeek(nowKey), newWeek: weekLabel(nowKey), write: true });
}
/* the sunset starts at sky time `at`. A real morning saves the name and clears morningDue here (by any path) */
function leaveMorning(at, name) {
  const c = morningCfg(); if (!c) return false;
  const nm = cleanName(name);
  if (nm) setMorningName(nm);
  if (c.write) {
    if (nm) store.weeks[c.weekKey] = withName(store.weeks[c.weekKey], nm);
    store.morningDue = null; store.morningAway = 0; saveSoon(); flushSave();
  }
  pushMorning('leave', at, !!nm);
  skySwap(c.newSeed, at, TIME.crossfadeMorning);
  setPastSkip(null);
  return true;
}
Object.assign(morningCtl, {
  advance() { const p = (morningNow() || {}).phase; if (p === 'night' || p === 'rise') pushMorning('advance', T); },
  leave(name) { const p = (morningNow() || {}).phase; return p === 'night' || p === 'rise' || p === 'hold' ? leaveMorning(T, name) : false; },
  cut() { if ((morningNow() || {}).phase === 'set') pushMorning('cut', T); }
});

/* the weekly morning starts only when the user is present; morningDue is cleared when the sunset starts */
function morningTick(ts) {
  if (morningScene()) {
    if (morningNow().phase === 'end') { clearMorningScene(); clearMorning(); setPastSkip(null); }
    return;
  }
  if (!store.morningDue || DEMO_ON || FLAGS.freeze || FLAGS.scene || FLAGS.morning) return;
  const go = shouldStartMorning({
    due: store.morningDue,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    busy: isAnimating(),
    barText: !!(bar.focus && bar.text && bar.text.trim()),
    sinceInput: ts - lastInput,
    sinceShown: ts - shownAt
  });
  if (go) startRealMorning(store.morningDue);
}

/* app use = real time while the tab is visible and focused; each step is capped in the store */
function useTick(ms) {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
  advanceUseMs(ms);
}

/* thoughts coming back: only while the user is here and free, never during the morning, never as a notification.
   An unanswered coming back ends as `ignored` after askIdleMs. */
function canComeBack(ts) {
  if (FLAGS.freeze || FLAGS.scene || FLAGS.morning) return false;
  const visible = document.visibilityState === 'visible', focused = document.hasFocus();
  if (!thoughtMayCome({ morning: !!morningScene(), busy: isAnimating(), barText: bar.focus || bar.text !== '', when: !!bar.thought, selected: selIdx >= 0, visible, focused })) return false;
  return isPresent({ visible, focused, busy: false, barText: false, sinceInput: ts - lastInput, sinceShown: ts - shownAt });
}
function deliverThought(id) {
  const th = findThought(id);
  if (!th || th.saidAt || th.goneAt) return null;
  const now = wall(T);
  th.askedAt = now; th.askUse = store.useMs;
  if (Number.isFinite(th.remindAt) && now >= th.remindAt) th.remindAt = null;     // the reminder was delivered
  store.lastAskUse = store.useMs;
  enterThoughtWhen(id, false, true);                                               // no focus: no keyboard on touch, no stolen keys
  bar.backAt = T;
  announce('a thought came back: ' + th.text);
  saveSoon();
  return id;
}
function thoughtTick(ts) {
  if (bar.thoughtBack && T - bar.backAt >= TIME.thought.askIdleMs / 1000) { leaveThoughtWhen('ignored'); return; }
  if (!canComeBack(ts)) return;
  const id = pickDue(store.thoughts, wall(T), store.useMs, store.lastAskUse);
  if (id) deliverThought(id);
}

async function boot() {
  const canvas = document.getElementById('c');
  initCanvas(canvas);
  applyGeometry();
  const fontsReady = Promise.race([
    Promise.all([document.fonts.load('400 12px "IBM Plex Mono"'), document.fonts.load('500 12px "IBM Plex Mono"')]),
    new Promise(r => setTimeout(r, 3000))
  ]);
  if (!FLAGS.freeze && !FLAGS.scene && !DEMO_ON && !THOUGHTS_DEMO) setPersistence({ load: loadStore, save: saveStore });
  else setPersistence(null);
  await loadModel();
  if (FLAGS.useMs !== null) store.useMs = Math.max(0, FLAGS.useMs);
  setReducedPref(FLAGS.reduced ? 'on' : (store.prefs.reducedMotion || 'system'));
  clearWidthCache();
  const wk = isoWeekKey(wall(0));
  const seed = FLAGS.seed !== null ? FLAGS.seed : (DEMO_ON ? 7 : seedForWeek(store.lastSeenWeek || wk));
  const dueSky = !!store.morningDue && !DEMO_ON && !FLAGS.freeze && !FLAGS.scene;
  makeSky(dueSky ? seedForWeek(store.morningDue) : seed);
  setT(FLAGS.t || 0);
  clockTick(true);
  cloudsForce();
  initBar(document.getElementById('bar-input'));
  setWake(() => { booted = true; lastInput = lastTs; });
  bindKeys(); bindPointer();
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'input']) window.addEventListener(ev, e => { lastInput = e.timeStamp; }, { capture: true, passive: true });
  setAnnouncer(announce);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  /* production: draw the sky at once and add canvas text when the fonts arrive. deterministic paths (freeze, scenes, bench, script, dev) await the fonts first, as before */
  const fast = !FLAGS.dev && !FLAGS.freeze && !FLAGS.scene && !FLAGS.bench && !FLAGS.script;
  if (fast) textReady = false;
  else { await fontsReady; clearWidthCache(); }

  if (FLAGS.dev) (await import('./dev/hooks.js')).installHooks(api);
  if (FLAGS.dev && applyScenes()) { document.documentElement.setAttribute('data-ready', '1'); return; }

  if (dueSky) rebuildPast();
  liveWeek = isoWeekKey(wall(0)); setInterval(checkRollover, 30000);

  window.addEventListener('resize', () => {
    clearTimeout(window.__nsResize);
    window.__nsResize = setTimeout(() => {
      applyGeometry();
      if (!FLAGS.freeze) startLoop();
      renderNow(true);
    }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); flushSave(); }
    else if (!FLAGS.freeze) { lastTs = 0; shownAt = performance.now(); startLoop(); thoughtTick(performance.now()); }
  });
  window.addEventListener('focus', () => { shownAt = performance.now(); if (!FLAGS.freeze) thoughtTick(performance.now()); });
  window.addEventListener('pagehide', flushSave);

  shownAt = performance.now();
  if (!FLAGS.freeze && !sceneFrozen) { renderNow(true); startLoop(); }
  else renderNow(true);
  if (fast) { const go = () => { clearWidthCache(); textReady = true; renderNow(true); }; fontsReady.then(go, go); }
  document.documentElement.setAttribute('data-ready', '1');
}

window.addEventListener('error', e => {
  document.documentElement.setAttribute('data-err', (e.message || '') + ' @' + e.lineno);
});
boot();

/* service worker: web only; on localhost only with ?sw=1 so dev edits are never cached */
if ('serviceWorker' in navigator && !isTauri && /^https?:$/.test(location.protocol)) {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!local || /[?&]sw=1/.test(location.search)) navigator.serviceWorker.register('./sw.js').catch(() => { });
  else {                                                   // dev host: drop any service worker and cache an earlier ?sw=1 run left behind (not awaited)
    navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).catch(() => { });
    if (window.caches) caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ns-')).map(k => caches.delete(k)))).catch(() => { });
  }
}
