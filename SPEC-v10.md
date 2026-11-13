# Night Sky v10: polish v9, then adding stars and a living sky

Build `prototype/v10.html` starting from `prototype/v9.html`. That file is approved and is your
baseline.

`SPEC-v9.md` §1 (taste principles) still applies in full. Re-read it first. Everything in v9 that this
spec doesn't mention must keep working exactly as it does now, including all `window.ns` hooks and URL
scenes.

The work comes in three phases, in this order. Shoot and judge each phase before you start the next.

- **Phase A:** fix v9's weak spots (§2).
- **Phase B:** adding a star, and deadlines passing live (§3).
- **Phase C:** a living sky, meaning new components and events (§4).

---

## 1. Taste reminders specific to this iteration

- **New things are rare and quiet.** A sky with a moon, a comet, aurora, satellites and meteor showers
  could easily become a theme park. Each event is rare, and each one is dim. The test is simple: on
  any random screenshot of ambient time, at most one "special" thing is visible besides the user's
  stars. Usually there should be none.
- **Everything lives in the grain framebuffer.** The moon, the comet, aurora and satellites are light
  written into grains, using `splat`, `halo` and `add`. You may add new framebuffer helpers, but you
  must not draw smooth shapes.
- **Brightness hierarchy, from top to bottom:**
  1. user stars and their glows;
  2. the constellation;
  3. the moon;
  4. comet / satellite / meteor;
  5. bright background stars;
  6. everything else.

  Nothing in the sky may outshine an alive user star's core.
- **Typing a task should feel like the sky is listening.** The preview is gentle: faint, slow and
  precise.

## 2. Phase A: v9 fixes

### 2.1 Labels glide, and never hop before their cause

- Label placement must only consider edge segments that are **visibly drawn right now**: the
  line-core portion behind the bead, or full edges after arrival. A not-yet-drawn edge must not push
  labels around.
- When the chosen anchor changes, the label **glides** from its old position to the new one over
  320 ms with easeInOut. Its text and its backing rect move together.
  - Interpolate in CSS px.
  - Snap the final position to the grain grid, but render intermediate frames at fractional
    positions. Text may sit off-grid only while it's moving.
- Hysteresis stays at 20.

### 2.2 A stronger charge beat

The bead at the source edge must be clearly readable by 550 ms.
- Charge window: 450–700 ms.
- Halo peak 0 → 0.8 with an easeOut shape (not easeIn, which is why it was invisible).
- σ 1.8, radius 6.
- The source core brightening goes to +0.25.
- Check `03-0600.png` at 3× zoom: the bead must be obviously separate from the arm tip.

### 2.3 Hover frame

- The frame width = the widest text line (measured with the actual font) + 2 grains of padding on
  each side. Snap the width up to a whole grain. No text may touch or cross the frame.
- Replace the `⏎` glyph with a **grain-drawn return arrow**, so you don't depend on a font glyph. It
  sits 2 grains right of the frame, centred on row 1, drawn in `dim`, alpha 0.9. It is 5 grains wide
  and 4 tall:

```
....#
....#
.#..#
#####
.#...
```

### 2.4 Missed stars

A lone ash grain is too invisible. The missed star becomes:
- the centre grain in `ash`, alpha 1;
- 4 orthogonal neighbours in `ash`, alpha 0.35;
- an ash halo with peak 0.04, σ 2, radius 5.

It should still read as quiet: a burnt-out ember, not a star.

### 2.5 Verify the paths that weren't tested

Drive real input over CDP (or `dispatchEvent` in the page). Test and screenshot:
- Tab to a star → `21-kbd-select.png`;
- Enter finishes it → `22-kbd-finish-0900.png`;
- `z` undoes;
- Esc clears the selection;
- clicking `↻ sky` → `23-sky-click-0450.png`, which must show the mid-crossfade.

Also add a scene where an edge passes behind a third star → `24-occlusion.png`. Check the §3.3
occlusion at 3× zoom.

Re-shoot all of v9's shots that are affected, and move v9's folder content into `shots/v10/` as the new
baseline.

## 3. Phase B: adding a star, and deadlines passing

### 3.1 The input bar becomes real

- Clicking the bar, or pressing `n` or `/`, focuses it.
  - The block cursor blinks at 1.1 Hz, only while focused.
  - When unfocused, the placeholder shows `title, deadline`, as it does now.
- Typing writes text after the `›` prompt. These keys work as normal:
  - Backspace;
  - left/right arrows;
  - Home/End;
  - Ctrl+Backspace (deletes a word).
