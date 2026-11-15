/* draw.js — the drawing API over the grain grid (layer 1, next to framebuffer.js). Scene code says WHAT it draws; the loops over grains,
   the bounds checks and every BR/BG/BB access live here. Pilot: sky/valley.js is the first module on it; see docs/dev/RENDERING.md section 3.

   A callback `fn` writes the grain's colour into `out` (an array of 3 numbers, reused for every grain: never keep it) and returns the
   weight/alpha. A return value <= 0 skips the grain. `colour` (optional last argument) presets `out` once, for a constant colour.

   Modes (the per-grain arithmetic is exactly that of framebuffer.js, same operation order):
   ADD   light adds:           B += c * a
   OVER  paint covers by a:    B += (c - B) * a     (a clamped to 1, like over())
   SET   replace:              B = c                (a only says "draw this grain")  */
import { GW, SH, BR, BG, BB } from './framebuffer.js';

export const ADD = 0,
  OVER = 1,
  SET = 2;

const out = [0, 0, 0]; // plain doubles, like the colour arrays of the old code: no rounding before the Float32 write

function put(k, c, a, mode) {
  if (mode === OVER) {
    a = a > 1 ? 1 : a;
    BR[k] += (c[0] - BR[k]) * a;
    BG[k] += (c[1] - BG[k]) * a;
    BB[k] += (c[2] - BB[k]) * a;
  } else if (mode === ADD) {
    BR[k] += c[0] * a;
    BG[k] += c[1] * a;
    BB[k] += c[2] * a;
  } else {
    BR[k] = c[0];
    BG[k] = c[1];
    BB[k] = c[2];
  }
}
function preset(colour) {
  if (!colour) return;
  out[0] = colour[0];
  out[1] = colour[1];
  out[2] = colour[2];
}

/* shade(area, fn, mode, colour): a FIELD. Every grain of the area gets fn(i, j, out) -> alpha.
   area is a rectangle { x0, y0, x1, y1 } (x1, y1 exclusive, y0 an integer),
   or row spans { y0, y1, x0: j => first column, x1: j => end column (exclusive) } (an empty span: x1 <= x0). Clamped to the grid. */
export function shade(area, fn, mode = OVER, colour) {
  preset(colour);
  const y0 = Math.max(0, area.y0),
    y1 = Math.min(SH, area.y1),
    rows = typeof area.x0 === 'function';
  for (let j = y0; j < y1; j++) {
    const x0 = Math.max(0, rows ? area.x0(j) : area.x0),
      x1 = Math.min(GW, rows ? area.x1(j) : area.x1);
    for (let i = x0; i < x1; i++) {
      const a = fn(i, j, out);
      if (a > 0) put(j * GW + i, out, a, mode);
    }
  }
}

/* fillBelow(top, bottom, fn, mode, lead): RELIEF. Per column i the grains from the outline top[i] down to bottom (a number, or one
   per column; exclusive) get fn(i, j, depth, out) -> alpha, depth = j - top[i]. lead = grains above the outline offered to fn too
   (a soft edge). A column with bottom <= top is empty. */
export function fillBelow(top, bottom, fn, mode = OVER, lead = 0) {
  const per = typeof bottom !== 'number';
  for (let i = 0; i < GW; i++) {
    const t = top[i],
      end = Math.min(SH, per ? bottom[i] : bottom);
    for (let j = Math.max(0, Math.floor(t) - lead); j < end; j++) {
      const a = fn(i, j, j - t, out);
      if (a > 0) put(j * GW + i, out, a, mode);
    }
  }
}

/* points(list, fn, mode, colour): single grains. Each item has i, j. With fn: fn(item, out) -> alpha (colour written to out);
   without fn the item carries its own colour `c` and alpha `a`. Off-grid points are skipped. */
export function points(list, fn, mode = OVER, colour) {
  preset(colour);
  for (let n = 0; n < list.length; n++) {
    const p = list[n];
    if (p.i < 0 || p.j < 0 || p.i >= GW || p.j >= SH) continue;
    const a = fn ? fn(p, out) : p.a;
    if (a > 0) put(p.j * GW + p.i, fn ? out : p.c, a, mode);
  }
}
