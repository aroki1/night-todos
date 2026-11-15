# Rendering: how a frame is drawn

For anyone who opens `app/src/sky` or `app/src/render` for the first time. Read [ARCHITECTURE.md](ARCHITECTURE.md) for the module map and layer rules, and [DESIGN.md](../DESIGN.md) for the look.

## 1. Grains, not pixels

The whole picture is a grid of **grains**: dots on a pitch of 3 CSS pixels with a gap between them. The grid is `GW x SH` grains for the sky, plus a few rows for the bar. A phone gets fewer grains, never smaller ones (a 412 px wide phone has about 135 x 276, a 1917 px desktop window about 639 x 291).

Light lives in three `Float32Array`s, one per channel: `BR`, `BG`, `BB` (`framebuffer.js`). The grain at column `i`, row `j` is index `i + j * GW`. Values are **light, not paint**: they add up and may go above 1 (a bright star on a glowing cloud). Only at the very end a tone curve (`tone` in `math.js`, a 4096-entry table `TONE`) maps light to 0..255. That is why the app can have soft glows and hot cores without clipping, and why it does not draw with a canvas API (an 8-bit canvas would clip the light at every step).

Two ways to put light into a grain:

| | What it means | Use it for |
|---|---|---|
| `add(i, j, colour, w)` | light adds to what is there | stars, halos, sparkles, anything that glows |
| `over(i, j, colour, a)` | paint covers what is there by `a` | land, trees, flowers, panels, shadows |

`splat(fx, fy, colour, w)` adds light at a fractional position, spread over the 4 nearest grains, so a moving light glides instead of jumping from grain to grain. `halo` and `ring` are round glows built from `add`.

## 2. One frame of the night

`render/compose.js` writes the whole frame, back to front, every time. A frame is a pure function of the sky time `T` (`sky/clock.js`), so any moment can be redrawn exactly (tests and the README clips rely on this).

1. **Sky base**: the sky gradient and the background star layers (`sky/sky.js`). Mostly cached: the stars are drawn once into their own buffers and copied each frame; a new week crossfades from the old base.
2. **Clouds** (`sky/clouds.js`): a noise field at half resolution, upsampled and added to the gradient. On the GPU when available (section 4).
3. **Past weeks** as faint constellations, the **moon**, **aurora**, **comet, satellites, meteors**.
4. **Thoughts** as haze along the bottom (`render/haze.js`).
5. **Constellation lines** and **halos**, then each **task star** (`drawSprite`), its **steps** orbit and the open step list.
6. During the weekly morning, the morning scene is mixed in per grain (`render/morning.js` `blendMorning`).
7. **Present** (`framebuffer.js` `blit`): the WebGL2 path uploads `BR/BG/BB` as float textures and the shader tone-maps and draws the dots and gaps; WebGL1 and a plain 2D canvas are fallbacks.
8. **Text** (labels, the bar) is drawn on a canvas over the grains: the only thing that is not grains (`render/text.js`).

The morning (`render/morning.js` `layers`) is the same idea with its own layers: glow, sky, sun, day clouds, land (ridges, tree line, river, hills, grass), flowers. Its land is drawn once into cached layers and revealed grain by grain, in a fixed per-grain order, so the sunrise "grows" the valley dot by dot.

## 3. The drawing API (`draw.js`, in progress)

Today most drawing functions write their own loops over grains: about 250 of them across `sky/` and `render/`, and about 100 direct writes to `BR/BG/BB`. That mixes three things in one place: **what** is drawn, **how** a shape becomes grains, and **how to make it fast**. A reader has to decode all three to see the first.

The plan is a small API over the grain grid, in the spirit of a fantasy console (PICO-8 has `circfill`, `line`, `spr`): scene code says what it draws, the API owns the loops and every speed trick. The operations come from what the existing loops actually do:

| Operation | Draws | Examples today |
|---|---|---|
| `shade(area, fn)` | a **field**: every grain in an area gets a value from a formula | sun halo, glow, mist, sky gradient |
| `fillBelow(heights, paint)` | **relief**: a filled outline, column by column | ridges, hills, tree line, ground |
| `stroke(points, paint)` | **lines** along a path | stems, constellation lines, river banks |
| `stamp(shape, x, y, paint)` | **small shapes** at a point | stars, flower heads, birds |
| `scatter(particles, paint)` | **many small lights** that move | pollen, snow, dew, meteors |
| `reveal(order, progress, layer)` | **appear or dissolve grain by grain** | the morning land, archived practices |

