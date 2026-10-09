# Particle logo demo

A wide, folded, star-shaped ribbon cloud of green rounded cubes gathers into a lowercase **t** and a detached square. The finished mark has staggered depth layers, a bright front, and a darker interior, seen from a slight angle. The cloud has uneven density and independently shifting inner and outer edges. Gathering starts immediately, with a wave of arrivals, damped rebounds, and short-range neighbor contacts. After the intro, approximately 10% of the cubes along the letter's edges drift out and return every eight seconds. Every cube also moves gently around its center, bounded to 20% of its size. The square stays intact. Every cube exists throughout the animation.

Move the pointer over the composition to tilt it gently and attract nearby cubes. Click to send an outward ripple that returns to the authored shape. Touch devices support tap ripples while retaining normal page scrolling.

## Run locally

Use Node.js 22.12+ (or a current supported Node release).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Pause/resume and replay controls sit below the animation.

```sh
npm run build
npm run preview
```

The production output is in `dist/`. The demo has no runtime dependencies on remote fonts, services, or video files.

## Replace the artwork

`public/logo.svg` is a **draft traced by eye from the screenshots**, not an exact font match. Replace it with an SVG export of the approved glyph and square. Use filled vector outlines, a transparent background, and a `viewBox`; leave a visible gap between the square and letter. Avoid embedded fonts, external images, or an opaque background rectangle: the animation samples every opaque pixel.

The largest connected filled shape is treated as the letter. Other components, including the separate square, remain intact during the idle drift. Particle destinations are generated from the SVG on initialization; changing the artwork requires recreating the controller.

## Embed in a website

Copy the animation modules from `src/` (`particle-logo.js`, `particle-layout.js`, `particle-interaction.js`, `cube-geometry.js`, and `logo-mask.js`) into your application, install `three`, and provide the SVG as a same-origin static asset. No demo stylesheet is needed. Give the container an explicit height; the canvas fills it with a transparent background.

```html
<div id="hero-particles" style="width:100%;height:520px" aria-hidden="true"></div>
```

```js
import { createParticleLogo } from './particle-logo.js';

const logo = await createParticleLogo(document.querySelector('#hero-particles'), {
  logoUrl: '/logo.svg',
  color: '#BDC950',
  seed: 17,
  // particleCount: 2400, // Optional override of the responsive default.
  // interactive: false, // Optional: retain only the automatic animation.
});

logo.pause();
logo.resume();
logo.replay(); // Restarts the ribbon intro and resumes playback.
logo.destroy(); // Call when the component unmounts; safe to call twice.
```

Call initialization only in the browser and await it before using the controller. A malformed or inaccessible SVG rejects initialization and removes any partially created animation; retain your own static logo as a loading/error placeholder if needed.

| Option | Default | Behavior |
| --- | --- | --- |
| `logoUrl` | `logo.svg` relative to the document base URL | Self-contained SVG; cross-origin URLs need CORS. |
| `particleCount` | 1,200 below 768px; 2,400 otherwise | Integer from 1 to 12,000, fixed at initialization. |
| `depthLayers` | 2 below 768px; 3 otherwise | Integer from 1 to 6, capped at particle count. Distributes the same total cubes across staggered layers. |
| `color` | `#BDC950` | Base cube color, with small seeded variations. |
| `seed` | `17` | Number or string for repeatable sampling and movement. |
| `interactive` | `true` | Enables pointer tilt, magnetic attraction, and click/tap ripples within the container. Set `false` for automatic motion only. |

`getState()` returns a read-only snapshot containing mode, phase, elapsed animation seconds, manual pause state, whether rendering is running, particle/drift counts, depth-layer count, measured FPS, pixel ratio, and draw calls. The container also receives a bubbling `particlelogo:state` event about four times per second and on playback changes. This can drive surrounding controls without adding UI to the animation itself.

The snapshot also reports `interactive` and an `interaction` object containing pointer activity, tilt angles in radians, active ripple count, affected particle count, and the largest local displacement in scene units.

## Pointer interaction

