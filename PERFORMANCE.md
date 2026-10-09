# Validation and performance

Validation on October 9, 2026 passed **14 unit tests**, and all **13 Chromium browser cases** were verified across full and targeted runs. One full run hit a software-browser timeout reading state after destruction; the cleanup, hover, and resizing cases passed in a targeted rerun. The production build passed. Browser coverage includes immediate gathering with neighbor contacts, pause/resume/replay, responsive particle and depth-layer counts, magnetic hover and tilt, click/tap ripples, paused input, disabled interaction, offscreen and hidden-tab suspension, reduced motion, WebGL fallback/context restoration, and resource cleanup. Unit coverage includes bounded attraction and ripple displacement, spring stability across frame rates, ripple propagation and reset, protected square motion, sampled depth layers, 20% micro-motion, wave continuity, contact separation, repeatable sampling, and closed cube geometry.

The production preview was checked on desktop and a touch-enabled mobile viewport. Hover attraction, tilt, a click ripple, return to rest, and a touch ripple were captured in `artifacts/desktop-hover.png`, `artifacts/desktop-ripple.png`, and `artifacts/mobile-ripple.png`. `artifacts/interaction-check.json` records the functional snapshots and confirms no browser errors. Counts stayed at 2,400/1,200, with one draw call and the existing triangle counts; the return snapshot had no active ripples or affected particles. These snapshots are not hardware FPS benchmarks.

## Rendering measurements

The most recent full desktop/mobile benchmark was recorded on October 8, 2026, before pointer interaction was added. It used the production build, Chromium 151.0.7922.34, and ANGLE/SwiftShader, a **software WebGL renderer**, on this workspace host. Each sample measured browser frame cadence for eight seconds of the idle animation. The runs use the `#BDC950` palette, cube sides reduced by 30%, gently curved edges and corners, subtle highlights, shaded interior layers, and the frame-step cap.

| Emulated viewport | Particles | Depth layers | Average FPS | 95th-percentile frame time | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop, 1280 × 960, DPR 1 | 2,400 | 3 | 6.4 | 433.3 ms | 1 | 220,800 |
| Mobile, 390 × 844, DPR 2 | 1,200 | 2 | 9.9 | 216.7 ms | 1 | 110,400 |

Both runs reduced rendering pixel ratio to 1 while retaining every cube. Measurements are recorded in `artifacts/performance.json`; the accompanying screenshots show the broad star cloud, arrival wave, completed mark, and drift with the final appearance. The controller's shorter-window FPS snapshot is also included in the raw report.

The software-rendered runs **did not meet the 60 FPS desktop / 30 FPS mobile targets**. Hardware-accelerated desktop and physical mobile profiling remain necessary before homepage integration. The host's default browser configuration also reported SwiftShader, so a hardware comparison was unavailable here.

## Optimizations included

- One instanced mesh, one material, and one draw call.
- A shared, closed rounded cube with 48 indexed vertices and 92 triangles, replacing 324 vertices and 108 triangles per cube. Two arc segments along each edge and curved corners soften the silhouette; smooth normals and subtle Phong highlights reveal the rounding.
- Subtle face and edge shading in the existing shader, without additional shadow-map passes; brighter ambient lighting keeps the base color visible.
- Staggered depth layers redistribute the same particle count, with baked interior darkening. This adds volume behind the smaller front cubes without increasing particle or draw-call counts. Smaller cubes leave more space between neighbors.
- Reused animation buffers and precomputed contact neighborhoods.
- Pointer interaction reuses spring displacement/velocity buffers and a fixed pool of four ripples. Pointer projection uses a single plane intersection instead of testing every cube. All effects use the existing mesh, material, and draw call.
- Responsive initial particle counts (2,400 desktop / 1,200 mobile), capped/adaptive resolution, and suspension when hidden or offscreen.
- At most 100ms of simulation time per frame to preserve the visible impact wave during stalls; below 10 FPS, motion slows instead of skipping stages.

Run `npm run measure` to repeat the measurements and regenerate the screenshots. For hardware profiling, use `PERFORMANCE_GPU=1` on a host with a working GPU; `MEASURE_HEADED=1` selects a visible browser when a display is available.
