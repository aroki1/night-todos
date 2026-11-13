# Advisor answer: P2 seam review (binding)

0. Get the tree green and commit P1 before any P2 code. If timeline.js is the blocker, land a minimal
   one (finish/undo replay only), commit "P1: port + restructure", then extend it in P2.
1. **Persist only durable state** (the Store shape from SPEC-v11 P2). Timeline events are
   session-only and live in memory.
   - Undoing an import uses an in-memory snapshot for 5 s.
   - Reloading mid-choreography renders the final state.
   - Debounced saving lives in the store (commit → apply → scheduleSave), not in the timeline.
2. **lastSeenWeek is written immediately** at the moment of the ritual decision.
   - A skipped or backgrounded ritual counts as seen and is never replayed.
   - Freeze/dev/clock-override scenes never write to the real store; they use the in-memory adapter.
   - Archiving is idempotent.
   - A rollover while the app is open (Sunday → Monday) runs the same path live, triggered from the
     clock tick.
3. **Dependency inversion:** store exports `setPersistence({load, save})` and main injects the
   platform adapters. The default adapter is in-memory, for tests. Notifications work the same way:
   main subscribes to commits and calls `platform.notify`.
4. **compose: Option A** (a minimal seam).
   - compose.js and placement.js never import ui/*.
   - Prefer `prepare(uiSnapshot)` arguments over setters. If a setter stays, only main calls it, once
     per frame.
   - Freeze renders once and never starts RAF.
   - The literal frameInput object is post-v11 cleanup.
5. **First launch** (including former v10 users): an empty sky, no ritual, `weeks[current]` recorded,
   `lastSeenWeek` = current, no migration.

In P2, also turn the golden fixtures in ARCHITECTURE-NOTES §4 into selfTest cases. P2 isn't done
until they pass. The parity diffs of 124/136 px in the 500-weight bar glyphs are accepted.
