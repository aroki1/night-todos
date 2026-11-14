/* dev/hooks.js — window.ns test hooks. Installed only with ?dev=1 or on localhost. */
import { rng, clamp01 } from '../math.js';
import { setT, wall, T, isoWeekKey, seedForWeek, setClockISO, setClockBase, weekDistance, wc } from '../sky/clock.js';
import { sky, skyFlags, makeSky } from '../sky/sky.js';
import { cloudReset, cloudDebug } from '../sky/clouds.js';
import { resetClockCache, clockTick } from '../sky/clock.js';
import { moonSt } from '../sky/moon.js';
import { specialsNow, setForceShower, satTime, setMoonShow, cometHead, satNow } from '../sky/events.js';
import { BR, BG, BB, SR, SG, SB, CR, CG, CB, SBR, SBG, SBB, AGR, AGG, AGB, GW, SH, UH, dpr, P, D, N } from '../framebuffer.js';
import { stars, NS, GHI, rebuildStars, store } from '../model/store.js';
import { events, doFinish, doUndo, doStepNext, doStepToggle, doStepAdd, doStepDelete, mkSteps, pipTotal } from '../model/timeline.js';
import { lab, setForceFocus, setMouseHover, setSelIdx, computeFocus, updateHover, hk, hp, frK, lk, focus, wg } from '../model/placement.js';
import { bar, submitBar, barParse, msAvg } from '../ui/bar.js';
import { rebuildPast, setPastSkip } from '../sky/past.js';
import { skipRitual, ritualInfo } from '../render/ritual.js';
import { ensureWeeks, previousWeekKey } from '../model/week.js';
import { selfTest } from './selftest.js';
import { skySwap } from '../render/compose.js';
import { isReduced } from '../tokens.js';
import { doneCount, nextIdx, sui } from '../model/steps.js';
import { stepsBack, stepsFront } from '../render/steps.js';

let api = null;
const findStar = n => { const k = stars.findIndex(s => s.n === n); return k >= 0 ? k : stars.findIndex(s => s.n.indexOf(n) >= 0); };

