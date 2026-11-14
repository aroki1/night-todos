# Terminal look prototype (scripts/term-proto)

Run: `node scripts/term-proto/view.mjs --mode half|braille|mixed --play still|finish|drift --size 200x55` (dumps: `mkshots.mjs`, `cdp.mjs --shots`, `extract.mjs`).
Measured at 200x55 cells, drift, unpaced to a file (render + diff + write, no terminal): bytes per delta frame / fps ceiling.
- half: 90 KiB, ~390 fps. braille (thr 8): 65 KiB, ~96 fps. mixed: 67 KiB, ~306 fps. (160x45: 68/49/53 KiB; 240x65: 119/75/84 KiB.) First full frame 116-235 KB.
- `--q 4` (drop 4 low colour bits) cuts to 43/34/36 KiB. At 30 fps the unquantised stream is 1.5-2.7 MB/s: the terminal's parser/GPU, not Node, will be the limit. Not tested in a real terminal.
- Closest to the browser (my guess, not seen): half-block. It is the only mode with one true colour per grain column and no glyph shapes, so gradient and clouds stay smooth. Braille gives 2x4 grains per cell but one fg colour per cell, so star colour is lost. Mixed looks like a star chart, not like the grain field.
OpenTUI (anomalyco/opentui, formerly sst; docs opentui.com), from README, npm metadata and docs only, nothing installed:
- Runtime: Bun (README says dev needs Bun + Zig); native Zig core. npm `@opentui/core` ships optional native packages incl. win32-x64/arm64. No Node support statement found.
- It has a FrameBuffer with `setCell(x, y, char, fg, bg)` and `drawText`, double-buffered native renderer. Diff output is likely but I did not confirm it in the docs.
- No half-block or braille helper found. Both are a few lines on top of setCell (the `▀` mode above).
- Verdict: usable for the terminal output layer only if Bun is acceptable; for a Node prototype, direct ANSI as in view.mjs is enough.
Cannot match the browser: no sub-cell dot size (grain gaps), no alpha/glow blending beyond per-cell colour, text sits on the cell grid (not 12 px IBM Plex), the bar is one row, step lists, hover frames and pips are not dumped.
