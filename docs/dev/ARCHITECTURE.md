# Architecture

Night Sky is a static ES-module app. The web app lives in `app/`; the Tauri shell in `desktop/` serves the same files. Rendering uses one grain framebuffer, with canvas text as the only off-grain layer.

## Commands

- `npm run dev` serves `app/` on `http://127.0.0.1:5173`.
- `npm test` runs the pure Node self-tests.
- `npm run shell` regenerates the service-worker shell and module preloads after any change under `app/`.
- `npm run verify` checks tests, imports, generated files, this module map, deterministic screenshots, and performance.

## Ownership and import direction

- Durable tasks, weeks, and preferences belong to the store. Session events belong to the timeline. Time belongs to the clock.
- Choreographies are pure functions of elapsed time and inputs. Rendering reads their results; it does not own state.
- Colours, dimensions, and timings come from tokens.
- Imports flow down these layers: tokens/math → framebuffer/clock → sky/model → choreo → timeline → render → UI → platform/dev → main.
- Generated sections in `app/sw.js` and `app/index.html` are written only by `npm run shell`.

## Module map

### Entry points and foundations

- `app/src/main.js` — boot, frame loop, resize, rollover, and wiring.
- `app/src/tokens.js` — colours, sizes, timings, and URL flags.
- `app/src/math.js` — deterministic helpers, easing, noise, and colour math.
- `app/src/framebuffer.js` — grain buffers, drawing primitives, and presentation.
- `app/src/platform.js` — browser/Tauri persistence and notifications.
- `app/src/stageprof.js` — development-only stage timings.

### Model and timelines

- `app/src/model/store.js` — durable data and task projections.
- `app/src/model/timeline.js` — in-memory events and undo.
- `app/src/model/parser.js` — deadlines, bar syntax, tags, and the "when?" answer.
- `app/src/model/thoughts.js` — thoughts, their haze slots, age, and when they are due to come back.
- `app/src/model/placement.js` — star and label placement.
- `app/src/model/steps.js` — step progress, rows, and orbit geometry.
- `app/src/model/week.js` — ISO-week membership and archives.
- `app/src/model/morning.js` — weekly-morning decisions and summaries.
- `app/src/model/quotes.js` — the 52 weekly lines.
- `app/src/choreo/expire.js` — deadline transition.
- `app/src/choreo/finish.js` — finish and constellation transition.
- `app/src/choreo/morning.js` — sunrise, hold, and sunset timeline.
- `app/src/choreo/step.js` — step transition and slot fill.
- `app/src/choreo/undo.js` — undo transition.
- `app/src/choreo/condense.js` — a said thought: haze pulls into a point and travels to its star.

### Sky and rendering

- `app/src/sky/clock.js` — wall and sky time, formatting, and ISO weeks.
- `app/src/sky/sky.js` — seeded palettes, layers, and sky crossfades.
- `app/src/sky/clouds.js` — cached cloud layers.
- `app/src/sky/components.js` — background star types.
- `app/src/sky/events.js` — aurora, comet, satellites, and meteors.
- `app/src/sky/moon.js` — real-phase moon.
- `app/src/sky/past.js` — distant archived constellations.
- `app/src/sky/day.js` — morning gradient and sun.
- `app/src/sky/land.js` — morning hills and grass.
- `app/src/sky/flora.js` — flowers and buds.
- `app/src/sky/life.js` — morning wind, pollen, dew, birds, and butterflies.
- `app/src/sky/valley.js` — ridges, river, trees, and mist.
- `app/src/render/compose.js` — frame composition.
- `app/src/render/text.js` — labels and hover text.
- `app/src/render/steps.js` — step orbit and list.
- `app/src/render/haze.js` — thoughts as haze: drift, breath, asked/hover, condense, let go.
- `app/src/render/morning.js` — morning scene and controls.

### Interaction and development

- `app/src/ui/bar.js` — input, commands, undo row, counter, and help panel.
- `app/src/ui/guide.js` — pure first-use and help copy selection.
- `app/src/ui/keys.js` — keyboard interaction.
- `app/src/ui/pointer.js` — mouse and touch interaction.
- `app/src/dev/hooks.js` — development hooks exposed as `window.ns`.
- `app/src/dev/selftest.js` — pure self-tests.

### Scripts

- `scripts/serve.mjs` — local static server.
- `scripts/gen-shell.mjs` — service-worker and preload generation.
- `scripts/test.mjs` — Node test entry point.
- `scripts/verify.mjs` — structural, visual, and performance verification.
- `scripts/cdp.mjs` — deterministic Edge screenshots and browser automation.
- `scripts/record.mjs` — renders the README clips and stills from the real app (frozen frames, one Edge, ffmpeg).
- `scripts/goldens.json` — screenshot hashes and performance budget.

## Frame order

The frame is composed in this order: sky and clouds; background components; past constellations; moon and events; constellation edges and star light; choreography; text backing; user-star sprites; presentation; canvas text and the bottom bar. User stars remain the brightest objects in the night scene.

See [the design system](../DESIGN.md) for visual rules and [testing](../TESTING.md) for manual scenarios.