- Esc blurs and keeps the text. A second Esc clears it.
- The title is the text before the **last comma**, trimmed. The deadline is the text after it. With
  no comma, there's no deadline and nothing to preview.
- **Size:** if the text ends with ` !` (space + exclamation mark), the new star is big. The `!` is
  removed from the title. It's the only syntax beyond the comma, so keep it simple.

### 3.2 Deadline parser (JS port of the Rust app's parser, keep the semantics identical)

`parseDeadline(str, now)` returns `{ok, date}` or `{err: 'unreadable' | 'past'}`. Input is
case-insensitive and trimmed. If no time is given, the time is 23:59 local. It accepts:
- `today`, `tonight`, `tomorrow`, `tmr`;
- weekday names and their 3-letter forms. These mean the next such day; if today is that day and no
  time is given, it means today.
- `nov 20`, `20 nov`, `20.11` (if already past, next year), and `2026-11-20` (exact);
- `+3d`, `+5h`, `+90m`;
- an optional time suffix on any day form: `18:00`, `18`, `6pm`, `6:30pm`.

A deadline in the past is `past`. Write unit tests as an in-page `ns.selfTest()` that returns the
pass/fail counts, using a fixed `now` of Fri 2026-11-13 21:00 local. Cover every form and both errors.

### 3.3 Live preview while typing

**Bar, right of the typed text, 3 grains gap:**
- a valid deadline shows `→ fri 20 nov 23:59 · 6d 02h` in `dim`;
- an unreadable one shows `can't read that`, and a past one shows `that's already gone`, both in `warn`;
- an empty deadline shows nothing.

The preview text fades in over 120 ms after typing pauses for 150 ms. Don't flicker on every
keystroke.

**Ghost star in the sky**, once the deadline is valid:
- a faint version of the final sprite at its future position, every grain at alpha 0.18, warm `ink2`;
- no glow, except halo peak 0.03.

**Ghost behaviour:**
- It appears with a 250 ms fade.
- It "breathes" very slowly: alpha 0.14 ↔ 0.22 over a 2.4 s period.
- Its label is the typed title in `dim`, placed with the normal placement algorithm.
- When the text becomes invalid, the ghost fades out over 200 ms.
- Its position is computed once the title is non-empty and stays stable while you type. Typing
  must not make it wander.

**Placement of new stars** (deterministic):
- Candidates come from a hash of the title plus the creation counter.
- Reject any spot closer than 9 grains (Chebyshev) to another star, closer than 6 to an edge line,
  inside 4 grains of the screen edges, or inside the bottom 8 rows.
- Score the rest by their label-placement score (prefer spots where the label fits right).
- Up to 64 tries.

### 3.4 Enter: the star condenses out of the sky

Enter with a valid deadline creates the star. Choreography, in ms from Enter:

| t | What happens |
|---|---|
| 0–80 | The bar text slides up 1 grain and fades out. The placeholder returns at 400. |
| 0–700 | **Gathering:** 18–26 light motes start on a ring of radius 16–22 grains around the target (seeded random angles). They spiral inward along a gentle curve (angle offset 0.6 rad at the start, 0 at arrival), easeIn, each at a slightly different speed (600–700 ms). Each mote is a `splat`, brightness 0.35, colour `ink2`, with a 3-splat tail. Nearby background stars within 18 grains dim by 0.15 during this phase and recover after, as if the light is borrowed from the sky. Subtle. |
| 550–900 | **Assembly:** sprite grains appear centre-out, by Chebyshev distance, one ring per 45 ms, each fading in over 120 ms. The colour is warm `ink`, settling to the normal alive colours. The ghost (if shown) crossfades into the real sprite. |
| 650–1000 | **First light:** halo grows 0 → its normal alive value with easeOut, then a tiny overshoot of +15%, settling by 1000. |
| 700–1100 | **Label:** the title types in left-to-right at 18 ms/char, then the time-left line types in. |
| 900 | The counter's total increments. A new empty pip appears at the end of the row and fades in. |

**Reduced motion:** no motes; fade in the star and label over 300 ms.

**Undo for creation:** the same bar undo row shows `added · title  undo z`. The undo reverses it:
the sprite dissolves outward into motes that drift 8 grains and fade (400 ms), and the label erases.

### 3.5 A deadline passing while you watch

When an alive star's deadline passes during the session (sky time `T` maps to a wall clock; see the
§4.2 clock), it **exhales** over 1600 ms:
1. **0–300 ms:** the core brightens one last time to `ambC` (+0.2), like an intake.
2. **300–1300 ms:** the remaining arm grains fade from the outside in, one ring per 110 ms. The halo
   shrinks to zero. The colour drifts amber → `ash`.
