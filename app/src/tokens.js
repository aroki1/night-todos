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

/* the morning scene. Grain colours are hex() arrays (0..1, before the tone curve); text colours are strings.
   sky = [top, mid, horizon]; grass = [far, near, tips, shadow]. */
export const MORNING = {
  /* per season: sky, grass = [far, near, tips, shadow], stem, foliage (4 colours; the 4th of spring is its blossom pink), species, sunY (share of SH), and the M5 look:
     snow (1: the ground is a snow field with dry stalks), bladeH / patchy / roll (blade height, how uneven the tufts are, the rolling ground: x summer's),
     mist and mistDy (the valley mist's strength and its lowering, grains), glint (river glints x), dew (dew or frost x), blossom (share of tree crowns in blossom),
     sunR and halo (the sun's size and halo strength x). */
  seasons: {
    autumn: { sky: [hex('#9fb7d6'), hex('#d9b48c'), hex('#eebd78')], grass: [hex('#7f8456'), hex('#46501e'), hex('#b39a3c'), hex('#1e240c')], stem: hex('#86ad3c'), foliage: [hex('#e2b53a'), hex('#c9822a'), hex('#b4501f'), hex('#8a7a22')], species: ['aster', 'chrysanthemum', 'daisy'], sunY: .40, snow: 0, bladeH: 1, patchy: 1, roll: 1, mist: 1.5, mistDy: 0, glint: 1, dew: 1, blossom: 0, sunR: 1, halo: 1 },
    summer: { sky: [hex('#7fb1e6'), hex('#cfe3f2'), hex('#fbe7b0')], grass: [hex('#6f9a5c'), hex('#2f6a26'), hex('#9bcb52'), hex('#14301a')], stem: hex('#5fb044'), foliage: [hex('#4f9a3a'), hex('#6fb347'), hex('#3a7a2e'), hex('#8cc95a')], species: ['poppy', 'cornflower', 'daisy'], sunY: .42, snow: 0, bladeH: 1, patchy: 1, roll: 1, mist: 1, mistDy: 0, glint: 1, dew: 1, blossom: 0, sunR: 1, halo: 1 },
    spring: { sky: [hex('#8fbfe8'), hex('#dbeaf0'), hex('#f8e4c0')], grass: [hex('#93b87a'), hex('#4f8f3a'), hex('#b5d873'), hex('#2c5222')], stem: hex('#58a040'), foliage: [hex('#6fb347'), hex('#8cc95a'), hex('#4f9a3a'), hex('#e8a0b0')], species: ['crocus', 'tulip', 'daisy'], sunY: .40, snow: 0, bladeH: .7, patchy: .45, roll: .6, mist: 1.45, mistDy: 4, glint: 1, dew: 1.35, blossom: .3, sunR: 1, halo: 1 },
    winter: { sky: [hex('#b8c6d8'), hex('#e3e2e6'), hex('#f2dcc4')], grass: [hex('#e8eef5'), hex('#b9c6d6'), hex('#7d8060'), hex('#8f9bb0')], stem: hex('#6e8a5a'), foliage: [hex('#8a9a6a'), hex('#a8a890'), hex('#6e8a5a'), hex('#b0a080')], species: ['snowdrop', 'hellebore'], sunY: .48, snow: 1, bladeH: .8, patchy: 1, roll: 1, mist: 1.2, mistDy: 0, glint: .4, dew: .9, blossom: 0, sunR: .85, halo: .55 }
  },
  /* M5, winter. The snow field: lit / shade / deep (the drift's shade colours) / gold (where the low sun hits), relief (how much the rolling ground shades), slope (the backlit drift edge),
     haze (the far snow toward the sky), jit (grain jitter), goldK (gold strength), hollow (extra shade in the hollows).
     dry stalks: keep (share of the blades left), colours [base, body, tip]. dip: the little shade at a flower's base (colour, alpha), shadow: the long shadow's colour.
     tree: the bare tree line (colour, share of grains left out, snow on its top). cap: snow on the ridges' tops (colour, depth in grains, strength).
     water: [top, bottom] of the open dark water; ice: shelves along the banks (colour, width, ragged edge, alpha); glint: the colder river glint. */
  snow: {
    lit: hex('#d6dae3'), shade: hex('#93a7ca'), deep: hex('#6a80aa'), gold: hex('#ffdfa6'), relief: 1, slope: 1.4, haze: .12, jit: .02, goldK: .5, hollow: .12,
    keep: .06, dry: [hex('#5e5a44'), hex('#7a7556'), hex('#a8a070')], dip: hex('#6d7fa6'), dipA: .7, shadow: hex('#5d6f98'),
    tree: hex('#463f4a'), treeGap: .42, treeSnow: hex('#e9edf4'),
    /* M5b: the snow field's strokes (the meadow's blades, snow-shaped): dens = chance x the meadow's, ridge / ripple = shares (the rest are tufts), len = [far, near] grains, tuft = tallest tuft,
       shadow = [length, alpha] of a lump's long shadow, dither = grain scatter of the shade, tone = per-stroke brightness spread, rollX / rollY = the drifts' size (grains per unit of noise).
       mtn: snow on the mountains. line = snow line (share of the peak), litK = how far the line climbs on the sunlit side, rag = ragged edge (grains), fall = streak length (share of the peak),
       gx = gully spacing, shear = how far a streak runs along the fall line, thr = gully threshold (higher = fewer, thinner), body = the rock's blue x summer's (it keeps the ridge apart from the sky), capA / streakA = cover, lit / shade = snow colours, rock = [lit, shade] bare rock, rockA = rock tint, hazeK = snow toward the ridge's haze. */
    fx: { dens: 1.8, ridge: .34, ripple: .14, len: [2, 9], tuft: 3, shadow: [4, .5], dither: .22, tone: .08, rollX: .022, rollY: .09 },
    mtn: { line: .42, litK: .3, facet: .25, rag: 3, fall: .55, gx: .35, shear: .7, thr: .62, body: 1.15, capA: .95, streakA: .9, lit: hex('#fffaf0'), shade: hex('#bccbe6'), rock: [hex('#aab5cf'), hex('#8c9aba')], rockA: .2, hazeK: .3 },
    water: [hex('#566884'), hex('#24324a')], ice: { color: hex('#dbe8f4'), w: 3.6, rag: 2.4, a: .92 }, glint: hex('#dff0ff')
  },
  /* [petals, core] */
  flowers: {
    daisy: [hex('#f7f3ea'), hex('#f2c94c')], poppy: [hex('#d94a3a'), hex('#2b1d1a')], cornflower: [hex('#4a6fd8'), hex('#2e3f8f')],
    aster: [hex('#9b7fd1'), hex('#f2c94c')], chrysanthemum: [hex('#e8963a'), hex('#a8541f')], snowdrop: [hex('#f4f6f8'), hex('#8fb87a')],
    hellebore: [hex('#e9d8e4'), hex('#c9b45a')], crocus: [hex('#9d6fd6'), hex('#f0b43c')], tulip: [hex('#e2553f'), hex('#3a2a1a')]
  },
  /* M4c, the flower label. Per species: plate (a pastel of the petals' complementary hue, drawn in grains), ink (the title, a dark shade of the petals, a CSS colour for the text layer),
     dim (the second line, lighter), line (the dotted link to the head: the petal colour). box (grains): pad above and below the text, padX at its sides, lh = one text row, gap from the head, margin to the frame, subPx = the second line's font,
     plate = its alpha, edge = how much darker its 1-grain rim is, speck = per-grain brightness variation, dot = link dot spacing, bright = how much the hovered head is lightened, sunPad = clearance around the sun. */
  label: {
    daisy: { plate: hex('#e2d6f0'), ink: '#4a3022', dim: '#66503f', line: hex('#f7f3ea') },
    poppy: { plate: hex('#cdeedd'), ink: '#6a1220', dim: '#82343f', line: hex('#d94a3a') },
    cornflower: { plate: hex('#fbd9c4'), ink: '#1c2f78', dim: '#3f5393', line: hex('#4a6fd8') },
    aster: { plate: hex('#f9f2b8'), ink: '#45257a', dim: '#644a92', line: hex('#9b7fd1') },
    chrysanthemum: { plate: hex('#cde6f6'), ink: '#762a0e', dim: '#8f4a2a', line: hex('#e8963a') },
    snowdrop: { plate: hex('#f6d3dc'), ink: '#1c4726', dim: '#40664a', line: hex('#f4f6f8') },
    hellebore: { plate: hex('#d4e5cc'), ink: '#47193a', dim: '#664258', line: hex('#e9d8e4') },
    crocus: { plate: hex('#f7edba'), ink: '#3c1a68', dim: '#5c4388', line: hex('#9d6fd6') },
    tulip: { plate: hex('#cdeedd'), ink: '#561812', dim: '#773b34', line: hex('#e2553f') }
  },
  labelBox: { pad: 2, padX: 3, lh: 5, gap: 6, margin: 2, subPx: 11, plate: .9, edge: .2, speck: .05, dot: 2, bright: .15, sunPad: 3 },
  sun: { core: hex('#fffbee'), limb: hex('#ffd890'), halo: hex('#ffe2a8'), r: .15, x: .5, nudge: .06, yPhone: .52, shimmer: .03, shimmerHz: .12 },
  /* the valley: trunk, reeds and cattails, river glints, mist */
  valley: { trunk: hex('#4a3626'), reed: hex('#7a8a3a'), cattail: hex('#6b4a2a'), glint: hex('#fff2c8'), mist: hex('#fff0d0'), blossom: hex('#fbeff2') },
  /* M4b, the living hold. All of it is a function of sky time T and the week seed; reduced motion shows none of it.
     wind: base sway sin(T*w + x*k) and a steady lean (tip offset per grain of blade height), gusts (Gaussian bumps along x: one every `every` s +- jit/2, speed grains/s, sigma grains, strength),
     flower: stems sway this much more than blades per grain of stem height; rampMs: the hold's motion comes in over this long after the hold starts (the sunrise has none of it); easeMs: leaving from the full hold, the sway eases out over this long.
     clouds: 0..3 thin day clouds (count = floor(H * (max + 1))), width and height as shares of SH, y band as shares of SH, drift in grains/s, strongest alpha (also over the sun).
     glints: river glints are flickers now: share of cells (today's was .55), period and the length of one flicker in s.
     life: slot = the length of a time slot in s, in which each kind is on or off (chance p, salt); fade = the cross fade between slots; kinds per season (never more than 2 non-bird kinds, a flock only crosses when at most 1 is on). */
  wind: { w: .33, k: .018, amp: .045, lean: .03, gust: { every: 16.67, jit: 6.67, speed: 15, sig: 16, amp: .15 }, flower: 1.1, rampMs: 1500, stillT: 40, easeMs: 600 },
  clouds: { max: 3, w: [.28, .46], h: [.05, .085], y: [.1, .34], drift: .18, alpha: .3, color: hex('#fff6e6') },
  glints: { chance: .17, period: [4.17, 8.33], on: 1.5 },
  life: {
    slot: 50, fade: 3.33,
    kinds: { spring: ['butterfly', 'dew'], summer: ['pollen', 'butterfly'], autumn: ['dew', 'leaves'], winter: ['snow', 'dew'] },
    p: { pollen: .7, butterfly: .7, dew: .6, snow: .85, leaves: .8 }, salt: { pollen: 4, butterfly: 6, dew: 3, snow: 8, leaves: 9 },
    phone: .5,
    /* M5: snow and leaves fall slowly (grains/s) from top (share of SH) to a landing row, drifting with the wind. n = count, fall = speed, drift / driftHz = sideways sway, wind = grains per unit of wind,
       frost = the dew of winter. snow: light on dark backgrounds, dark on light ones (luminance from lo to hi). leaves: hz = tumble rate. phone = the share of them on a phone. */
    snow: { n: 30, fall: 2.2, top: .06, landMin: 8, drift: 3, driftHz: .2, wind: 36, a: .9, color: hex('#ffffff'), dark: hex('#7a8fb6'), lo: .62, hi: .82 },
    leaves: { n: [10, 20], fall: 3, top: .1, landMin: 10, drift: 7, driftHz: .26, wind: 50, hz: .45, a: .95 },
    frost: hex('#e4f2ff'),
    pollen: { n: [10, 20], rise: .66, span: .35, drift: 5, driftHz: .21, a: .4, haloBoost: 1.6, color: hex('#fff0a8') },
    dew: { life: .67, every: 1.67, p: .6, a: .85, color: hex('#fffdf0') },
    butterfly: { drift: .012, hz: 1.8, restHz: .48, cycle: 30, wobble: [3.18, 5.46], land: .5, approach: 1.5, stay: [2, 5], colors: [hex('#fff4c8'), hex('#f2c94c'), hex('#e8c0ff')], body: hex('#3a2a1a') },
    birds: { every: 108.3, jit: 83.3, n: [3, 7], dx: 8, dy: 4, cross: 53.3, y: [.18, .34], hz: .96, bob: .36, a: .75, color: hex('#2c3040') }
  },
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
  /* the weekly morning. presence: no input for idleMs, or the page shown less than shownMs ago;
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
  barOut: .08, previewDelay: [.15, .27],
  /* thoughts coming back: the first interval counts app use (firstUseMs); the later ones are calendar gaps from the last
     coming back (gapMs, step 4 repeats the last); at most one coming back per perUseMs of app use (a due reminder ignores it);
     an unanswered coming back ends as `ignored` after askIdleMs. */
  thought: {
    firstUseMs: 2 * 36e5, perUseMs: 36e5, askIdleMs: 60e3,
    gapMs: [864e5, 3 * 864e5, 7 * 864e5, 14 * 864e5]
  }
};

