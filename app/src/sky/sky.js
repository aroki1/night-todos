/* sky/sky.js — palettes, the seeded sky, star layers, the sky's response, crossfade base. */
import { rng, fbm, sm, clamp01, hex } from '../math.js';
import { PAL } from '../tokens.js';
import { GW, SH, BR, BG, BB, CR, CG, CB, SR, SG, SB, AGR, AGG, AGB, PROF, SBR, SBG, SBB, LM, skyResets, onSkyReset, splat, halo } from '../framebuffer.js';
import { extendLayers } from './components.js';
import { ringRadius } from '../choreo/finish.js';
import { T } from './clock.js';
import * as pf from '../stageprof.js';

export let sky = null;

/* per-sky flags from their own seeded stream, so the plain star field stays exactly as before */
export function skyFlags(seed) {
  const ri = rng(seed), pi = Math.floor(ri() * PAL.length), r = rng((seed ^ 0x2545F491) >>> 0);
  const f = { palIdx: pi, shower: r() < .25, comet: r() < 1 / 3, aurora: pi === 2 && r() < .5, rx: -200 + r() * 260, ry: -120 + r() * 100 };
  const p0x = 28 + r() * 90, p0y = 112 + r() * 30, p2x = GW - 30 - r() * 90, p2y = 22 + r() * 30;
  const dx = p2x - p0x, dy = p2y - p0y, l = Math.hypot(dx, dy), sg = r() < .5 ? -1 : 1, bow = 35 + r() * 25;
  f.cometArc = {
    p0x, p0y, p2x, p2y, p1x: (p0x + p2x) / 2 - dy / l * bow * sg, p1y: (p0y + p2y) / 2 + dx / l * bow * sg,
    sunX: GW * r() + (r() - .5) * 300, sunY: SH + 300, len: 28 + r() * 12, curve: (r() < .5 ? -1 : 1) * (.6 + .4 * r())
  };
  return f;
}

export function makeSky(seed) {
  const r = rng(seed), pal = PAL[Math.floor(r() * PAL.length)], off = Math.floor(r() * 900);
  const top = hex(pal.top), bot = hex(pal.bot), hz = pal.hz.map(v => v / 255);
  for (let j = 0; j < SH; j++) {
    PROF[j] = Math.pow(sm(SH - 60, SH, j), 1.4);
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i, t = sm(0, .78, j / SH), dx = (i - GW / 2) / GW, dy = (j - SH * .55) / GW;
      const vig = 1 - .4 * sm(.2, .62, Math.hypot(dx, dy)), h = PROF[j] * .1;
      SBR[k] = (top[0] + (bot[0] - top[0]) * t) * vig * 1.5;
      SBG[k] = (top[1] + (bot[1] - top[1]) * t) * vig * 1.5;
      SBB[k] = (top[2] + (bot[2] - top[2]) * t) * vig * 1.5;
      AGR[k] = hz[0] * h; AGG[k] = hz[1] * h; AGB[k] = hz[2] * h;
      SR[k] = SBR[k] + AGR[k]; SG[k] = SBG[k] + AGG[k]; SB[k] = SBB[k] + AGB[k];
    }
  }
  const W = GW + 24, scale = W / 428;
  const layers = [
    { n: 1100, sp: .73, a: [.08, .26], tw: .05 },
    { n: 300, sp: 1.67, a: [.2, .42], tw: .25 },
    { n: 46, sp: 3, a: [.42, .7], tw: .7 }
  ].map(L => {
    const S = [], target = Math.max(12, Math.round(L.n * scale)); let k = 0;
    while (S.length < target && k < target * 8) {
      k++;
      const px = r() * W, py = r() * SH, dens = .35 + .65 * sm(.35, .7, fbm(px / 87, py / 87, off + 7));
      if (r() > dens) continue;
      const m = Math.pow(r(), 2.2), t = r();
      S.push({
        x: px, y: py, a: L.a[0] + (L.a[1] - L.a[0]) * (1 - m),
        c: hex(t < .72 ? pal.tint[0] : t < .9 ? pal.tint[1] : pal.tint[2]),
        ph: r() * 6.28, f: .3 + r() * .9, tw: r() < L.tw
      });
    }
    return { n: target, sp: L.sp, S, W };
  });
  const r2 = rng((seed * 7 + 12345) >>> 0);
  extendLayers({ layers, W, SH, r2, pal, seed });
  const rgb = a => hex('#' + a.map(v => v.toString(16).padStart(2, '0')).join(''));
  const fl = skyFlags(seed);
  sky = {
    seed, pal, off, layers, cl: [rgb(pal.cl[0]), rgb(pal.cl[1])], palIdx: fl.palIdx,
    shower: fl.shower, aurora: fl.aurora, rx: fl.rx, ry: fl.ry, comet: fl.comet ? fl.cometArc : null
  };
  for (const fn of skyResets) fn();
}
export { onSkyReset };

