/* model/placement.js — label content, label placement with scoring + hysteresis, and the
   placement of a new star. All in grains; the screen never decides text positions. */
import { rng, hstr, segDist, seg, ease, mixTo } from '../math.js';
import { K, FONT, SIZE, FLAGS, STEPS, PLACE, TIME } from '../tokens.js';
import { ctx, GW, SH } from '../framebuffer.js';
import { stars, NS, GHI, pres, Rb, edgeGeom as geom, isUrgent, starTag } from './store.js';
import { FS, US } from './timeline.js';
import { edgeState } from '../choreo/finish.js';
import { undoEdge } from '../choreo/undo.js';
import { T, wall, isoWeekKey } from '../sky/clock.js';
import {
  stepsLive,
  stepsHint,
  stepsLine2,
  stepRows,
  stepExtent,
  rowPitch,
  doneCount,
  panelMax,
  clampScroll,
  sui,
  isTouchLayout
} from './steps.js';
import { weekCount, practiceRows, ringReach } from './practices.js';

/* the expire label swap is a pure timeline; kept here so model never imports choreo */
function expireSwap(ms) {
  return { leftA: 1 - seg(ms, 900, 1000), missedA: seg(ms, 1000, 1100), leftGone: ms >= 1000, missedOn: ms >= 1000 };
}

/* the ghost (typed-but-not-committed) text is UI state; main snapshots it in before prepare */
let ghost = { title: '', gCommit: -1 };
export function setGhostInfo(v) {
  ghost = v;
}

export const lab = [];
for (let i = 0; i < SIZE.maxStars; i++) lab.push({ pick: -1, shown: false });
export const hk = new Float32Array(SIZE.maxStars),
  hp = new Float32Array(SIZE.maxStars),
  frK = new Float32Array(SIZE.maxStars),
  lk = new Float32Array(SIZE.maxStars);
export let focus = -1,
  mouseHover = -1,
  selIdx = -1,
  forceFocus = null,
  tapSelected = false;
export function setMouseHover(v) {
  mouseHover = v;
}
export function setSelIdx(v) {
  selIdx = v;
}
export function setForceFocus(v) {
  forceFocus = v;
}
export function setTapSelected(v) {
  tapSelected = !!v;
}
export function computeFocus() {
  focus = forceFocus !== null ? forceFocus : mouseHover >= 0 ? mouseHover : selIdx;
  return focus;
}
/* returns true while any hover / frame / list-scroll value is still easing towards its target */
export function updateHover(dt) {
  let moving = false;
  for (let i = 0; i < stars.length; i++) {
    const tgt = focus === i ? 1 : 0,
      rate = tgt > hp[i] ? dt / 0.15 : dt / 0.2;
    hp[i] = tgt > hp[i] ? Math.min(tgt, hp[i] + rate) : Math.max(tgt, hp[i] - rate);
    hk[i] = ease.out(hp[i]);
    const ft = focus === i && !stars[i].done && !stars[i].miss ? 1 : 0;
    frK[i] = ft > frK[i] ? Math.min(1, frK[i] + dt / 0.15) : Math.max(0, frK[i] - dt / 0.2);
    const pr = !!stars[i].practice && focus === i; // a practice's day rows fade with the hover
    const lt = (selIdx === i && (stepsLive(stars[i]) || stepsHint(stars[i]))) || pr ? 1 : 0; // the list under the label
    lk[i] = lt > lk[i] ? Math.min(1, lk[i] + dt / 0.15) : Math.max(0, lk[i] - dt / 0.15);
    const d = sui.st[i] - sui.sy[i]; // smooth scroll of the list: eases towards its target
    if (d !== 0) sui.sy[i] = Math.abs(d) < 0.02 ? sui.st[i] : sui.sy[i] + d * (1 - Math.exp(-dt * STEPS.scrollEase));
    if (hp[i] !== tgt || frK[i] !== ft || lk[i] !== lt || sui.sy[i] !== sui.st[i]) moving = true;
  }
  return moving;
}

const SIZE_INDENT = STEPS.indent;
const widthCache = new Map();
export function wg(str, wt) {
  if (!str) return 0;
  const key = (wt || 400) + str;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = (wt || 400) + ' 12px ' + FONT;
    w = Math.ceil(ctx.measureText(str).width / 3 - 1e-6);
    ctx.restore();
    widthCache.set(key, w);
  }
  return w;
}
export function clearWidthCache() {
  widthCache.clear();
}

