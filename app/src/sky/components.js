/* components.js — background star types: open clusters, binaries, giants, the variable star,
   diffraction crosses. Everything here is seeded; nothing is random at render time. */
import { hex } from '../math.js';
import { C, SIZE } from '../tokens.js';

/* Add the special types to a freshly built layer set. Same stream and same removals as v10,
   so the plain field is unchanged. */
export function extendLayers({ layers, W, SH, r2, pal, seed }) {
  const ex = [[], [], []],
    tc = i => hex(pal.tint[i]),
    P6 = 6.2832;
  const nC = r2() < 0.3 ? 0 : r2() < 0.5 ? 1 : 2; // open clusters: 6-10 stars in a 3-4 grain radius
  for (let c = 0; c < nC; c++) {
    const cx = 40 + r2() * (W - 80),
      cy = 14 + r2() * (SH - 90),
      th = r2() * 3.14,
      n = 6 + Math.floor(r2() * 5);
    for (let k = 0; k < n; k++) {
      const rad = k ? 3.6 * Math.sqrt(r2()) : 0,
        an = r2() * P6,
        ax = rad * Math.cos(an) * 1.5,
        ay = rad * Math.sin(an) * 0.65;
      ex[1].push({
        x: cx + ax * Math.cos(th) - ay * Math.sin(th),
        y: cy + ax * Math.sin(th) + ay * Math.cos(th),
        a: k === 0 ? 0.45 : 0.15 + r2() * 0.15,
        c: tc(r2() < 0.8 ? 0 : 1),
        ph: r2() * P6,
        f: 0.3 + r2() * 0.9,
        tw: false
      });
    }
  }
  const nB = 4 + Math.floor(r2() * 4); // binary pairs: one warm, one cool
  for (let b = 0; b < nB; b++) {
    const li = r2() < 0.5 ? 0 : 1,
      x = r2() * W,
      y = 10 + r2() * (SH - 70),
      sp = 1.5 + r2(),
      an = r2() * P6;
    ex[li].push(
      { x, y, a: 0.25 + 0.15 * r2(), c: tc(2), ph: r2() * P6, f: 0.5, tw: false },
      { x: x + Math.cos(an) * sp, y: y + Math.sin(an) * sp, a: 0.25 + 0.15 * r2(), c: tc(1), ph: r2() * P6, f: 0.5, tw: false }
    );
  }
  const nG = 2 + Math.floor(r2() * 3); // warm giants: bigger, warmer, a small halo
  for (let g = 0; g < nG; g++)
    ex[r2() < 0.5 ? 1 : 2].push({
      x: r2() * W,
      y: 10 + r2() * (SH - 70),
      a: 0.45 + 0.15 * r2(),
      c: C.giant[r2() < 0.5 ? 0 : 1],
      ph: r2() * P6,
      f: 0.5,
      tw: false,
      hl: 0.1
    });
  ex[2].push({
    x: r2() * W,
    y: 10 + r2() * (SH - 80),
    a: 0.33,
    c: tc(0),
    ph: 0,
    f: 0.5,
    tw: false,
    vp: { lo: 0.12, hi: 0.55, P: 180 + r2() * 180, ph: r2() * P6 }
  }); // the variable star: 3-6 min period
  for (let li = 0; li < 3; li++) {
    const S = layers[li].S;
    S.length = Math.max(0, S.length - ex[li].length);
    for (const s of ex[li]) S.push(s);
  }
  const nX = 2 + Math.floor(r2() * 2);
  layers[2].S.filter(s => !s.vp)
    .sort((a, b) => b.a - a.a)
    .slice(0, nX)
    .forEach(s => {
      s.cross = true;
    });
  return layers;
}

/* star sprites: grain positions, distance class, Chebyshev class */
export function buildSprite(big) {
  const r = big ? SIZE.starRBig : SIZE.starR,
    rc = big ? SIZE.starCoreBig : SIZE.starCore,
    I = [0],
    J = [0],
    DD = [0],
    CH = [0];
  for (let i = -r; i <= r; i++)
    for (let j = -r; j <= r; j++) {
      if (!i && !j) continue;
      const m = Math.abs(i) + Math.abs(j),
        core = big ? m <= rc : Math.abs(i) <= rc && Math.abs(j) <= rc;
      if (core || i === 0 || j === 0) {
        I.push(i);
        J.push(j);
        DD.push(core ? 0 : Math.max(Math.abs(i), Math.abs(j)));
        CH.push(Math.max(Math.abs(i), Math.abs(j)));
      }
    }
  if (big) {
    const g = r - 1;
    [
      [-g, -g],
      [g, -g],
      [-g, g],
      [g, g]
    ].forEach(([i, j]) => {
      I.push(i);
      J.push(j);
      DD.push(-1);
      CH.push(r);
    });
  }
  return { n: I.length, I, J, DD, CH };
}
export const SPR = [buildSprite(0), buildSprite(1)];
