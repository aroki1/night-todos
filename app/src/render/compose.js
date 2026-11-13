/* render/compose.js — prepare() reads the model, compose() writes the whole frame. */
import { clamp01, seg, ease, mixTo, SC, fbm, H } from '../math.js';
import { C, SIZE, TIME, FLAGS } from '../tokens.js';
import { GW, SH, N, BR, BG, BB, OR, OG, OB, add, over, splat, halo, ring, dimRect } from '../framebuffer.js';
import { T, clockTick, wall, fmtLeft } from '../sky/clock.js';
import { sky, composeBase } from '../sky/sky.js';
import { clouds, cloudsTick, cloudsForce, isCloudStale, cloudTime } from '../sky/clouds.js';
import { moonUpdate, drawMoon } from '../sky/moon.js';
import { drawAurora, auroraUpdate, drawComet, drawSats, drawMeteor } from '../sky/events.js';
import { drawPast } from '../sky/past.js';
import { stars, NS, GHI, edgeGeom, expAt, R, CORE, Rb, pres, lifeAt, timeStr, isUrgent } from '../model/store.js';
import { FS, US, undoTarget, replay, setPipTotals } from '../model/timeline.js';
import { hk, computeFocus, placeLabels, lab } from '../model/placement.js';
import { finishState, edgeState } from '../choreo/finish.js';
import { undoState, undoEdge } from '../choreo/undo.js';
import { SPR } from '../sky/components.js';
import { makeSky } from '../sky/sky.js';
import { ritualActive, ritualTick, drawRitual } from './ritual.js';

export const bump = new Float32Array(SIZE.maxStars);
const dims = []; let dimN = 0;
const acts = []; let actN = 0;
export let animating = false;
export let frozen = false;
export let frozenForce = false;
export let xf = null;
export function setFrozen(v) { frozen = !!v; }
export function setFrozenForce(v) { frozenForce = !!v; }
export function isAnimating() { return animating || !!xf || ritualActive(); }

export function prepare() {
  clockTick(false);
  ritualTick();
  replay(T);
  animating = !!xf; actN = 0; dimN = 0;
  let nTot = 0, lt = -1e9;
  for (let si = 0; si < NS; si++) {
    const s = stars[si];
    FS[si] = null; US[si] = null;
    if (s.gh) continue;
    s.rmMs = s.rm ? (T - s.rm.t0) * 1000 : -1;
    if (s.rmMs >= 0 && s.rmMs < 500) animating = true;
    if (s.on && s.dl !== null) {
      s.life = lifeAt(s, Math.min(T, expAt(s) - .02));
      if (!s.miss) { const ts = timeStr(s, T); s.left = ts.left; s.full = ts.full; }
    }
    if (s.on) { const cn = s.cr ? s.cr.t0 + (s.cr.reduced ? .3 : .9) : -1e9; if (T >= cn) { nTot++; if (s.cr) lt = Math.max(lt, cn); } }
    if (s.cr && s.on) {
      const ms = (T - s.cr.t0) * 1000;
      if (ms < 1300) animating = true;
      if (!s.cr.reduced && ms < 1100) {
        if (!dims[dimN]) dims[dimN] = { x: 0, y: 0, k: 0 };
        const A = dims[dimN++]; A.x = s.gx; A.y = s.gy;
        A.k = .15 * (ms < 200 ? ease.out(ms / 200) : ms < 700 ? 1 : 1 - ease.inOut(seg(ms, 700, 1100)));
      }
    }
    if (s.miss && s.mT >= 0 && s.mT < 1700) animating = true;
    if (s.done && s.fin) {
      const ms = (T - s.fin.t0) * 1000;
      FS[si] = finishState(s.fin, ms);
      if (ms < s.fin.arriveMs + 700) animating = true;
      if (!s.fin.reduced && ms >= 120 && ms <= 1300) {
        if (!acts[actN]) acts[actN] = { x: 0, y: 0, ms: 0 };
        const A = acts[actN++]; A.x = s.gx; A.y = s.gy; A.ms = ms;
      }
    } else if (!s.done && s.und) {
      const ms = (T - s.und.t0) * 1000;
      if (ms < 700) { US[si] = undoState(s.und, ms); animating = true; }
    }
    if (hk[si] > 0 && hk[si] < 1) animating = true;
  }
  setPipTotals(nTot, lt);
  if (undoTarget && T - undoTarget.at < 5.4) animating = true;
  computeFocus();
  placeLabels();
  for (let si = 0; si < NS; si++) if (lab[si].gliding && lab[si].shown) animating = true;
}

