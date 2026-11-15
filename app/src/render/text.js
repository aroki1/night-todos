/* render/text.js — labels, the hover/selection frame, the grain-drawn return arrow, and the
   past-week hover line. Text is the only thing that may sit off the grain grid. */
import { css } from '../math.js';
import { TXT, K, FONT, STEPS, ARROW as ARROW_TOKEN } from '../tokens.js';
import { ctx, P, dpr, GW, SH } from '../framebuffer.js';
import { stars, NS, starTag, sameTag } from '../model/store.js';
import { lab, frK, hk, focus } from '../model/placement.js';
import { pastHoverInfo } from '../sky/past.js';
import { sui, rowPitch } from '../model/steps.js';

const ARROW = ARROW_TOKEN || ['....#', '....#', '.#..#', '#####', '.#...'];

export function dot(gx, gy, col, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.fillRect(gx * P, gy * P, Math.max(1, P - Math.max(1, Math.round(dpr))), Math.max(1, P - Math.max(1, Math.round(dpr))));
}
export function frameRect(x0, y0, x1, y1, col, alpha) {
  const t = Math.max(1, Math.round(dpr));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.fillRect(x0 * P, y0 * P, (x1 - x0) * P, t);
  ctx.fillRect(x0 * P, y1 * P - t, (x1 - x0) * P, t);
  ctx.fillRect(x0 * P, y0 * P, t, (y1 - y0) * P);
  ctx.fillRect(x1 * P - t, y0 * P, t, (y1 - y0) * P);
}

