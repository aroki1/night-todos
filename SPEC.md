# Night Sky — v1 spec

A todo app where every task is a star on a squared night sky. Stars lose their square modules as
their deadline approaches. Finished stars connect into this week's constellation. Missed stars leave
one grey module. Built with Rune (Rust, GPU-rendered), running natively on Windows and in the
browser (WebGPU), so it also works in any iOS 26+ browser.

The user is one student who lives by deadlines. The app has one job: make self-set deadlines visible
and real. It is not a dashboard, not a habit tracker, no streaks, no XP, no stats screens.

**Ship rule:** v1 must be usable by Sun 2026-11-15. The first real star is "HM one-pager", due
Fri 2026-11-20 23:59. Working beats polished. Do not add features beyond this spec.

---

## 1. Platform and stack

- **Framework:** Rune — https://github.com/anomalyco/rune. Pre-release. Pin the `dev` branch at rev
  `09ab92a5c83b906adb6fbf92637323b49e86d7ac` (latest on 2026-11-13). Use `rune` for UI and
  `rune-fx` for glow/burst effects only where it helps; plain squares are fine everywhere else.
- **Start from** Rune's `examples/hello` and read `crates/rune/README.md`, `crates/rune-fx/README.md`
  and `WEB.md` in the Rune repo before writing code. Clone Rune to a sibling folder for reading
  (`../rune-src`), not inside this project.
- **Targets:**
  1. Windows desktop native (`x86_64-pc-windows-msvc`, already installed with cargo 1.99).
  2. Web: `wasm32-unknown-unknown`, built with Rune's `scripts/web-build.sh` (run via Git Bash).
     Requires WebGPU, no WebGL fallback. Needs Python 3.11+ (installed) and the `wasm-bindgen-cli`
     version pinned in Rune's `Cargo.lock` (install it with `cargo install wasm-bindgen-cli --version X`).
- No native iOS app. No Telegram. No server.

## 2. Data model

```rust
struct Task {
    id: u64,               // random at creation; also seeds placement and module dropout
    title: String,         // ≤ 60 chars
    created_at: i64,       // unix seconds, UTC
    deadline: i64,         // unix seconds, UTC; LOCKED after creation (see §6)
    size: Size,            // Small | Large
    gx: i32, gy: i32,      // grid position of the star centre, chosen once at creation
    done_at: Option<i64>,
    deleted: bool,         // soft delete
}
struct Week { year: i32, iso_week: u32, name: Option<String>, task_ids: Vec<u64> }  // archived weeks
struct Store { version: u32, tasks: Vec<Task>, archive: Vec<Week> }
```

**Derived state** (pure functions, unit-tested):
- `life(task, now) = clamp((deadline - now) / (deadline - created_at), 0, 1)`
- Status: `Done` if `done_at` is set; `Missed` if `now > deadline` and not done; otherwise `Alive(life)`.
- Times are stored in UTC. The UI and week boundaries use local time.

**Persistence:** local only in v1, one sky per device. No sync.
- Use a `Storage` trait with two implementations behind `cfg`:
  - Desktop: JSON file at `%APPDATA%/night-sky/store.json` (use the `dirs` crate). Write to a temp
    file, then rename (atomic).
  - Web: `window.localStorage["night-sky"]` via `web-sys`, holding the same JSON.
- Save on every change. Load at start. If the JSON is corrupt, keep a `.bak` copy and start empty.
  Never crash.
- `serde` + `serde_json`. The schema has a `version` field.

**First launch seed:** one Large task titled `HM one-pager`, deadline 2026-11-20 23:59 local time,
`created_at = now`.

## 3. The grid

- Everything is drawn on one square module grid. No curves, no diagonals, no circles anywhere,
  including UI chrome (buttons and inputs are square-cornered, radius 0).
- **Logical grid:** 96 × 54 modules, landscape. In portrait (height > width) use 54 × 96. Module size
  is `floor(min(viewport_w / cols, viewport_h / rows))` in logical points, minimum 4. Centre the grid
  and fill the rest of the window with the background colour.
- Each module is drawn as a square of `module - gap`, where `gap = 1` if module < 8 and `2` otherwise.
- **Background dust:** about 1.5% of modules (deterministic hash of grid x,y) show a dim module that
  slowly pulses opacity between 0.25 and 0.6, each at its own phase, with a period of about 4 s.
  Keep it subtle.

**Palette** (dark only in v1):

| Token | Hex | Use |
|---|---|---|
| bg | `#07080c` | sky |
| dust | `#3a4152` | background dust |
| ink | `#f4f1e6` | alive star centre |
| ink-dim | `#c9c3ad` | alive star arms |
| done | `#ffffff` / `#9fb8ff` | done star centre / arms |
| trace | `#5b8cff` | constellation path |
| missed | `#4a4d55` | missed module |
| text | `#8a8f9c` | labels |
| text-strong | `#e6e8ee` | selected label, HUD |

**Font:** IBM Plex Mono (embedded by Rune by default) for all text. Lowercase labels.

## 4. Stars

