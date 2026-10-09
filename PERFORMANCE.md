# Validation and performance

The implementation passed **10 unit tests and 9 Chromium browser tests** on October 8, 2026. The production build passed, and its desktop and mobile rendering was checked through the production preview. Browser coverage includes immediate gathering with neighbor contacts, pause/resume/replay, fixed responsive particle and depth-layer counts, offscreen and hidden-tab suspension, reduced motion, WebGL fallback and context restoration, and resource cleanup. Unit coverage includes staggered depth layers preserving both components and total cube count, bounded 20% micro-motion, wave continuity, contact separation, repeatable sampling, and closed cube geometry.

## Rendering measurements

The latest full measurement used the production build, Chromium 151.0.7922.34, and ANGLE/SwiftShader, a **software WebGL renderer**, on this workspace host. Each sample measured browser frame cadence for eight seconds of the idle animation. The runs use the `#BDC950` palette, cube sides reduced by 30%, gently curved edges and corners, subtle highlights, shaded interior layers, and the frame-step cap.

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
- Responsive initial particle counts (2,400 desktop / 1,200 mobile), capped/adaptive resolution, and suspension when hidden or offscreen.
- At most 100ms of simulation time per frame to preserve the visible impact wave during stalls; below 10 FPS, motion slows instead of skipping stages.

Run `npm run measure` to repeat the measurements and regenerate the screenshots. For hardware profiling, use `PERFORMANCE_GPU=1` on a host with a working GPU; `MEASURE_HEADED=1` selects a visible browser when a display is available.
