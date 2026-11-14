# Per-stage frame profile

Measurement only; nothing was optimized. Tool: `?dev=1&prof=1`, then `await ns.profRun({frames:300, finish:'patterns quiz prep'})` (`src/stageprof.js`, `dev/hooks.js`).
Method: 60 warm-up + 300 measured frames per run; the loop is stopped and driven by rAF at active rate (clouds refresh every frame, T += 1/60). `finish` loops T over the 120..1300 ms choreography window so every frame is mid-flight.
Edge headless, 16-core dev laptop. "sw" = `--disable-gpu` (WebGL renderer: Microsoft Basic Render); "GPU" = `scripts/cdp.mjs --gpu` (WebGL renderer: NVIDIA RTX 4060 via ANGLE, so a GPU was used for WebGL; whether the 2D canvas itself was GPU-accelerated is not observable). Phone = 375x812 dpr 2 with CPU throttle x4. Scenes: `demo=1` (8 stars), `scene=steps&live=1`, `demo=1` + a finish in flight.
Cells are median / p95 ms. Grouped rows show the sum of member medians and of member p95 (an upper bound). Timer resolution is 0.1 ms, so values under 0.2 are noise. Mark overhead: 0.3-0.6 us per mark (2.6 us on the throttled phone), about 40 marks per frame.

### Scene: ambient  (median / p95 ms per frame)

| stage | d125 sw | d125 GPU | d2 sw | d2 GPU | ph sw | ph GPU |
|---|---:|---:|---:|---:|---:|---:|
| prepare | 0.10 / 0.50 | 0.10 / 0.50 | 0.10 / 0.50 | 0.10 / 0.50 | 0.90 / 2.1 | 1.00 / 2.1 |
| clouds | 5.4 / 9.3 | 6.9 / 11.9 | 6.8 / 11.0 | 7.1 / 10.7 | 6.7 / 11.1 | 6.4 / 10.4 |
| base+stars (composeBase) | 1.1 / 1.7 | 1.3 / 1.8 | 1.4 / 2.1 | 1.3 / 2.1 | 1.7 / 2.8 | 1.3 / 2.4 |
| past, aurora, moon, events | 0.10 / 0.40 | 0.10 / 0.50 | 0.10 / 0.50 | 0.10 / 0.50 | 0.80 / 1.9 | 0.60 / 1.8 |
| edges (links) | 0.10 / 0.20 | 0.20 / 0.30 | 0.20 / 0.30 | 0.20 / 0.30 | 1.1 / 1.5 | 1.0 / 1.5 |
| halos | 0.20 / 0.40 | 0.30 / 0.40 | 0.30 / 0.40 | 0.30 / 0.40 | 1.4 / 2.0 | 1.3 / 1.9 |
| user-star sprites | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.20 / 0.50 | 0.20 / 0.40 |
| step orbits (back, front, panel) | 0.00 / 0.00 | 0.00 / 0.20 | 0.00 / 0.10 | 0.00 / 0.20 | 0.00 / 0.60 | 0.00 / 0.60 |
| dimRect + ritual overlay | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.20 / 0.40 | 0.10 / 0.40 |
| blit.paint (grains->pixels) | 5.5 / 7.6 | 8.2 / 10.2 | 10.8 / 14.5 | 11.2 / 14.6 | 10.8 / 13.2 | 10.6 / 13.8 |
| blit.put (putImageData) | 1.9 / 2.2 | 1.2 / 1.5 | 4.6 / 5.7 | 3.1 / 3.5 | 3.4 / 4.3 | 2.5 / 3.2 |
| text.labels | 0.10 / 0.20 | 0.10 / 0.20 | 0.20 / 0.30 | 0.10 / 0.20 | 0.90 / 1.6 | 0.80 / 1.4 |
| text.bar | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 1.1 / 1.8 | 0.90 / 1.6 |
| text.pastHover+ritual, post | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.20 | 0.00 / 0.10 | 0.00 / 0.60 | 0.00 / 0.50 |
| **total (CPU in renderNow)** | 15.1 / 20.1 | 19.1 / 24.2 | 25.4 / 31.4 | 24.1 / 29.2 | 29.5 / 35.1 | 27.1 / 34.0 |
| rAF interval | 16.7 / 33.3 | 20.8 / 27.8 | 33.3 / 33.4 | 27.7 / 28.6 | 33.3 / 50.0 | 27.8 / 34.9 |
| core / presentation (mean, %) | 49 / 51 | 49 / 51 | 37 / 63 | 40 / 60 | 46 / 54 | 46 / 54 |