**Shape** (module offsets from the centre):
- Small: plus with arm length 2 → 9 modules.
- Large: plus with arm length 3, plus the 4 diagonal neighbours of the centre → 17 modules.

**Placement** at creation: choose `(gx, gy)` deterministically from `id`, retrying with the next hash
until it is ≥ 8 modules (Chebyshev distance) from every other non-deleted task in the current week
and ≥ 4 modules from the grid edge. Leave the bottom 6 rows free for the input bar (§7). After 64
failed tries, accept the best candidate.

**Fading by module dropout:**
- Order the star's non-centre modules by a hash of `(id, dx, dy)`. With `n` modules, the visible count
  is `ceil(life * (n - 1))` non-centre modules plus the centre. The centre is always visible while
  the task is alive.
- So a fresh star is complete, a half-life star is missing about half its modules, and the last
  module standing is the centre.
- Remove modules one at a time with a short fade (about 300 ms opacity), never a pop.

**Twinkle:**
- `life > 0.25`: each module's opacity oscillates 0.75–1.0, slow (2–3 s), with per-module phase.
- `life ≤ 0.25`: flicker faster (≈ 6–9 Hz, opacity 0.35–1.0) with irregular per-module phases. This
  is "about to go out".
- Optional: a `rune-fx` glow on the centre module only, low intensity, colour `ink`. Drop it if it
  costs more than a day.

**Done star:** all modules come back to full (stagger 20 ms each, centre first), with colours `done`.
No twinkle; it stays steady.

**Missed star:** the whole star collapses (modules fade out over about 400 ms) to a single module at
the centre, coloured `missed`, steady, no label unless hovered or selected.

**Labels:** the title in lowercase, 11–12 pt mono, `text` colour, placed 2 modules to the right of
the star's right arm and vertically aligned to the centre row. Flip to the left side if it would
overflow the grid. Done labels use `trace`.

## 5. Constellation

- **Current week:** ISO week, Monday 00:00 to Sunday 23:59:59 local time.
- This week's done stars, sorted by `done_at`, are joined in order: star k-1 → star k.
- **Path:** orthogonal Manhattan route on the grid between the two centres. Go horizontal first, then
  vertical. Skip modules that are covered by any star's shape. Draw each path module in `trace` at
  0.45 opacity, with a slow travelling shimmer (opacity +0.15 moving along the path, about 3 s per
  loop).
- **New link animation:** when a star is finished, its new path segment draws module by module from
  the previous star to the new one, about 12 ms per module.

## 6. Editing

The app is not strict. The pressure comes from the visuals, not from rules.
- Title and deadline can both be edited from the HUD. The deadline uses the same parser (§8).
  `created_at` stays the same, so `life` is recomputed against the new deadline. If the new deadline
  restores modules, they fade back in.
- A task can be deleted at any time (soft delete). Its star fades out over about 300 ms.

## 7. Interaction

Keep it minimal. Two surfaces: the sky and one bottom bar.

**Bottom bar** (bottom 6 rows, square-edged, 1-module border in `dust`):
- A single text input with placeholder `new star: title, deadline` and a size toggle `[s]` / `[l]`.
- Enter submits. Parse the deadline from the text after the last comma (§8). If parsing fails, show an
  inline error in the bar (`can't read that deadline — try "fri", "fri 18:00", "nov 20", "+3d"`) and
  keep the text.
- Keyboard: `n` or `/` focuses the input; Esc blurs it.
- On submit, a new star appears with a quick build-in: modules appear centre-out, 15 ms each.

**Star selection:**
- Hover (desktop) shows the label at `text-strong`.
- Click or tap a star (hit area = its bounding box plus 2 modules) to select it and open the **HUD**,
  a small square panel anchored next to the star with:
  - the title (editable on click)
  - the deadline as `fri 20 nov 23:59`, plus time left as `6d 4h` / `3h 12m` / `missed` / `done`
  - the deadline is editable on click (same parser; Enter saves, Esc cancels, inline error on failure)
  - `[finish]` button (only if alive)
  - `[delete]`
- Click outside or press Esc to close. Keyboard: Enter finishes the selected star.

**Finish:**
- Set `done_at`, then save.
- **Burst:** a square ring ripple out of the star centre. The ring is the set of modules at Chebyshev
  distance r, r grows 1 → 7 over about 600 ms, colour `done`, and opacity fades from 1 to 0 as r grows.
  Optionally layer a `rune-fx` sparkle burst on top.
- Then the star restores fully (§4 done star) and the constellation segment draws in (§5).

**Week rollover:** at the first app frame after Monday 00:00 local (and on launch), archive the
previous week:
- Push `Week { year, iso_week, name: None, task_ids }` with all tasks whose deadline fell in that
  week, or that were done in it.
- Those tasks no longer render on the sky.
- Alive tasks whose deadline is in a future week stay on the sky.

Week naming and the archive viewer are **v1.1**, not now. Just store the data.

**Reduced motion:** respect Rune's reduced-motion setting. Twinkle and flicker become static, and
burst, build-in and path draw become simple fades.

