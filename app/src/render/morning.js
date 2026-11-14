/* render/morning.js — the morning scene: its state, layer order and text block. M1: a static hold frame (dev ?morning=1). */
import { MORNING, FONT } from '../tokens.js';
import { GW, SH, BR, BG, BB, P, ctx, setGap, geometryListeners } from '../framebuffer.js';
import { drawDaySky, drawSun } from '../sky/day.js';
import { drawHills, drawGrass, hillLines } from '../sky/land.js';
import { drawMountains, drawTreeline, drawRiver, drawMist } from '../sky/valley.js';
import { drawFlora } from '../sky/flora.js';
import { weekSummary, summaryLines, flowerList } from '../model/morning.js';

let base = null;
let mor = null;           // { cfg, sc, lines }
export function morningScene() { return !!mor; }
export function morningInfo() { return mor ? { season: mor.sc.season, gap: mor.cfg.gapMode, flowers: mor.sc.flowers.length, lines: mor.lines.slice() } : null; }

/* cfg: { tasks, weekKey, nowMs, season, gapMode: 'paper'|'mosaic', seed, name } */
export function setMorningScene(cfg) { mor = { cfg }; build(); applyGap(); }
export function clearMorningScene() { mor = null; setGap(MORNING.gap.night, 0, 0); }

function build() {
  const c = mor.cfg, portrait = GW < SH;
  const horizon = Math.round(SH * (portrait ? MORNING.horizonPhone : MORNING.horizon));
  const pal = MORNING.seasons[c.season] || MORNING.seasons.autumn;
  const sunR = MORNING.sun.r * Math.min(GW, SH);
  const nudge = ((c.seed >>> 0) % 1000 / 1000 * 2 - 1) * MORNING.sun.nudge;
  mor.sc = {
    season: MORNING.seasons[c.season] ? c.season : 'autumn', pal, seed: c.seed >>> 0, portrait, horizon,
    midY: Math.round(horizon * MORNING.skyMid),
    sun: { x: GW * (MORNING.sun.x + nudge), y: SH * (portrait ? MORNING.sun.yPhone : pal.sunY), r: sunR },
    flowers: flowerList(c.tasks, c.weekKey, c.nowMs, MORNING.minGap / Math.max(1, GW))
  };
  mor.lines = summaryLines(weekSummary(c.tasks, c.weekKey, c.nowMs), c.weekKey, c.name || '');
}
geometryListeners.push(() => { if (mor) build(); });

function applyGap() {
  if (mor.cfg.gapMode === 'mosaic') setGap(MORNING.gap.paper, 1, MORNING.gap.mosaicK);
  else setGap(MORNING.gap.paper, 0, 0);
}

/* grain pass: the whole sky is overwritten, back to front */
export function drawMorning() {
  if (!mor) return;
  const sc = mor.sc;
  /* sky, sun, ridges, hills, tree line, river and mist never move in M1: composed once per scene/geometry, then copied (blades and flowers are redrawn: M4 sways them) */
  if (!base || base.sc !== sc || base.n !== BR.length) {
    const L = hillLines(sc);
    drawDaySky(sc); drawSun(sc); drawMountains(sc); drawHills(sc, () => drawTreeline(sc, L.far)); drawRiver(sc, L.near); drawMist(sc);
    base = { sc, n: BR.length, r: BR.slice(), g: BG.slice(), b: BB.slice() };
  } else { BR.set(base.r); BG.set(base.g); BB.set(base.b); }
  drawGrass(sc); drawFlora(sc);
}

/* text pass (after the blit): summary lines, a blank line, the quote. Desktop: top-left. Phone: top, centred. 12 px like the night:
   the grain is 3 px, so a larger size would crowd the sky and read as a second UI. */
export function drawMorningText() {
  if (!mor) return;
  const T3 = MORNING.text, portrait = GW < SH, lh = T3.lineGrains * 3;
  const x = portrait ? Math.round(GW / 2) * 3 : Math.round(GW * T3.x) * 3, y0 = Math.round(SH * (portrait ? T3.yPhone : T3.y)) * 3;
  ctx.setTransform(P / 3, 0, 0, P / 3, 0, 0);
  ctx.textBaseline = 'middle'; ctx.textAlign = portrait ? 'center' : 'left'; ctx.font = '400 12px ' + FONT; ctx.globalAlpha = 1;
  mor.lines.forEach((t, i) => { ctx.fillStyle = i === 0 ? T3.ink : T3.dim; ctx.fillText(t, x, y0 + i * lh); });
  const q = MORNING.quote, yq = y0 + (mor.lines.length + 1) * lh;
  ctx.fillStyle = T3.dim; ctx.fillText(q.text, x, yq);
  if (q.by) ctx.fillText('— ' + q.by, x, yq + lh);
  ctx.textAlign = 'left';
}
