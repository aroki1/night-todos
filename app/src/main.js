/* main.js — boot, geometry, the loop, resize and visibility. */
import { FLAGS, isReduced, setReducedPref, LAYOUT, SIZE } from './tokens.js';
import { initCanvas, configure, cv, GW, SH, ROWS, dpr, blit } from './framebuffer.js';
import { setT, T, wall, clockTick, isoWeekKey, seedForWeek, weekLabel } from './sky/clock.js';
import { previousWeekKey, decideRitual, archivePast } from './model/week.js';
import { startRitual, drawRitualText, ritualActive } from './render/ritual.js';
import { makeSky } from './sky/sky.js';
import { cloudsForce, cloudReset } from './sky/clouds.js';
import { store, loadModel, flushSave, syncStarPositions, rebuildStars, stars, NS, DEMO_ON, setAnnouncer, rolledFrom, setPersistence } from './model/store.js';
import { doFinish, doUndo } from './model/timeline.js';
import { initBar, bar, setWake, drawBar, barTick, barAnimating, undoHit } from './ui/bar.js';
import { drawLabels, drawPastHover } from './render/text.js';
import { setGhostInfo } from './model/placement.js';
import { bindKeys, finishFocused } from './ui/keys.js';
import { bindPointer, toUnits, hitStar } from './ui/pointer.js';
import { prepare, compose, setFrozen, setFrozenForce, isAnimating, skySwap } from './render/compose.js';
import { computeFocus, updateHover, clearWidthCache, setForceFocus, setMouseHover, setSelIdx } from './model/placement.js';
import { updatePastHover, rebuildPast, resetPastHover, setPointerGrain } from './sky/past.js';
import { installHooks } from './dev/hooks.js';
import { notifyUrgent, notifyMissed, isTauri, loadStore, saveStore } from './platform.js';
import { moonSt } from './sky/moon.js';

let raf = 0, lastTs = 0, tick = 0, running = false, booted = false, sceneFrozen = false;
const missedAnnounced = new Set();

function computeGeometry() {
  const vw = window.innerWidth, vh = window.innerHeight, ratio = window.devicePixelRatio || 1;
  if (FLAGS.parity) return { gw: 404, sh: 196, rows: 196 + 20, ratio };
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || vw < 700;
  const barRows = touch ? LAYOUT.barRowsTouch : LAYOUT.barRowsDesktop;
  const gw = Math.max(LAYOUT.minGrainsW, Math.floor(vw / 3));
  const sh = Math.max(LAYOUT.minGrainsH, Math.floor((vh - barRows * 3) / 3));
  return { gw, sh, rows: sh + barRows, ratio };
}
function applyGeometry() {
  const g = computeGeometry();
  configure(g.gw, g.sh, g.rows - g.sh, g.ratio);
  document.body.classList.toggle('parity', FLAGS.parity);
  clearWidthCache();
  cloudReset();
  syncStarPositions();
  rebuildPast();
  clockTick(true);
  cloudsForce();
}

function renderNow(force) {
  setFrozenForce(!!force);
  barTick();
  setGhostInfo({ title: bar.title, gCommit: bar.gCommit });
  prepare(); compose(); blit();
  drawLabels(); drawPastHover(); drawRitualText(); drawBar();
  setFrozenForce(false);
  updateAria();
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.miss && s.mT >= 0 && !missedAnnounced.has(i)) { missedAnnounced.add(i); announce(s.n + ' missed'); }
  }
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
  const dt = Math.min(.05, (ts - lastTs) / 1000); lastTs = ts;
  setT(T + dt); tick++;
  computeFocus(); updateHover(dt); updatePastHover(dt);
  if (!isAnimating() && !barAnimating() && (tick & 1)) return;
  renderNow(false);
  desktopNotify();
}

