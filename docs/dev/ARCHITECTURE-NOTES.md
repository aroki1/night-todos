# Architecture notes for the v11 port (from the orchestrator)

These answer the builder's questions 2–4. They're binding unless they contradict SPEC-v11.

## 1. Ownership: who owns what

There is exactly one owner per kind of state, and nothing else mutates it.

| State | Owner | Others may |
|---|---|---|
| Wall clock `now()` and sky time `T` | `sky/clock.js` | read only. **No other module calls `Date.now()` or `performance.now()`.** URL `clock=`/`t=`/`freeze=` are resolved here, once, at boot. |
| Persistent data (tasks, weeks, prefs) | `model/store.js` | read via selectors; change only through `commit(event)` |
| Event log (finish, undo, create, expire, import, ritual), with timestamps | `model/timeline.js` (new file) | read `timeline.at(T)` snapshots. Choreographies are *derived* from it and never stored. |
| Sky generation (palette, layers, components) | `sky/sky.js` | read; rebuilt only on week change or dev ↻ |
| UI state (hover, selection, input text, caret, focus, undo row) | `ui/*` | read; ui calls `commit()` for anything persistent |
| Framebuffer arrays | `framebuffer.js` | only `render/compose.js` writes into them |
| RAF loop, resize and boot | `main.js` | nobody else |

- **The ritual is just a timeline event** (`{type:'ritual', from:'2026-W45', at}`). It owns no state. The
  composer asks the timeline "is a ritual active at T, and what progress?", then calls the pure
  `ritualState(ms)`.
- **`commit(event)`** = append to the timeline, apply the data change to the store, then schedule a
  save. Undo is a new event (`{type:'undo', target:eventId}`), not a deletion. The model state at T is
  a replay of events up to T over the stored base. This is what v9 and v10 already did, so keep it.

## 2. Import direction (this is what prevents circular imports)

```
tokens, math
  ← framebuffer, sky/clock
    ← sky/* , model/*          (model never imports sky or render)
      ← choreo/*               (pure: import only math + tokens)
        ← model/timeline       (may import choreo for durations only)
          ← render/*           (reads everything above; writes framebuffer + canvas text)
            ← ui/*             (reads render's layout results, e.g. label rects for hit tests)
              ← platform, dev/*
                ← main.js      (wires everything)
```

A module may only import from rows above it. If you need something from below, pass it in as an
argument. `render/compose.js` exports one function: `compose(frameInput) → void`, where `frameInput` =
`{ T, now, sky, view (tasks on this week's sky), past, timelineSnapshot, ui, layout }`.

## 3. Frame-order contract (compose)

1. Sky base (cached, plus the crossfade if active).
2. Clouds (cached, refreshed every N frames).
3. Background star layers and sky components (clusters, binaries, giants, variable, diffraction).
4. Past-week constellations.
5. Moon.
6. Events: aurora, comet, satellites, meteors.
7. Edges (lines + glow + bead/pulse).
8. Star glows (alive / urgent / done / missed halos).
9. Choreography light (rings, core flashes, motes, sky response, arrival flashes).
10. Ghost star.
11. Text backing (`dimRect` under label rects).
12. Sprites (`over`), user stars last, so nothing dims them.
13. Blit.
14. Canvas text (labels, hover frame, bar). Grain glyphs like the return arrow go into the framebuffer
    before the blit, so they belong in step 12.

**Boot order:**
1. Resolve the clock and params.
2. Load the store.
3. Compute the week.
4. Build the sky.
5. Build the past constellations.
6. Decide the ritual.
7. If `freeze`: compose and blit once, and **do not start RAF**.
8. Else: start RAF.
9. Then await fonts and re-render once.

## 4. Golden fixtures for P2/P3 (no screenshots needed)

`now` = **Fri 2026-11-13 21:00 local**. Current week = **2026-W46** (Mon 9 Nov 00:00 → Sun 15 Nov
23:59:59.999, local).

| id | Task | Expected |
|---|---|---|
| a | alive, deadline 2026-11-20 23:59 | on this sky |
| b | done, doneAt 2026-11-12 18:00 | on this sky (done W46) |
| c | done, doneAt 2026-11-06 12:00 | archived, week 2026-W45 |
| d | missed, deadline 2026-11-11 23:59 | on this sky (missed W46) |
| e | missed, deadline 2026-11-04 23:59 | archived, 2026-W45 |
| f | done, doneAt 2026-11-09 00:00:00 | on this sky (Monday 00:00 is inclusive) |
| g | done, doneAt 2026-11-08 23:59:59 | archived, 2026-W45 |
| h | alive, created 2026-10-28, deadline 2026-11-14 12:00 | on this sky (alive tasks are always shown) |
| i | alive, deadline 2026-11-13 20:59 (one minute ago) | missed now, on this sky |

**ISO week edge cases:**
- 2026 has **53** ISO weeks, because 1 Jan 2026 is a Thursday.
  - `2026-12-31` → `2026-W53`
  - `2027-01-01` → `2026-W53`
  - `2027-01-03` → `2026-W53`
  - `2027-01-04` → `2027-W01`
  - `2025-12-29` → `2026-W01`
- `2026-11-09` → `2026-W46`; `2026-11-15` → `2026-W46`; `2026-11-16` → `2026-W47`.

**Ritual decision:**
- `lastSeenWeek` 2026-W45, now W46 → run the ritual for W45 → W46, then set `lastSeenWeek` = W46.
- `lastSeenWeek` 2026-W46, now W46 → no ritual.
- `lastSeenWeek` 2026-W42, now W46 → the ritual lifts **only W45's** shape. W43 and W44 appear already
  in place, and `lastSeenWeek` = W46.
- `lastSeenWeek` missing (first launch) → no ritual, and `lastSeenWeek` = current.

**Store:**
- Round trip: `load(save(s))` deep-equals `s`.
- Corrupt JSON (`"{oops"`) → backup key `night-sky:v1:corrupt:<ts>` is written, the store starts
  empty, and nothing throws.
- An unknown `version` (e.g. 2) → treat it as corrupt (back it up), don't migrate.

**Past constellations (from 6 archived weeks, ages 1..6):**
- Star brightness = `0.22·0.88^age`, with a minimum of 0.05.
  - age 1 → 0.1936
  - age 6 → 0.1022
  - age 20 → max(0.0170, 0.05) = 0.05
- Anchors are pairwise at least 40 grains apart, and none is in the bottom 15%.

## 5. Parity harness (question 1)

Yes, build it as `scripts/parity.mjs`. It should:
- render a list of scene URLs in both `prototype/v10.html` and `app/index.html?dev=1&v10parity=1` with
  headless Edge;
- diff the PNGs (pure Node: decode with a tiny PNG reader, or use `pngjs` as a devDependency);
- print the differing-pixel count, its bounding box, and which named region it falls in. Regions are
  sky / labels / bar / bar-right (counter), derived from the layout.

Treat font-weight-500 differences in the bar as explained, since the self-hosted Medium vs v10's
synthesised bold is expected, and exclude them by region once you've confirmed them.

## 6. Profiling

`?dev=1&prof=1` turns on the per-stage frame timer (`src/stageprof.js`, clock passed in by `dev/hooks.js`; one boolean test per mark when off); `await ns.profRun({frames:300, finish?:"title"})` returns median/p95 per stage. Results: `docs/dev/PERF-PROFILE.md`.