function drawEdge(g, es, phase, si) {
  const ax = g.ax, ay = g.ay, ux = g.ux, uy = g.uy, sA = g.sA, sE = sA + es.lineLen, owner = stars[si], from = stars[es.src];
  let occ = null;
  for (let j = 0; j < NS; j++) {
    if (j === si || j === es.src || !stars[j].on) continue;
    const o = stars[j], rr = Rb(o) + 1;
    const t = Math.max(0, Math.min(g.len, (o.gx - ax) * ux + (o.gy - ay) * uy));
    const dx = ax + ux * t - o.gx, dy = ay + uy * t - o.gy;
    if (dx * dx + dy * dy < rr * rr) { if (!occ) occ = []; occ.push(o.gx - rr - 1, o.gy - rr - 1, o.gx + rr + 1, o.gy + rr + 1); }
  }
  const inOcc = (i, j) => { if (!occ) return false; for (let q = 0; q < occ.length; q += 4) if (i >= occ[q] && j >= occ[q + 1] && i <= occ[q + 2] && j <= occ[q + 3]) return true; return false; };
  if (es.lineLen > .01 && es.mul > 0) {
    const px0 = ax + ux * sA, py0 = ay + uy * sA, px1 = ax + ux * sE, py1 = ay + uy * sE;
    const i0 = Math.floor(Math.min(px0, px1)) - 3, i1 = Math.ceil(Math.max(px0, px1)) + 3;
    const j0 = Math.floor(Math.min(py0, py1)) - 3, j1 = Math.ceil(Math.max(py0, py1)) + 3;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let s = (i - ax) * ux + (j - ay) * uy; s = s < sA ? sA : s > sE ? sE : s;
      const dx = ax + ux * s - i, dy = ay + uy * s - j, d2 = dx * dx + dy * dy;
      if (d2 < 9) { let w = .07 * Math.exp(-d2 / 2.4) * es.mul; if (occ && inOcc(i, j)) w *= .3; add(i, j, C.lineG, w); }
    }
    const beadK = Math.min(1, es.beadPeak / .55);
    for (let s = sA; s <= sE; s += .25) {
      const px = ax + ux * s, py = ay + uy * s;
      if (occ && inOcc(Math.round(px), Math.round(py))) continue;
      const fi = clamp01((s - sA) / 1.5), fo = 1 - es.ff * (1 - clamp01((sE - s) / 1.5));
      const e = sE - s, bo = e < 10 ? .6 * (1 - e / 10) * beadK : 0;
      splat(px, py, C.line, .11 * fi * fo * (1 + bo) * es.mul);
    }
  }
  if (es.beadPeak > .003) {
    const bx = ax + ux * sE, by = ay + uy * sE, bk = Math.min(1, es.beadPeak / .55);
    halo(bx, by, C.pulse, es.beadPeak, es.beadSig || 1.5, es.beadRad || 5);
    splat(bx, by, C.pulse, .6 * es.beadPeak / .8);
    for (let k = 1; k <= 7; k++) {
      const s = sE - es.tailSign * k * .6;
      if (s < sA || s > g.sB) continue;
      splat(ax + ux * s, ay + uy * s, C.pulse, .5 * (1 - k / 7) * bk);
    }
  }
  if (es.pulseK > 0) {
    const ph = (T * .16 + phase) % 1, pp = ph * g.len;
    if (pp > g.sA && pp < g.sB) halo(ax + ux * pp, ay + uy * pp, C.pulse, .45 * Math.sin(Math.PI * ph) * es.pulseK, 1.4, 4);
  }
  if (es.bump > 0) bump[es.src] = Math.max(bump[es.src], es.bump);
  if (es.arrHalo > 0) { const sg = owner.big ? 7.5 : 5.5; halo(owner.gx, owner.gy, C.cold, es.arrHalo, sg, sg * 3); }
  if (es.miniOn) ring(owner.gx, owner.gy, es.miniR, es.miniB, C.done);
}
export function drawEdges() {
  bump.fill(0);
  for (let si = 0; si < NS; si++) {
    const s = stars[si]; let es = null, src = -1;
    if (s.done && s.link !== null) {
      src = s.link; const g = edgeGeom(stars[src], s);
      if (s.fin) es = edgeState(s.fin, (T - s.fin.t0) * 1000);
      else es = { lineLen: g.path, mul: 1, ff: 1, beadPeak: 0, tailSign: 1, bump: 0, arrHalo: 0, miniB: 0, pulseK: 1 };
      if (es) { es.src = src; drawEdge(g, es, si * .37, si); }
    } else if (!s.done && s.und && US[si] && s.und.link !== null) {
      src = s.und.link; es = undoEdge(s.und, (T - s.und.t0) * 1000);
      if (es) { es.src = src; drawEdge(edgeGeom(stars[src], s), es, 0, si); }
    }
  }
}
export function drawHalos(si) {
  const s = stars[si]; if (!pres(s)) return;
  if (s.gh) { if (s.ghA > .01) { const rr = s.big ? 7 : 5; halo(s.gx, s.gy, C.warm, .03 * s.ghA, rr, rr * 3); } return; }
  const ex = s.miss && s.mT >= 0 && s.mT < 1700;
  if (s.miss && !ex) { halo(s.gx, s.gy, C.ash, FLAGS.parity ? .04 : .06, 2, 5); return; }
  const fs = FS[si], us = US[si], b0 = s.big, cms = s.cr && s.on ? (T - s.cr.t0) * 1000 : 1e9;
  let cold = 0, mul = 1, hv = 1;
  if (s.done) { cold = fs ? fs.haloCold : 1; mul = fs ? fs.haloMul : 1; } else if (us) cold = us.cold; else hv = 1 + .15 * hk[si];
  if (!s.on) mul = 1 - seg(s.rmMs, 0, 400);
  if (cms < 1000) mul *= s.cr.reduced ? seg(cms, 0, 300) : cms < 900 ? 1.15 * ease.out(seg(cms, 650, 900)) : 1.15 - .15 * ease.inOut(seg(cms, 900, 1000));
  if (ex) mul *= 1 - ease.inOut(seg(s.mT, 300, 1300));
  const urgent = !s.done && isUrgent(s, wall(T)), b = urgent ? .5 + .5 * fbm(T * .45, si * 3.1, 5) : 1;
  if (cold < 1) {
    const w = (1 - cold) * mul * hv;
    if (urgent) { halo(s.gx, s.gy, C.amb, .2 * b * w, 4.5, 13); halo(s.gx, s.gy, C.ambC, .38 * b * w, 1.4, 4); }
    else { const rr = (b0 ? 7 : 5) * (.6 + .4 * s.life); halo(s.gx, s.gy, C.warm, (.08 + .12 * s.life) * w, rr, rr * 3); halo(s.gx, s.gy, C.warmC, .38 * w, 1.4, 4); }
  }
  if (cold > 0) { halo(s.gx, s.gy, C.cold, .26 * cold, b0 ? 7.5 : 5.5, b0 ? 22 : 16); halo(s.gx, s.gy, C.core, .45 * cold, 1.5, 4); }
  if (ex) halo(s.gx, s.gy, C.ash, (FLAGS.parity ? .04 : .06) * ease.inOut(seg(s.mT, 900, 1600)), 2, 5);
  if (fs && !fs.reduced) { if (fs.ringOn) ring(s.gx, s.gy, fs.ringR, fs.ringB, C.done); if (fs.flashPeak > 0) halo(s.gx, s.gy, C.core, fs.flashPeak, fs.flashSig, fs.flashRad); }
}
/* choreography light: creation motes and the expire exhale (render layer, step 9) */
function drawMotes(s, si, ms) {
  const n = 18 + Math.floor(H(si, 1.3) * 9);
  for (let m = 0; m < n; m++) {
    const dur = 600 + 100 * H(si * 1.7, m + .5), r0 = 16 + 6 * H(si + .3, m * 1.9);
    const a0 = (m / n) * 6.2832 + (H(si, m * 2.7) - .5) * .8;
    for (let k = 0; k < 4; k++) {
      const t = ms - k * 22; if (t < 0 || t > dur) continue;
      const p = ease.in(t / dur), rad = r0 * (1 - p), ang = a0 + .6 * (1 - p);
      splat(s.gx + Math.cos(ang) * rad, s.gy + Math.sin(ang) * rad, C.ink2, .35 * (k === 0 ? 1 : 1 - k / 4) * (1 - seg(t, dur - 70, dur)));
    }
  }
}
function drawExhale(s, ms) {
  const SP = SPR[s.big ? 1 : 0], r = s.big ? 5 : 3, core = s.big ? 2 : 1, urgent = isUrgent(s, wall(T));
  const v = Math.min(s.life * r, r - core);
  const kin = ease.out(seg(ms, 0, 300)), kdr = ease.inOut(seg(ms, 300, 1300)), ksh = ease.inOut(seg(ms, 900, 1600));
  const bmp = .2 * Math.sin(Math.PI * seg(ms, 0, 600));
  for (let q = 0; q < SP.n; q++) {
    const i = SP.I[q], j = SP.J[q], dd = SP.DD[q], ch = SP.CH[q], cent = i === 0 && j === 0;
    let a0, c0, a, c;
    if (dd === -1) { a0 = Math.max(0, (s.life - .7) / .3) * .75; c0 = C.ink2; }
    else if (dd === 0) { a0 = urgent ? .7 * (cent ? 1 : .8) : 1; c0 = urgent ? (cent ? C.ambC : C.ambS) : C.ink; }
    else { a0 = clamp01(v - (dd - core - 1)); c0 = urgent ? C.ambS : C.ink2; }
    if (dd === 0) {
      const tgt = cent ? 1 : (Math.abs(i) + Math.abs(j) === 1 ? .35 : 0);
      c = ms < 300 ? mixTo(SC, c0, C.ambC, kin) : mixTo(SC, C.ambC, C.ash, kdr);
      a = (a0 + (1 - a0) * kin) * (1 - ksh) + tgt * ksh;
      over(s.gx + i, s.gy + j, c, a);
      if (bmp > 0) add(s.gx + i, s.gy + j, C.ambC, bmp * (1 - ksh));
    } else {
      const tf = 300 + (r - ch) * 110;
      a = a0 * (1 - seg(ms, tf, tf + 300));
      if (a <= 0) continue;
      c = mixTo(SC, c0, C.ambS, seg(ms, 300, 700)); c = mixTo(SC, c, C.ash, seg(ms, 700, 1300));
      over(s.gx + i, s.gy + j, c, a);
    }
  }
}
function drawGhost(s) {
  const SP = SPR[s.big ? 1 : 0], ga = (.18 + .04 * Math.sin(T * 6.2832 / 2.4)) * s.ghA;
  if (ga <= .002) return;
  for (let q = 0; q < SP.n; q++) over(s.gx + SP.I[q], s.gy + SP.J[q], C.ink2, ga);
}
export function drawSprite(si) {
  const s = stars[si]; if (!pres(s)) return;
  if (s.gh) { drawGhost(s); return; }
  if (s.miss && s.mT >= 0 && s.mT < 1700) { drawExhale(s, s.mT); return; }
  if (s.miss) {
    const nb = FLAGS.parity ? .35 : .5;
    over(s.gx, s.gy, C.ash, 1);
    over(s.gx - 1, s.gy, C.ash, nb); over(s.gx + 1, s.gy, C.ash, nb);
    over(s.gx, s.gy - 1, C.ash, nb); over(s.gx, s.gy + 1, C.ash, nb);
    return;
  }
  const SP = SPR[s.big ? 1 : 0], r = R(s), core = CORE(s), fs = FS[si], us = US[si];
  const urgent = !s.done && isUrgent(s, wall(T)), b = urgent ? .5 + .5 * fbm(T * .45, si * 3.1, 5) : 1;
  const alive = !s.done && !us, h = alive ? hk[si] : 0, v = Math.min(s.life * r, r - core);
  const cc = fs ? fs.cc : 0, e = v - cc, ms = fs ? fs.ms : 0, ums = us ? (T - s.und.t0) * 1000 : 0, bp = bump[si];
  const dis = !s.on, dms = s.rmMs, cms = s.cr && s.on ? (T - s.cr.t0) * 1000 : 1e9, crOn = cms < 1200;
  for (let q = 0; q < SP.n; q++) {
    const i = SP.I[q], j = SP.J[q], dd = SP.DD[q], ch = SP.CH[q], cent = i === 0 && j === 0;
    let a0, c0;
    if (dd === -1) { a0 = Math.max(0, (s.life - .7) / .3) * .75; c0 = C.ink2; }
    else if (dd === 0) { a0 = urgent ? (.45 + .55 * b) * (cent ? 1 : .8) : 1; c0 = urgent ? (cent ? C.ambC : C.ambS) : C.ink; }
    else {
      const sh = .88 + .12 * Math.sin(T * 1.3 + i + j);
      a0 = clamp01(e - (dd - core - 1)) * sh; c0 = urgent ? C.ambS : C.ink2;
      if (h > 0) a0 += .45 * h * (clamp01(e + 1 - (dd - core - 1)) * sh - a0);          // hover: preview one more arm grain
    }
    if (dis) {                                                                          // undo of an add: dissolve outward
      const k = ease.out(seg(dms, 0, 400)), len = Math.hypot(i, j), an = H(si, 3.7) * 6.2832;
      const ux = len ? i / len : Math.cos(an), uy = len ? j / len : Math.sin(an);
      splat(s.gx + i + ux * 8 * k, s.gy + j + uy * 8 * k, c0, a0 * (1 - seg(dms, 0, 400)));
      continue;
    }
    const cD = cent ? C.core : dd === -1 ? C.glint : C.done;
    let a = a0, c = c0;
    if (s.done && !fs) { a = 1; c = cD; }
    else if (fs && fs.reduced) { a = a0 + (1 - a0) * fs.k; c = mixTo(SC, c0, cD, fs.k); }
    else if (fs) {
      if (cent) { a = a0 + (1 - a0) * cc; c = mixTo(SC, c0, C.core, cc); }
      else if (dd === -1) { a = Math.max(a0, fs.glint); c = mixTo(SC, c0, C.glint, fs.glint); }
      else {
        a = Math.max(a0, igA(ch, ms));
        const k = igK(ch, ms);
        c = k < .4 ? mixTo(SC, c0, C.core, k / .4) : mixTo(SC, C.core, cD, (k - .4) / .6);
      }
    }
    else if (us) { a = a0 + (1 - a0) * (1 - undoShr(ums, ch, r)); c = mixTo(SC, c0, cD, us.cold); }
    if (crOn) {                                                                          // creation: assembly centre-out
      if (s.cr.reduced) a *= seg(cms, 0, 300);
      else { const tR = 550 + ch * 45; a *= seg(cms, tR, tR + 120); if (a <= 0) continue; c = mixTo(SC, C.ink, c, seg(cms, tR, tR + 300)); }
    }
    over(s.gx + i, s.gy + j, c, a);
    if (bp > 0 && dd === 0) add(s.gx + i, s.gy + j, C.core, bp);
  }
  if (crOn && !s.cr.reduced) drawMotes(s, si, cms);
}
import { igA, igK } from '../choreo/finish.js';
import { undoShr } from '../choreo/undo.js';

