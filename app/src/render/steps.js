/* render/steps.js — the orbit of steps around a task's star, written into the grain framebuffer only.
   A tilted orbit of dust with one companion per slot. Light, never lines: every sample is a splat.
   Order per star: stepsBack (before the label backing and the parent sprite), stepsFront (right after the sprite),
   stepsBullets (after all sprites, for the selected list). */
import { clamp01, seg, ease, mixTo, sm } from '../math.js';
import { C, STEPS, isReduced } from '../tokens.js';
import { add, over, splat, halo, GW, SH, SR, SG, SB } from '../framebuffer.js';
import { T, wall } from '../sky/clock.js';
import { stars, NS, stepsDoneBy } from '../model/store.js';
import { lab, hk } from '../model/placement.js';
import { hasSteps, stepsLive, stepGeom, stepView, orbAt, rowPitch, sui } from '../model/steps.js';
import { slotCount, slotF, collapseK } from '../choreo/step.js';

const FR = [];
for (let i = 0; i < 64; i++) FR.push({ on: false });
const P3 = [0, 0, 0],
  P4 = [0, 0, 0],
  COL = [0, 0, 0],
  COL2 = [0, 0, 0],
  PP = [0, 0];
/* a sharper splat: still glides by fractional position, but sits mostly on the nearest grain so small things keep their peak */
function splatS(fx, fy, c, w) {
  const i = Math.floor(fx),
    j = Math.floor(fy);
  let u = fx - i,
    v = fy - j;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  let q = w * (1 - u) * (1 - v);
  if (q > MINW) add(i, j, c, q); // corners that would add under 1/600 of a level are skipped
  q = w * u * (1 - v);
  if (q > MINW) add(i + 1, j, c, q);
  q = w * (1 - u) * v;
  if (q > MINW) add(i, j + 1, c, q);
  q = w * u * v;
  if (q > MINW) add(i + 1, j + 1, c, q);
}
const MINW = 0.0006;
const depthMul = (z, b) => b + (1 - b) * sm(-0.25, 0.25, z);

/* position of slot i relative to the star (the orbit drifts) */
function slotRel(fr, i, out) {
  orbAt(fr.g, i / fr.K + fr.drift, P3);
  out[0] = P3[0];
  out[1] = P3[1];
  out[2] = P3[2];
}

/* the colour of a slot of fill f: ink2 (amber when behind) towards the done colour */
function slotCol(fr, f, out) {
  mixTo(out, fr.behind ? C.ambS : C.ink2, C.done, f);
  return out;
}

/* a mini-sprite: one core grain and four neighbours, splatted so it glides */
function mini(x, y, col, ncol, core, nb, m) {
  splatS(x, y, col, core * m);
  const w = core * nb * m;
  splatS(x - 1, y, ncol, w);
  splatS(x + 1, y, ncol, w);
  splatS(x, y - 1, ncol, w);
  splatS(x, y + 1, ncol, w);
}

/* ---------- per-frame state ---------- */
function frameOf(si) {
  const s = stars[si],
    fr = FR[si],
    fin = s.fin;
  fr.on = false;
  const live = stepsLive(s),
    fold = !live && s.done && s.on && fin && fin.colMs > 0 && hasSteps(s) && (T - fin.col0) * 1000 < fin.colMs;
  if (!live && !fold) return fr;
  const g = stepGeom(s),
    n = s.steps.length,
    K = slotCount(n),
    now = wall(T);
  fr.on = true;
  fr.s = s;
  fr.g = g;
  fr.K = K;
  fr.n = n;
  fr.gx = s.gx;
  fr.gy = s.gy;
  fr.reduced = isReduced();
  fr.behind = fold ? !!fin.behind : !!s.stepBehind;
  fr.ready = stepsDoneBy(s, now) === n;
  fr.hv = 1 + (STEPS.hover - 1) * hk[si];
  fr.drift = !fr.reduced ? T / STEPS.rev : 0;
  fr.cl = 1;
  fr.fade = 1;
  fr.ms = 0;
  fr.fold = fold;
  if (fold) {
    // finishing: the orbit folds into the core (it only fades when reduced)
    fr.ms = (T - fin.col0) * 1000;
    fr.cl = collapseK(fr.ms, fin.reduced);
    fr.fade = fin.reduced ? fr.cl : sm(0.1, 0.7, fr.cl);
  }
  if (s.cr && s.on) {
    const c = (T - s.cr.t0) * 1000;
    fr.fade *= s.cr.reduced ? seg(c, 0, 300) : seg(c, 900, 1500);
  } // creation: the orbit follows the star
  const ev = s.sev,
    v = stepView(s, T, ev ? g.rx * 0.8 : 12);
  fr.fill = v.fill;
  fr.st = v.st;
  fr.slot = v.slot;
  return fr;
}

