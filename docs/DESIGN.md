# Night Sky design system

Written for a future contributor or AI. Change `app/src/tokens.js` first; this document follows it.

## 1. Principles

1. **One system.** The whole scene is one grain framebuffer. Why: a single material is what makes the sky feel like one object. Never draw a smooth shape (arc, stroke, gradient) over it; the only things outside the framebuffer are text and the 1 px hover frame.
2. **Calm by default, alive on close look.** Nothing blinks, jumps or moves fast unless the user just acted. Why: the sky must never ask for attention.
3. **Smooth motion inside the grid.** Moving light is splatted across neighbouring grains by its fractional position; it glides, never snaps.
4. **Light, not decoration.** Warm ivory is alive, amber is urgent, cold blue-white is done, ash is missed. No new colours. Why: brightness and hue carry meaning.
5. **The user caused it, the sky responds.** Only a user action earns motion bigger than ambient, and it has a beginning, middle and end that start where the eye already is.
6. **Restraint.** No stats, no dates in a header, no app name. The only chrome is the bottom bar.
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

Sizes: star radius 3 (big 5), core 1 (big 2), max 48 stars on a sky, title ellipsis at 22 characters, past scale 0.32, bottom band without past anchors 15%, anchors at least 40 grains apart.

## 4. Brightness hierarchy

1. User stars and their glows (core 1.0).
2. The constellation (lines `0.11` per splat).
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

## 8. Don'ts

Smooth shapes over the sky; new colours; blinking; particles flying across the screen; more than one special event at once; header or stats chrome; labels on past weeks; reading the clock outside `sky/clock.js`.
