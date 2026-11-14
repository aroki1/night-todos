# Repo audit (2026-11-14, read only; nothing deleted)

Method: grep of importers across `app/src`, `app/index.html`, `app/sw.js` (a script lists every `export` and which other files mention the name); grep of `prototype|legacy|rune|docs/media` across the repo; manual check of `desktop/`, `.github/`.

## 1. Stale docs
- `README.md:14` says urgent = "under a quarter of its time left". Code (`model/store.js:75-77`, `tokens.js:75`): `life < .25` OR `< 1 h to deadline` OR behind pace (`isBehind`).
- `README.md:53` lists `ns.selfTest()` as the only test path. `npm test` now runs the same suite in Node.
- `README.md:58` says "Bump `VERSION` in `app/sw.js` for each release". Wrong: `VERSION` and `SHELL` are generated (`npm run shell`, `npm run check`; `sw.js:1`).
- `README.md:67,78` and `docs/specs/SPEC-v11.md:93-106` describe `legacy/` and `prototype/` as live history. They are, but see section 5.
- `docs/specs/SPEC.md` (whole file, 290 lines): Rune/Rust spec. Mentions `../rune-src`, rev pin, `rune-fx`, `web-build.sh`. Nothing in it describes the current app.
- `docs/dev/ADVISOR-P2.md` and `docs/dev/ASK-CLAUDE.md`: advisor-relay workflow (user relays questions to a senior model). Obsolete process.
- `docs/dev/ARCHITECTURE-NOTES.md:122`: parity against `prototype/v10.html`. Also written for the v11 port (builder Q&A), now history.
- `docs/dev/TERMINAL-NOTES.md:3`: runs `scripts/term-proto/view.mjs`, which does not exist (prototype code dropped, commit 6165800). `docs/specs/SPEC-term-proto.md` is the matching spec.
- `docs/specs/SPEC-v9.md:363` etc.: Edge command lines and paths for a prototype flow that is finished.

## 2. Dead code
Exports with no importer anywhere (other than their own file); names marked (decl) have no use even inside their own file:
- choreo: `create.js` `CREATE` (decl), `dimForCreate` (decl); `finish.js` `FINISH` (decl), `igT`, `ignA`, `ignK`; `step.js` `STAGE`, `UNDO_MS`, `endMs` (decl).
- `framebuffer.js` `getGeometryVersion` (decl). `math.js` `vn`. `sky/clock.js` `advanceT` (decl), `clockBase`, `weekProgress`, `weekSeed`, `moonTransitHour`, `moodUpdate`.
- `model/timeline.js` `undoDescriptor` (decl), `resetTimeline`, `makeFin`, `makeUnd`, `pushEvent`. `model/store.js` `STEPS_SCENE`, `sanitizeSteps`. `model/parser.js` `wdTok`, `monTok`, `timeTok`. `model/placement.js` `labelInfo`, `candAnchor`, `rectScore`. `model/steps.js` `isTouchLayout`.
- `render/compose.js` `animating`, `frozenForce`, `xf`, `drawEdges`, `drawHalos`, `drawSprite`. `render/text.js` `frameRect`.
- `sky/*`: `clouds` `cloudRows`, `cloudUpsample`; `components` `buildSprite`; `events` `showerOn`, `meteorList`, `auroraW`, `resetEvents`; `moon` `moonOK`, `moonClear`, `moonPick`, `resetMoon`; `past` `hoverInfo`; `sky` `skyW`.
- `tokens.js`: `FONT_URL` (decl), `FONT_URL_500` (decl), `BG_HEX` (decl), `Q`. `ui/bar.js` `ghostAlphaNow`, `fitText`, `barPlaceholder`; `ui/keys.js` `aliveByGx`; `ui/pointer.js` `hitRow`, `hitPanel`.
- Most of the non-(decl) ones are used inside their own file: the fix is dropping `export`, not deleting code. Only the (decl) ones are fully dead.
- Used only by `dev/hooks.js` or `dev/selftest.js` (keep): `pulseMs`, `dotPixel`, `glActive`, `glLose`, `wg`, `nextIdx`, `sanitize`, `mkSteps`, `taskWeekKey`, `nextWeekKey`, `ritualInfo`, `setClockBase`, `setClockISO`, `resetClockCache`, `cloudDebug`, `satNow`, `satTime`, `forceShower`, `setForceShower`, `cometHead`, `specialsNow`, `setMoonShow`, `skyFlags`, stageprof `enable/reset/summary/markCost`, `barParse`, `submitBar`.
- Dev scenes (`main.js:169-190`): `finish, urgent, overlap, undo, labels, occlusion, expire, steps, crossfade`. All reachable. No script in `scripts/` names a scene; they are used only from `docs/specs/*` and `docs/dev/PERF-PROFILE.md` and ad-hoc cdp calls. Keep.
- Flags used once or only in dev: `FLAGS.debug`, `FLAGS.reduced`, `FLAGS.steps`, `FLAGS.devSeed` (one reference each). `FLAGS.parity` (15 refs) exists only for `scripts/parity.mjs`.
- Unreferenced files: none in `app/`. `app/` fonts, icons: not checked in depth.