export function drawLabels() {
  ctx.textBaseline = 'middle';
  for (let si = 0; si < NS; si++) {
    const L = lab[si];
    if (!L.shown) continue;
    if (frK[si] > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const fx0 = Math.round(L.fx0),
        fx1 = Math.round(L.fx1),
        fy0 = Math.round(L.by0),
        fy1 = Math.round(L.by1);
      frameRect(fx0, fy0, fx1, fy1, TXT.dim, frK[si]);
      const ay = Math.round(L.dy) + 1;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (ARROW[r][c] === '#') dot(fx1 + 2 + c, ay + r, TXT.dim, 0.9 * frK[si]);
    }
    ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
    ctx.globalAlpha = L.a1;
    ctx.font = L.w1 + ' 12px ' + FONT;
    ctx.fillStyle = css(L.c1);
    ctx.fillText(L.title, L.dx * 3, (L.dy + 3) * 3 + 1);
    ctx.font = '400 12px ' + FONT;
    if (L.t2) {
      ctx.globalAlpha = L.a2;
      ctx.fillStyle = css(L.c2);
      ctx.fillText(L.t2, L.dx * 3, (L.dy + 9) * 3 + 1);
    }
    if (L.t4) {
      ctx.globalAlpha = L.a2;
      ctx.fillStyle = TXT.dim;
      ctx.fillText(L.t4, (L.dx + L.w2) * 3 + 0, (L.dy + 9) * 3 + 1);
    }
    if (L.t3) {
      ctx.globalAlpha = L.a3;
      ctx.fillStyle = css(K.dim);
      ctx.fillText(L.t3, L.dx * 3, (L.dy + 9) * 3 + 1);
    }
    if (L.hint && L.hintK > 0.01) {
      ctx.globalAlpha = L.hintK * STEPS.rowHintAlpha;
      ctx.fillStyle = TXT.dim;
      ctx.fillText(L.hint, (L.dx + STEPS.indent) * 3, (L.dy + 12 + rowPitch() * 0.5) * 3 + 1);
    }
    if (L.list && L.listK > 0.01) {
      const p = rowPitch(),
        sy = sui.sy[si],
        pt = L.dy + 12; // the step list: same typography, cold / ink / ink2 / dim
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); // rows scroll smoothly and are clipped to the panel
      ctx.rect(
        Math.round(L.fx0) * P,
        Math.round(pt) * P,
        (Math.round(L.fx1) - Math.round(L.fx0)) * P,
        (Math.round(pt + L.listH) - Math.round(pt)) * P
      );
      ctx.clip();
      ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
      for (let r = 0; r < L.list.length; r++) {
        const row = L.list[r],
          ry = pt + p * (r + 0.5) - sy;
        if (ry < pt - p || ry > pt + L.listH + p) continue;
        const ef = Math.min(1, Math.max(0, Math.min(ry - pt, pt + L.listH - ry) / (p * 0.5))); // a row sliding past an edge fades out instead of being cut
        ctx.globalAlpha = L.listK * ef * (row.k === 'done' ? 0.75 : 1);
        ctx.fillStyle =
          row.k === 'practice'
            ? row.on
              ? TXT.ink
              : TXT.dim
            : row.k === 'hdr' || row.k === 'done'
              ? TXT.done
              : row.k === 'next'
                ? TXT.ink
                : row.k === 'open'
                  ? TXT.ink2
                  : TXT.dim;
        ctx.fillText(row.text, (L.dx + STEPS.indent) * 3, ry * 3 + 1);
      }
      ctx.restore();
      if (L.scrollMax > 0) {
        // a dim ▴ / ▾ where there is more content that way
        ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
        ctx.fillStyle = TXT.dim;
        const hx = (L.dx + L.wPlace - 4) * 3,
          up = Math.min(1, sy / 4),
          dn = Math.min(1, (L.scrollMax - sy) / 4);
        if (up > 0.01) {
          ctx.globalAlpha = L.listK * up;
          ctx.fillText('▴', hx, (pt + 3) * 3 + 1);
        }
        if (dn > 0.01) {
          ctx.globalAlpha = L.listK * dn;
          ctx.fillText('▾', hx, (pt + L.listH - 3) * 3 + 1);
        }
      }
      if (sui.rowStar === si && sui.rowHover >= 0 && L.rr && L.rr[sui.rowHover]) {
        // row hover: the same 1 px frame
        const q = L.rr[sui.rowHover];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        frameRect(Math.round(q.x0), Math.round(q.y0), Math.round(q.x1), Math.round(q.y1), TXT.dim, 0.9 * L.listK);
        ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* a hovered or selected tagged star names its group once, at the group's centre: one dim line, no box, fading with the hover */
export function drawGroupTag() {
  const i = focus;
  if (i < 0 || i >= NS) return;
  const s = stars[i],
    a = hk[i];
  if (!s || !s.on || a <= 0.01) return;
  const tag = starTag(s);
  if (!tag) return;
  let n = 0,
    sx = 0,
    sy = 0;
  for (let j = 0; j < NS; j++) {
    const o = stars[j];
    if (!o.on || o.gh || !sameTag(starTag(o), tag)) continue;
    n++;
    sx += o.gx;
    sy += o.gy;
  }
  if (n < 2) return; // a tag alone is not a group
  const cx = sx / n,
    cy0 = sy / n;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px ' + FONT;
  const text = '#' + tag,
    w = ctx.measureText(text).width,
    gw = w / 3;
  /* below the centroid, then above, then left, then right: the first spot that clears every shown label; none free = not drawn */
  const cands = [
    [cx, cy0 + 6],
    [cx, cy0 - 6],
    [cx - gw / 2 - 5, cy0],
    [cx + gw / 2 + 5, cy0]
  ];
  let x = 0,
    cy = 0,
    found = false;
  for (const c of cands) {
    const px = Math.max(3, Math.min(GW - 3 - gw, c[0] - gw / 2)),
      py = Math.max(4, Math.min(SH - 4, c[1]));
    let hit = false;
    for (let j = 0; j < NS && !hit; j++) {
      const L = lab[j];
      if (!L.shown || L.bx0 === undefined) continue;
      const lx0 = Math.min(L.bx0, L.fx0 === undefined ? L.bx0 : L.fx0),
        lx1 = Math.max(L.bx1, L.fx1 === undefined ? L.bx1 : L.fx1);
      if (px - 1 < lx1 && px + gw + 1 > lx0 && py - 3.5 < L.by1 && py + 3.5 > L.by0) hit = true;
    }
    if (!hit) {
      x = px * 3;
      cy = py;
      found = true;
      break;
    }
  }
  if (!found) return;
  ctx.globalAlpha = a * 0.75;
  ctx.fillStyle = TXT.dim;
  ctx.fillText(text, x, cy * 3);
  ctx.globalAlpha = 1;
}

/* the only interaction with a past week: one dim line, no frame */
export function drawPastHover() {
  const h = pastHoverInfo();
  if (!h || h.a <= 0.01) return;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px ' + FONT;
  ctx.globalAlpha = h.a * 0.75;
  ctx.fillStyle = TXT.dim;
  ctx.fillText(h.text, h.x * 3, h.y * 3);
  ctx.globalAlpha = 1;
}

export function drawCenterWeek(text, alpha) {
  if (!text || alpha <= 0.01) return;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.font = '400 12px ' + FONT;
  const w = ctx.measureText(text).width;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = TXT.dim;
  ctx.fillText(text, Math.round((GW * 3 - w) / 6) * 3, Math.round(SH * 0.5) * 3);
  ctx.globalAlpha = 1;
}