3. **900–1600 ms:** it settles into the missed-star form (§2.4).
4. **Label:** the title colour fades to `dim`, and the second line changes to `missed` with a
   150 ms crossfade. After 4 s the label fades out, because missed labels only show on hover.

There are no particles and no sound. It should feel like a candle going out.

Add a test scene `scene=expire` that sets one star's deadline to 2 s after load. Shoot
`30-expire-0400.png`, `31-expire-1000.png` and `32-expire-2000.png`.

## 4. Phase C: a living sky

All of this is **seeded by the sky seed** (a new sky each ISO week in the real app). Add `ns.week(n)`,
which sets `seed = hash(year, isoWeek)`. Several systems need a wall clock, so add `?clock=2026-11-13T21:00`
(local) to override the clock in tests. Otherwise use `Date.now()`, with sky time `T` advancing alongside
it.

**Demo mode** `?demo=1` speeds every rare event ×20, so the user can see them in one minute. In
normal mode, use the real rates.

### 4.1 New background star types (generated in `makeSky`)

| Type | Count per sky | Spec |
|---|---|---|
| Open cluster | 1–2 (and 0 in 30% of skies) | 6–10 stars in a 3–4-grain radius, in the mid layer (same drift). The brightest is 0.45, the others 0.15–0.3. Tight and slightly elongated, so it reads as "a little group" when you notice it. |
| Binary pair | 4–7 | Two stars 1.5–2.5 grains apart, the same layer, one warm and one cool tint, brightness 0.25–0.4. |
| Warm giant | 2–4 | Mid/near layer, tint `#ffd2a0`–`#ffc890`, brightness 0.45–0.6, halo 0.1 (σ 1.4, r 3). |
| Variable star | exactly 1 | Near layer. Brightness oscillates 0.12 ↔ 0.55 over a period of 3–6 min (seeded), with a sine shaped by `pow(·, 1.6)` so it spends more time dim. Nobody should notice in minutes; they might notice in an hour. |
| Diffraction cross | the 2–3 brightest near stars only | A grain plus with arms of 2 grains at alpha 0.35 and 0.15, which twinkle with the star. |

Remove the same number of plain stars from each layer so the overall density stays the same.

### 4.2 Time of day (wall clock)

The sky mood shifts with the local hour. The keyframes multiply or add on the v9 base, interpolated
smoothly (smoothstep) between them:

| Local time | Sky base × | Horizon airglow | Note |
|---|---|---|---|
| 17:00–19:30 dusk | 1.25 | +0.06 of a warm `[230,140,90]` near the horizon, fading as the hour goes on | The faint and mid star layers are at 60% → 100% (stars come out). |
| 21:00–01:00 night | 1.0 | v9 normal | |
| 02:00–04:00 deep | 0.85 | ×0.7 | Faint stars at 110%. |
| 04:30–06:30 pre-dawn | 1.0 → 1.3 | a cool `[90,140,200]` rising to +0.08 | Faint stars fade to 50%, and at 06:30 only near stars remain. |
| 07:00–16:30 day | 1.15 | ×0.8 | Faint layer at 40%. The app stays a night sky; this is just a lighter, quieter version. |

Transitions happen in real time, minutes long, and are never visible as a change.

Add `ns.clock(iso)` to jump, plus shots `40-dusk.png` (18:30), `41-night.png` (23:00), `42-deep.png`
(03:00), `43-predawn.png` (05:45) and `44-day.png` (13:00), all with the same seed.

### 4.3 The moon (real phase)

- **Phase:** synodic month 29.530588853 days, reference new moon 2000-01-06 18:14 UTC.
  Illumination fraction `k = (1 − cos(2π·age/29.53))/2`. Waxing or waning comes from the age.
- **Position:** a seeded spot in the upper 40% of the sky, avoiding stars and labels by at least 14
  grains, re-checked when stars are added (it may move once, with a 2 s crossfade). It doesn't drift
  with the layers. The moon stays still, like a fixed lamp.
- **Shape:** a disc of radius 5 grains.
  - Lit grains are those inside the disc **and** on the lit side of the terminator ellipse (standard
    phase rendering: terminator x-scale = `cos(2π·age/29.53)`).
  - Lit grains: `#f3efe4`, alpha 0.9, with soft edge grains at 0.5.
  - Dark side: "earthshine" `#3a4050`, alpha 0.22, visible only within the disc.
  - Halo: `#d8dcea`, peak `0.05 + 0.10·k`, σ 7, radius 22.