export function compose() {
  if (frozen || isCloudStale() || T < cloudTime()) clouds(); else cloudsTick();
  composeBase(acts, actN, dims, dimN);
  if (xf) {
    const k = ease.inOut(clamp01((T - xf.t0) / (xf.dur || .9)));
    if (k >= 1) xf = null;
    else for (let q = 0; q < N; q++) {
      BR[q] = OR[q] * (1 - k) + BR[q] * k; BG[q] = OG[q] * (1 - k) + BG[q] * k; BB[q] = OB[q] * (1 - k) + BB[q] * k;
    }
  }
  drawPast();
  moonUpdate(); auroraUpdate(frozenForce); drawAurora(); drawMoon(); drawComet(); drawSats(); drawMeteor();
  drawEdges();
  for (let si = 0; si < NS; si++) drawHalos(si);
  for (let si = 0; si < NS; si++) { const L = lab[si]; if (L.shown) dimRect(Math.round(L.bx0), Math.round(L.by0), Math.round(L.bx1), Math.round(L.by1), L.vis); }
  drawRitual();
  for (let si = 0; si < NS; si++) drawSprite(si);
}

/* crossfade to a new sky (the old base is snapshotted, then the new week fades in) */
export function skySwap(seed, atT, dur) {
  cloudsForce(); actN = 0; composeBase(acts, actN, dims, dimN);
  OR.set(BR); OG.set(BG); OB.set(BB);
  makeSky(seed); clockTick(true); cloudsForce();
  xf = { t0: atT === null || atT === undefined ? T : atT, dur: dur || .9 };
}