/* frame pacing (fps): active = something is moving or the user just touched it; idle = a calm sky drifting. Sky time T still advances every RAF. */
export const FPS = { active: 60, idle: 15, morning: 30 };
/* smart frame cap (sky/clock.js pace): on a display faster than fastMs^-1 (12.5 ms = 80 Hz) that cannot keep up, active rendering drops to FPS.active.
   window: active frames judged (one smoothing window); busy: render work above this share of the display interval = not keeping up (0.8 x 8.3 ms = 6.7 ms at 120 Hz);
   lateShare: share of late frames (RAF gap > 1.5 x interval) that also means it; free: work below this share of the interval = calm; calmMs: calm time before uncapping. */
export const FRAMECAP = { fastMs: 12.5, window: 40, busy: 0.8, lateShare: 0.25, free: 0.45, calmMs: 8000 };

/* sizes and budgets */
/* urgency: a star goes amber when its remaining life fraction is low OR the absolute time left is short.
   1 h: a 3-minute task has a tiny life fraction budget, so life alone stays calm until its last 45 s;
   an hour is the point where "later today" becomes "now" for a deadline todo. */
export const URGENT = { life: .25, leftMs: 60 * 60 * 1000 };

/* practices: a repeating act, marked by day. limit = how many live practices fit; a day may be marked until yesterdayUntil
   (local hour) for yesterday; the drawing is described at PRACTICE. */
