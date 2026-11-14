/* tokens.js — the single source of truth for colour, size and timing.
   Change a value here first, then the modules that use it. See docs/DESIGN.md. */
import { hex } from './math.js';

export const FONT = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
export const FONT_URL = '../fonts/IBMPlexMono-Regular.woff2';
export const FONT_URL_500 = '../fonts/IBMPlexMono-Medium.woff2';

/* text colour (DOM-ish chrome) */
export const TXT = {
  ink: '#f1ead6', ink2: '#b6af9a', dim: '#575b66', warn: '#eda55a',
  done: '#9db1f0', pipOff: '#2a2d35', bg: '#030407', rule: '#181b24'
};
export const K = {
  ink: hex(TXT.ink), ink2: hex(TXT.ink2), dim: hex(TXT.dim),
  warn: hex(TXT.warn), done: hex(TXT.done), pipOff: hex(TXT.pipOff)
};

/* light colour table (unchanged from v8; the only colours light may take) */
export const C = {
  ink: hex('#f1ead6'), ink2: hex('#b6af9a'), done: hex('#d3dfff'), core: hex('#ffffff'), glint: hex('#a8bbf2'),
  warm: hex('#f5e3bb'), warmC: hex('#fff6e0'), cold: hex('#9fb8ff'), amb: hex('#f0a050'), ambC: hex('#ffd9a8'),
  ambS: hex('#eda55a'), ash: hex('#43464e'), line: hex('#c4d2ff'), lineG: hex('#6e8cff'), pulse: hex('#d0dcff'),
  met: hex('#e8eeff'),
  sat: hex('#e8f0ff'), cometH: hex('#e8f4ff'), ion: hex('#9fc4ff'), moonL: hex('#f3efe4'),
  moonE: hex('#3a4050'), moonH: hex('#d8dcea'), auLo: hex('#3fd6a0'), auHi: hex('#6a7cff'),
  dusk: [230 / 255, 140 / 255, 90 / 255], dawn: [90 / 255, 140 / 255, 200 / 255],
  giant: [hex('#ffd2a0'), hex('#ffc890')]
};

/* the five skies; a seed picks one */
export const PAL = [
  { top: '#070912', bot: '#101830', hz: [80, 105, 180],  cl: [[58, 82, 160], [92, 64, 150]],  tint: ['#e3e9ff', '#cdd8ff', '#ffe7c8'] },
  { top: '#09070f', bot: '#1a1230', hz: [150, 95, 175],  cl: [[110, 64, 150], [52, 78, 150]], tint: ['#efe6ff', '#d9ccff', '#ffdcc8'] },
  { top: '#050a0d', bot: '#0a1f24', hz: [60, 150, 140],  cl: [[30, 112, 106], [44, 80, 124]], tint: ['#e2fbff', '#cdeaf0', '#fff1d6'] },
  { top: '#09080c', bot: '#1f1715', hz: [190, 115, 75],  cl: [[124, 76, 58], [60, 64, 108]],  tint: ['#fff0dc', '#e8e4ff', '#ffd2a8'] },
  { top: '#07070a', bot: '#111119', hz: [125, 125, 150], cl: [[64, 70, 98], [50, 56, 82]],    tint: ['#f2f2ff', '#d8dcf0', '#fff0dd'] }
];

/* layout, in grains and layout units (1 grain = 3 units = 3 CSS px at 1x) */
export const LAYOUT = {
  pitch: 3,
  v10: { GW: 404, SH: 196, ROWS: 216 },        // the approved baseline geometry
  barRowsDesktop: 20,
  barRowsTouch: 24,
  canvasTop: 6,                                // parity mode: v10's 6px top margin
  maxGrainWidth: 0,                            // 0 = fill the viewport
  minGrainsW: 60, minGrainsH: 80
};

/* timing, in seconds of sky time unless noted */
export const TIME = {
  labelGlide: .32,
  hoverIn: .15, hoverOut: .2,
  finishAnticipation: .11, finishHalo: .6, finishFlash: .63, finishTitle: .7,
  ringStart: .12, ringEnd: .9,
  chargeMin: .45, travelAfterCharge: .25,
  edgeDrawMin: .52, edgeDrawPerGrain: 11, edgeDrawMax: 1.2,
  createMotes: .6, createSettle: .9, createLabelStart: .7, createLabelStep: .018,
  expireLabelOut: [.9, 1.0], expireLabelIn: [1.0, 1.1],
  undoWindow: 5,
  crossfade: .9, crossfadeRitual: 1.5,
  ritual: { boost: 600, lift0: 600, lift1: 3000, sky0: 1800, sky1: 3300, barIn: 2600, barOut: 3800, end: 4200, reduced: 600 },
  clockTick: .25, cloudChunk: .0625, auroraTick: .25,
  barOut: .08, previewDelay: [.15, .27]
};

