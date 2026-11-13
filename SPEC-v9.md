# Night Sky v9: stabilize and the finishing moment

Prototype iteration. Build `prototype/v9.html` from the approved `prototype/v8.html`.

This file is the whole brief, so read all of it before you write any code. The parts on why and on
taste matter as much as the numbers. When the spec doesn't cover a case, decide it the way these
principles say.

---

## 0. Why this iteration exists

Night Sky is a todo app. Every task is a star on a night sky. A star loses its arms as its deadline
gets closer. When a task is finished, the star turns cold blue-white and joins this week's
constellation. The user is a student who lives by deadlines. The app makes self-set deadlines
visible and real.

v8 is approved for its look and its system. The user rates it about 70/100, and this iteration takes
it toward 85. It does that two ways:
- **Stabilize:** fix every bug, glitch and inconsistency below.
- **Make finishing a task feel earned:** a choreographed moment, not a state flip.

The user's own complaint, which started this iteration: when a new connection appears, the light
starts "at the middle of the connection, not from the star". Small things like that are exactly what
separates 70 from 100. Treat every detail that way.

## 1. Taste principles (apply to every decision)

1. **One system.** The whole scene is one grain framebuffer. Each grain is a 2×2 dot with a 1-device-
   pixel-dark gap, on a 3px pitch at 1× scale. Sky, clouds, stars, glows, lines, ripples, meteors and
   sprites are all values written into grains.
   - Never draw a smooth canvas shape (arc, stroke, gradient) over the sky. The only things outside
     the framebuffer are text and the 1px hover frame.
   - If you're about to reach for `ctx.arc` or `ctx.stroke` in the sky, stop. Write light into
     grains instead.
2. **Calm by default, alive on close look.** The sky never asks for attention. Nothing blinks, jumps,
   or moves fast unless the user just did something. Motion is slow, smooth, continuous and wraps
   seamlessly.
3. **Smooth motion inside the grid.** Anything that moves splats its light across neighbouring grains
   by its fractional position, using the existing `splat()`. It never snaps grain to grain. A moving
   light must glide.
4. **Light, not decoration.** Brightness means something:
   - warm ivory = alive;
   - amber = urgent;
   - cold blue-white = done;
   - ash = missed.

   Don't add new colours. Only the palettes and tokens below are allowed.
5. **The user caused it → the sky responds.** Only a user action (finish, undo, hover) earns
   motion bigger than ambient. When it happens, it has a clear beginning, a middle and an end, and
   every part starts exactly where the eye already is.
6. **Restraint.** No extra text, no stats, no dates in the header, no app name. The only chrome is the
   bottom bar.
7. **Determinism.** Given a seed and a time, a frame is fully determined. This is required for
   testing (§9) and for the later Rust port.

## 2. Ground truth: what to keep from v8

Copy `prototype/v8.html` to `prototype/v9.html` and evolve it. Keep these exactly unless a section
below changes them:
- the five sky palettes;
- `makeSky` (gradient, vignette, horizon airglow, three parallax star layers with drift speeds .73 /
  1.67 / 3 grains/s);
- the clouds (formula, 4-frame update, half-res plus bilinear upsample);
- meteors;
- the star sprites (`sprite()`, sizes R=3 small, R=5 big);
- dying through arm shrink;
- urgent amber breathing via fbm (no embers);
- the missed ash grain;
- the tone curve `tone()`;
- the colour table `C`;
- the bottom bar layout (prompt `›`, blinking block cursor, placeholder, `n / m` counter with grain
  pips, `↻ sky` demo button).

Data: keep the same 7 demo stars, positions and states as v8.

## 3. Fixes (section 1 of the plan)

### 3.1 Grow-only constellation (replaces MST)

v8 recomputes a minimum spanning tree every frame. When a star is finished, existing lines can vanish
and re-wire. That's wrong. The constellation is a **history** of the week, and it only grows.

- Each star gets `link: index | null`.
- When star S is finished: `S.link` = the nearest star (Euclidean, in grains) that is already done at
  that moment, excluding S. If there is none, `S.link = null`, and S is the first star of the week.
- Edges are exactly `{ (S, S.link) | S.done && S.link != null }`. Never recompute old links.
- Initial demo data: the three pre-done stars get links computed in this order:
  1. `hm weekly report` (first, `link = null`);
  2. `dp · knapsack + lis`, which links to hm weekly report;
  3. `read ch. 7 · os`, which links to its nearest done star at that moment.

  Store these. Don't recompute them on load.