### Scene: steps  (median / p95 ms per frame)

| stage | d125 sw | d125 GPU | d2 sw | d2 GPU | ph sw | ph GPU |
|---|---:|---:|---:|---:|---:|---:|
| prepare | 0.10 / 0.60 | 0.10 / 0.60 | 0.10 / 0.60 | 0.10 / 0.60 | 0.90 / 2.1 | 0.90 / 2.0 |
| clouds | 7.7 / 11.9 | 7.2 / 11.8 | 7.2 / 12.3 | 7.2 / 11.6 | 6.2 / 10.4 | 6.0 / 10.8 |
| base+stars (composeBase) | 1.3 / 1.9 | 1.2 / 1.7 | 1.3 / 1.9 | 1.3 / 1.9 | 1.3 / 2.6 | 1.2 / 2.3 |
| past, aurora, moon, events | 0.10 / 0.50 | 0.10 / 0.40 | 0.10 / 0.40 | 0.10 / 0.50 | 0.70 / 1.7 | 0.60 / 1.8 |
| edges (links) | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.20 | 0.00 / 0.20 |
| halos | 0.20 / 0.30 | 0.20 / 0.40 | 0.20 / 0.40 | 0.20 / 0.30 | 1.2 / 1.8 | 1.2 / 1.8 |
| user-star sprites | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.20 / 0.60 | 0.20 / 0.60 |
| step orbits (back, front, panel) | 0.40 / 0.70 | 0.40 / 0.60 | 0.40 / 0.60 | 0.40 / 0.60 | 2.3 / 3.9 | 2.1 / 3.7 |
| dimRect + ritual overlay | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.20 / 0.60 | 0.20 / 0.50 |
| blit.paint (grains->pixels) | 7.7 / 9.9 | 7.9 / 10.0 | 12.1 / 14.7 | 11.5 / 14.6 | 9.2 / 13.2 | 10.1 / 13.8 |
| blit.put (putImageData) | 1.7 / 2.2 | 1.2 / 1.4 | 4.5 / 5.2 | 3.0 / 3.3 | 3.2 / 4.3 | 2.4 / 3.1 |
| text.labels | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 0.70 / 1.3 | 0.60 / 1.1 |
| text.bar | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 0.10 / 0.20 | 0.80 / 1.5 | 0.60 / 1.1 |
| text.pastHover+ritual, post | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.20 | 0.00 / 0.10 | 0.00 / 0.50 | 0.00 / 0.40 |
| **total (CPU in renderNow)** | 20.1 / 24.9 | 19.0 / 24.1 | 26.4 / 31.9 | 24.4 / 29.5 | 27.7 / 35.7 | 27.2 / 34.8 |
| rAF interval | 16.7 / 33.4 | 20.8 / 27.8 | 33.3 / 33.4 | 27.7 / 34.7 | 33.3 / 50.0 | 27.8 / 35.3 |
| core / presentation (mean, %) | 51 / 49 | 51 / 49 | 37 / 63 | 40 / 60 | 49 / 51 | 49 / 51 |

### Scene: finish  (median / p95 ms per frame)