export const PRACTICE = {
  limit: 5, yesterdayUntil: 12,
  /* the star: a core (centre + 4 arms) inside a thin ring of `haloN` grains at `haloR`; pale gold, its own colour (not alive / amber / done / ash).
     week: 7 grains `dotStep` apart, `dotY` below; a lit day, an open one, today's open slot a touch brighter. */
  ink: hex('#f4e3b4'), dim: hex('#c9b886'),
  coreA: .85, armA: .5, haloA: .42, haloR: 3, haloN: 12,
  dotA: 1, dotOffA: .22, dotTodayA: .36, dotY: 6, dotStep: 2,
  /* the year ring: 52 slots clockwise from the top, ring 1 at ring1 grains, each further ring ringGap outside; a slot shows days/7 from slotOffA to slotA;
     at rest only every hintEvery-th slot of ring 1 is drawn, at hintA. */
  ring1: 10, ringGap: 3.5, slotOffA: .14, slotA: .85, hintEvery: 13, hintA: .2,
  /* motion (ms): a mark flashes (flashGain extra white) and lifts the core by liftGain; reduced = a plain fade; archive thins the star out */
  flashMs: 250, flashGain: .6, liftGain: .15, reducedMs: 150, thinMs: 600,
  full: '{n} practices · /practice limit <n> for more'
};

