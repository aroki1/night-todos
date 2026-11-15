/* render/practice.js — the practice star: a small core in a thin ring of grains, the week's seven grains under it, and the year ring (on hover / selection).
   Steady by design: no life, never amber, done or ash. Reads the choreography (choreo/practice.js); writes only into the grain framebuffer. */
import { H } from '../math.js';
import { PRACTICE, C } from '../tokens.js';
import { GW, SH, over, add } from '../framebuffer.js';
import { T, wall, isoWeekKey } from '../sky/clock.js';
import { stars } from '../model/store.js';
import { hk } from '../model/placement.js';
import { weekDots, ringWeeks, dayMs } from '../model/practices.js';
import { markState, stopState } from '../choreo/practice.js';

const PC = PRACTICE, TAU = Math.PI * 2;
const COS = [], SIN = [];
for (let i = 0; i < 52; i++) { COS.push(Math.cos(-Math.PI / 2 + TAU * i / 52)); SIN.push(Math.sin(-Math.PI / 2 + TAU * i / 52)); }
const HALO = [];
for (let i = 0; i < PC.haloN; i++) { const a = -Math.PI / 2 + TAU * i / PC.haloN, x = Math.round(PC.haloR * Math.cos(a)), y = Math.round(PC.haloR * Math.sin(a)); if (!HALO.some(h => h.x === x && h.y === y)) HALO.push({ x, y }); }
const ARMS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* the rings of a practice, cached until its days, its start or the day change */
const cache = new Map();
function ringsOf(p, now) {
  const sig = p.days.length + ':' + p.createdAt + ':' + (p.days[p.days.length - 1] || '') + ':' + Math.floor(now / 864e5);
  let c = cache.get(p.id);
  if (!c || c.sig !== sig) { c = { sig, rings: ringWeeks(p, now) }; cache.set(p.id, c); }
  return c.rings;
}

/* ms of a choreography still running for this star (0 = none), so the frame loop keeps drawing */
export function practiceFxMs(s) {
  let ms = 0;
  if (s.pmk) { const m = (T - s.pmk.t0) * 1000, e = markState(0, s.pmk.on, s.pmk.reduced).end; if (m < e) ms = e - m; }
  if (s.pfx) { const m = (T - s.pfx.t0) * 1000, e = stopState(0, s.pfx.dir, s.pfx.reduced).end; if (m < e) ms = Math.max(ms, e - m); }
  return ms;
}

export function drawPractice(si) {
  const s = stars[si], p = s.pdata; if (!p) return;
  let gone = 0, al = 1;
  if (s.pfx) {
    const ms = (T - s.pfx.t0) * 1000, st = stopState(ms, s.pfx.dir, s.pfx.reduced);
    gone = st.p; al = st.a;
  }
  if (al <= 0 || gone >= 1 || (!s.on && !s.pfx)) return;
  const live = (id) => H(si + 1, id * 1.37 + .5) >= gone;
  const now = wall(T), cx = s.gx, cy = s.gy;
  /* the mark in flight: which day grain, and the core's lift */
  let mk = null, lift = 0, mi = -1;
  if (s.pmk) {
    const ms = (T - s.pmk.t0) * 1000;
    if (ms < markState(0, s.pmk.on, s.pmk.reduced).end) {
      mk = markState(ms, s.pmk.on, s.pmk.reduced); lift = mk.lift;
      const dm = dayMs(s.pmk.day);
      if (Number.isFinite(dm) && isoWeekKey(dm) === isoWeekKey(now)) mi = (new Date(dm).getDay() + 6) % 7;
    }
  }
  /* the year ring: the faint hint at rest, every slot with the hover / selection */
  const rings = ringsOf(p, now), hv = hk[si];
  if (rings.length) {
    const outer = PC.ring1 + (rings.length - 1) * PC.ringGap, room = Math.min(cx - 1, GW - 2 - cx, cy - 1, SH - 2 - cy), sc = Math.min(1, room / outer);
    for (let r = 0; r < rings.length; r++) {
      const R = (PC.ring1 + r * PC.ringGap) * sc, ws = rings[r];
      for (let i = 0; i < ws.length; i++) {
        const hint = r === 0 && i % PC.hintEvery === 0 ? PC.hintA : 0;
        const full = hv > .002 ? hv * (PC.slotOffA + (PC.slotA - PC.slotOffA) * ws[i].k) : 0;
        const a = Math.max(hint, full) * al;
        if (a > 0 && live(200 + r * 60 + i)) over(Math.round(cx + COS[i] * R), Math.round(cy + SIN[i] * R), PC.ink, a);
      }
    }
  }
  /* the star: core + four arms inside the thin ring */
  const ca = Math.min(1, PC.coreA * (1 + PC.liftGain * lift)) * al;
  if (live(0)) over(cx, cy, PC.ink, ca);
  for (let q = 0; q < 4; q++) if (live(1 + q)) over(cx + ARMS[q][0], cy + ARMS[q][1], PC.ink, PC.armA * (1 + PC.liftGain * lift) * al);
  for (let q = 0; q < HALO.length; q++) if (live(10 + q)) over(cx + HALO[q].x, cy + HALO[q].y, PC.dim, PC.haloA * al);
  /* the week: seven grains, lit for done days, faint for open ones, today's open slot a touch brighter */
  const dots = weekDots(p, now), today = (new Date(now).getDay() + 6) % 7;
  for (let d = 0; d < 7; d++) {
    if (!live(30 + d)) continue;
    const x = cx + (d - 3) * PC.dotStep, y = cy + PC.dotY, lit = d === mi ? mk.lit : dots[d] ? 1 : 0;
    const off = d === today ? PC.dotTodayA : PC.dotOffA;
    over(x, y, lit > 0 ? PC.ink : PC.dim, (off + (PC.dotA - off) * lit) * al);
    if (d === mi && mk.flash > 0) add(x, y, C.core, mk.flash * PC.flashGain * al);
  }
}
