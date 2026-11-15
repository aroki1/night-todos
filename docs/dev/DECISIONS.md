# Decisions (one line each: date, decision, why). Not auto-loaded.

- 2026-11-14: No WASM. The bottleneck was pixel pushing, not math.
- 2026-11-14: No two stacked canvases. The compositor differed by 1-8 levels at fractional DPR, so we use an offscreen GL canvas plus `drawImage`.
- 2026-11-14: No per-file stale-while-revalidate service worker. It mixes module versions; the SW caches one generated shell.
- 2026-11-14: CLI/terminal version deferred. Half-block, braille and mixed looks lost too much detail; revisit with supersampled octants or sixel/kitty graphics. OpenTUI needs Bun and Zig.
- 2026-11-14: Rune port dropped. Slow builds, and it needs a custom GPU pass.
- 2026-11-14: Idle frame rate is 15 fps. The sky is slow; this saves battery and CPU.
- 2026-11-14: The cloud `n` layer is not coarsened, because of the risk to the look.
- 2026-11-14: GitHub Pages is off and the repo stays private.
- 2026-11-14: The selftest count is 136, not 139 (the earlier number was a miscount).
- 2026-11-14: The ritual dev scene is frozen by default, so a shot is a pure function of T.
- 2026-11-14: Goldens store SHA-256 hashes, not PNGs. 5 old import-direction violations are allowlisted (`KNOWN` in `scripts/verify.mjs`); fix or remove an entry when you touch the edge.
- 2026-11-15: The cloud field runs on the GPU (WebGL2 + float target; CPU fallback, ?gpuclouds=0). Clouds 3.2 -> 0.9 ms desktop, 4.0 -> 1.1 ms phone (CPU x4). The CPU makes the noise lattice, so the look matches to 1/255.