/* placing a new tagged star: the pull toward the tag's centroid. tagRadius is a share of GW; tagPull is the cost per grain
   outside that radius (same units as rectScore, so a far candidate pays roughly one star-label overlap). */
export const PLACE = { tagPull: 40, tagRadius: .16 };

export const SIZE = {
  labelFont: 12, caretW: 6, caretH: 18,
  starR: 3, starRBig: 7, starCore: 1, starCoreBig: 3,   // arm radius and core radius (grains); a big star reads about twice a normal one
  haloSig: 5, haloSigBig: 10, haloColdSig: 5.5, haloColdSigBig: 10.5, haloColdRad: 16, haloColdRadBig: 30, bigGain: 1.2,   // halo sigma/radius per size; bigGain = big halo brightness
  maxStars: 48, maxTitle: 80, maxBar: 240, ellipsisAt: 22,
  labelHysteresis: 20, labelGap: 4,
  moonClearStars: 14, moonClearEdges: 6,
  pastScale: .32, pastMaxWeeks: 26, pastMinGap: 40, pastBottomBand: .15,
  touchHitPx: 22, mouseHitPx: 8,
  pipStep: 9, pipRow: 9
};

/* thoughts: text without a deadline, kept as a haze in a band above the bar.
   bandY = the band's top in grains above the sky's bottom edge; bandH = its height; patchW = a patch's width in grains.
   The hit test uses the same band rect. The haze is cool violet-grey (not one of the four meanings), always dimmer than the dimmest star.
   alpha / selAlpha / hoverAlpha = the patch's peak brightness at rest / asked / hovered; hazeH = rows of a patch; fill = share of cells that carry grain.
   breathA / breathS = the faint breathing (fraction, seconds); driftA / driftS = the slow sideways drift (grains, seconds).
   asked: the patch stays put and brightens to selAlpha; a seed point (seedA brightness, seedWarm = how far its colour warms toward alive ivory) fades in over seedMs
   and pulses seedHz by seedPulse; all other patches dim to dimOthers over dimMs (back the same way). gather = how far a said patch starts to pull toward its centre; letGoMs = thinning out; condenseMs = a said thought travels up to its star,
   condenseReducedMs = the reduced-motion crossfade, gatherMs / travelFrom = the pull-in and when the point sets off, arc = the sideways bow in grains,
   pointA = the travelling point's brightness, holdMs / holdFade = how long the point rests on the new star before the star takes over. */