Each takes a blend mode, `ADD` (light) or `OVER` (paint). Rules for scene code once a module is moved to the API: no loops over grains, no direct `BR[...]` writes, no shared scratch objects to pass parameters; the speed tricks (caches, row passes, precomputed values) live inside the API.

It lives in `app/src/draw.js`, next to `framebuffer.js` (layer 1). Modules move to it one at a time and every move must leave the golden screenshots identical (section 5). **Built so far** (the rest of the table is still planned): `sky/valley.js` is the first module on it, `sky/flora.js` the second.

- Modes: `ADD` (`B += c * a`), `OVER` (`B += (c - B) * a`, a clamped to 1: the arithmetic of `over()`), `SET` (`B = c`; `a` only means "draw this grain", and `OVER` with `a = 1` is not bit-identical).
- `shade(area, fn, mode = OVER, colour)`: a field. `fn(i, j, out)` writes the colour into `out` and returns alpha (<= 0 skips). `area` is a rectangle `{x0, y0, x1, y1}` or row spans `{y0, y1, x0: j => .., x1: j => ..}` (end columns exclusive).
- `fillBelow(top, bottom, fn, mode = OVER, lead = 0)`: relief. Per column, from `top[i]` down to `bottom` (a number or per column, exclusive); `fn(i, j, depth, out)`; `lead` grains above the outline are offered too (soft edge).
- `shadeLayers(area, fn)`: a field with several layers per grain. `fn(i, j, paint)` calls `paint(colour, alpha, mode = OVER)` as often as it likes; the layers land on that grain in call order. One description per grain (the river: water, ice, wet edge, grass tip) instead of one pass per layer. The colour is passed in, not written to `out`.
- `points(list, fn, mode = OVER, colour)`: single grains `{i, j}`; `fn(item, out)`, or without `fn` the item's own `c` and `a`.
- `out` is one scratch array inside `draw.js`; `colour` presets it once for a constant colour.

## Readable first, fast where measured

- Code is readable by default. Nothing is optimised without a measurement.
- A **hot path** is code that runs every frame over many grains (today: the sky base, clouds, the per-frame morning reveal, task stars). Code that runs once or is cached (scene build, the morning land layers, the valley) is never optimised at the cost of reading.
- The judge is the frame budget (`scripts/goldens.json`, 7.5 ms desktop) and the per-stage timer (`?prof=1`, `ns.profRun`): if the readable version stays inside the budget with margin, it stays.
- A speed trick that is needed lives inside `draw.js` or a named kernel, with a comment that cites the measurement. Scene code stays plain.

## 4. Fields on the GPU

Measured: on a desktop night frame, clouds and the sky base were about 70% of the time, task stars and lines about 10%. Fields (a formula per grain) are what a GPU does best, so they run as shaders where possible; objects stay in JavaScript, next to the task data they depend on.

The first one is the **cloud field** (`sky/cloudsgl.js`). How it works:
- It uses the one WebGL2 context of `framebuffer.js` (never a second canvas) and restores every GL state it touches.
- The noise hash stays on the CPU in 64-bit doubles: the CPU fills small tables of lattice values and the shader only interpolates them. A GPU `sin` would give different values and therefore different cloud shapes.
- The shader never sees absolute coordinates (they grow with time); the CPU passes the table origin and a small offset, so the clouds stay exact after the app has been open for days.
- The result comes back to the CPU (asynchronously while live, at once for still frames), because everything after the clouds is drawn on top of it on the CPU.
- No WebGL2, no float render target, or a lost context: the CPU path draws the same clouds. `?gpuclouds=0` forces it.

The GPU and CPU paths differ by rounding only: at most 1 brightness level out of 255 on a few grains. Clouds went from about 3.2 ms to 0.9 ms on a desktop.

## 5. How to check a change

- `npm run verify` compares 46 screenshots, by SHA-256 hash, with `scripts/goldens.json`, and checks the median CPU frame (`?prof=1`, `ns.profRun({frames:300})`) against the budget. A pure refactor must keep every hash.
- A hash changes even when one grain moves by one level. When that is expected (a deliberate look change, or GPU rounding), compare the images grain by grain first, then run `npm run verify -- --update-goldens` and say so in the commit.
- Per-stage timings: open `?dev=1&prof=1`, run `ns.profRun({frames:300})` in the console; each stage (`clouds`, `base.layer0`, `edges`, `blit.paint`, ...) has its median and p95. Phone-like numbers: the same in headless Edge with CPU throttling x4 (`cpu: 4` in a `scripts/cdp.mjs` job).
- `npm run format` lays the code out; verify fails if it is not formatted.