/* ---------- the orbit ---------- */
function drawA(fr, pass) {
  const S = STEPS,
    g = fr.g,
    gx = fr.gx,
    gy = fr.gy,
    hv = fr.hv,
    K = fr.K,
    arcFrac = fr.fill / K,
    ready = fr.ready;
  const sc = fr.reduced ? 1 : fr.cl,
    fd = fr.fade; // fold: scale towards the core, fade before it arrives
  if (fd <= 0.002) return;
  if (pass === 0) {
    // positions, depth and shimmer once per frame; the near half reuses them
    if (!g.cx) {
      g.cx = new Float64Array(g.N);
      g.cy = new Float64Array(g.N);
      g.cz = new Float64Array(g.N);
      g.ca = new Float64Array(g.N);
    }
    for (let k = 0; k < g.N; k++) {
      orbAt(g, g.u[k] + fr.drift, P3);
      g.cx[k] = P3[0];
      g.cy[k] = P3[1];
      g.cz[k] = P3[2];
      g.ca[k] = g.amp[k] * depthMul(P3[2], S.behind) * (fr.reduced ? 1 : 0.8 + 0.2 * Math.sin(T * g.fq[k] + g.ph[k])) * hv * fd;
    }
  }
  for (let k = 0; k < g.N; k++) {
    if (g.cz[k] >= 0 !== (pass === 1)) continue;
    const uk = g.u[k],
      a = g.ca[k];
    const x = gx + g.cx[k] * sc + g.jx[k] * sc,
      y = gy + g.cy[k] * sc + g.jy[k] * sc;
    splatS(x, y, C.ink2, S.dust * a);
    if (uk < arcFrac) {
      // the lit arc: cold dust with a lineG glow
      const e = arcFrac >= 0.999 ? 1 : 1 - seg(uk, arcFrac - 0.05, arcFrac);
      splatS(x, y, C.line, S.arc * a * e);
      splat(x, y, C.lineG, S.arcGlow * a * e);
    }
  }
  for (let i = 0; i < K; i++) {
    // companions
    slotRel(fr, i, P4);
    if (P4[2] >= 0 !== (pass === 1)) continue;
    const m = depthMul(P4[2], S.behind) * hv * fd,
      x = gx + P4[0] * sc,
      y = gy + P4[1] * sc;
    const f = slotF(fr.fill, i),
      isEv = i === fr.slot && fr.st;
    const dim = isEv ? 1 - fr.st.dim : 1;
    slotCol(fr, f, COL);
    mixTo(COL2, fr.behind ? C.ambS : C.ink2, C.glint, f);
    mini(x, y, COL, COL2, (S.openCore + (S.doneCore - S.openCore) * f) * dim, S.nb, m);
    if (f > 0.01) halo(x, y, C.cold, S.halo * f * m, S.haloSig, 3);
    if (isEv && fr.st.flash > 0.01) {
      splat(x, y, C.core, 0.5 * fr.st.flash * m);
      halo(x, y, C.core, 0.18 * fr.st.flash, 1.6, 4);
    }
  }
  if (!ready) {
    // the pace mark: where the time is
    const u = clamp01(1 - fr.s.life);
    orbAt(g, u + fr.drift, P3);
    if (P3[2] >= 0 === (pass === 1)) {
      const m = depthMul(P3[2], S.behind) * hv * (fr.behind ? 1 : S.tickCalm) * fd,
        tx = P3[0] * sc,
        ty = P3[1] * sc;
      splat(gx + tx * 0.86, gy + ty * 0.86, C.ambS, S.tick * m);
      splat(gx + tx * 1.14, gy + ty * 1.14, C.ambS, S.tick * m);
    }
  } else if (!fr.reduced) {
    // ready: one glint, one lap per 4 s
    const u = (T / S.glint) % 1;
    for (let q = 0; q < 8; q++) {
      orbAt(g, u - q * 0.008, P3);
      if (P3[2] >= 0 !== (pass === 1)) continue;
      splat(gx + P3[0] * sc, gy + P3[1] * sc, C.pulse, 0.3 * (1 - q / 8) * depthMul(P3[2], S.behind) * hv * fd);
    }
  }
}