/* frame pacing (fps): active = something is moving or the user just touched it; idle = a calm sky drifting. Sky time T still advances every RAF. */
export const FPS = { active: 60, idle: 15 };

/* sizes and budgets */
/* urgency: a star goes amber when its remaining life fraction is low OR the absolute time left is short.
   1 h: a 3-minute task has a tiny life fraction budget, so life alone stays calm until its last 45 s;
   an hour is the point where "later today" becomes "now" for a deadline todo. */
export const URGENT = { life: .25, leftMs: 60 * 60 * 1000 };

export const SIZE = {
  labelFont: 12, caretW: 6, caretH: 18,
  starR: 3, starRBig: 5, starCore: 1, starCoreBig: 2,
  maxStars: 48, maxTitle: 80, maxBar: 240, ellipsisAt: 22,
  labelHysteresis: 20, labelGap: 4,
  moonClearStars: 14, moonClearEdges: 6,
  pastScale: .32, pastMaxWeeks: 26, pastMinGap: 40, pastBottomBand: .15,
  touchHitPx: 22, mouseHitPx: 8,
  pipStep: 9, pipRow: 9
};

/* scene flags from the URL (dev-only) */
const LOC = typeof location !== 'undefined' ? location : { search: '', hostname: '' };  // Node (npm test): not dev
export const Q = new URLSearchParams(LOC.search);
export const FLAGS = {
  prof: Q.get('prof') === '1',               // dev: per-stage frame timer (stageprof.js)
  dev: Q.get('dev') !== '0' && (Q.get('dev') === '1' || LOC.hostname === 'localhost' || LOC.hostname === '127.0.0.1'),
  demo: Q.get('demo') === '1',
  gl: Q.get('gl') !== '0',                   // ?gl=0 forces the 2D canvas path (dev/tests)
  parity: Q.get('v10parity') === '1',
  debug: Q.get('debug') === '1',
  seed: Q.has('seed') ? +Q.get('seed') : null,
  clock: Q.getAll('clock').pop(),
  scene: Q.get('scene'),
  at: Q.has('at') ? +Q.get('at') : null,
  t: Q.has('t') ? +Q.get('t') : 0,
  freeze: Q.get('freeze') === '1',
  reduced: Q.get('reduced') === '1',
  bench: Q.get('bench') === '1',
  frames: Q.has('frames') ? +Q.get('frames') : 120,
  hover: Q.get('hover'),
  star: Q.get('star'),
  script: Q.get('script'),
  devSeed: Q.get('seed2') ? +Q.get('seed2') : null,
  steps: Q.get('steps')                       // dev: steps=1 puts steps on the demo tasks
};

/* reduced motion: system default, overridable at runtime by /motion and prefs */
let reducedPref = FLAGS.reduced ? 'on' : 'system';
export function setReducedPref(v) { reducedPref = v; }
export function getReducedPref() { return reducedPref; }
export function isReduced() {
  if (reducedPref === 'on') return true;
  if (reducedPref === 'off') return false;
  return !!(typeof window !== 'undefined' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* grain-drawn return arrow (no font glyph) */
export const ARROW = ['....#', '....#', '.#..#', '#####', '.#...'];

export const BGPIX = (255 << 24) | (7 << 16) | (4 << 8) | 3;   // #030407, also the gap between dots
export const BG_HEX = '#030407';

/* steps inside a task: an orbit of dust around the star, one companion per slot (up to 8).
   Brightness ceiling: below the parent core and glow, at the constellation's level. */
export const PACE = { margin: .3 };               // behind = (1 - life) > done/n + margin; the one rule lives in model/store.js isUrgent
export const STEPS = {
  maxSteps: 20, maxSlots: 8,
  maxText: 60,                                     // characters kept per step
  hover: 1.6,                                      // hover / selection multiplier on all step light
  rowStep: 6, rowStepTouch: 11,                    // list row pitch in grains (11 grains is at least 32 CSS px at dpr 2)
  maxOpenRows: 5, maxDoneRows: 5, indent: 4,
  panelFrac: .4, panelRows: 6, hintPad: 5,         // list panel: max height as a share of the sky; on desktop also at most 6 rows (done header + 5 open); gutter for the scroll hints
  dragPx: 8, scrollEase: 16,                       // a touch move of more than 8 css px is a scroll, not a tap; wheel scroll eases at 1/16 s
  collapse: 400, longPress: 500,                   // ms: the orbit folding into the core on finish; long-press to delete a row
  rx: 11, rxBig: 13, ratio: .42, tilt: -16,        // degrees
  sampPerGrain: 3, dust: .09, jit: .45, behind: .7, rev: 240,
  shimmer: [6, 11],                                // seconds
  openCore: .55, doneCore: .85, nb: .4, halo: .09, haloSig: 1.3,
  arc: .13, arcGlow: .05, tick: .4, tickCalm: .55, glint: 4
};