/* stars and their twinkle; acts/dims are light events owned by the choreography */
export function composeBase(acts, actN, dims, dimN) {
  BR.set(CR); BG.set(CG); BB.set(CB);
  if (pf.on) pf.mark('base.copy');
  for (let li = 0; li < 3; li++) {
    const L = sky.layers[li], S = L.S, lm = LM[li];
    if (lm <= .003) continue;
    for (let q = 0; q < S.length; q++) {
      const s = S[q], px = (((s.x - T * L.sp) % L.W) + L.W) % L.W - 12;
      if (px < -3 || px > GW + 2) continue;
      const hf = .45 + .55 * sm(SH, SH - 55, s.y); let tf = 1, a;
      if (s.vp) a = (s.vp.lo + (s.vp.hi - s.vp.lo) * Math.pow(.5 + .5 * Math.sin(T * 6.2832 / s.vp.P + s.vp.ph), 1.6)) * hf;
      else { a = s.a * hf; if (s.tw) { tf = .62 + .38 * Math.pow(.5 + .5 * Math.sin(T * s.f + s.ph), 1.5); a *= tf; } }
      a *= lm;
      if (dimN) {
        let dm = 1;
        for (let m = 0; m < dimN; m++) { const A = dims[m], dx = px - A.x, dy = s.y - A.y; dm -= A.k * (1 - sm(14, 18, Math.sqrt(dx * dx + dy * dy))); }
        if (dm < 1) a *= dm;
      }
      splat(px, s.y, s.c, a);
      if (s.hl) halo(px, s.y, s.c, s.hl * lm, 1.4, 3);
      else if (li === 2) halo(px, s.y, s.c, a * .2, 1.1, 2.6);
      if (s.cross) {
        const w1 = .35 * tf * lm * hf, w2 = .15 * tf * lm * hf;
        splat(px + 1, s.y, s.c, w1); splat(px - 1, s.y, s.c, w1); splat(px, s.y + 1, s.c, w1); splat(px, s.y - 1, s.c, w1);
        splat(px + 2, s.y, s.c, w2); splat(px - 2, s.y, s.c, w2); splat(px, s.y + 2, s.c, w2); splat(px, s.y - 2, s.c, w2);
      }
      if (actN) {
        let w = 0;
        for (let m = 0; m < actN; m++) { const A = acts[m], dx = px - A.x, dy = s.y - A.y; w += skyW(Math.sqrt(dx * dx + dy * dy), A.ms); }
        if (w > 0) splat(px, s.y, s.c, Math.min(1, w) * .22);
      }
    }
    if (pf.on) pf.mark('base.layer' + li);
  }
}
/* sky response to a ring front (pure): w in 0..1 for a bg star at distance d from the ring origin */
export function skyW(d, ms) {
  if (ms < 120 || ms > 1300) return 0;
  const r = ringRadius(ms), q = clamp01((d - 3) / 25), tp = 120 + 780 * (1 - Math.pow(1 - q, 1 / 3));
  const lead = clamp01((r - d + 2.5) / 2.5), decay = ms > tp ? Math.max(0, 1 - (ms - tp) / 350) : 1;
  return lead * decay;
}