| stage | d125 sw | d125 GPU | d2 sw | d2 GPU | ph sw | ph GPU |
|---|---:|---:|---:|---:|---:|---:|
| prepare | 0.20 / 0.60 | 0.20 / 0.60 | 0.20 / 0.60 | 0.20 / 0.60 | 1.3 / 2.5 | 1.4 / 2.7 |
| clouds | 7.5 / 12.3 | 7.2 / 12.1 | 6.3 / 11.0 | 7.1 / 12.3 | 6.0 / 10.4 | 5.9 / 11.0 |
| base+stars (composeBase) | 1.5 / 2.3 | 1.5 / 2.4 | 1.5 / 2.5 | 1.5 / 2.3 | 1.8 / 3.4 | 1.5 / 2.8 |
| past, aurora, moon, events | 0.10 / 0.50 | 0.10 / 0.50 | 0.10 / 0.40 | 0.10 / 0.40 | 0.60 / 1.6 | 0.60 / 1.6 |
| edges (links) | 0.20 / 0.30 | 0.20 / 0.40 | 0.20 / 0.30 | 0.20 / 0.30 | 1.1 / 1.8 | 1.1 / 1.8 |
| halos | 0.40 / 0.60 | 0.40 / 0.60 | 0.30 / 0.60 | 0.40 / 0.60 | 1.6 / 2.4 | 1.5 / 2.5 |
| user-star sprites | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.20 / 0.50 | 0.20 / 0.50 |
| step orbits (back, front, panel) | 0.00 / 0.20 | 0.00 / 0.20 | 0.00 / 0.10 | 0.00 / 0.20 | 0.00 / 0.60 | 0.00 / 0.50 |
| dimRect + ritual overlay | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.00 / 0.10 | 0.10 / 0.40 | 0.10 / 0.40 |
| blit.paint (grains->pixels) | 8.1 / 10.0 | 7.7 / 9.9 | 9.5 / 13.9 | 11.4 / 14.6 | 9.7 / 13.1 | 9.9 / 13.4 |
| blit.put (putImageData) | 1.6 / 2.0 | 1.2 / 1.5 | 4.4 / 5.2 | 3.0 / 3.4 | 3.2 / 4.0 | 2.4 / 3.2 |
| text.labels | 0.20 / 0.30 | 0.10 / 0.20 | 0.20 / 0.30 | 0.10 / 0.20 | 0.90 / 1.5 | 0.70 / 1.4 |
| text.bar | 0.20 / 0.30 | 0.20 / 0.30 | 0.20 / 0.30 | 0.20 / 0.30 | 1.2 / 2.1 | 1.1 / 2.0 |
| text.pastHover+ritual, post | 0.00 / 0.20 | 0.00 / 0.00 | 0.00 / 0.10 | 0.00 / 0.00 | 0.00 / 0.50 | 0.00 / 0.50 |
| **total (CPU in renderNow)** | 20.5 / 26.0 | 19.5 / 25.7 | 23.4 / 31.3 | 24.7 / 30.9 | 28.3 / 35.6 | 27.0 / 35.4 |
| rAF interval | 16.7 / 33.4 | 20.8 / 27.9 | 33.3 / 33.5 | 27.7 / 34.8 | 33.3 / 50.0 | 27.8 / 41.6 |
| core / presentation (mean, %) | 52 / 48 | 53 / 47 | 39 / 61 | 41 / 59 | 48 / 52 | 48 / 52 |

### Geometry and renderer

