/* render/text.js — labels, the hover/selection frame, the grain-drawn return arrow, and the
   past-week hover line. Text is the only thing that may sit off the grain grid. */
import { css } from '../math.js';
import { TXT, K, FONT, ARROW as ARROW_TOKEN } from '../tokens.js';
import { ctx, P, dpr, GW, SH } from '../framebuffer.js';
import { stars, NS } from '../model/store.js';
import { lab, frK } from '../model/placement.js';
import { pastHoverInfo } from '../sky/past.js';

const ARROW = ARROW_TOKEN || ['....#', '....#', '.#..#', '#####', '.#...'];

export function dot(gx, gy, col, alpha) {
  ctx.globalAlpha = alpha; ctx.fillStyle = col;
  ctx.fillRect(gx * P, gy * P, Math.max(1, P - Math.max(1, Math.round(dpr))), Math.max(1, P - Math.max(1, Math.round(dpr))));
}
export function frameRect(x0, y0, x1, y1, col, alpha) {
  const t = Math.max(1, Math.round(dpr));
  ctx.globalAlpha = alpha; ctx.fillStyle = col;
  ctx.fillRect(x0 * P, y0 * P, (x1 - x0) * P, t);
  ctx.fillRect(x0 * P, y1 * P - t, (x1 - x0) * P, t);
  ctx.fillRect(x0 * P, y0 * P, t, (y1 - y0) * P);
  ctx.fillRect(x1 * P - t, y0 * P, t, (y1 - y0) * P);
}

export function drawLabels() {
  ctx.textBaseline = 'middle';
  for (let si = 0; si < NS; si++) {
    const L = lab[si]; if (!L.shown) continue;
    if (frK[si] > .01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const fx0 = Math.round(L.fx0), fx1 = Math.round(L.fx1), fy0 = Math.round(L.by0), fy1 = Math.round(L.by1);
      frameRect(fx0, fy0, fx1, fy1, TXT.dim, frK[si]);
      const ay = Math.round(L.dy) + 1;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (ARROW[r][c] === '#') dot(fx1 + 2 + c, ay + r, TXT.dim, .9 * frK[si]);
    }
    ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
    ctx.globalAlpha = L.a1; ctx.font = L.w1 + ' 12px ' + FONT; ctx.fillStyle = css(L.c1);
    ctx.fillText(L.title, L.dx * 3, (L.dy + 3) * 3 + 1);
    ctx.font = '400 12px ' + FONT;
    if (L.t2) { ctx.globalAlpha = L.a2; ctx.fillStyle = css(L.c2); ctx.fillText(L.t2, L.dx * 3, (L.dy + 9) * 3 + 1); }
    if (L.t3) { ctx.globalAlpha = L.a3; ctx.fillStyle = css(K.dim); ctx.fillText(L.t3, L.dx * 3, (L.dy + 9) * 3 + 1); }
  }
  ctx.globalAlpha = 1;
}

/* the only interaction with a past week: one dim line, no frame */
export function drawPastHover() {
  const h = pastHoverInfo();
  if (!h || h.a <= .01) return;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px ' + FONT;
  ctx.globalAlpha = h.a * .75;
  ctx.fillStyle = TXT.dim;
  ctx.fillText(h.text, h.x * 3, h.y * 3);
  ctx.globalAlpha = 1;
}

export function drawCenterWeek(text, alpha) {
  if (!text || alpha <= .01) return;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px ' + FONT;
  const w = ctx.measureText(text).width;
  ctx.globalAlpha = alpha; ctx.fillStyle = TXT.dim;
  ctx.fillText(text, Math.round((GW * 3 - w) / 6) * 3, Math.round(SH * .5) * 3);
  ctx.globalAlpha = 1;
}