- Hover tilts the entire 3D composition by up to 3° and adds a small parallax shift. Nearby cubes lean toward the pointer within a soft influence area. A damped spring returns them as the pointer moves away or leaves the container.
- Clicks send a wave outward, briefly displacing and rotating cubes before they settle. Each ripple lasts 2.6 animation seconds; up to four overlap, with their combined displacement capped. The detached square responds more gently to preserve its shape.
- Interaction is weaker during gathering and reaches full strength as the logo forms. Pointer effects are added to the existing poses; destinations, particle identities, cube counts, and the automatic drift remain intact.
- Pause freezes hover movement and ripples with the animation clock. Clicks while paused, offscreen, hidden, or in reduced-motion mode are ignored. Replay clears pointer offsets, tilt, and ripples before restarting the intro.
- Touch movement does not create a persistent magnetic field or tilt. Taps trigger ripples; listeners do not capture pointers or prevent normal scrolling. Reduced-motion and unavailable-WebGL visitors retain the static SVG.
- Pointer listeners attach to the animation root, so surrounding links and controls keep their usual behavior. Destruction removes these listeners along with the rendering resources.

The animation is decorative. Provide any necessary brand name or equivalent accessible content in the surrounding page.

## Performance and lifecycle

- One instanced mesh shares a closed rounded cube with 48 vertices and 92 triangles. Two arc segments along each edge, curved corners, smooth normals, and a subtle Phong highlight soften its shape while preserving flat faces. Bright ambient lighting, a directional light, and subtle shader-based seam shading give depth without shadow maps or postprocessing. The 2,400/1,200 responsive defaults use 20% fewer particles than the first version.
- Pixel ratio is capped at 1.5 on desktop and 1.25 on small screens. Sustained slow frames reduce the ratio toward 1, preserving all cubes.
- Intro timing: no cloud dwell, approximately 3.6 seconds of gathering and settling, a brief 0.4-second hold, then an eight-second breathing cycle. Each cube has a wave-based delay, accelerated travel, and a short damped impact response. A small precomputed neighborhood supplies soft separation during arrivals, rather than a full rigid-body engine.
- Finished positions use shuffled, jittered sampling in three staggered layers on desktop and two on small screens. Cube sides are 30% smaller than the original layered version, with the same destinations and particle counts. Rear cubes add depth behind the front. Seeded color variations and baked interior darkening suggest occlusion between layers while keeping front faces bright. A slight camera angle exposes the sides. Continuous, seeded micro-motion remains within 20% of each cube's side around its moving center.
- Offscreen and hidden-tab suspension freezes the animation clock; returning to the page continues from the same moment. Resizing preserves particle identities and adjusts camera framing.
- Interaction reuses displacement and velocity buffers, projects the pointer onto the composition plane once per frame, and uses the existing mesh and draw call. Ripple storage is fixed in size.
- Frame time advances by at most 100ms per rendered frame so a stalled or slow renderer cannot skip the arrival wave. Below 10 FPS, the intro runs more slowly instead of jumping to the completed mark.
- Reduced-motion visitors and browsers without WebGL 2 get the static SVG with no animation loop. Initially static instances stay static until recreated. An existing animated instance responds to preference changes and restores motion when allowed.
- WebGL context loss shows the static mark; context restoration resumes the existing particles. `destroy()` removes the canvas, observers, listeners, animation frame, and GPU resources.

## Validate and measure

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run measure
```

The browser suite runs on a separate test server at port 5174 with file watching and hot reload disabled. It covers the immediate arrival wave and contacts, intro, drift, controls, responsive density and layer counts, hover attraction/tilt and return, click/tap ripples, paused input, replay reset, disabled interaction, offscreen suspension, reduced motion, WebGL fallback/context recovery, invalid SVG cleanup, and destruction. Unit tests verify sampled destinations stay inside the mask, staggered layers preserve both components, seeded layouts are repeatable, micro-motion stays bounded, neighbors separate on impact, and phase transitions are continuous. Interaction tests verify spring stability across frame rates, local attraction, wave propagation, bounded rapid clicks, protection of the square, and complete reset.

`npm run measure` starts a local Vite server if needed, captures ribbon/mark/drift screenshots, and records eight-second frame measurements at desktop and mobile sizes in `artifacts/performance.json`. By default it uses Chromium's software WebGL renderer for reproducibility. These are host measurements, **not physical mobile-device benchmarks**. Target 60 FPS on desktop and 30 FPS on mobile; profile on the actual target devices before homepage integration. See `PERFORMANCE.md` for the latest checked results.

If Chromium is already installed elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable. `DEMO_URL` can select an existing development server. Set `PERFORMANCE_GPU=1` to use the browser's default GPU configuration and `MEASURE_HEADED=1` for a visible browser when a display is available.