- **Effect on the sky:** sky base × `(1 + 0.12·k)`, and the faint layer at `(1 − 0.4·k)`. A full moon
  washes out faint stars, like reality.
- New moon (k < 0.03): no moon is drawn.
- Shots: `50-moon-crescent.png` (clock 2026-11-23), `51-moon-full.png` (2026-11-24 is near full;
  compute it and pick a date with k > 0.97), `52-moon-new.png`.

The moon must never be brighter than an alive user star's core. Compare them at 3× zoom.

### 4.4 Rare events

| Event | Real rate | Spec |
|---|---|---|
| Satellite | a pass every 4–7 min | A single steady point (splat 0.3, cool white) crossing on a straight line, entering and leaving at the screen edges at 14–22 grains/s. 1 in 6 passes **flares**: brightness rises to 0.8 over 1.5 s and falls (a Gaussian in time) somewhere mid-path. No tail. |
| Meteor | as v9 | Keep it. |
| Meteor shower night | 1 in 4 skies | The meteor rate is ×5 between 22:00 and 04:00 local. Every meteor comes from one seeded **radiant** point (which may be off-screen), so their directions converge when traced back. That's the detail that makes it real. |
| Aurora | teal palette (`PAL[2]`) skies only, 50% of them, 20:00–03:00 | Curtains in the top 30% of the sky. For each grain column x, curtain intensity = `fbm(x/40 + T·0.01, T·0.02)` shaped by a smoothstep, and the vertical profile is a soft band with ray streaks (`fbm(x/3, T·0.05)` modulating). Colour from `#3fd6a0` (low) to `#6a7cff` (top), peak alpha 0.07. It must be very slow: curtains shift over tens of seconds. |
| Comet | 1 in 3 skies | Present all week. Its head position is interpolated along a seeded arc across the sky by **week progress** (Mon 00:00 = 0 → Sun 23:59 = 1), so each day it's further along. Head: halo peak 0.22, σ 1.6, radius 5, `#e8f4ff`. Tail: 28–40 grains pointing **away from a fixed sun direction** (below the horizon, seeded azimuth), made of splats with brightness `0.16·(1−s/len)^1.5` and a slight curve. Plus a faint second ion tail that is straighter, bluer (`#9fc4ff`) and dimmer (0.08). The comet drifts with the far layer for parallax consistency, but wraps its arc with the week, not the drift. |

Shots (using `clock` + `seed` + a frozen T where needed):
- `60-satellite.png`
- `61-satellite-flare.png`
- `62-shower.png`: 3–4 meteors composited by freezing at different T in one scene. Add a `scene=shower` that shows several mid-flight at once for the demo.
- `63-aurora.png`
- `64-comet-mon.png`, `65-comet-thu.png` and `66-comet-sun.png`: the same seed, different days.

## 5. Out of scope

Past weeks becoming the sky, the Monday ritual, the Rune port, settings, sound, deleting or editing
stars from the HUD (only undo), and mobile/touch layout.

## 6. Code

- Same single file. Keep v9's section structure, and add sections: `input & parser`, `placement`,
  `create choreography`, `expire choreography`, `sky components`, `clock & moon`, `events`.
- Choreographies stay pure functions of elapsed ms.
- Rare events are pure functions of (seed, wall time) wherever possible, so screenshots are
  reproducible.
- Performance: keep compose + blit ≤ 8 ms at 1×. The aurora and moon must be cheap: cache per
  0.25 s, not per frame, where possible. Report ms with the aurora + comet + moon all visible.

## 7. Verification and report

- Shoot everything listed, into `prototype/shots/v10/`. **Open and judge every PNG at full size, and
  zoom into the details** (bead, moon, comet head, ghost star, label glide frames).
- Run `ns.selfTest()` and report the counts.
- Add these to the v9 checklist:
  - Is more than one special sky thing visible at random ambient times? Sample 20 random seed/time
    pairs with `?demo=0` and count.
  - Is anything in the sky brighter than an alive user star's core?
  - Does the ghost star ever wander while typing?
  - Does the expire animation read as "going out", not "exploding"?

Report in the v9 §10 format, plus `selfTest` counts and the 20-sample count.

Work only in `prototype/`. No git. Don't hand back early, and if you're truly blocked, say on what.
Tool calls time out at 2 minutes, so keep each screenshot command short or batch them in a script
that you run in the background and wait for.