## 3. Duplicated logic
- Clamp: `math.js:3` `clamp01` vs `model/steps.js:27` `clampScroll` (general clamp). Winner: add a `clamp(v, lo, hi)` to `math.js`, use it in both.
- URL params: `main.js:177,206,210,217` re-run `new URLSearchParams(location.search)` although `tokens.js` exports `Q` and `FLAGS`. Winner: `Q` (so also `FLAGS` gets `weeks`, `ritual`, `select`, `live`, `stepfin`, `stepundo`, `sel`).
- Urgency: one rule, `isUrgent` in `model/store.js:75`. `main.js:124` (notifications) and render use it. No second copy found.
- Week keys: `isoWeekKey` in `sky/clock.js` is the only implementation (`main.js`, `week.js`, `hooks.js` all import it).

## 4. Implicit rules (not written anywhere else)
- Generated, never hand-edit: `app/sw.js` `VERSION` + `SHELL`, and the `<!-- gen:preload -->` block in `app/index.html`. Run `npm run shell`; `npm run check` fails when stale. Adding or removing a module in the shell needs a regen.
- `src/dev/*` is not in the SW shell and not preloaded. It loads on demand only when `FLAGS.dev` (`main.js:265`). The browser entry to the selftests is `ns.selfTest()` (`hooks.js:161`).
- `tokens.js` is imported by nearly everything, so it must load in Node and the browser. Guard globals there (`LOC`, `window`).
- Demo tasks exist only with `FLAGS.dev` (`store.js:14`). Freeze mode (`?dev=1&freeze=1`) never writes the real store and skips the ritual (`main.js:247`).
- Layering: `model/store.js` never imports sky, render, ui or choreo. `choreo/*` is pure (imports only math and tokens). Render writes only into the grain framebuffer; text is the only thing off-grain (`render/text.js`).
- State owners: durable data (tasks, weeks, prefs) = `model/store.js`; the session event log is memory only (`model/timeline.js`, not persisted); time = `sky/clock.js` (`T` sky time, `wall()` real time).
- Frozen vs live: `?freeze=1` composes and blits once and does not start RAF. Live path runs `clockTick`, `cloudsTick` (sliced), then compose.
- Edge cleanup: `scripts/cdp.mjs` owns teardown (`Browser.close`, `taskkill /T`, rm `ns-cdp-*`). Do not spawn Edge another way.
- `rune-src/` is a local, untracked, git-ignored Rune clone (not part of the repo).

## 5. Deletion candidates
Sizes are on disk; "tracked" = files in git.

| path | size / files | what depends on it | safe to delete? |
|---|---|---|---|
| `prototype/` | 13 MB, 137 tracked | `scripts/parity.mjs:1,33,42` (reads `v10.html`, writes `shots/v11/`); `README.md:66`; docs only: `SPEC-v9/v10/v11/steps.md`, `ARCHITECTURE-NOTES.md:122` | yes-after delete or retire `scripts/parity.mjs`, `FLAGS.parity` (`tokens.js:96` + 14 refs) and README:53,66 |
| `legacy/rune/` | 7 MB, 28 tracked (plus ignored `dist/`) | `README.md:67,78`; docs `SPEC-v11.md:20,94,106`. Nothing in `app/`, `desktop/` (`tauri.conf.json:7` -> `../app` only), `.github/workflows/pages.yml` | yes (git history keeps it); fix README:67,78 |
| `rune-src/` | 94 MB, 2009 files, untracked | `.gitignore:6`; `docs/specs/SPEC.md:23` text only | yes (local clone, no repo impact) |
| `scripts/parity.mjs` | 3 KB | `README.md:53`; `prototype/v10.html`; `FLAGS.parity` in `tokens.js`, `compose.js`, etc. | yes-after the `prototype/` decision |
| `docs/media/*` | 540 KB, 5 files | `README.md:5,7,8,9` | no (README images); only if README changes |
| `docs/specs/SPEC.md` | 290 lines | none in code; `SPEC-v11.md` mentions it | yes |
| `docs/dev/ADVISOR-P2.md`, `ASK-CLAUDE.md` | 29 + 37 lines | none (grep found no references in code or docs) | yes |
| `docs/dev/TERMINAL-NOTES.md`, `docs/specs/SPEC-term-proto.md` | 13 + 75 lines | `scripts/term-proto/` is gone; refs only to each other | yes |
| finished specs `SPEC-v9.md`, `SPEC-v10.md`, `SPEC-v11.md` | 412 + 306 + 304 lines | cited by `prototype/` workflow and `ARCHITECTURE-NOTES.md` only | yes-after `prototype/` decision (or keep v11 as architecture reference) |
| `SPEC-steps.md`, `SPEC-perf-boot.md`, `SPEC-perf-frame.md` | 162 + 76 + 79 lines | none in code; `PERF-PROFILE.md` covers perf results | yes if work is shipped (confirm) |
| `docs/dev/ARCHITECTURE-NOTES.md` | 133 lines | v11 port Q&A; `DESIGN.md` may duplicate | yes-after folding the ownership rules (section 4) into one doc |
| dead exports (section 2, (decl) items) | ~10 names | no importers | yes (`CREATE`, `dimForCreate`, `FINISH`, `endMs`, `getGeometryVersion`, `undoDescriptor`, `advanceT`, `FONT_URL*`, `BG_HEX`) |
| `.claude/handoffs/` | 2 files, untracked | none | yes |