export const THOUGHT = {
  bandY: 12, bandH: 10, patchW: 18, patchH: 4, patchGap: 4,
  alpha: .32, selAlpha: .44, hoverAlpha: .38, undoMs: 5,
  seedA: .5, seedWarm: .55, seedMs: 300, seedHz: .4, seedPulse: .16, dimOthers: .5, dimMs: 200,
  color: hex('#a9a3cc'), hazeH: 8, fill: .8,
  breathA: .22, breathS: 9, driftA: 2.4, driftS: 90, gather: .22,
  letGoMs: 600, condenseMs: 1100, condenseReducedMs: 250, gatherMs: 480, travelFrom: 420, arc: 6, pointA: .95, holdMs: 650, holdFade: 230,
  labelAlpha: .8, ageAlpha: 1
};

/* first-use copy and the quiet, replayable /help panel. Layout values are in grains. */
export const GUIDE = {
  first: 'add your first star — title, deadline',
  firstTouch: 'add — title, deadline',
  add: 'title, deadline',
  finishMouse: 'click a star to finish',
  finishTouch: 'tap twice to finish',
  when: 'when? · fri makes it a star · remind +2h · esc: later',
  whenTouch: 'when? · fri · remind +2h',
  whenBack: 'when? · {age} · fri makes it a star · esc: later',
  letGo: 'let go? enter · esc keeps it',
  firstStep: 'first step? · esc to skip',
  open: 'help · esc to close',
  helpDesktop: [
    'help',
    'add · title, deadline / step / step',
    'big · add ! at the end',
    'finish · click a star',
    'n or / write · tab move · enter finish · z undo',
    '/export · /import · /motion on|off|system',
    '/practice <title> · stop <name> · limit <n>',
    'esc closes help'
  ],
  helpTouch: [
    'help',
    'add · title, deadline',
    'steps · add / step / step',
    'big · add ! at the end',
    'finish · tap a star twice',
    'n or / write · tab move',
    'enter finish · z undo',
    '/export · /import',
    '/motion on|off|system',
    '/practice <title> · stop <name>',
    '/practice limit <n>',
    'esc closes help'
  ],
  panel: { margin: 5, padX: 4, padY: 3, row: 5, alpha: .96 }
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
  cap: Q.get('cap'),                          // dev: cap=on|off forces the smart frame cap (memory only)
  slow: Q.has('slow') ? +Q.get('slow') : 0,   // dev: busy-wait this many ms inside each render
  reduced: Q.get('reduced') === '1',
  bench: Q.get('bench') === '1',
  frames: Q.has('frames') ? +Q.get('frames') : 120,
  hover: Q.get('hover'),
  star: Q.get('star'),
  script: Q.get('script'),
  devSeed: Q.get('seed2') ? +Q.get('seed2') : null,
  steps: Q.get('steps'),                      // dev: steps=1 puts steps on the demo tasks
  thoughts: Q.has('thoughts') ? +Q.get('thoughts') : null,   // dev: ?thoughts=n adds n synthetic thoughts in memory
  useMs: Q.has('useMs') ? +Q.get('useMs') : null,             // dev: the app-use clock, in ms
  tags: Q.get('tags') === '1',                                // dev: give the demo stars tags (ns.tagDemo)
  practices: Q.has('practices') ? +Q.get('practices') : null, // dev: ?practices=n adds n synthetic practices in memory
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
  rx: 11, rxBig: 19, ratio: .42, tilt: -16,        // degrees
  sampPerGrain: 3, dust: .09, jit: .45, behind: .7, rev: 240,
  shimmer: [6, 11],                                // seconds
  openCore: .55, doneCore: .85, nb: .4, halo: .09, haloSig: 1.3,
  arc: .13, arcGlow: .05, tick: .4, tickCalm: .55, glint: 4
};
