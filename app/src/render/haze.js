/* render/haze.js — thoughts as haze: a soft, coreless patch of grains in the band above the bar, drifting and breathing as a function of T.
   The asked thought stays put, brightens and shows a pulsing seed point while the others dim; a hovered one only brightens; a thought being said condenses into a point and travels to its star (choreo/condense.js);
   a thought let go thins out grain by grain (and back on undo). The grains of a patch are chosen once per thought; only drift and breath run per frame.
   Draws nothing without thoughts (the goldens). */
import { clamp01, seg, ease, rng, hstr, mixTo, SC } from '../math.js';
import { C, FLAGS, THOUGHT, isReduced } from '../tokens.js';
import { GW, SH, add, splat, halo } from '../framebuffer.js';
import { T } from '../sky/clock.js';
import { stars, liveThoughts, findThought } from '../model/store.js';
import { hazeSlots } from '../model/thoughts.js';
import { thFx } from '../model/timeline.js';
import { condenseState, condenseMs } from '../choreo/condense.js';

let selId = null, hovId = null;                          // UI state: the thought the bar asks about, the one under the pointer
export function setThoughtSel(id) { selId = id; }
export function setThoughtHover(id) { hovId = id; }

const TAU = Math.PI * 2;
const cache = new Map();                                 // id -> { n, dx, dy, w, th, ph, ph0 } (chosen once)
function cellsFor(id) {
  let c = cache.get(id); if (c) return c;
  const r = rng(hstr(id) ^ 0x5bd1e995), rx = THOUGHT.patchW * .6, ry = THOUGHT.hazeH / 2, hy = Math.floor(ry);
  const dx = [], dy = [], w = [], th = [], ph = [];
  for (let j = -hy; j <= hy; j++) for (let i = -Math.floor(rx); i <= Math.floor(rx); i++) {
    const q = (i / rx) * (i / rx) + (j / ry) * (j / ry), a = r(), b = r(), d = r(), e = r();
    if (q >= 1 || a > THOUGHT.fill * (1 - .45 * q)) continue;            // no core, no edge: sparse grains thinning out toward the rim
    dx.push(i); dy.push(j); w.push(Math.pow(1 - q, 1.2) * (.5 + b)); th.push(d); ph.push(e * TAU);
  }
  c = { n: dx.length, dx, dy, w, th, ph, ph0: r() * TAU, ph1: r() * TAU };
  cache.set(id, c); return c;
}

/* one patch: centre cx, peak brightness, v = presence (grains leave by their own threshold), scale = contraction toward the centre */
function patch(id, cx, peak, v, scale) {
  const c = cellsFor(id), cy = SH - THOUGHT.bandY + THOUGHT.bandH / 2, col = THOUGHT.color;
  const ox = cx + THOUGHT.driftA * Math.sin(TAU * T / THOUGHT.driftS + c.ph0), br = TAU * T / THOUGHT.breathS + c.ph1;
  for (let k = 0; k < c.n; k++) {
    const pr = clamp01((v * 1.2 - c.th[k]) * 5); if (pr <= 0) continue;
    add(Math.round(ox + c.dx[k] * scale), Math.round(cy + c.dy[k] * scale), col, peak * c.w[k] * pr * (1 + THOUGHT.breathA * Math.sin(br + c.ph[k] * .5)));
  }
}

/* the seed of a star in the middle of an asked patch: one grain, the haze colour warmed toward alive ivory, pulsing softly (not when reduced) */
function seed(x, y, k) {
  const TH = THOUGHT;
  mixTo(SC, TH.color, C.ink, TH.seedWarm);
  splat(x, y, SC, TH.seedA * k * (1 + (isReduced() ? 0 : TH.seedPulse * Math.sin(TAU * TH.seedHz * T))));
}