`desktop/` and Tauri config: no references into `prototype/`, `legacy/`, `rune-src/` (only `frontendDist: ../app`). `.github/workflows/pages.yml` publishes `app/` only. `scripts/cdp.mjs` and `scripts/serve.mjs` reference no scenes or deleted dirs.

## 6. Draft module map
app/src
- `main.js` — boot, geometry, the frame loop, resize, week rollover, scene setup.
- `tokens.js` — all colours, sizes, timings, URL flags; imported by almost everything.
- `math.js` — pure helpers: hash, rng, noise, easing, tone curve, colour packing.
- `framebuffer.js` — the grain framebuffer, grid geometry, draw primitives, WebGL presenter.
- `platform.js` — web vs Tauri storage and notifications.
- `stageprof.js` — dev-only per-stage frame timer.
- `choreo/create.js` — pure timeline for a new star appearing.
- `choreo/expire.js` — pure timeline for a deadline passing.
- `choreo/finish.js` — pure timeline for the finishing moment.
- `choreo/ritual.js` — pure timeline for the Monday ritual.
- `choreo/step.js` — pure step-finish timeline plus slot fill rules.
- `choreo/undo.js` — pure timeline for undoing a finish.
- `dev/hooks.js` — `window.ns` test hooks, installed only in dev.
- `dev/selftest.js` — the 136 selftests (parser, week, store, steps, choreo).
- `model/parser.js` — deadline text parser and bar splitting (title, deadline, steps).
- `model/placement.js` — label placement, hover focus, placement of a new star.
- `model/steps.js` — step counts, list rows, orbit geometry, drag rules.
- `model/store.js` — durable tasks/weeks/prefs, star list, `isUrgent`, sanitize.
- `model/timeline.js` — session event log: finish, undo, create, import, step ops.
- `model/week.js` — week membership, archive and ritual decision rules.
- `render/compose.js` — `prepare()` reads the model, `compose()` writes the whole frame.
- `render/ritual.js` — draws the Monday ritual from the choreo timeline.
- `render/steps.js` — draws the orbit of steps around a star.
- `render/text.js` — labels, hover frame, return arrow, past-week hover line.
- `sky/clock.js` — sky time, wall clock, mood, moon phase, ISO weeks.
- `sky/clouds.js` — half-res fbm clouds, keyframed layers, sliced upsample.
- `sky/components.js` — background star types: clusters, binaries, giants, variable.
- `sky/events.js` — satellites, meteor showers, aurora, comet.
- `sky/moon.js` — real-phase moon, rise/set window, placement.
- `sky/past.js` — archived weeks drawn as distant constellations.
- `sky/sky.js` — palettes, seeded sky, star layers, crossfade base.
- `ui/bar.js` — bottom bar, hidden input, undo row, counter.
- `ui/keys.js` — keyboard handling: write, Tab, Enter, undo.
- `ui/pointer.js` — mouse and touch: select, second tap finishes, hit tests.

scripts
- `cdp.mjs` — headless Edge QA driver (screenshots, typing, eval); tears Edge down on exit.
- `gen-shell.mjs` — regenerates SW shell/version and modulepreload block; `--check` verifies.
- `parity.mjs` — pixel diff of `app/` against `prototype/v10.html`.
- `serve.mjs` — zero-dependency static dev server on 127.0.0.1.
- `test.mjs` — runs `dev/selftest.js` under Node; prints `pass/total`, non-zero on failure.