function startLoop() {
  if (running) return;
  running = true; lastTs = 0;
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
    if (s.life < .25 && s.life > 0) { if (!urgentSent.has(t.id)) { urgentSent.add(t.id); notifyUrgent(t, now); } }
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
  beginRitual(opts = {}) {
    const nowKey = isoWeekKey(wall(T)), liftKey = opts.key || previousWeekKey(nowKey);
    makeSky(seedForWeek(liftKey)); cloudsForce();
    rebuildPast();
    startRitual({ key: liftKey, week: weekLabel(nowKey), newSeed: seedForWeek(nowKey) }, skySwap);
    return true;
  },
  prepareCompose() { prepare(); compose(); },
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
  } else if (FLAGS.scene === 'crossfade') {
    ns.skySwap(FLAGS.devSeed || 11, tFreeze);
    tFreeze += (at === null ? 450 : at) / 1000; freeze = true;
  }
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
  if (FLAGS.dev && new URLSearchParams(location.search).get('ritual') === '1') {
    setT(FLAGS.t || 12);
    ns.ritual();
    if (new URLSearchParams(location.search).has('at')) { tFreeze = (FLAGS.t || 12) + at / 1000; freeze = true; }
  }
  if (freeze) api.freeze(tFreeze);
  return false;
}

/* a rollover while the app is open (Sunday -> Monday) runs the same path live */
let liveWeek = null;
function checkRollover() {
  const now = wall(T), key = isoWeekKey(now);
  if (liveWeek === null) { liveWeek = key; return; }
  if (key === liveWeek || DEMO_ON || ritualActive()) return;
  const from = liveWeek; liveWeek = key;
  const dec = decideRitual(from, now, store.tasks);
  archivePast(store, now); store.lastSeenWeek = key; flushSave();
  rebuildStars(now); rebuildPast();
  if (dec.run) api.beginRitual({ key: dec.liftKey });
}

async function boot() {
  const canvas = document.getElementById('c');
  initCanvas(canvas);
  applyGeometry();
  const fontsReady = Promise.race([
    Promise.all([document.fonts.load('400 12px "IBM Plex Mono"'), document.fonts.load('500 12px "IBM Plex Mono"')]),
    new Promise(r => setTimeout(r, 3000))
  ]);
  if (!FLAGS.freeze && !FLAGS.scene && !DEMO_ON) setPersistence({ load: loadStore, save: saveStore });
  else setPersistence(null);
  await loadModel();
  setReducedPref(store.prefs.reducedMotion || 'system');
  clearWidthCache();
  const wk = isoWeekKey(wall(0));
  const seed = FLAGS.seed !== null ? FLAGS.seed : (DEMO_ON ? 7 : seedForWeek(store.lastSeenWeek || wk));
  const nowW = wall(0), dec = (!FLAGS.dev || !FLAGS.freeze) && !DEMO_ON ? decideRitual(rolledFrom, nowW, store.tasks) : { run: false };
  const doRitual = dec.run && dec.hasShape && !FLAGS.freeze;
  makeSky(doRitual ? seedForWeek(dec.liftKey) : seed);
  setT(FLAGS.t || 0);
  clockTick(true);
  cloudsForce();
  initBar(document.getElementById('bar-input'));
  setWake(() => { booted = true; });
  bindKeys(); bindPointer();
  setAnnouncer(announce);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  await fontsReady;
  clearWidthCache();

  if (FLAGS.dev) installHooks(api);
  if (FLAGS.dev && applyScenes()) { document.documentElement.setAttribute('data-ready', '1'); return; }

  if (doRitual) { rebuildPast(); startRitual({ key: dec.liftKey, week: weekLabel(dec.to), newSeed: seed }, skySwap); }
  else if (dec.run) rebuildPast();
  liveWeek = isoWeekKey(wall(0)); setInterval(checkRollover, 30000);

  window.addEventListener('resize', () => {
    if (FLAGS.parity && Math.abs((window.devicePixelRatio || 1) - dpr) < .001) return;
    clearTimeout(window.__nsResize);
    window.__nsResize = setTimeout(() => {
      applyGeometry();
      if (!FLAGS.freeze) startLoop();
      renderNow(true);
    }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); flushSave(); }
    else if (!FLAGS.freeze) { lastTs = 0; startLoop(); }
  });
  window.addEventListener('pagehide', flushSave);

  if (!FLAGS.freeze && !sceneFrozen) { renderNow(true); startLoop(); }
  else renderNow(true);
  document.documentElement.setAttribute('data-ready', '1');
}

window.addEventListener('error', e => {
  document.documentElement.setAttribute('data-err', (e.message || '') + ' @' + e.lineno);
});
boot();