/* the tag appended to a full label's second line: `sun 15 nov 19:00 · 10m` + ` · #study`; untagged adds nothing */
export function tagSuffix(tag) {
  return tag ? ' · #' + tag : '';
}

export function labelInfo(si) {
  const s = stars[si],
    L = lab[si],
    fk = hk[si],
    foc = focus === si;
  if (!pres(s)) {
    L.shown = false;
    return;
  }
  const cInk = mixTo([0, 0, 0], K.ink2, K.ink, fk);
  let c1 = cInk,
    a1 = 1,
    t2 = '',
    c2 = K.dim,
    a2 = 1,
    place2 = '',
    l2vis = 1,
    vis = 1,
    shown = true,
    title = s.n,
    placeTitle = s.n,
    t3 = '',
    a3 = 0;
  const urgent = isUrgent(s, wall(T));
  if (s.gh) {
    // ghost: the typed title in dim, placed like any label
    title = ghost.title;
    placeTitle = title;
    c1 = K.dim;
    a1 = s.ghA * (1 - (ghost.gCommit < 0 ? 0 : seg((T - ghost.gCommit) * 1000, 400, 700)));
    l2vis = 0;
    shown = title !== '' && a1 > 0.01;
    vis = a1;
  } else if (!s.on) {
    // dissolving after undo of an add: erases right to left
    const n = Math.ceil(s.n.length * (1 - seg(s.rmMs, 0, 300)));
    title = s.n.slice(0, n);
    l2vis = 0;
    shown = n > 0;
  } else if (s.miss) {
    const ex = s.mT >= 0 && s.mT < 4400,
      ms = s.mT,
      exv = ex ? 1 - seg(ms, 4000, 4400) : 0;
    vis = Math.max(fk, exv);
    a1 = vis;
    a2 = vis;
    shown = foc || vis > 0.001;
    c1 = K.dim;
    if (ex && fk < 0.5) {
      c1 = mixTo([0, 0, 0], cInk, K.dim, seg(ms, 300, 1300));
      const left = s.exLeft || '<1m',
        sw = expireSwap(ms); // sequential: 100 ms out, then 100 ms in
      c2 = urgent ? K.warn : K.dim;
      t2 = sw.leftGone ? '' : left;
      a2 = vis * sw.leftA;
      place2 = left;
      t3 = sw.missedOn ? 'missed' : '';
      a3 = vis * sw.missedA;
    } else {
      t2 = s.stamp;
      place2 = s.stamp;
    }
  } else if (s.practice) {
    const cnt = s.pdata ? weekCount(s.pdata, isoWeekKey(wall(T))) : 0;
    t2 = cnt + ' of 7 this week';
    place2 = t2;
    c2 = K.dim;
  } else if (s.done) {
    const fin = s.fin,
      fs = FS[si],
      ms = fin ? (T - fin.t0) * 1000 : 1e9;
    c1 = mixTo([0, 0, 0], cInk, K.done, fs ? fs.titleK : 1);
    if (fin && ms < fin.tEnd + 150) {
      const left = Math.max(0, fin.n2 - fs.erased);
      t2 = fin.line2.slice(0, left);
      c2 = fin.urgent ? K.warn : K.dim;
      place2 = fin.line2;
      l2vis = left > 0 ? 1 : 1 - seg(ms, fin.tEnd, fin.tEnd + (fin.reduced ? 0.001 : 150));
    } else {
      t2 = s.stamp;
      a2 = fk;
      l2vis = fk;
      place2 = foc ? s.stamp : '';
    }
  } else {
    const us = US[si],
      sp = stepsLive(s),
      full = sp ? stepsLine2(s, foc) : foc ? s.full : s.left;
    c2 = urgent ? K.warn : K.dim;
    place2 = full;
    t2 = full;
    if (us) {
      c1 = mixTo([0, 0, 0], cInk, K.done, us.titleK);
      t2 = full.slice(0, Math.min(full.length, us.typed));
      l2vis = seg((T - s.und.t0) * 1000, 250, 300);
    }
    if (s.cr) {
      // creation: the title types in, then the time-left line
      const ms = (T - s.cr.t0) * 1000,
        t0 = TIME.createLabelStart * 1000,
        st = TIME.createLabelStep * 1000;
      if (s.cr.reduced) {
        if (ms < 300) {
          vis = seg(ms, 0, 300);
          a1 = vis;
          a2 = vis;
        }
      } else if (ms < t0) shown = false;
      else {
        const n1 = Math.min(s.n.length, Math.floor((ms - t0) / st) + 1),
          ts = t0 + s.n.length * st;
        const n2 = ms < ts ? 0 : Math.floor((ms - ts) / st) + 1;
        title = s.n.slice(0, n1);
        t2 = full.slice(0, n2);
        l2vis = t2 ? 1 : 0;
      }
    }
  }
  // on the sky, long titles are ellipsised; the hover/selection state keeps the full one
  if (!foc && title.length > SIZE.ellipsisAt) title = title.slice(0, SIZE.ellipsisAt - 1) + '…';
  // touch selection: same look as hover, plus a second row that says how to finish
  if (tapSelected && selIdx === si && !s.done && !s.miss && !s.gh && s.on && !s.practice) {
    t2 = stepsLive(s) ? doneCount(s) + '/' + s.steps.length + ' · tap again to finish' : 'tap again to finish';
    c2 = K.dim;
    place2 = t2;
    l2vis = 1;
    a2 = 1;
  }
  const crTyping =
    s.cr &&
    (s.cr.reduced
      ? (T - s.cr.t0) * 1000 < 300
      : (T - s.cr.t0) * 1000 < (TIME.createLabelStart + (s.n.length + place2.length) * TIME.createLabelStep) * 1000);
  const tsuf = foc && t2 && !t3 && !s.gh && s.on && !crTyping && !US[si] ? tagSuffix(starTag(s)) : ''; // the star's own tag, only in the full (hovered / selected) state
  if (tsuf && place2) place2 += tsuf;
  L.shown = shown;
  L.vis = vis;
  L.title = title;
  L.c1 = c1;
  L.a1 = a1;
  L.w1 = fk > 0.5 ? 500 : 400;
  L.t2 = t2;
  L.c2 = c2;
  L.a2 = a2;
  L.t3 = t3;
  L.a3 = a3;
  L.t4 = tsuf;
  L.w2 = wg(t2);
  L.wPlace = Math.max(wg(placeTitle, 400), wg(place2, 400), fk > 0.5 ? wg(placeTitle, 500) : 0);
  L.rowsPlace = place2 ? 2 : 1;
  L.wDisp = l2vis > 0.01 ? Math.max(wg(title, L.w1), wg(t2 + tsuf), t3 ? wg(t3) : 0) : wg(title, L.w1);
  L.rows2h = Math.round(6 * l2vis);
  L.list = null;
  L.listK = 0;
  L.nList = 0;
  if (s.on && !s.gh && stepsLive(s) && (lk[si] > 0.01 || selIdx === si)) {
    // the selected step list: rows under the label
    const rows = stepRows(s);
    let w = 0;
    for (const r of rows) w = Math.max(w, SIZE_INDENT + wg(r.text, 400));
    const p = rowPitch(),
      content = rows.length * p,
      mx = panelMax(),
      scrolls = content > mx,
      ph = scrolls ? mx : content;
    if (scrolls) w += STEPS.hintPad; // a gutter at the right for the ▴ ▾ hints
    L.list = rows;
    L.nList = rows.length;
    L.listK = lk[si];
    L.listH = ph;
    L.scrollMax = scrolls ? content - ph : 0;
    sui.st[si] = clampScroll(sui.st[si], L.scrollMax);
    sui.sy[si] = clampScroll(sui.sy[si], L.scrollMax);
    L.scrolling = sui.st[si] !== sui.sy[si];
    if (selIdx === si) {
      L.wPlace = Math.max(L.wPlace, w);
      L.rowsPlace += Math.ceil(ph / 6);
    }
    if (lk[si] > 0.5) L.wDisp = Math.max(L.wDisp, w);
    L.rows2h += Math.round(ph * lk[si]);
  } else {
    sui.st[si] = 0;
    sui.sy[si] = 0;
    L.scrollMax = 0;
    L.scrolling = false;
    L.listH = 0;
  }
  L.hint = null;
  L.hintK = 0;
  if (stepsHint(s) && (lk[si] > 0.01 || selIdx === si)) {
    // no steps yet: one dim "+ step" row under the label
    const p = rowPitch();
    L.hint = STEPS.rowHint;
    L.hintK = lk[si];
    if (selIdx === si) {
      L.wPlace = Math.max(L.wPlace, SIZE_INDENT + wg(L.hint, 400));
      L.rowsPlace += Math.ceil(p / 6);
    }
    if (lk[si] > 0.5) L.wDisp = Math.max(L.wDisp, SIZE_INDENT + wg(L.hint, 400));
    L.rows2h += Math.round(p * lk[si]);
  }
  if (s.practice && s.pdata && (lk[si] > 0.01 || focus === si)) {
    // the practice's day rows: today on touch, yesterday until noon
    const prk = lk[si] > 0.01 ? lk[si] : 1; // a frozen hover/selection still shows them
    const rows = practiceRows(s.pdata, wall(T), isTouchLayout());
    if (rows.length) {
      let w = 0;
      for (const r of rows) w = Math.max(w, SIZE_INDENT + wg(r.text, 400));
      const p = rowPitch(),
        content = rows.length * p;
      L.list = rows;
      L.nList = rows.length;
      L.listK = prk;
      L.listH = content;
      L.scrollMax = 0;
      L.scrolling = false;
      if (focus === si) {
        L.wPlace = Math.max(L.wPlace, w);
        L.rowsPlace += Math.ceil(content / 6);
      }
      if (prk > 0.5) L.wDisp = Math.max(L.wDisp, w);
      L.rows2h += Math.round(content * prk);
    }
  }
}