| config | canvas (device px) | GW x SH (ROWS) | P | stars (layers) | renderer (sw) | renderer (GPU) | mark cost (us) |
|---|---|---|---|---|---|---|---|
| 1917x933 @1.25 | 2396x1164 | 599x271 (291) | 4 | 1601+437+67 | ANGLE (Microsoft, Microsoft Basic Render | ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E | 0.34 |
| 1917x933 @2 | 3834x1866 | 639x291 (311) | 6 | 1704+465+71 | ANGLE (Microsoft, Microsoft Basic Render | ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E | 0.56 |
| 375x812 @2, cpu x4 | 750x1620 | 125x246 (270) | 6 | 383+104+16 | ANGLE (Microsoft, Microsoft Basic Render | ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E | 2.60 |

## Top 3 costs (median, ms per frame, ambient scene; steps and finish are within +-2 ms)

| rank | stage | d125 | d2 | phone x4 |
|---|---|---|---|---|
| 1 | blit.paint (grains to P x P dots) | 5.5-8.2 | 10.8-11.2 | 10.8 |
| 2 | clouds (recomputed every active frame) | 5.4-6.9 | 6.8-7.1 | 6.7 |
| 3 | blit.put (putImageData) | 1.2-1.9 | 3.1-4.6 | 2.5-3.4 |

Next: composeBase (stars) 1.1-1.7, phone-only small stages (halos 1.4, edges 1.1, text.bar 1.1, prepare 0.9) each about 1 ms.

## Core vs presentation

Core = prepare + compose (grain grid); presentation = blit.paint + blit.put + canvas text. By mean ms: d125 about 50/50, d2 about 38/62, phone about 47/53 (core / presentation). Canvas text itself is tiny on desktop (0.2-0.4 ms) and 1.5-2.5 ms on the throttled phone; the pixel conversion and upload are 95% of presentation.

## GPU dot-painting estimate

Upload the tone-mapped grain grid (GW x SH x RGBA8: 0.65 MB at d125, 0.74 MB at d2, 0.12 MB on the phone) as a texture and let one fragment shader draw the P x P dots; `blit.paint` and `blit.put` become a texture upload (about 0.3-0.5 ms desktop, about 1-2 ms throttled phone, plus about 0.3 ms to tone-map on CPU or none if the shader does it from a float texture). Canvas text moves to a 2D overlay canvas (cost unchanged).

| config | blit now | after | frame now | frame after | gain |
|---|---|---|---|---|---|
| d125 | 7.4-9.4 | about 0.6 | 15-19 | about 8-10 | 1.9x |
| d2 | 15.4-15.8 | about 0.8 | 24-25 | about 9-10 | 2.5x |
| phone x4 | 13.4-14.2 | about 2 | 27-30 | about 16 | 1.8x |

The gain on the blit stages is 10-20x, but the whole frame improves only about 2-2.5x: the CPU core (clouds 6-7 ms, composeBase 1-2 ms, small stages) remains. A 10x frame gain needs clouds off the per-frame path as well. At dpr 2 software the frame (25 ms) does not make 60 fps today (rAF interval 33 ms); after the GPU path it would.

## Clouds, live path (SPEC-perf-frame part 1)

**Measurement fix.** `ns.profRun` now unfreezes the sky while it runs (restored afterwards), keeps T monotonic, and in `finish` mode undoes and re-finishes every 71 frames instead of rewinding T. New sub-stages: `clouds.kf`, `clouds.rows`, `clouds.upsample` (`pf.lap`); `summary()` also reports `max`. With the fix, the "clouds" rows above were already close to the live path: the old runs were not frozen, so the 5-7 ms was real, not an artifact (one full-grid upsample every ~5 frames, 6 ms spike, plus a 1/5 slice of rows at ~6.5 ms; a full exact refresh is ~31 ms).

**Optimization.** The live path (`cloudsTick`) now keyframes the slow layers `w`/`m` every 0.5 s of sky time (next keyframe computed ahead over the slices, linear interpolation), caches the lattice cell per octave, prunes octaves of `n` that cannot reach the cloud threshold, hoists the row factor, and spreads the upsample over the slices into a double buffer (`CRn/CGn/CBn`, published with one `set` when the cycle completes). `cloudRows` / `cloudUpsample` / `clouds()` / `cloudsForce()` (frozen, forced, sky swaps) keep the exact computation; frozen shots are byte-identical. Live vs exact (node, same t): max deviation 4e-4 of a 0.2 range (0.1 of 255 levels), exact at keyframe times.

Clouds, ambient scene, GPU on, mean / median / p95 / max ms per frame, 300 frames (before = fixed profRun on the old code):

| config | before | after | after: rows | after: upsample |
|---|---|---|---|---|
| d125 | 7.4 / 6.9 / 11.5 / 14.8 | 3.7 / 3.6 / 4.7 / 6.6 | 2.2 mean | 0.9 mean |
| d2 | 7.9 / 7.4 / 12.5 / 14.2 | 3.6 / 3.5 / 5.1 / 19 (one outlier) | 2.0 mean | 1.0 mean |
| phone x4 | 5.8 / 5.6 / 9.1 / 13.2 | 3.3 / 3.2 / 4.9 / 9.1 | 1.9 mean | 0.8 mean |

Before the change, `clouds.rows` averaged 6.4-7.0 and `clouds.upsample` 0.7-1.0 mean with a 4-6 ms p95 spike. The upsample spike is gone; the mean is about half. The spec's thresholds (mean < 1 ms, no spike > 3 ms) are not met: the remaining cost is the `n` layer itself (about 7 ms per full refresh, 12 refreshes/s). Going lower needs `n` to be keyframed/interpolated or computed at lower resolution, which changes the live picture slightly more than the spec allows.

## Other large wins (described, not done)

1. **Clouds**: 5-7 ms every active frame at all sizes (about 30-40% of core). They drift slowly; refresh every 3-4 frames (the loop already has `setCloudPace`; active uses 0) or compute at half resolution and upsample, or move to the shader. Biggest single CPU saving, about 5 ms.
2. **blit.paint on the CPU**: 8-11 ms at d2 even though only D x D of each P x P cell is written (the rest is the static BGPIX background). Skipping grains whose packed colour is unchanged since the last frame, or `putImageData` with a dirty rect, would help if many grains are static (not measured).
3. **composeBase**: about 2100 stars (1704+465+71 at d2) cost only 1.1-1.7 ms (about 5%), already culled by x. Not worth work.
4. **Text redraw**: labels + bar are 0.2-0.4 ms on desktop, 1.5-2.5 ms on the phone x4 (6-8%). Caching them to an offscreen canvas when nothing changed would save that phone cost; low priority.
5. **Frame pacing**: p95 total is 20-35 ms, so d2 software and the phone x4 miss 60 fps (rAF interval 33 ms median).

## Not measured / caveats

- GPU raster and compositor time after the frame is not in `total`; the rAF interval row is the only proxy. With GPU on, intervals were 20.8 (d125) and 27.7 ms (d2), odd vs 16.7 sw, so compositing costs something there.
- Whether the 2D canvas was GPU-accelerated in the GPU runs could not be read directly.
- Demo has only 8 stars; heavy-star scenes (`ns.fillSteps(48)`) were not profiled. Phone CPU x4 is throttling on a fast CPU, not a real phone.
- Timer resolution 0.1 ms; p95 of grouped rows is an upper bound.

## After: GPU dot drawing (SPEC-perf-frame part 2)

Ambient scene, GPU run, 300 frames, median / p95 ms. `framebuffer.js` tone-maps one RGBA texel per grain, uploads it, and a WebGL shader expands it to the P x P / D x D dot picture; `blit()` then copies the GL canvas into `#c` with `drawImage`. `?gl=0` keeps the old 2D path.

| | d125 before | d125 after | d2 before | d2 after | phone x4 before | phone x4 after |
|---|---:|---:|---:|---:|---:|---:|
| blit.paint | 8.4 / 10.0 | 2.6 / 3.6 | 11.2 / 13.7 | 3.3 / 4.5 | 10.4 / 13.4 | 2.9 / 4.4 |
| blit.put | 1.4 / 1.6 | 0.2 / 0.3 | 3.0 / 3.6 | 0.2 / 0.3 | 2.6 / 3.2 | 0.9 / 1.4 |
| CPU total | 16.1 / 18.1 | 8.4 / 10.5 | 20.9 / 24.4 | 9.1 / 11.3 | 24.2 / 28.6 | 13.6 / 18.1 |
| rAF interval | 13.9 / 21.0 | 7.0 / 14.0 | 20.9 / 27.9 | 7.0 / 14.0 | 27.8 / 34.8 | 14.0 / 20.9 |

Deviation from the spec: the spec's two stacked canvases (GL under a transparent `#c`) were built and measured. At fractional dpr (1.25) the page compositor resamples the two layers differently, so shots differed from `?gl=0` by up to 8 levels in about 2.5% of pixels. Copying the GL canvas into `#c` gives byte-identical shots and the same speed, so that is what ships.

## After: tone mapping in the shader (SPEC-perf-frame part 3)

WebGL2 path: `BR/BG/BB` go up as three R32F textures; `TONE` is a 4096x1 R8 texture uploaded once; the fragment shader does `v>=1 -> 255, v>0 -> TONE[floor(v*4096)], else 0` (NaN and negatives give 0, same as the CPU loop). WebGL1 keeps the CPU tone-map. Ambient, GPU run, 300 frames, median / p95 ms:

| | d125 part 2 | d125 now | d2 part 2 | d2 now | phone x4 part 2 | phone x4 now |
|---|---:|---:|---:|---:|---:|---:|
| blit.paint | 2.6 / 3.6 | 0.3 / 0.4 | 3.3 / 4.5 | 0.3 / 0.4 | 2.9 / 4.4 | 0.4 / 0.6 |
| blit.put | 0.2 / 0.3 | 0.1 / 0.2 | 0.2 / 0.3 | 0.1 / 0.2 | 0.9 / 1.4 | 0.5 / 0.9 |
| CPU total | 8.4 / 10.5 | 4.5 / 5.9 | 9.1 / 11.3 | 4.7 / 6.0 | 13.6 / 18.1 | 7.9 / 9.6 |
| rAF interval | 7.0 / 14.0 | 7.0 / 7.1 | 7.0 / 14.0 | 7.0 / 7.1 | 14.0 / 20.9 | 7.0 / 14.0 |

GL vs `?gl=0` shots (steps, finish, labels, ritual, ambient at 1917x933 dpr 1.25 and 375x812 dpr 2, plus the context-loss shot): 0 differing pixels in all 11 pairs. Selftests 136/136.