export function installHooks(a) {
  api = a;
  setMoonShow(() => moonSt.show);
  window.ns = {
    setSeed(n) { makeSky(n); },
    week(n) {
      const y = new Date(wall(T)).getFullYear();
      const key = y + '-W' + String(n).padStart(2, '0');
      const sd = seedForWeek(key); makeSky(sd); return sd;
    },
    flags(sd) { return skyFlags(sd); },
    find(pred, from, to) { const out = []; for (let sd = from; sd < to; sd++) { const f = skyFlags(sd); if (new Function('f', 'return ' + pred)(f)) out.push(sd); } return out; },
    specials() { return specialsNow(); },
    satCount() { return { moon: moonSt.show, sats: satNow([]).length, comet: !!sky.comet }; },
    sample(n) {
      const o = [], r = rng(99);
      for (let i = 0; i < n; i++) {
        const sd = Math.floor(r() * 1e6), day = Math.floor(r() * 7), hr = r() * 24;
        makeSky(sd);
        setClockBase(new Date(2026, 10, 9 + day, Math.floor(hr), Math.floor(hr % 1 * 60)).getTime() - T * 1000);
        setT(12 + r() * 600); resetClockCache(); clockTick(true); moonSt.init = false;
        ns.render();
        o.push(sd + ':' + hr.toFixed(1) + ':' + specialsNow().join('+'));
      }
      return o;
    },
    bright() {
      ns.render();
      const mx = (x0, y0, x1, y1) => {
        let m = 0;
        for (let j = Math.max(0, y0); j < Math.min(SH, y1); j++) for (let i = Math.max(0, x0); i < Math.min(GW, x1); i++) {
          const k = j * GW + i; m = Math.max(m, BR[k], BG[k], BB[k]);
        }
        return m;
      };
      return {
        moonMax: moonSt.show ? mx(moonSt.x - 6, moonSt.y - 6, moonSt.x + 7, moonSt.y + 7) : 0,
        starCore: mx(stars[3].gx - 1, stars[3].gy - 1, stars[3].gx + 2, stars[3].gy + 2),
        starCore2: mx(stars[4].gx, stars[4].gy, stars[4].gx + 1, stars[4].gy + 1)
      };
    },
    forceShower(v) { setForceShower(v); },
    freeze(t) { api.freeze(t); },
    finish(name, atT, hov) { return doFinish(findStar(name), atT, hov); },
    undo(atT) { return doUndo(atT); },
    hover(name) {
      setForceFocus(name === null ? null : findStar(name));
      const f = focus === undefined ? -1 : (name === null ? -1 : findStar(name));
      for (let i = 0; i < NS; i++) { hp[i] = hk[i] = i === f ? 1 : 0; frK[i] = (i === f && !stars[i].done && !stars[i].miss) ? 1 : 0; }
      computeFocus(); api.render();
    },
    select(name) {
      const f = name === null ? -1 : findStar(name); setSelIdx(f);
      for (let i = 0; i < NS; i++) { lk[i] = i === f ? 1 : 0; if (i === f) { hp[i] = hk[i] = 1; frK[i] = !stars[i].done && !stars[i].miss ? 1 : 0; } }
      computeFocus(); api.render();
    },
    skySwap(seed, atT) { skySwap(seed, atT); },
    stepsFinish(name, atT) { return doStepNext(findStar(name), atT); },
    stepsUndo(name, atT) {                                  // reopen the most recently finished step
      const i = findStar(name), s = stars[i]; if (!s || !s.steps) return false;
      let b = -1; s.steps.forEach((t, k) => { if (t.doneAt && (b < 0 || t.doneAt >= s.steps[b].doneAt)) b = k; });
      return b >= 0 && doStepToggle(i, s.steps[b].id, atT);
    },
    hoverRow(name, k) { const i = findStar(name); sui.rowStar = k < 0 ? -1 : i; sui.rowHover = k; api.render(); },       // dev: put the row hover on row k of the selected list
    rowPos(name, k) { const L = lab[findStar(name)], q = L && L.rr ? L.rr[k] : null, r = api.canvas().getBoundingClientRect(); return q ? { x: r.left + (q.x0 + 6) * 3 / (GW * 3) * r.width, y: r.top + (q.y0 + q.y1) / 2 * 3 / UH * r.height } : null; },   // dev: client coordinates of a list row
    stepsScroll(v) { for (let i = 0; i < NS; i++) if (lab[i].list) { sui.st[i] = sui.sy[i] = v; } api.render(true); },
    stepsAdd(name, text, atT) { return doStepAdd(findStar(name), text, atT); },
    stepsDelete(name, k, atT) { const i = findStar(name), s = stars[i]; return !!s && !!s.steps && !!s.steps[k] && doStepDelete(i, s.steps[k].id, atT); },
    stepsInfo() { return { stars: stars.filter(s => s.steps).map(s => [s.n, doneCount(s), s.steps.length, !!s.stepBehind, !!s.stepReady, nextIdx(s)]) }; },
    /* dev: n live tasks with steps spread over the sky (for 48-star and timing checks); `steps` = steps per task */
    fillSteps(n, steps = 5, clear = false) {
      const now = wall(T), r = rng(77);
      if (clear) store.tasks.length = 0;
      for (let i = 0; i < n; i++) {
        const nsteps = steps > 0 ? steps : 0;
        store.tasks.push({ id: 'f' + i, title: 'task ' + (i + 1) + ' · ' + ['essay', 'lab', 'reading', 'notes', 'quiz'][i % 5], createdAt: now - 2 * 864e5, deadline: now + (1 + r() * 6) * 864e5,
          big: i % 9 === 0 ? 1 : 0, x: .06 + ((i % 8) + r() * .5) / 8.6, y: .08 + (Math.floor(i / 8) + r() * .4) / 6.6, doneAt: null, link: null, week: null,
          steps: mkSteps(Array.from({ length: nsteps }, (_, q) => 'step ' + (q + 1))) });
        if (nsteps && i % 3 === 0 && store.tasks[store.tasks.length - 1].steps[0]) store.tasks[store.tasks.length - 1].steps[0].doneAt = now - 36e5;
      }
      rebuildStars(now); api.render(true); return stars.length;
    },
    /* dev: time render/steps.js on its own over `n` frames (ms per frame for the live step-stars) */
    stepsBench(n = 300) {
      const t0 = T, bump = new Float32Array(64); let tb = 0, tf = 0;
      for (let i = 0; i < n; i++) {
        setT(t0 + i / 60);
        let a = performance.now(); for (let q = 0; q < NS; q++) stepsBack(q, bump); tb += performance.now() - a;
        a = performance.now(); for (let q = 0; q < NS; q++) stepsFront(q); tf += performance.now() - a;
      }
      setT(t0); return { backMs: tb / n, frontMs: tf / n, totalMs: (tb + tf) / n, stars: stars.filter(s => s.steps && s.steps.length).length };
    },
    nextSeed: null,
    move(name, gx, gy) { const s = stars[findStar(name)]; if (!s) return; s.gx = gx; s.gy = gy; if (s.task) { s.task.x = gx / (GW - 1); s.task.y = gy / (SH - 1); } },
    render() {
      cloudReset(); resetClockCache(); api.render(true);
    },
    bench(n) {
      const t0 = T; let sum = 0, mx = 0, fr = [];
      api.stop();
      for (let i = 0; i < n; i++) { setT(t0 + i / 60); const a = performance.now(); api.prepareCompose(); const d = performance.now() - a; sum += d; fr.push(d); if (i > 10) mx = Math.max(mx, d); }
      api.freeze(null, false);
      fr.sort((x, y) => x - y);
      return { avg: sum / n, median: fr[n >> 1], p95: fr[Math.floor(n * .95)], max: mx };
    },
    now() { return T; },
    selfTest() { return selfTest(); },
    typeTrace(str) {
      const out = []; ns.key('n');
      for (const ch of str) { ns.key(ch === ' ' ? 'Space' : ch); ns.advance(170); const g = stars[GHI]; out.push([bar.text.length, +g.ghA.toFixed(2), g.gx, g.gy].join(':')); }
      return out.join(' ');
    },
    clock(iso) { setClockISO(iso); cloudReset(); },
    dbg() { return { T, wall: new Date(wall(T)).toString(), bar: { text: bar.text, title: bar.title, pv: bar.pv, focus: bar.focus, gpos: bar.gpos, gOn: bar.gOn }, ghost: { x: stars[GHI].gx, y: stars[GHI].gy, a: stars[GHI].ghA }, n: stars.length, pipTotal, events: events.length, stars: stars.map(s => [s.n, s.gx, s.gy, s.on, s.done, s.miss]) }; },
    advance(ms) {
      const n = Math.max(1, Math.round(ms / 16.667)), dt = ms / 1000 / n;
      for (let i = 0; i < n; i++) { setT(T + dt); computeFocus(); updateHover(dt); if (ns.onStep) ns.onStep(dt); }
      api.render();
    },
    key(spec) {
      const parts = spec.split('+'), k = parts.pop();
      const isChar = k === 'Space' || (k.length === 1 && !k.includes('+'));
      if (bar.focus && isChar) {
        const ch = k === 'Space' ? ' ' : k;
        if (bar.text.length < 80) { bar.text = bar.text.slice(0, bar.caret) + ch + bar.text.slice(bar.caret); bar.caret++; bar.last = T; }
        const inp = document.getElementById('bar-input'); if (inp) inp.value = bar.text;
        api.render(); return;
      }
      if (bar.focus && k === 'Enter') { submitBar(); api.render(); return; }
      if (bar.focus && k === 'Escape') { bar.focus = false; api.render(); return; }
      if (bar.focus && k === 'Backspace') { bar.text = bar.text.slice(0, Math.max(0, bar.caret - 1)) + bar.text.slice(bar.caret); bar.caret = Math.max(0, bar.caret - 1); api.render(); return; }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k === 'Space' ? ' ' : k, ctrlKey: parts.indexOf('ctrl') >= 0, shiftKey: parts.indexOf('shift') >= 0, bubbles: true, cancelable: true }));
      api.render();
    },
    type(str) { for (const ch of str) ns.key(ch === ' ' ? 'Space' : ch); },
    clickAt(ux, uy) {
      const r = api.canvas().getBoundingClientRect();
      api.canvas().dispatchEvent(new MouseEvent('click', { clientX: r.left + ux / (GW * 3) * r.width, clientY: r.top + uy / ((SH + 20) * 3) * r.height, bubbles: true }));
      api.render();
    },
    click(what) {
      if (what === 'sky') api.clickSky();
      else if (what === 'undo') api.clickUndo();
      else { const s = stars[findStar(what)]; if (!s) return; api.finishAt(s.gx * 3 + 1, s.gy * 3 + 1); }
    },
    script(str) {
      api.freeze(T);
      for (const tok of str.split(';')) {
        const i = tok.indexOf(':'), c = i < 0 ? tok : tok.slice(0, i), a = i < 0 ? '' : tok.slice(i + 1);
        if (c === 'fz') ns.freeze(+a);
        else if (c === 'adv') ns.advance(+a);
        else if (c === 'key') ns.key(a);
        else if (c === 'type') ns.type(a);
        else if (c === 'click') ns.click(a);
        else if (c === 'move') { const q = a.split(','); ns.move(q[0], +q[1], +q[2]); ns.render(); }
        else if (c === 'fin') { ns.finish(a.split(',')[0], +a.split(',')[1], false); }
        else if (c === 'und') ns.undo(+a);
        else if (c === 'next') ns.nextSeed = +a;
        else if (c === 'hover') { ns.hover(a === '' ? null : a); ns.render(); }
        else if (c === 'render') ns.render();
        else if (c === 'sat') ns.freeze(satTime(a === '1'));
        else if (c === 'shower') setForceShower(a === '1');
        else if (c === 'dbg') document.documentElement.setAttribute('data-out', JSON.stringify(ns.dbg()));
        else if (c === 'eval') document.documentElement.setAttribute('data-out', JSON.stringify(eval(a)));
      }
    },
    stats() { return { ms: msAvg, grains: N, dpr, P, D }; },
    buf(x = 100, y = 100) {
      const k = y * GW + x;
      return { br: [BR[k], BG[k], BB[k]], px: Array.from(document.getElementById('c').getContext('2d').getImageData(x * P, y * P, 1, 1).data) };
    },
    cloudDebug(x = 100, y = 100) { return cloudDebug(x, y); },
    comet() { const o = { x: 0, y: 0 }; const vis = cometHead(o); return { wp: wc.wp, comet: !!sky.comet, vis, head: o }; },
    special() { return sky.layers.map(l => l.S.filter(s => s.hl || s.vp || s.cross).map(s => [+s.x.toFixed(2), +s.y.toFixed(2)])).flat(); },
    layerCounts() { return sky.layers.map(l => [l.S.length, l.n]); },
    fontInfo() { return { w500: wg('3 / 7', 500), w400: wg('3 / 7', 400), chk: document.fonts.check('500 12px "IBM Plex Mono"') }; },
    skyBuf(x = 100, y = 100) {
      const k = y * GW + x;
      return { SR: SR[k], SG: SG[k], SB: SB[k], CR: CR[k], CG: CG[k], CB: CB[k], SBR: SBR[k], SBG: SBG[k], SBB: SBB[k], AGR: AGR[k], AGG: AGG[k], AGB: AGB[k] };
    },

    /* product-only test helpers */
    injectWeeks(n = 6, opts = {}) {
      const now = wall(T), cur = isoWeekKey(now);
      let key = cur;
      const r = rng(4242);
      const out = [];
      for (let w = 0; w < n; w++) {
        key = previousWeekKey(key);
        const weekStart = weekStartMs(key);
        const count = 4 + Math.floor(r() * 4);
        const tasks = [];
        for (let i = 0; i < count; i++) {
          const d = new Date(weekStart + (1 + Math.floor(r() * 4)) * 864e5 + Math.floor(r() * 10) * 36e5);
          tasks.push({
            id: 'w' + w + '-' + i, title: 'week ' + key.slice(-2) + ' · ' + ['essay', 'lab', 'reading', 'notes', 'quiz', 'problem set'][Math.floor(r() * 6)],
            createdAt: weekStart - 5 * 864e5, deadline: d.getTime() + 2 * 864e5, big: r() < .3 ? 1 : 0,
            x: .18 + r() * .64, y: .12 + r() * .5, doneAt: d.getTime(), link: null, week: key
          });
        }
        for (let i = 1; i < tasks.length; i++) if (r() < .7) tasks[i].link = tasks[Math.floor(r() * i)].id;
        store.tasks.push(...tasks);
        store.weeks[key] = { seed: seedForWeek(key), archivedAt: now };
        out.push(key);
      }
      if (!opts.noRebuild) { rebuildStars(now); rebuildPast(); }
      return out;
    },
    ritual(opts = {}) { return api.beginRitual(opts); },
    ritualInfo() { return ritualInfo() || { active: false }; },
    skipRitual() { skipRitual(); },
    weekKey() { return isoWeekKey(wall(T)); }
  };
  const ns = window.ns;
  ns.onStep = null;
  return window.ns;
}

function weekStartMs(key) {
  const m = /^(\d+)-W(\d+)$/.exec(key);
  if (!m) return Date.now();
  const y = +m[1], w = +m[2];
  const jan4 = new Date(y, 0, 4);
  const day = (jan4.getDay() + 6) % 7;
  const mon = new Date(y, 0, 4 - day + (w - 1) * 7);
  return mon.getTime();
}
