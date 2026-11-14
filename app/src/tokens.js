/* tokens.js — the single source of truth for colour, size and timing.
   Change a value here first, then the modules that use it. See docs/DESIGN.md. */
import { hex } from './math.js';

export const FONT = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

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

/* the morning scene (docs/specs/SPEC-morning.md). Grain colours are hex() arrays (0..1, before the tone curve); text colours are strings.
   Start values; M1b tunes them. sky = [top, mid, horizon]; grass = [far, near, tips, shadow]. */
export const MORNING = {
  seasons: {
    autumn: { sky: [hex('#9fb7d6'), hex('#d9b48c'), hex('#eebd78')], grass: [hex('#7f8456'), hex('#46501e'), hex('#b39a3c'), hex('#1e240c')], stem: hex('#86ad3c'), foliage: [hex('#e2b53a'), hex('#c9822a'), hex('#b4501f'), hex('#8a7a22')], species: ['aster', 'chrysanthemum', 'daisy'], sunY: .40 },
    summer: { sky: [hex('#7fb1e6'), hex('#cfe3f2'), hex('#fbe7b0')], grass: [hex('#6f9a5c'), hex('#2f6a26'), hex('#9bcb52'), hex('#14301a')], stem: hex('#5fb044'), foliage: [hex('#4f9a3a'), hex('#6fb347'), hex('#3a7a2e'), hex('#8cc95a')], species: ['poppy', 'cornflower', 'daisy'], sunY: .42 },
    spring: { sky: [hex('#8fbfe8'), hex('#dbeaf0'), hex('#f8e4c0')], grass: [hex('#93b87a'), hex('#4f8f3a'), hex('#b5d873'), hex('#2c5222')], stem: hex('#58a040'), foliage: [hex('#6fb347'), hex('#8cc95a'), hex('#4f9a3a'), hex('#e8a0b0')], species: ['crocus', 'tulip', 'daisy'], sunY: .40 },
    winter: { sky: [hex('#b8c6d8'), hex('#e3e2e6'), hex('#f2dcc4')], grass: [hex('#e8eef5'), hex('#b9c6d6'), hex('#7d8060'), hex('#8f9bb0')], stem: hex('#6e8a5a'), foliage: [hex('#8a9a6a'), hex('#a8a890'), hex('#6e8a5a'), hex('#b0a080')], species: ['snowdrop', 'hellebore'], sunY: .48 }
  },
  /* [petals, core] */
  flowers: {
    daisy: [hex('#f7f3ea'), hex('#f2c94c')], poppy: [hex('#d94a3a'), hex('#2b1d1a')], cornflower: [hex('#4a6fd8'), hex('#2e3f8f')],
    aster: [hex('#9b7fd1'), hex('#f2c94c')], chrysanthemum: [hex('#e8963a'), hex('#a8541f')], snowdrop: [hex('#f4f6f8'), hex('#8fb87a')],
    hellebore: [hex('#e9d8e4'), hex('#c9b45a')], crocus: [hex('#9d6fd6'), hex('#f0b43c')], tulip: [hex('#e2553f'), hex('#3a2a1a')]
  },
  sun: { core: hex('#fffbee'), limb: hex('#ffd890'), halo: hex('#ffe2a8'), r: .15, x: .5, nudge: .06, yPhone: .52 },
  /* the valley: trunk, reeds and cattails, river glints, mist */
  valley: { trunk: hex('#4a3626'), reed: hex('#7a8a3a'), cattail: hex('#6b4a2a'), glint: hex('#fff2c8'), mist: hex('#fff0d0') },
  /* backlight: rim gold, long shadows, rolling ground */
  light: { rim: hex('#ffd36e'), rimGrass: .62, rimBase: .1, rimSpread: .36, roll: .4, rollWarm: .16, shadowA: .55, shadowLen: .95, shadowDx: .32 },
  /* sunrise and sunset drawing (M2b, M2c). glow: the horizon warming under the night (share of the horizon height where it starts, peak mix, profile exponent).
     sil: silhouette colour, modulated by the layer's own luminance (silBase + silGain * lum). landTone: exponent of landColorK (colour comes late and goes early).
     nightOff: from this dayK on the night is not composed at all (1: only when every sky grain has switched). */
  rise: {
    glow: { from: .6, peak: .55, pow: 1.4 },
    sil: hex('#0b0e1a'), silBase: .5, silGain: 1.1,
    landTone: 1.8, nightOff: 1,
    starSoft: .3, starMax: .7,
    boostMax: .15, boostHalo: .6, pastBoost: .5
  },
  /* M2c: every transition is per grain. A grain switches when the phase progress passes its order o = mix(direction, noise, noiseMix), over rampMs of its own.
     silNoise: the noise share for the silhouette (appears and dissolves almost at random, with a slight bottom-up / top-down bias).
     lightDx, lightDy: weights of the distance from the sun's x and from the horizon in the order of the light on the land. */
  grain: { noiseMix: .35, silNoise: .8, rampMs: 150, lightDx: .45, lightDy: .55, blob: 9, blobShare: .6 },
  /* the sunset sky: gold, rose, violet ([top, mid, horizon] each); the sun's colours at the end of the day */
  dusk: {
    stops: [
      [hex('#a9a9bd'), hex('#e3b684'), hex('#f2c26b')],
      [hex('#8f8fb8'), hex('#cf8f9a'), hex('#e58f7e')],
      [hex('#4c4a78'), hex('#7d6a9c'), hex('#b0789a')]
    ],
    sun: { core: hex('#ffd9a0'), limb: hex('#ff9a58'), halo: hex('#ff9a6a') }
  },
  horizon: .64, horizonPhone: .68,
  skyMid: .45,                                   // where the mid sky colour sits, as a share of the horizon height
  minGap: 12,                                     // grains between flower stems
  gap: { night: [3 / 255, 4 / 255, 7 / 255], paper: hex('#d8ccb4'), mosaicK: .72 },
  text: { ink: '#14120f', dim: '#2e2a22', x: .06, y: .10, yPhone: .08, lineGrains: 6, name: 'name this week' }
};