const ovl = (a0, b0, a1, b1, c0, d0, c1, d1) => {
  const w = Math.min(a1, c1) - Math.max(a0, c0),
    h = Math.min(b1, d1) - Math.max(b0, d0);
  return w > 0 && h > 0 ? w * h : 0;
};
export const edgeList = []; // visible line cores only: ax, ay, ux, uy, s0, s1
function addVisEdge(f, s, es) {
  if (!es || es.lineLen <= 0.01) return;
  const g = geom(f, s);
  edgeList.push(f.gx, f.gy, g.ux, g.uy, g.sA, g.sA + es.lineLen);
}
export function candAnchor(ci, gx, gy, r, w, th, out, rl = r, rv = r) {
  // r: right reach, rl: left reach, rv: vertical reach
  if (ci === 0) {
    out[0] = gx + r + 4;
    out[1] = gy - 3;
  } else if (ci === 1) {
    out[0] = gx - rl - 3 - w;
    out[1] = gy - 3;
  } else if (ci === 2) {
    out[0] = gx + 2;
    out[1] = gy - rv - 2 - th;
  } else {
    out[0] = gx + 2;
    out[1] = gy + rv + 3;
  }
}
export function rectScore(x0, y0p, x1, y1, skip, placed) {
  let sc = 100 * ((x1 - x0) * (y1 - y0p) - ovl(x0, y0p, x1, y1, 0, 0, GW, SH - 2));
  for (let j = 0; j < NS; j++) {
    if (j === skip) continue;
    const o = stars[j];
    if (!pres(o)) continue;
    const rr = Rb(o);
    sc += 40 * ovl(x0, y0p, x1, y1, o.gx - rr - 1, o.gy - rr - 1, o.gx + rr + 2, o.gy + rr + 2);
    const ex = stepExtent(o); // a neighbour's orbit: keep a label off it, more softly than off the star
    if (ex) sc += 12 * ovl(x0, y0p, x1, y1, o.gx - ex.extL, o.gy - ex.extV, o.gx + ex.extR, o.gy + ex.extV);
  }
  for (let p = 0; p < placed.length; p++) {
    const q = placed[p];
    sc += 25 * ovl(x0, y0p, x1, y1, q[0], q[1], q[2], q[3]);
  }
  for (let e = 0; e < edgeList.length; e += 6) {
    const ex = edgeList[e],
      ey = edgeList[e + 1],
      ux = edgeList[e + 2],
      uy = edgeList[e + 3],
      s0 = edgeList[e + 4],
      s1 = edgeList[e + 5];
    const n = Math.ceil((s1 - s0) / 0.5);
    for (let k = 0; k <= n; k++) {
      const ss = s0 + ((s1 - s0) * k) / n,
        lx = ex + ux * ss,
        ly = ey + uy * ss;
      if (lx >= x0 && lx < x1 && ly >= y0p && ly < y1) sc += 1;
    }
  }
  return sc;
}
const CA = [0, 0];
export function placeLabels() {
  edgeList.length = 0;
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (!s.on) continue;
    if (s.done && s.link !== null) {
      const f = stars[s.link];
      if (s.fin) addVisEdge(f, s, edgeState(s.fin, (T - s.fin.t0) * 1000));
      else {
        const g = geom(f, s);
        edgeList.push(f.gx, f.gy, g.ux, g.uy, g.sA, g.sA + g.path);
      }
    } else if (!s.done && s.und && US[i] && s.und.link !== null) addVisEdge(stars[s.und.link], s, undoEdge(s.und, (T - s.und.t0) * 1000));
  }
  for (let i = 0; i < NS; i++) labelInfo(i);
  const order = [];
  for (let i = 0; i < NS; i++) order.push(i);
  order.sort(
    (a, b) =>
      (b === selIdx && stepsLive(stars[b]) ? 1 : 0) - (a === selIdx && stepsLive(stars[a]) ? 1 : 0) ||
      stars[a].gy - stars[b].gy ||
      stars[a].gx - stars[b].gx ||
      a - b
  ); // a selected step list is placed first: the others make room
  const placed = [];
  for (let oi = 0; oi < NS; oi++) {
    const si = order[oi],
      s = stars[si],
      L = lab[si];
    if (!L.shown) {
      L.init = false;
      continue;
    }
    const r = s.practice && s.pdata ? ringReach(s.pdata, wall(T)) : Rb(s),
      w = L.wPlace,
      rows = L.rowsPlace,
      th = 6 * rows;
    const ex = stepExtent(s),
      rR = ex ? Math.max(r, ex.extR) : r,
      rL = ex ? Math.max(r, ex.extL) : r,
      rV = ex ? Math.max(r, ex.extV) : r;
    let best = -1,
      bestScore = 1e18,
      prevScore = 1e18,
      prev = L.pick;
    const px = [0, 0, 0, 0],
      py = [0, 0, 0, 0];
    for (let ci = 0; ci < 4; ci++) {
      candAnchor(ci, s.gx, s.gy, rR, w, th, CA, rL, rV);
      const ax = CA[0],
        y0 = CA[1];
      const sc = rectScore(ax - 1, y0 - 1, ax + w + 1, y0 + th + 1, si, placed) + 3 * ci;
      px[ci] = ax;
      py[ci] = y0;
      if (ci === prev) prevScore = sc;
      if (sc < bestScore) {
        bestScore = sc;
        best = ci;
      }
    }
    let pick = best;
    if (prev >= 0 && bestScore > prevScore - SIZE.labelHysteresis) pick = prev; // hysteresis: no flicker
    L.pick = pick;
    L.ax = px[pick];
    L.y0 = py[pick];
    // glide: when the chosen anchor changes, the label travels to it over 320 ms (easeInOut)
    if (!L.init) {
      L.init = true;
      L.tx = L.ax;
      L.ty = L.y0;
      L.fx = L.ax;
      L.fy = L.y0;
      L.gt0 = -1e9;
      L.dx = L.ax;
      L.dy = L.y0;
    } else if (L.tx !== L.ax || L.ty !== L.y0) {
      L.fx = L.dx;
      L.fy = L.dy;
      L.tx = L.ax;
      L.ty = L.y0;
      L.gt0 = T;
    }
    const gk = ease.inOut(seg(T - L.gt0, 0, 0.32));
    L.dx = L.fx + (L.tx - L.fx) * gk;
    L.dy = L.fy + (L.ty - L.fy) * gk;
    L.gliding = gk < 1;
    L.bx0 = L.dx - 1;
    L.bx1 = L.dx + L.wDisp + 1;
    L.by0 = L.dy - 1;
    L.by1 = L.dy + 6 + L.rows2h + 1;
    L.fx0 = L.dx - 2;
    L.fx1 = L.dx + L.wPlace + 2;
    if (L.list && L.listK > 0.3) {
      // row rectangles for hover and clicks
      const p = rowPitch(),
        pt = L.dy + 12,
        pb = pt + L.listH,
        sy = sui.sy[si];
      L.pt = pt;
      L.pb = pb;
      L.rr = L.list.map((q, r2) => {
        // rows scrolled out of the panel are clipped to it (or unreachable)
        const y0 = pt + p * r2 - sy,
          y1 = y0 + p,
          c0 = Math.max(y0, pt),
          c1 = Math.min(y1, pb),
          ok = c1 > c0;
        return {
          x0: L.dx - 1,
          y0: ok ? c0 : -1e9,
          x1: L.dx + SIZE_INDENT + wg(q.text, 400) + 2,
          y1: ok ? c1 : -1e9,
          sid: q.sid,
          k: q.k,
          num: q.num,
          day: q.day,
          on: q.on
        };
      });
    } else L.rr = null;
    placed.push([L.ax - 1, L.y0 - 1, L.ax + L.wPlace + 1, L.y0 + th + 1]);
  }
  const sl = selIdx >= 0 ? lab[selIdx] : null; // a neighbour's label never sits on the open step list
  if (sl && sl.shown && sl.list && sl.listK > 0.3) {
    for (let i = 0; i < NS; i++) {
      const L = lab[i];
      if (i === selIdx || !L.shown || L.bx0 === undefined) continue;
      if (ovl(L.bx0, L.by0, L.bx1, L.by1, sl.fx0, sl.by0, sl.fx1, sl.by1)) L.shown = false;
    }
  }
}