**Redraw:** the sky animates continuously (twinkle). Use Rune's animation loops or wake deadlines
(see the README's time and deadline sections) so idle CPU/GPU use stays low. A 30 fps cap for the
twinkle is fine.

## 8. Deadline parser

A pure function `parse_deadline(input: &str, now: DateTime<Local>) -> Result<DateTime<Local>, ()>`,
unit-tested. It is case-insensitive and trims input. If no time is given, the time is 23:59.

Accepted forms:
- `today`, `tonight` (today 23:59), `tomorrow` / `tmr`
- weekday names and 3-letter forms (`fri`, `friday`): the next such day. If today is that day and no
  time is given, it means today 23:59.
- `nov 20`, `20 nov`, `20.11`, `2026-11-20`: if the date is already past this year, use next year
  (except the ISO form, which is exact).
- `+3d`, `+5h`, `+90m`
- An optional time suffix on any day form: `18:00`, `18`, `6pm`
- A deadline in the past is an error (`that's already gone`).

Use `chrono`.

## 9. Web specifics

- Build with Rune's `scripts/web-build.sh` and mount the app as the whole page.
- Ship a minimal `index.html` that shows, without WebGPU, the text: `night sky needs WebGPU —
  update to iOS 26+ / a current Chrome, Edge or Safari`.
- Add `manifest.webmanifest`: name "Night Sky", `display: standalone`, background `#07080c`, plus a
  simple square-module icon generated as a PNG at 192 and 512 px. This lets it be added to the iOS
  home screen.
- Add `serve.py` (or document a one-liner) that serves the output on localhost with
  `.wasm` → `application/wasm`.

## 10. Project layout

```
night-sky/
  SPEC.md            (this file)
  Cargo.toml         (rune pinned by git rev)
  src/
    main.rs          app entry, desktop + wasm
    model.rs         Task, Store, life/status, week logic
    deadline.rs      parser
    grid.rs          grid sizing, placement, shapes, dropout order, manhattan paths
    storage.rs       Storage trait + file/localStorage impls
    view.rs          Rune view: sky, stars, paths, bar, HUD
    fx.rs            burst / build-in / glow helpers
  web/               index.html, manifest, icons, serve.py
  snapshots/         headless PNGs (§11)
  README.md          how to run desktop + web, in 10 lines max
```

## 11. Verification (required before reporting done)

1. `cargo test`: tests for `life`/status, the deadline parser (all forms in §8 plus errors, using a
   fixed `now`), placement spacing, dropout counts at life 1.0 / 0.5 / 0.1, manhattan path avoiding
   star modules, week rollover, and storage JSON roundtrip and corrupt-file recovery.
2. `cargo run --release` opens a desktop window on Windows that renders the sky with the seeded star.
3. Headless snapshots using Rune's headless rendering (see its README), saved into `snapshots/`:
   - `01-fresh.png`: seed star complete
   - `02-half.png`: 4 stars at life 1.0 / 0.6 / 0.3 / 0.1 (inject fake `now`)
   - `03-constellation.png`: 4 done stars joined by paths, plus 1 missed module
   - `04-hud.png`: HUD open on a star
   - `05-portrait.png`: 390 × 844 viewport (phone)

   Look at each PNG yourself and fix anything that looks broken, overlapping or unreadable.
4. The web build succeeds and the output folder has the `.wasm`, JS glue and `index.html`. If you can,
   load it in headless Chromium (Rune's own Playwright approach) and screenshot it to
   `snapshots/06-web.png`.

## 11b. Setup and build order

**Setup** (do first):
- `rustup target add wasm32-unknown-unknown`.
- Install `wasm-bindgen-cli` at the exact version in Rune's `Cargo.lock`.
- Run a trivial `cargo build` first to confirm MSVC `link.exe` works.
- Clone Rune with `git clone --filter=blob:none --depth 1 -b dev`, because the repo carries large demo
  media. Run long clones and first builds in the background so they don't hit the 2-minute tool
  timeout.
- Python is `python` / `py` here. If `web-build.sh` calls `python3`, work around it with a shim or env
  var on this machine, not by patching Rune.

**Milestones.** Leave something working at each one, and report which one you reached:
- **M1 desktop core:** sky grid, seed star, add a star via the bar plus the parser, dropout fading and
  twinkle, HUD with finish/edit/delete, missed state, persistence, unit tests.
- **M2:** constellation paths plus the new-link draw, burst, build-in, and week rollover.
- **M3:** web build, index.html with WebGPU fallback, manifest and icons, serve script, snapshots.
- **M4:** rune-fx glow, portrait layout polish, reduced motion.

## 12. Out of scope (do not build)

Sync, accounts, notifications/reminders, Telegram, archive viewer, week naming UI, themes/light mode,
recurring tasks, categories/colours per course, statistics, sound, settings screen.

## 13. If something blocks you

- If a Rune API doesn't exist or behaves differently than assumed here, adapt to what Rune actually
  offers and note the deviation in the final report. Don't fight the framework.
- If `rune-fx` integration is painful, skip it entirely. Squares plus opacity animation are enough.
- If the web target fails to build after a real attempt (about 1 hour), finish desktop fully,
  document the exact web error, and stop. Don't sink the whole budget into it.
- Never vendor or patch Rune's source inside this project.