- Edge direction for animation: the line always travels **from `S.link` (old) to S (new)**.

### 3.2 Lines never break for labels; labels move instead

v8 cut gaps into lines under labels, so lines looked broken. Replace it with this:

**a) Text cells get a backing.** Every grain under a label's text rectangle has its final light
multiplied by 0.28 before blit, a terminal-style "cell background". A line passing under a label
dims but stays continuous. Apply it after all light is composed and before sprites, so sprites are
never dimmed.
- Backing rect: the text's bounding box plus 1 grain of padding on each side.
- Feather the edge: the outermost grain ring uses ×0.55, not ×0.28.

**b) Label placement avoids collisions.** For each star, choose the label anchor from these candidates,
in preference order:
1. right of the star, vertically centred on the star row;
2. left of the star, right-aligned to `star.gx − R − 3` grains;
3. above-right: the label's last line ends 2 grains above the top arm tip;
4. below-right: the label's first line starts 2 grains below the bottom arm tip.

Score each candidate:
- +100 per grain of overlap with the screen edge (the sky area is `0..GW`, `0..SH−2`);
- +40 per grain of overlap with another star's sprite bounding box plus 1 margin;
- +25 per grain of overlap with another label's rect (labels already placed, processed in a stable
  order: by gy, then gx);
- +1 per line sample (every 0.5 grain along each edge) that falls inside the rect;
- +3 × candidate index (preference).

Pick the minimum score.

**Hysteresis:** keep the previous frame's choice unless the new best is at least 20 lower. Labels
must never flicker between positions.

**c)** A missed star's label (shown only on hover) uses the same placement.

### 3.3 Lines avoid passing through other stars

When an edge's segment passes within `R+1` grains of a third star's centre, don't draw line grains
inside that star's sprite bounding box plus 1. Line light there is skipped; the glow is kept but
×0.3. The line reads as passing behind the star. This is the one allowed gap, and it is a physical
occlusion, not a glitch.

### 3.4 Lines start and end exactly at the star edge

The line core starts at `R(f) + 1.0` grains from the source centre and ends at `R(t) + 1.0` from the
target centre (v8 used 1.2 plus a sampling offset, which left a visible notch).
- Sample the core every 0.25 grain, not 0.34.
- Splat weight 0.11 (lower, to compensate for the denser sampling). The perceived brightness should
  match v8.
- The first and last 1.5 grains of the core fade in and out linearly, so the line emerges from the
  star's light instead of starting with a hard dot.

### 3.5 Text on the grid

- Switch the font to **IBM Plex Mono** (Google Fonts, weights 400 and 500), 12px. It matches the Rune
  app's font.
- All text positions are integer multiples of the grain pitch (3px at 1×):
  - x origin of a label = `(anchor gx) × 3`;
  - text rows are 6 grains (18px) tall;
  - row 1 centre = star row centre `gy × 3 + 1`;
  - row 2 centre = row 1 + 18px.
- Text tones: title uses `ink2` (`#b6af9a`); on hover or selection it uses `ink` (`#f1ead6`) at weight
  500. Secondary line uses `dim` (`#575b66`), or `warn` (`#eda55a`) when urgent. Done titles use
  `#9db1f0`. No other text colours.
- The bottom bar's text baseline also snaps to the grid.

### 3.6 Device pixel ratio (Windows 125% and 150%)

v8 rounds DPR and scales a 1× framebuffer, which makes dots uneven at fractional DPR.
- Let `dpr = window.devicePixelRatio`.
- Grain pitch in device px: `P = max(3, round(3 × dpr))`.
- Dot size: `D = P − max(1, round(dpr))`.
- Build the ImageData at device resolution: `GW × P` by `SH × P`, writing D×D dots per grain.
- Draw it 1:1 with no scaling: set the canvas backing size from P, and the CSS size to
  `backing / dpr`.
- Text is drawn with `ctx.setTransform(P/3, 0, 0, P/3, 0, 0)`, so CSS-px coordinates still map
  exactly onto the grain grid.

Verify at dpr 1, 1.25, 1.5 and 2 (§9). Every dot must be exactly D×D, with no 1px variance.

