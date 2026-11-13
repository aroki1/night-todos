# Night Sky v11: from prototype to product (web + desktop)

Take the finished `prototype/v10.html` and turn it into the real product:
- a modular static web app (an installable PWA);
- the same app as a Tauri 2 desktop app (the shell already exists in `desktop/`, serving `app/`);
- real saving, real weeks, past weeks becoming the sky, and the Monday ritual;
- `DESIGN.md`, a `README.md`, and an organized repo that's ready to deploy.

The taste principles in `SPEC-v9.md` §1 and `SPEC-v10.md` §1 still rule every decision. **Nothing
visual from v10 may regress.** The ported app, at the same seed, clock and state, must render
pixel-identically to v10 (§9 checks this).

## P0. Current state and carry-over fixes from the v10 review

**State**
- `prototype/v10.html` is approved, and its shots are in `prototype/shots/v10/`.
- `desktop/` is a working Tauri 2 shell (plugins: store, notification) with frontendDist `../app`.
- `app/index.html` is currently a placeholder; replace it.
- Cargo output goes to `C:/nstarget`, because the root `.cargo/config.toml` sets it. When you move
  the Rune app to `legacy/rune/`, its `.cargo/` moves with it, so give `desktop/` its own
  `.cargo/config.toml` with `target-dir = "C:/nstarget"` to keep the warm cache. The first rebuild
  takes about 1 minute, about 7 if the cache is cold.
- `npm run desktop:build` already works from the root.

**Fix these while porting.** These are the only intended visual differences from v10. Do the parity
check (§9) with these fixes off, by a `?dev=1&v10parity=1` flag.
1. **The moon is up almost always**, which breaks "at most one special at once". Add a real
   moonrise/moonset window: approximate the moon's transit as 0.84 h later per day of age (it rises
   about at sunset at full moon, about at noon at first quarter, and so on), so the moon is visible
   for about a 12 h window centred on its transit. Outside the window, draw no moon. Inside it, fade
   for 20 minutes at the edges. Then re-run the 20-sample count: at most 3 of 20 may have 2 or more
   specials.
2. **The comet and the missed star are too faint.**
   - Comet head: splat 0.55.
   - Tail: brightness `0.32·(1−s/len)^1.3`.
   - It must be findable within 5 seconds of looking. It must still be dimmer than the moon.
   - Missed star: centre ash alpha 1, plus 4 neighbours at 0.5, plus ash halo peak 0.06.
3. **2× performance** is 10.5 ms; the target is ≤ 9 ms at 2×.
   - Cache the aurora at 4 Hz.
   - Skip compose of unchanged sky regions only if trivial.
   - Otherwise reduce cloud refresh to every 6 frames at dpr ≥ 2.
4. **Expire text overlap:** the `<1m` → `missed` swap must be a sequential fade-out-then-in over
   2×100 ms, not a crossfade.
5. **Moon avoidance** must also avoid edge lines (6 grains).
6. **Demo-mode satellite overlap:** in demo, cap concurrent satellites at 1.