const sm = new Map(); let lastT = 0;                      // id -> { s, h, p, d }: asked / hover / seed / dimmed amounts, eased (snapped in a frozen frame or when reduced)
const RATE = { s: .25, h: .25, p: THOUGHT.seedMs / 1000, d: THOUGHT.dimMs / 1000 };
function ease1(id, key, target, dt) {
  let o = sm.get(id); if (!o) sm.set(id, o = { s: 0, h: 0, p: 0, d: 0 });
  if (FLAGS.freeze || isReduced()) o[key] = target; else { const d = target - o[key], m = dt / RATE[key]; o[key] += Math.abs(d) < m ? d : Math.sign(d) * m; }
  return o[key];
}

export function drawHaze() {
  const live = liveThoughts();
  if (!live.length && !thFx.size) return;
  const dt = Math.min(.1, Math.max(0, T - lastT)); lastT = T;
  const slots = live.length ? hazeSlots(live, GW) : [];
  const TH = THOUGHT, cy = SH - TH.bandY + TH.bandH / 2;
  for (const q of slots) {
    const fx = thFx.get(q.id);
    const v = fx && fx.kind === 'go' && fx.dir > 0 ? seg((T - fx.t0) * 1000, 0, TH.letGoMs) : 1;
    const asked = q.id === selId, sk = ease1(q.id, 's', asked ? 1 : 0, dt), hk = ease1(q.id, 'h', q.id === hovId && !asked ? 1 : 0, dt);
    const pk = ease1(q.id, 'p', asked ? 1 : 0, dt), dk = ease1(q.id, 'd', selId !== null && !asked ? 1 : 0, dt);
    patch(q.id, q.x, (TH.alpha + (TH.selAlpha - TH.alpha) * sk + (TH.hoverAlpha - TH.alpha) * hk) * (1 - (1 - TH.dimOthers) * dk), v, 1);
    if (pk > .002) seed(q.x, cy, pk * v);
  }
  for (const [id, fx] of thFx) {
    const ms = (T - fx.t0) * 1000; if (ms < 0) continue;
    if (fx.kind === 'go') {                                                     // let go: thinning out from where it was
      if (fx.dir > 0 || ms >= TH.letGoMs) continue;
      const th = findThought(id); if (!th || !th.goneAt) continue;
      const q = hazeSlots(live.concat([th]), GW).find(p => p.id === id);
      if (q) patch(id, q.x, TH.alpha, 1 - seg(ms, 0, TH.letGoMs), 1);
    } else {                                                                    // said: haze -> point -> star
      const s = stars[fx.si]; if (!s) continue;
      const c = { x0: fx.x, y0: cy, x1: s.gx, y1: s.gy, reduced: fx.reduced };
      if (ms >= condenseMs(fx.reduced) + (fx.reduced ? 0 : TH.holdMs)) continue;
      const o = condenseState(c, ms);
      if (o.hazeA > .002) patch(id, c.x0, TH.selAlpha * o.hazeA, 1, (1 - TH.gather * seg(ms, 0, TH.gatherMs * .25)) * o.scale);
      if (!fx.reduced) { const k = 1 - seg(ms, TH.gatherMs * .4, TH.gatherMs); if (k > .002) seed(c.x0, c.y0, k); }     // the seed hands over to the travelling point
      if (o.on) {
        const col = mixTo(SC, TH.color, C.ink, o.warm);
        for (let k = 1; k <= 4; k++) { const t = condenseState(c, ms - k * 40); if (ms - k * 40 > 0) splat(t.px, t.py, col, o.pb * .5 * (1 - k / 5)); }
        splat(o.px, o.py, col, o.pb); halo(o.px, o.py, col, o.pb * .45, 1.6, 4);
      }
    }
  }
}
export const hazeAnimating = () => { for (const fx of thFx.values()) { const ms = (T - fx.t0) * 1000; if (ms >= 0 && ms < (fx.kind === 'go' ? THOUGHT.letGoMs : condenseMs(fx.reduced) + THOUGHT.holdMs)) return true; } return false; };