### 3.7 Performance and lifecycle

- **Frame budget:**
  - ambient (nothing user-triggered animating): compose and blit at 30 fps by skipping every other
    rAF;
  - while any choreography, hover transition or sky crossfade is active: 60 fps.
- Pause the loop on `document.visibilitychange` to hidden, and resume on visible without a time jump.
  T is accumulated from real dt, capped at 50ms per frame.
- **Hot loops:** no array allocation per grain, no `forEach` in per-grain loops. Use plain `for` loops,
  and hoist label rects and star lists out of loops.
- **Target:** compose plus blit ≤ 8 ms per frame at 1× on a typical laptop. Add a `?debug=1` overlay
  that prints the ms per frame in the top-left, in dim text.

### 3.8 Sky crossfade

`↻ sky` must not cut. It crossfades over 900 ms with ease-in-out:
1. Snapshot the old composed sky base (gradient + clouds + bg stars, not sprites or glows).
2. Render the new one.
3. Blend `old·(1−k) + new·k`.

Clouds of the new sky start computing immediately.

## 4. The finishing moment (section 2 of the plan)

This is the heart of the iteration. Clicking an alive star, or pressing Enter on a selected one,
starts a choreography. All times are in ms from the click, and every element is a **pure function of
elapsed time**: `state(t)`, so it is scrubbable and testable (§9).

Curves:
- `easeOut = 1−(1−p)³`
- `easeInOut = p<.5 ? 4p³ : 1−(−2p+2)³/2`
- `easeIn = p³`

### 4.1 Timeline

| t (ms) | Beat | What happens |
|---|---|---|
| 0–110 | **Anticipation** | The star contracts: visible arm length −1 grain (min core), halo peak ×0.65, core grain → pure `core` white at full alpha. easeOut. This beat is what makes the moment feel physical, so don't skip it. |
| 110–480 | **Ignition** | Arms extend outward one grain per 45 ms (Chebyshev distance 1 → R). Each grain, when it appears, transitions colour warm → white → cold over 260 ms (`ink` → `core` at 40% → `done` at 100%). Glints (big stars) appear last, at the end of this beat, fading in over 150 ms. Wide halo crossfades warm → cold, peak .08..0.20 → .26, over 110–600 ms. |
| 120–900 | **Ring** | One ring of light: radius 3 → 28 grains, easeOut over 780 ms. Profile `exp(−d²/0.45)`, brightness `0.5·(1−p)^1.3`, per-grain sparkle `0.6+0.4·hash(i,j)`. Colour `done`. |
| 120–900 | **Sky responds** | Background star grains within ±2.5 grains of the ring front get +0.22 brightness (additive, colour = their own tint) that decays over 350 ms after the front passes. The sky noticing you. Subtle: if you see it at first glance it's too strong. |
| 120–750 | **Core flash** | White halo at the centre: σ 1.5→5, radius 4→14, peak 0.55 at 160 ms → 0 at 750 ms. easeOut decay. |
| 450 → | **Connection** (only if `link != null`) | See §4.2. |
| 300–700 | **Label** | Title colour crossfades `ink2` → `#9db1f0` over 400 ms. The second line (time left) erases right-to-left, one character per 28 ms, starting at 300 ms. When empty, the label's backing rect shrinks to one row over 150 ms (grain-stepped). |
| arrival (or 650 if no link) | **Counter** | The next pip goes `#2a2d35` → `core` white (80 ms) → `done` (200 ms). The number updates at the same instant. |

There is no camera shake, no screen flash and no particles flying across the screen. Everything stays
local to the star, its line and its pip.

### 4.2 The connection: light travels from the constellation to the new star

The constellation claims the new star. The light must visibly **leave the old star** and **arrive at
the new one**. This fixes the user's bug.

Let `A = S.link` (source, old) and `B = S` (target, new). Let `len` be the distance in grains, and
`dir` the unit vector A→B.

1. **Charge (450–700 ms):** a bead of light forms **at A's edge**, at point `A + dir·(R(A)+1.0)`. Its
   halo grows: peak 0 → 0.55, σ 1.5, radius 5, easeIn. At the same time, A's own core brightens
   +0.15 and returns, so the source visibly "decides". The eye goes to A first.