/* ---------- placement of new stars (deterministic: hash of title + creation counter) ---------- */
let moonClearFn = () => true;
export function setMoonClear(fn) {
  moonClearFn = fn;
}
/* the cost of a candidate that sits outside a tag's region: 0 inside tagRadius*GW grains of the centroid, growing outside.
   Same units as rectScore, so a far candidate pays about one star-label overlap. */
export function tagPullScore(cand, centroid, gw) {
  const d = Math.hypot(cand.gx - centroid.gx, cand.gy - centroid.gy);
  return PLACE.tagPull * Math.max(0, d - PLACE.tagRadius * gw);
}
export function placeNew(title, ctr, big, tag = null) {
  const rr = rng((hstr(title) ^ Math.imul(ctr + 1, 0x9e3779b1)) >>> 0);
  const r = big ? SIZE.starRBig : SIZE.starR,
    w = Math.max(wg(title), 8),
    th = 12,
    segs = [],
    placed = [];
  /* a tag with on-screen stars pulls a new one into its region; without one (or untagged) this is exactly the old placement */
  let pull = null;
  if (tag) {
    let n = 0,
      sx = 0,
      sy = 0;
    for (let i = 0; i < NS; i++) {
      const s = stars[i];
      if (!s.on || s.gh || starTag(s) !== tag) continue;
      n++;
      sx += s.gx;
      sy += s.gy;
    }
    if (n) pull = { gx: sx / n, gy: sy / n };
  }
  for (let i = 0; i < NS; i++) {
    const s = stars[i];
    if (s.on && s.done && s.link !== null) {
      const f = stars[s.link];
      segs.push(f.gx, f.gy, s.gx, s.gy);
    }
  }
  for (let i = 0; i < NS; i++)
    if (i !== GHI && lab[i].shown && lab[i].bx0 !== undefined) placed.push([lab[i].bx0, lab[i].by0, lab[i].bx1, lab[i].by1]);
  let best = null,
    bs = 1e18,
    fb = null,
    fbd = -1;
  for (let k = 0; k < 64; k++) {
    const gx = 4 + Math.floor(rr() * (GW - 8)),
      gy = 4 + Math.floor(rr() * (SH - 12));
    let md = 1e9;
    for (let i = 0; i < NS; i++) {
      const o = stars[i];
      if (!o.on) continue;
      const ex = stepExtent(o);
      md = Math.min(md, Math.max(Math.abs(o.gx - gx), Math.abs(o.gy - gy)) - (ex ? Math.max(0, ex.extR + 4 - 9) : 0)); // a step-star keeps its orbit clear
    }
    let ed = 1e9;
    for (let e = 0; e < segs.length; e += 4) ed = Math.min(ed, segDist(gx, gy, segs[e], segs[e + 1], segs[e + 2], segs[e + 3]));
    const md2 = moonClearFn(gx, gy);
    if (md < 9 || ed < 6 || !md2) {
      const q = Math.min(md, ed + 3);
      if (q > fbd) {
        fbd = q;
        fb = { gx, gy };
      }
      continue;
    }
    let sc = 1e18;
    for (let ci = 0; ci < 4; ci++) {
      candAnchor(ci, gx, gy, r, w, th, CA);
      sc = Math.min(sc, rectScore(CA[0] - 1, CA[1] - 1, CA[0] + w + 1, CA[1] + th + 1, GHI, placed) + 3 * ci);
    }
    if (pull) sc += tagPullScore({ gx, gy }, pull, GW);
    if (sc < bs) {
      bs = sc;
      best = { gx, gy };
    }
  }
  return best || fb || { gx: 200, gy: 100 };
}
