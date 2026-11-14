# Night Sky design system

Written for a future contributor or AI. Change `app/src/tokens.js` first; this document follows it.

## 1. Principles

1. **One system.** The whole scene is one grain framebuffer. Why: a single material is what makes the sky feel like one object. Never draw a smooth shape (arc, stroke, gradient) over it; the only things outside the framebuffer are text and the 1 px hover frame.
2. **Calm by default, alive on close look.** Nothing blinks, jumps or moves fast unless the user just acted. Why: the sky must never ask for attention.
3. **Smooth motion inside the grid.** Moving light is splatted across neighbouring grains by its fractional position; it glides, never snaps.
4. **Light carries meaning.** At night four colours have fixed meanings: warm ivory is alive, amber is urgent, cold blue-white is done, ash is missed. They never mean anything else. Other colours are allowed where a scene needs them (the morning has its own palette); every colour lives in `tokens.js`.
5. **The user caused it, the sky responds.** Only a user action earns motion bigger than ambient, and it has a beginning, middle and end that start where the eye already is.
6. **Restraint at night.** The night has no chrome but the bottom bar. Numbers appear only where the user looks back: the morning summary and the Atlas.
7. **Determinism.** A seed and a time fully determine a frame. Why: tests, parity checks, and the week's sky being the same everywhere.
8. **New things are rare and quiet.** At most one special (moon, comet, aurora, satellite, shower) is visible at once, usually none.
9. **Past weeks are sky.** If a past constellation is noticed before the user's stars, it is too bright.

## 2. The grain system

- One grain = a dot on a pitch of `3 x dpr` device pixels with a 1 device-pixel gap (so grains are DPR-exact; phones get fewer grains, not smaller ones).
- Grid: `GW x SH` sky grains plus 20 (desktop) or 24 (touch) bar rows. GW and SH come from the viewport; buffers are reallocated on resize (debounced 150 ms), stars keep normalized positions.
- Pipeline order per frame (`render/compose.js`): base sky (cached, with crossfade) -> clouds -> background stars and components -> past weeks -> moon -> events (aurora, comet, satellites, meteors) -> edges -> glows -> choreography light -> ghost star -> text backing -> sprites (user stars last) -> blit -> canvas text.
- Ownership and import direction are in `docs/dev/ARCHITECTURE-NOTES.md`.

## 3. Tokens

Everything lives in `app/src/tokens.js`. Colour groups: `TXT` (text), `C` (light), `PAL` (five skies), `LAYOUT`, `TIME`, `SIZE`.

| Name | Hex | Meaning |
|---|---|---|
| ink | #f1ead6 | alive star, primary text |
| ink2 | #b6af9a | secondary text, alive arms |
| done / core / glint | #d3dfff / #fff / #a8bbf2 | done star, its core, glint |
| cold | #9fb8ff | done halo |
| amb / ambS / ambC | #f0a050 / #eda55a / #ffd9a8 | urgent |
| ash | #43464e | missed |
| line / lineG / pulse | #c4d2ff / #6e8cff / #d0dcff | constellation lines, glow, travelling pulse |
| dim | #575b66 | quiet text |
| bg | #030407 | background and the gap between grains |
| FPS | `{ active: 60, idle: 15 }` | frame pacing. Active (animating, hover or scroll easing, pointer or key in the last 300 ms): every display frame. Idle: at most 15 renders/s; sky time `T` still advances every frame |

Sizes: star radius 3 (big 5), core 1 (big 2), max 48 stars on a sky, title ellipsis at 22 characters, past scale 0.32, bottom band without past anchors 15%, anchors at least 40 grains apart.

Steps (`STEPS`, `PACE` in `tokens.js`): at most 20 steps per task and 8 orbit slots (`filled = done * K / n`, `K = min(n, 8)`); orbit `rx` 11 grains (13 for big stars), `ratio` 0.42, tilt -16 degrees, 3 dust samples per grain, one revolution per 240 s, shimmer period 6 to 11 s; dust 0.09, lit arc 0.13 (lineG glow 0.05), companion core 0.55 open / 0.85 done (four neighbours at 0.4), done halo 0.09, pace tick 0.4, glint lap 4 s; hover multiplies all step light by 1.6; the near half of the orbit is 1x and the half behind the star `behind` 0.7x. `PACE.margin` is 0.3: a task is behind when `(1 - life) > done / n + 0.3`. List rows: pitch 6 grains (11 on touch, so rows are at least 32 CSS px), at most 5 open and 5 done rows.

## 4. Brightness hierarchy

1. User stars and their glows (core 1.0).
2. The constellation (lines `0.11` per splat). The orbit of steps lives at this level: dust at most about `0.15`, the lit arc `0.13`, companions are mini-sprites (core 0.55 open, 0.85 done), always below the parent star's core and glow; with nothing hovered a viewer notices the user stars first.
3. Moon (about 0.5 at the bright limb).
4. Comet head 0.55, tail `0.32 (1-s/len)^1.3`; satellites; meteors.
5. Bright background stars.
6. Past constellations: stars `0.22 * 0.88^age` (min 0.05), lines `0.035 * 0.88^age`.
7. Everything else.

Nothing outshines an alive user star's core. Missed star: ash centre 1, four neighbours 0.5, halo peak 0.06.

