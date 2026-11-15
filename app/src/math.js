/* Pure math: hash, seeded rng, value noise, fbm, easing, tone curve. No DOM, no state. */

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp01((t - a) / (b - a)); // progress of t inside [a, b]

export const ease = {
  out: p => 1 - Math.pow(1 - p, 3),
  inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  in: p => p * p * p
};

export const H = (a, b) => {
  const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return t - Math.floor(t);
};

export function rng(s) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const vn = (px, py, o) => {
  const ix = Math.floor(px),
    iy = Math.floor(py),
    fx = px - ix,
    fy = py - iy,
    s = t => t * t * (3 - 2 * t);
  const a = H(ix + o, iy),
    b = H(ix + 1 + o, iy),
    c = H(ix + o, iy + 1),
    d = H(ix + 1 + o, iy + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
};

export const fbm = (px, py, o) => {
  let v = 0,
    a = 0.5,
    f = 1;
  for (let k = 0; k < 4; k++) {
    v += a * vn(px * f, py * f, o);
    f *= 2.03;
    a *= 0.5;
  }
  return v / 0.94;
};

export const sm = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const tone = v => {
  v = v < 0.82 ? v : 0.82 + 0.18 * (1 - Math.exp(-(v - 0.82) * 5));
  return v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
};
export const TONE = new Uint8Array(4097);
for (let q = 0; q <= 4096; q++) TONE[q] = tone(q / 4096);
export const tn8 = v => (v <= 0 ? 0 : v >= 1 ? 255 : TONE[(v * 4096) | 0]);

export const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const mixTo = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};
export const SC = [0, 0, 0]; // scratch colour (no per-grain allocation)
export const css = c => 'rgb(' + ((c[0] * 255 + 0.5) | 0) + ',' + ((c[1] * 255 + 0.5) | 0) + ',' + ((c[2] * 255 + 0.5) | 0) + ')';

export function hstr(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    l2 = dx * dx + dy * dy,
    t = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