/* layout, in grains and layout units (1 grain = 3 units = 3 CSS px at 1x) */
export const LAYOUT = {
  pitch: 3,
  v10: { GW: 404, SH: 196, ROWS: 216 },        // the approved baseline geometry
  barRowsDesktop: 20,
  barRowsTouch: 24,
  canvasTop: 6,
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
  crossfade: .9, crossfadeMorning: 1.5,
  /* the weekly morning (docs/specs/SPEC-morning.md section 5). presence: no input for idleMs, or the page shown less than shownMs ago;
     clock resync when wall time drifts more than driftMs. Then the timeline in ms: [from, to] ranges; A..C count from the start, D from the leave. */
  morning: {
    idleMs: 1500, shownMs: 2000, driftMs: 2000,
    night: 1500, hold: 7500,                                   // A ends, C starts
    labels: [0, 400], boost: [400, 1000],
    bgStars: [1500, 4500], specials: [1500, 2500], missed: [2000, 3000], alive: [3500, 4500], done: [4500, 5500],
    glow: [1500, 4500], day: [2500, 6500], gap: [3000, 6500], sun: [3800, 6500], land: [2400, 4200], landColor: [5000, 7000],
    bloom0: 5500, bloomStep: 120, stem: 400, head: 500, buds: [6500, 7000],
    textStep: 200, textIn: 400, advance: 400,
    oldOut: [0, 1500], textOut: [0, 600], nameOut: [600, 1200], sunSet: [0, 9000], close: [1500, 4500], closeHead: 500,
    dusk: [2500, 6000], newNight: [4500, 6000], landDark: [3000, 6500], landSink: [6500, 8000], gapBack: [4000, 7000],
    newStars: [5000, 8500], carried: [6500, 8000], pastBoost: [7500, 9000], week: [8500, 8800, 10200, 10500], end: 10500,
    createAt: 6400, cut: 600,
    reducedRise: 800, reducedSet: 800, reducedWeek: 1500
  },
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
  steps: Q.get('steps'),                      // dev: steps=1 puts steps on the demo tasks
  morning: Q.get('morning') === '1',          // dev: show the morning hold frame (M1)
  season: Q.get('season'),                     // dev: winter | spring | summer | autumn
  gap: Q.get('gap'),                           // dev: paper | mosaic
  flowers: Q.has('flowers') ? +Q.get('flowers') : null,
  buds: Q.has('buds') ? +Q.get('buds') : null,
  away: Q.has('away') ? +Q.get('away') : 0,     // dev: ?morning=1&away=3 shows the `N weeks away` line
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

/* steps inside a task: an orbit of dust around the star, one companion per slot (up to 8).
   Brightness ceiling: below the parent core and glow, at the constellation's level. */
export const PACE = { margin: .3 };               // behind = (1 - life) > done/n + margin; the one rule lives in model/store.js isUrgent
export const STEPS = {
  maxSteps: 20, maxSlots: 8,
  maxText: 60,                                     // characters kept per step
  hover: 1.6,                                      // hover / selection multiplier on all step light
  rowStep: 6, rowStepTouch: 11,                    // list row pitch in grains (11 grains is at least 32 CSS px at dpr 2)
  maxOpenRows: 5, maxDoneRows: 5, indent: 4,
  rowHint: '+ step', rowHintAlpha: .7,             // the dim row under a selected star that has no steps yet
  barHint: 'title, deadline / step / step', barHintEvery: 3,   // the empty bar shows the step syntax when the task count is 2 mod 3
  panelFrac: .4, panelRows: 6, hintPad: 5,        // list panel: max height as a share of the sky; on desktop also at most 6 rows (done header + 5 open); gutter for the scroll hints
  dragPx: 8, scrollEase: 16,                       // a touch move of more than 8 css px is a scroll, not a tap; wheel scroll eases at 1/16 s
  collapse: 400, longPress: 500,                   // ms: the orbit folding into the core on finish; long-press to delete a row
  rx: 11, rxBig: 13, ratio: .42, tilt: -16,        // degrees
  sampPerGrain: 3, dust: .09, jit: .45, behind: .7, rev: 240,
  shimmer: [6, 11],                                // seconds
  openCore: .55, doneCore: .85, nb: .4, halo: .09, haloSig: 1.3,
  arc: .13, arcGlow: .05, tick: .4, tickCalm: .55, glint: 4
};