/* ---------- the finishing pulse and the arrival lift ---------- */
function drawPulse(fr, bump, si) {
  if (fr.fold) {
    // the fold lands: a small lift on the core, then the finish takes over
    if (!fr.reduced) bump[si] = Math.max(bump[si], 0.12 * ease.out(seg(fr.ms, 250, 400)));
    return;
  }
  const st = fr.st;
  if (!st) return;
  if (st.lift > 0) bump[si] = Math.max(bump[si], st.lift);
  if (st.pulseP < 0 || fr.slot < 0) return;
  const gx = fr.gx,
    gy = fr.gy;
  for (let q = 0; q < 7; q++) {
    const p = st.pulseP - q * 0.045;
    if (p < 0) break;
    slotRel(fr, fr.slot, P4);
    PP[0] = P4[0] * (1 - p);
    PP[1] = P4[1] * (1 - p);
    if (q === 0) {
      halo(gx + PP[0], gy + PP[1], C.pulse, 0.4, 1.3, 4);
      splat(gx + PP[0], gy + PP[1], C.pulse, 0.55);
    } else splat(gx + PP[0], gy + PP[1], C.pulse, 0.4 * (1 - q / 7));
  }
}

export function stepsBack(si, bump) {
  const fr = frameOf(si);
  if (!fr.on) return;
  drawA(fr, 0);
  drawPulse(fr, bump, si);
}
export function stepsFront(si) {
  const fr = FR[si];
  if (!fr || !fr.on) return;
  drawA(fr, 1);
}
/* the open list is in front of the sky: inside its rectangle every grain becomes the plain background (the sky gradient, dimmed as under any label),
   so no star, glow, orbit or neighbouring label shows through. Runs after all sprites, before the bullets. */
const PANEL_BG = 0.5;
export function stepsPanel() {
  for (let si = 0; si < NS; si++) {
    const L = lab[si];
    if (!L.shown || !L.list || L.listK < 0.01) continue;
    const x0 = Math.max(0, Math.round(L.fx0)),
      x1 = Math.min(GW, Math.round(L.fx1)),
      y0 = Math.max(0, Math.round(L.by0)),
      y1 = Math.min(SH, Math.round(L.by1)),
      a = L.listK;
    for (let j = y0; j < y1; j++)
      for (let i = x0; i < x1; i++) {
        const k = j * GW + i,
          c = COLP;
        COLP[0] = SR[k] * PANEL_BG;
        COLP[1] = SG[k] * PANEL_BG;
        COLP[2] = SB[k] * PANEL_BG;
        over(i, j, c, a);
      }
  }
}
const COLP = [0, 0, 0];
/* grain bullets for the selected list, in the gutter left of the text; rows scrolled out of the panel get none */
export function stepsBullets() {
  const p = rowPitch();
  for (let si = 0; si < NS; si++) {
    const L = lab[si];
    if (!L.shown || !L.list || L.listK < 0.05) continue;
    const bx = Math.round(L.dx) + 1,
      k = L.listK,
      sy = sui.sy[si],
      top = Math.round(L.dy + 12),
      bot = Math.round(L.dy + 12 + L.listH);
    for (let r = 0; r < L.list.length; r++) {
      const by = Math.round(L.dy + 12 + p * (r + 0.5) - sy),
        row = L.list[r];
      if (by - 1 < top || by + 1 >= bot) continue;
      if (row.k === 'open') over(bx, by, C.ink2, 0.8 * k);
      else if (row.k === 'next') over(bx, by, C.ink, 0.95 * k);
      else if (row.k === 'hdr') over(bx, by, C.cold, 0.8 * k);
      else if (row.k === 'done') {
        over(bx, by, C.cold, 0.85 * k);
        over(bx - 1, by, C.cold, 0.4 * k);
        over(bx + 1, by, C.cold, 0.4 * k);
        over(bx, by - 1, C.cold, 0.4 * k);
        over(bx, by + 1, C.cold, 0.4 * k);
      }
    }
  }
}