## 5. Motion

Every choreography is a pure function of elapsed milliseconds (`choreo/*.js`, importing only math and tokens). The model replays an in-memory event log (`model/timeline.js`) at time T; choreographies are derived, never stored. Reloading mid-choreography shows the final state. Curves: `ease.out`, `ease.inOut`, `seg(ms, a, b)`.

| Choreography | Timeline |
|---|---|
| finish | anticipation 110 ms; ring 120-900; core flash ~630; title 700; arrival 650 ms (250 reduced) |
| connection | charge >= 450 ms, travel +250, draw `clamp(11 ms/grain, 520, 1200)` |
| undo | 5 s window; reverse of finish over ~700 ms |
| step | a step finish, reopen, add or delete is a timeline event (`type: 'step'`), undoable in the same 5 s window; anticipation: the slot dims 0-120 ms; flash to core white 120-450 (peak at 190); the connection pulse travels from the slot into the core at 11 ms/grain, clamped 180-400, leaving at 170 ms; arrival lifts the core +15%, decaying over 300 ms; reverse over 500 ms for undo or reopen; reduced motion: a 250 ms crossfade |
| collapse | finishing a task that has steps: the orbit folds into the core over 400 ms (250 ms fade when reduced), the core lifts +12% at the end, then the existing finish runs, shifted by that time. Open steps stay in the data |
| create | motes 0-600, assembly 550+45/ring, label from 700 |
| expire | label fade-out 900-1000, fade-in 1000-1100 (sequential, not crossfade) |
| ritual | 0-600 boost +15%; 600-3000 lift to 0.32 at far anchor; 1800-3300 sky crossfade (1.5 s); 2600-4200 `week N` centred; reduced motion 600 ms crossfade; click or key skips |

## 6. Components

| Component | What | Rarity / budget |
|---|---|---|
| clusters, binaries, giants, variable stars, diffraction | background texture | seeded per sky, dimmer than user stars |
| moon | phase from the wall clock, up about 12 h around its transit, 20 min fade at the edges | one special at once; avoids stars (14 grains) and edges (6) |
| comet | 1 in 3 skies, moves along an arc by week progress | findable within 5 s, dimmer than the moon |
| meteor showers | 1 in 4 skies | slow, dim |
| satellites | rare; 1 at a time in demo | dim |
| aurora | one palette only, cached at 4 Hz | dim, slow |
| past constellations | archived weeks, newest 26, drift with the far layer | no labels; hover shows `week 45 · 6 stars` |

## 7. How to add a sky component

1. Decide its rarity (seeded flag in `sky/sky.js` `skyFlags`) and write it in a new function in `sky/`.
2. Draw only with `splat`, `halo`, `add` into the framebuffer, at a fixed step in `compose.js`.
3. Pick a brightness below the moon, above nothing the user will read as a star.
4. Make it a pure function of seed, wall clock and T; no `Math.random`, no `Date.now`.
5. Add reduced-motion behaviour (stillness or a slow fade).
6. Bench it: `?dev=1&bench=1&weeks=6` must stay under 9 ms/frame at 2x.
7. Run `ns.selfTest()`; check the specials count over 20 sample times (at most 3 with two or more at once).

Checklist: rarity, brightness budget, determinism, reduced motion, performance.

## 8. Steps

A task may have up to 20 steps, `task.steps = [{ id, text, doneAt }]`. Tasks saved before steps existed load with `steps: []` (`sanitize` never drops a task for a bad step). The sky shows progress as an orbit around the star: a tilted ellipse of faint dust with one companion per slot. The list of steps lives in text, under the label of the selected star.

- Input: create with `title, deadline / step / step` (steps split only on a lone slash between spaces, so `20/11` stays a date). Select a star and the bar reads `step for <title>`; Enter adds. Space finishes the next step, `1`-`5` toggle the visible rows, Delete on a hovered row removes it (touch: tap toggles, long-press 500 ms deletes), Esc deselects. Enter or a second click on a selected star finishes the task.
- Pacing is part of `isUrgent` in `model/store.js` (one rule, one place): behind makes the star urgent, the open slots tint amber, and the desktop notification still fires once per task.
- Ready (all steps done, task not finished): the whole orbit is cold, one glint travels it per 4 s.
- With no steps a task looks and behaves exactly as before.

## 9. Decisions carried from the archived specs

Full history in `docs/specs/archive/`; one-line decisions in `docs/dev/DECISIONS.md`.

- The product is `app/` only: one grain framebuffer, text the only off-grain layer, no framework, no build step.
- Weeks are ISO weeks; finished stars archive into past-week constellations and the Monday ritual decides what carries over (`model/week.js`).
- Data is local-first: tasks, weeks and prefs persist through `platform.js` (localStorage on the web, Tauri storage on desktop); the session event log is memory only.
- Performance: the live frame is paced (idle 15 fps), clouds are keyframed and upsampled in slices, and the GPU only presents the grain (the frame stays a pure function of T).

## 10. Don'ts

Smooth shapes over the sky; using the alive, urgent, done or missed colours for anything else; blinking; particles flying across the night sky (the morning may have slow life); more than one special event at once; header or stats chrome at night; labels on past weeks in the night sky; reading the clock outside `sky/clock.js`.