Work in phases P1→P6, in order. Commit locally after each phase (git is already initialised; don't
push, and don't add remotes).

---

## P1. Reorganize the repo

Target layout:

```
night-sky/
  app/                      ← the product (static, no bundler, ES modules)
    index.html
    manifest.webmanifest
    sw.js
    icons/                  (192, 512, maskable-512, apple-touch-180, favicon.svg)
    src/
      main.js               boot, loop, resize, visibility
      tokens.js             every colour, size, timing, curve. The single source of truth.
      math.js               hash, rng, noise, fbm, easing
      framebuffer.js        grain buffer + add/over/splat/halo/dimRect + blit (DPR-exact)
      sky/sky.js            palettes, makeSky, layers, crossfade
      sky/clouds.js
      sky/components.js     clusters, binaries, giants, variable, diffraction
      sky/moon.js
      sky/events.js         meteors, showers, satellites, aurora, comet
      sky/clock.js          wall clock, time-of-day mood, ISO week helpers
      sky/past.js           past-week constellations (P3)
      model/store.js        data model + persistence adapters (P2)
      model/parser.js       deadline parser
      model/placement.js    new-star placement + label placement
      model/week.js         what is on this week's sky, archive rules
      choreo/finish.js      pure timelines, copied from v10
      choreo/create.js
      choreo/expire.js
      choreo/undo.js
      choreo/ritual.js      Monday ritual (P3)
      render/compose.js     writes the whole frame
      render/text.js        labels, hover frame, grain glyphs
      ui/bar.js             input bar (hidden real <input>, see P4), undo row, counter
      ui/pointer.js         mouse + touch
      ui/keys.js
      platform.js           web vs Tauri detection; storage and notification adapters
      dev/hooks.js          window.ns test hooks (only when ?dev=1 or on localhost)
      dev/selftest.js
  desktop/                  Tauri 2 shell (exists; frontendDist = ../app)
  prototype/                v8, v9, v10 html + shots (history, untouched)
  legacy/rune/              the old Rust/Rune app, moved here unchanged: src/, Cargo.toml,
                            Cargo.lock, .cargo/, assets/, web/, snapshots/, dist/
  docs/
    DESIGN.md
    specs/                  SPEC.md (v1), SPEC-v9.md, SPEC-v10.md, SPEC-v11.md (move them)
    media/                  screenshots and gif for the README
  scripts/serve.mjs         zero-dependency static server for dev (node)
  .github/workflows/pages.yml
  package.json  README.md  LICENSE (MIT, © 2026 the author; use "Night Sky contributors")  .gitignore
```

- Use `git mv` for the moves, so history is kept.
- Check that `legacy/rune` still builds: `cargo check` inside it is enough, run in the background.
  If moving it breaks the Rune path deps (git deps are fine, but the `.cargo/config` target dir is
  absolute), note it and move on. Don't fix the Rune app.
- Port v10's code into the modules. This is a **refactor, not a redesign**: keep the logic, the
  constants and the frame output identical. Move every literal colour, size and timing into
  `tokens.js`.
- ES modules need http, so `npm run dev` runs `node scripts/serve.mjs app 5173`. The server needs
  correct MIME types for .js/.webmanifest/.svg/.png, it must disable the cache, and it must bind to
  127.0.0.1.

## P2. Real data and saving

### Model

```js
Task  { id, title, createdAt, deadline, big, x, y, doneAt: null|ms, link: null|id, week: null }
// x, y are normalized 0..1 positions in the sky area (not grains) → survive any screen size.
Store { version: 1, tasks: Task[], weeks: { [isoWeekKey]: { seed, archivedAt } }, lastSeenWeek, prefs: { reducedMotion: 'system'|'on'|'off' } }
```

- **Persistence adapter** (`platform.js`):
  - In Tauri (`window.__TAURI__` present; set `app.withGlobalTauri: true` in `tauri.conf.json`), use
    `tauri-plugin-store` (file `night-sky.json`).
  - Otherwise use `localStorage["night-sky:v1"]`.
  - Save debounced to 300 ms after any change, and flush on `visibilitychange`/`pagehide`.
  - If the JSON is corrupt, back it up to `night-sky:v1:corrupt:<ts>`, start empty, and never crash.
- **First launch:** the sky is empty. The bar placeholder reads `add your first star — title, deadline`.
  After the first star, it reads `title, deadline`. There are no demo tasks in the product; they live
  only in `?dev=1&demo=1`.
- **Grain mapping:** star grain position = `round(x·(GW−1))`, `round(y·(SH−1))`. Placement (v10 §3.3)
  works in grains, then stores the normalized values.
- **Bar commands** (typed, then Enter). These are for power users and are not advertised in the UI;
  they're documented in the README.
  - `/export` downloads `night-sky-YYYY-MM-DD.json`. In Tauri it uses a save dialog if easy;
    otherwise a download is fine.
  - `/import` opens a file picker, validates the file, then replaces the store. Undo works for 5 s via
    the usual undo row (`imported · 23 stars  undo z`).
  - `/motion on|off|system` sets reduced motion.

## P3. Weeks (plan section 5)

- **Week key:** ISO week, e.g. `2026-W46`, in local time. Seed = `hash(isoYear, isoWeek)`. The sky is
  `makeSky(seed)`. `↻ sky` is removed from the product UI and stays only in `?dev=1`.
- **What's on this week's sky** (`model/week.js`):
  - alive tasks (not done, deadline in the future): always, whatever their week;
  - done tasks with `doneAt` in the current week;
  - missed tasks with a deadline in the current week.
  - Everything else belongs to a past week. A task's `week` is set when it's archived (= the ISO week
    of its `doneAt` or `deadline`).
- **Past weeks become the sky** (`sky/past.js`):
  - For each archived week (newest 26), take its done tasks and links. Render the shape as a
    **distant constellation**:
    - positions scaled by 0.32 around the shape's centroid;
    - placed at a seeded anchor in the sky, with no anchor closer than 40 grains to another and none
      inside the bottom 15%;
    - drifting with the **far** layer (wraps like the far stars).
  - Stars are single splats at brightness `0.22·0.88^age` (age in weeks, minimum 0.05), tinted
    `done`. Lines are splats every 0.5 grain at `0.035·0.88^age`.
  - No labels. **Hover** (pointer within 4 grains of any of its stars) shows one dim text line next to
    it, `week 45 · 6 stars`, fading in over 150 ms. That's the only interaction.
  - Taste rule: past constellations must read as "part of the sky", not as UI. If you notice them
    before the user's stars, they're too bright.
- **Monday ritual** (`choreo/ritual.js`): runs on load when `lastSeenWeek < currentWeek`, once per
  week. It's a pure timeline over 4200 ms:

| t | What happens |
|---|---|
| 0–600 | The previous week's done stars and lines brighten slightly (+15%), as if saying goodbye. |
| 600–3000 | **Lift:** that shape scales 1 → 0.32 around its centroid and moves to its far-field anchor, with easeInOut. Brightness goes from its current level to the past level. Sprites shrink: big → small → a single splat at the scale thresholds (0.7 and 0.45). Labels fade out over 600–1100. |
| 1800–3300 | **New sky:** crossfade from last week's sky to this week's (the existing crossfade at 1500 ms). |
| 2600–4200 | Alive tasks stay put the whole time. The bar shows `week 47` in `dim` at the centre, fading in over 300 ms and out at 3800–4200. |

  - If several weeks were missed, only the most recent one does the lift. The others appear already
    in place.
  - Reduced motion: crossfade everything over 600 ms.
  - Clicking or typing skips to the end.

## P4. Product-grade input and layout

- **A real hidden `<input>`** drives the bar, so the IME, on-screen keyboards, paste and autocorrect
  all work. It's visually hidden but focused when the bar is active, and the canvas renders its value
  and caret. Keep all of v10's behaviour (`n` and `/` focus it, Esc, the live preview, ` !` for big).
- **Responsive grid:** compute GW and SH from the viewport. The grain pitch P stays DPR-exact
  (`3·dpr`), so phones get fewer grains, not smaller ones.
  - Bar height = 20 grains on desktop, 24 on touch.
  - Reallocate buffers on resize, debounced 150 ms. Re-place labels; stars keep their normalized
    positions.
  - **Portrait phones:** the sky fills the screen. Labels use the same placement algorithm, which
    already handles edges. If the title is longer than 22 characters it's ellipsised on the sky; the
    hover/selection frame shows the full title.
- **Touch:**
  - The first tap on a star selects it (same look as hover, plus a second row `tap again to finish`
    in `dim`). A second tap within 4 s finishes. A tap elsewhere deselects.
  - Tapping the bar focuses the input.
  - Undo: tap `undo`.
  - Hit areas are at least 44 CSS px.
- **Safe areas:** `viewport-fit=cover`, plus padding from `env(safe-area-inset-*)` for the bar.
- **Accessibility:** an `aria-live="polite"` visually-hidden region announces "finished X",
  "added X, due fri 20 nov", "undone" and "X missed". The canvas has a `role="img"` label summarising
  `n of m done this week`.

## P5. Platforms: PWA and desktop

- **PWA:**
  - `manifest.webmanifest`: name "Night Sky", short_name "Night Sky", display standalone,
    background and theme `#030407`, `start_url "./"`, `scope "./"`, and icons including a maskable
    one.
  - iOS meta tags: apple-mobile-web-app-capable, a black-translucent status bar, and the
    apple-touch-icon.
  - `sw.js`: cache-first for the app shell with a versioned cache name (`ns-v11-<hash or date>`). Clean
    up old caches on activate. The fonts (IBM Plex Mono) must be **self-hosted** in
    `app/fonts/` (woff2, OFL licence file included). No Google Fonts in the product, so it works
    offline and stays private.
  - Every path is relative, so it works under a subpath like `/night-sky/`.
- **Tauri:**
  - `withGlobalTauri: true`; storage via plugin-store.
  - Notifications via plugin-notification: **one** notification per task when it becomes urgent
    (life < 25%), reading `os linux hw 3 — 26h left`, and one when a deadline passes
    (`hm one-pager — missed`). Ask permission on first need. Desktop only; there are no web
    notifications.
  - Window state: remember size and position if trivial (plugin-window-state); otherwise skip it.
  - Build: `npm run desktop:build` produces the installer. Report its path and size.
- **GitHub Pages workflow** `.github/workflows/pages.yml`: on push to main, upload `app/` as the Pages
  artifact and deploy. It doesn't run until the user pushes. Also add a one-line `app/.nojekyll`.

## P6. Docs

### `docs/DESIGN.md` (the design system; write it for a future contributor or AI)

1. **Principles:** the taste rules from v9/v10 §1, rewritten as a clean list with a one-line "why"
   each.
2. **The grain system:** pitch, dot, gap, DPR math, the framebuffer pipeline order (base → clouds →
   bg stars → past → events → edges → glows → choreography light → text backing → sprites → blit →
   text).
3. **Tokens:** a table of every colour (name, hex, meaning) and size, generated from `tokens.js` or
   kept in sync by hand. Note: "change tokens.js first".
4. **Brightness hierarchy**, with the actual numbers.
5. **Motion:** the curves, the "pure function of elapsed ms" rule, and each choreography's timeline
   as a table (finish, connection, undo, create, expire, ritual).
6. **Components:** each sky component, with what it is, its rarity and its budget.
7. **How to add a sky component:** a step-by-step recipe, plus a checklist (rarity, brightness
   budget, determinism, reduced motion, performance).
8. **Don'ts:** smooth shapes over the sky, new colours, blinking, particles flying across the screen,
   more than one special event at once, header/stats chrome.

### `README.md` (public-facing, calm tone like the app, no emoji)

1. **Title and one-line pitch:** "A todo list where every task is a star. Finish it and it joins this
   week's constellation. Miss it and it burns out."
2. A hero screenshot (`docs/media/hero.png`, an ambient frame with a constellation) and a short gif
   or 3-frame strip of the finishing moment (`docs/media/finish-*.png` is fine if no gif tool is
   available).
3. **How it works:** stars, arms shrinking with time, amber when urgent, finishing, the constellation,
   weekly skies, past weeks in the sky. Each is one sentence.
4. **Use it:** web (the link placeholder `https://<you>.github.io/night-sky/`), install on a phone
   (add to home screen), desktop installer.
5. **Adding stars:** the syntax table (deadline forms, ` !` for big), keyboard shortcuts, touch
   gestures, and the bar commands.
6. **Privacy:** everything is stored locally on your device. No account, no server, no tracking.
7. **Develop:** `npm install`, `npm run dev`, `npm run desktop:dev`, `?dev=1` hooks, `ns.selfTest()`.
8. **Deploy:** GitHub Pages (push, then enable Pages → GitHub Actions in repo settings), and any static
   host (upload `app/`). Desktop: `npm run desktop:build`.
9. **Project structure:** a short tree.
10. **Design:** a link to `docs/DESIGN.md`.
11. **History:** a sentence about the prototypes and the legacy Rune app, and why it moved to
    web + Tauri (one build runs everywhere, including iPhone browsers, with no WebGPU needed).
12. **Licence:** MIT.

## 9. Verification (judge every image yourself)

- **Parity:** render `app/` and `prototype/v10.html` with the same seed, clock, T and demo tasks
  (`?dev=1&demo=1&seed=7&clock=…&t=12&freeze=1`), screenshot both, and diff the pixels. The diff must
  be zero or explained (for example fonts now self-hosted with identical metrics). Do this for 3
  scenes: ambient, finish at 1200 ms, and the moon plus comet.
- `ns.selfTest()` must be all green. Add parser, week-membership, archive and store round-trip tests.
- **Shots** in `docs/media/` (for the README) and `prototype/shots/v11/` (for QA):
  - an empty first launch;
  - 3 stars added through real typing (CDP key events);
  - a phone at 390×844 at DPR 3 (`--force-device-scale-factor=3`);
  - past weeks in the sky (inject 6 fake archived weeks);
  - ritual frames at 300, 1500, 2600 and 4000 ms;
  - an offline reload (serve, load, stop the server, reload, and confirm it renders from the service
    worker; use CDP, or note it if impossible);
  - the Tauri window (`npm run desktop:dev` or the built exe; screenshot via PowerShell, or skip
    with a note).
- **Persistence:** add a star, reload, and it must still be there. Same in Tauri if you can check.
- **Performance:** ms/frame at 1× and 2× with the moon, comet and 6 past weeks.

**Report:**
- the phases done, the commits (hashes and messages), and every deviation;
- the checklist answers from v9 and v10, plus: parity diff results, selfTest counts, offline result,
  and the installer path and size;
- what you'd still fix.

Rules:
- Don't push, and don't create remotes or GitHub repos.
- Don't publish anything.
- Don't hand back while builds run: run them in the background and wait.
- If you're truly blocked, say on what.