2. **Travel (700 ms → 700+D):** `D = clamp(len × 11 ms, 520, 1200)`.
   - The bead moves from A's edge point to B's edge point `B − dir·(R(B)+1.0)` with **easeInOut**.
     It starts slow, so the eye catches it leaving.
   - The line core exists only **behind** the bead: from A's edge to the bead's current position.
     It's drawn with the §3.4 rules, at 1.6× brightness right behind the bead, decaying to normal over
     the trailing 10 grains.
   - The bead has a tail: 7 splats behind it at 0.6-grain spacing, brightness `0.5·(1−k/7)`.
   - The wide line glow follows the same rule, existing only behind the bead.
3. **Arrival (700+D → 700+D+380):**
   - B's halo gets +0.3 cold, decaying over 380 ms.
   - A mini ring: radius 2 → 9 grains, brightness 0.35, 300 ms.
   - The bead dissolves into B: peak 0.55 → 0 over 120 ms.
4. **After:** the line is permanent. The ambient pulse (v8's travelling light every ~6 s) resumes for
   this edge only after arrival plus 1.5 s.

Total length for a typical connection is about 1.5–2.0 s. It must never look like the line "appears";
it must look like light travelled.

### 4.3 Multiple finishes

Each star has its own timeline, so several can overlap. If star C finishes while B's connection is
still travelling and C's nearest done star is B, then C links to B. C's charge waits until B's arrival
time, so C's light leaves B only after B has received its light. Causality must read correctly.

### 4.4 Reduced motion

If `prefers-reduced-motion: reduce`, or `?reduced=1`:
- no anticipation, ring, sky response or bead travel;
- the star crossfades warm → cold over 250 ms;
- the line fades in fully over 300 ms;
- the label changes instantly.

### 4.5 Undo (5 seconds)

After a finish, the bottom bar's placeholder area shows:

`finished · hm one-pager    undo  z`

- `finished ·` in `dim`, the title in `ink2`, `undo` in `ink2`, `z` in `dim`. The title is truncated
  with `…` to 28 characters.
- Under it, a 1-grain-tall row of grains (the same width as the text) drains right to left over 5 s.
  This is the timer, and there is no countdown text.
- `z`, `ctrl+z`, or clicking `undo` reverses it. The reverse choreography is 700 ms total:
  - the bead retracts from B to A along the line, and the line core disappears behind it (easeInOut,
    450 ms);
  - B's colour goes cold → warm (300 ms, starting at 200 ms);
  - arms shrink back to the life-based length (one grain per 40 ms from the outside);
  - the title colour goes back;
  - the time-left text retypes left-to-right, one character per 20 ms;
  - the counter pip un-fills.
- The data is reverted: `done` false, `doneAt` cleared, `link` null.
- A new finish replaces the undo target, so only the latest finish is undoable. After 5 s the undo
  row fades out over 300 ms and the placeholder returns.

### 4.6 Hover

- **Alive star, hover in (150 ms easeOut):**
  - the arms preview one more grain than the current life length, at 0.45 alpha, capped at full;
  - halo peak ×1.15;
  - the label gets the 1px frame (CSS px, aligned to the grain grid, colour `dim`);
  - the title goes `ink`, weight 500;
  - the second line becomes the full deadline: `fri 20 nov 23:59 · 6d 02h`;
  - a `⏎` hint sits 2 grains right of the frame, in `dim`.
- **Hover out:** 200 ms reverse.
- **Done star:** no arm preview. The second line shows `done · thu 12 nov 21:10` in `dim` (make up
  plausible demo timestamps). No frame and no ⏎.
- **Missed star:** the label appears (fade 150 ms): title `dim`, second line `missed · wed 11 nov`.
- Hit area: the sprite bounding box plus 2 grains, plus the label rect. The cursor is `pointer` over
  a hit and `default` elsewhere. Drop v8's crosshair; it's noisy.
- **Keyboard:**
  - Tab and Shift+Tab cycle alive stars (left to right by gx);
  - selection looks the same as hover;
  - Enter finishes;
  - Esc clears the selection;
  - `z` undoes.

## 5. Things that must not change

- The no-embers rule: urgent stars only breathe amber.
- The ambient sky motion speeds and look. The user loves them, so don't "improve" them in this
  iteration.
- There are no new UI elements beyond the undo row and the hover details.

## 6. Out of scope (do not build)

Adding stars or ghost previews, live parsing, the moon, time of day, new background star types,
satellites, comets, aurora, past-weeks sky, the Monday ritual, the Rune port, sound and settings.

## 7. Code structure inside v9.html

Use a single file, no build step, no libraries except Google Fonts. Organise it into clearly
commented sections, in this order:
1. constants and tokens;
2. math and noise;
3. framebuffer (`add`, `over`, `splat`, `halo`, `dimRect`);
4. sky;
5. model (stars, links);
6. layout (label placement);
7. choreography (pure `finishState(star, tMs)`, `undoState`);
8. compose (one function that writes the whole frame);
9. blit;
10. text and bar;
11. input;
12. loop;
13. test hooks.

Choreography functions must be pure: they take elapsed ms and return numbers. No mutation inside
them. This is the shape the Rust port will copy.

## 8. Test hooks (required)

Expose `window.ns`:
- `ns.setSeed(n)`
- `ns.freeze(tSeconds)`: stops the loop at absolute time T and renders that frame.
- `ns.finish(name, atT)`: schedules a finish at sky time `atT`.
- `ns.undo(atT)`
- `ns.hover(name|null)`
- `ns.render()`: composes and blits once.
- `ns.stats()`: returns `{ms, grains, dpr, P, D}`.

**URL params** (applied on load): `seed`, `t`, `freeze=1`, `reduced=1`, `debug=1`, and a scene shortcut
`scene=finish&star=patterns%20quiz%20prep&at=850`. That one means: finish that star at T=2.0 s, then
freeze at T = 2.0 + 0.850 s.

## 9. Verification (do all of it, look at every image)

Use headless Edge screenshots, which worked in this environment before:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1240,700 --force-device-scale-factor=1 --screenshot=OUT.png "file:///.../prototype/v9.html?seed=7&t=12&freeze=1&..."
```

(Find the actual msedge path first. Add `--virtual-time-budget=4000` if fonts haven't loaded.)

Save to `prototype/shots/v9/` and **open each PNG with Read and judge it against §1** before moving on.

Required shots:
1. `00-ambient.png`: seed 7, t 12, nothing active.
2. `01-finish-0060.png`, `02-0300.png`, `03-0600.png`, `04-0900.png`, `05-1200.png`, `06-1600.png`,
   `07-2600.png`: the patterns quiz prep finish at those ms. You must see:
   - the contraction at 60;
   - arms igniting and the ring at 300;
   - the bead charging **at the edge of its link star** at 600;
   - the bead mid-travel with the line only behind it at 1200;
   - arrival at 1600–2600;
   - the final settled state.
3. `08-finish-urgent-1200.png`: the urgent os linux hw 3 finishing.
4. `09-overlap.png`: finish two stars 300 ms apart and freeze while both are travelling. Causality
   per §4.3.
5. `10-undo-0350.png` and `11-undo-1000.png`: undo mid-way and settled.
6. `12-hover-alive.png`, `13-hover-done.png`, `14-hover-missed.png`.
7. `15-labels.png`: a scene where labels must flip. Temporarily move a star near the right edge and
   another near a line, using a `scene=labels` that sets those positions.
8. `16-dpr125.png` and `17-dpr150.png`: `--force-device-scale-factor=1.25` and `1.5`. Zoom in with
   Read and confirm the dots are uniform.
9. `18-reduced-1200.png`.
10. `19-crossfade.png`: mid crossfade.

Also run the page live in the browser pane (or headful Edge) for 30 s with `?debug=1` and record the
ms/frame. Report it.

**Self-review checklist.** Answer each one honestly in the report:
- Does any light ever appear before its cause?
- Does any line have a notch, a gap (other than §3.3 occlusion), or a hard first dot?
- Does any label overlap a star, another label, or the edge?
- Does anything snap grain to grain while moving?
- Is the sky response visible only if you look for it?
- Does undo exactly restore the previous frame's look? Compare `00` with a frame after finish + undo
  + 2 s, at the same t.

## 10. Report back (concise)

1. What was built, and every deviation from this spec with the reason.
2. The checklist answers.
3. ms/frame at 1× and 2×.
4. The list of screenshots.
5. Anything you think looks wrong but didn't fix.

Do not commit to git. Do not touch `src/` or the Rust app. Work only in `prototype/`.
