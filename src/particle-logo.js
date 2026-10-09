import * as THREE from 'three';
import { createRoundedCubeGeometry } from './cube-geometry.js';
import { createParticleLayout, phaseAt, resolveArrivalContacts, writeParticleTransform } from './particle-layout.js';
import { loadLogoMask } from './logo-mask.js';

/**
 * Mount a decorative animation into an element with a defined width and height.
 * @returns {Promise<{pause: Function, resume: Function, replay: Function, destroy: Function, getState: Function}>}
 */
export async function createParticleLogo(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('container must be an HTMLElement.');
  const smallScreen = matchMedia('(max-width: 767px)').matches;
  const count = options.particleCount ?? (smallScreen ? 1200 : 2400);
  if (!Number.isInteger(count) || count < 1 || count > 12000) throw new RangeError('particleCount must be an integer between 1 and 12000.');
  const depthLayers = options.depthLayers ?? (smallScreen ? 2 : 3);
  if (!Number.isInteger(depthLayers) || depthLayers < 1 || depthLayers > 6) throw new RangeError('depthLayers must be an integer between 1 and 6.');
  const logoUrl = options.logoUrl ?? new URL('logo.svg', document.baseURI).href;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('div');
  root.className = 'particle-logo';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
  const fallback = new Image();
  fallback.className = 'particle-logo-fallback';
  fallback.src = logoUrl;
  fallback.alt = '';
  fallback.style.cssText = 'position:absolute;left:0;top:13%;width:100%;height:74%;object-fit:contain;pointer-events:none;';
  root.append(fallback);
  container.append(root);

  let renderer, mesh, geometry, material, scene, camera, layout;
  let resizeObserver, intersectionObserver;
  let elapsed = 0, raf = 0, previousTime = null, lastEmit = -Infinity;
  let destroyed = false, manuallyPaused = false, inView = true, contextLost = false;
  let mode = 'static', reason = motionPreference.matches ? 'reduced-motion' : 'webgl-unavailable';
  let width = 0, height = 0, squeeze = 1, fps = 0;
  let sampleStarted = null, sampleFrames = 0, samples = 0;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, smallScreen ? 1.25 : 1.5);
  let positions, orientations, contacts = 0;
  const transform = {};
  const dummy = new THREE.Object3D();
  const canRun = () => !destroyed && mode === 'animated' && !manuallyPaused && inView && !document.hidden && !motionPreference.matches && !contextLost && width > 0 && height > 0;
  const getState = () => ({
    mode: motionPreference.matches || contextLost ? 'static' : mode,
    reason: motionPreference.matches ? 'reduced-motion' : reason,
    phase: mode === 'animated' ? phaseAt(elapsed) : 'static',
    elapsed, paused: manuallyPaused, running: canRun(), destroyed,
    particleCount: layout?.count ?? 0, driftingCount: layout?.driftingCount ?? 0,
    depthLayers: layout?.depthLayers ?? 0,
    fps, pixelRatio: renderer ? pixelRatio : 0,
    drawCalls: renderer?.info.render.calls ?? 0,
    triangles: renderer?.info.render.triangles ?? 0,
    contacts,
  });
  const emit = () => {
    if (destroyed) return;
    const state = getState();
    root.dataset.mode = state.mode;
    root.dataset.phase = state.phase;
    root.dispatchEvent(new CustomEvent('particlelogo:state', { bubbles: true, detail: state }));
  };
  const showFallback = (show) => { fallback.hidden = !show; };
  const showCanvas = (show) => {
    if (!renderer) return;
    renderer.domElement.hidden = !show;
    renderer.domElement.style.display = show ? 'block' : 'none';
  };

  function draw() {
    if (!renderer || !layout || !width || !height || contextLost || destroyed) return;
    for (let index = 0; index < count; index++) {
      writeParticleTransform(layout, index, elapsed, squeeze, transform);
      const p = index * 3, r = index * 4;
      positions[p] = transform.x; positions[p + 1] = transform.y; positions[p + 2] = transform.z;
      orientations[r] = transform.rx; orientations[r + 1] = transform.ry; orientations[r + 2] = transform.rz; orientations[r + 3] = transform.scale;
    }
    contacts = resolveArrivalContacts(layout, positions, elapsed);
    for (let index = 0; index < count; index++) {
      const p = index * 3, r = index * 4;
      dummy.position.set(positions[p], positions[p + 1], positions[p + 2]);
      dummy.rotation.set(orientations[r], orientations[r + 1], orientations[r + 2]);
      dummy.scale.setScalar(orientations[r + 3]);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    showFallback(motionPreference.matches);
    showCanvas(!motionPreference.matches);
  }

  function syncPlayback() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    previousTime = null;
    sampleStarted = null;
    sampleFrames = 0;
    if (canRun()) raf = requestAnimationFrame(frame);
    if (renderer) {
      showCanvas(!motionPreference.matches && !contextLost);
      showFallback(motionPreference.matches || contextLost);
    }
    emit();
  }

  function frame(timestamp) {
    raf = 0;
    // Media-query matches can change before its change event is delivered.
    // Apply the static view here too, rather than stopping on a visible canvas.
    if (!canRun()) { syncPlayback(); return; }
    // Long GPU frames must not skip the entire impact wave. Normal refresh
    // rates keep real-time timing; slow renderers progress through the poses.
    if (previousTime !== null) elapsed += Math.min(0.1, (timestamp - previousTime) / 1000);
    previousTime = timestamp;
    draw();
    if (sampleStarted === null) sampleStarted = timestamp;
    sampleFrames++;
    const sampleDuration = (timestamp - sampleStarted) / 1000;
    if (sampleDuration >= 1.2) {
      fps = (sampleFrames - 1) / sampleDuration;
      // Reduce resolution, never particle count, so particles retain their identities.
      const target = smallScreen ? 30 : 60;
      if (++samples > 1 && fps < target * 0.75 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
      sampleStarted = timestamp;
      sampleFrames = 1;
    }
    if (timestamp - lastEmit >= 250) { emit(); lastEmit = timestamp; }
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (destroyed || !renderer) return;
    width = root.clientWidth;
    height = root.clientHeight;
    if (width && height) {
      const aspect = width / height;
      squeeze = Math.min(1, Math.max(0.35, aspect * 0.9));
      const sceneHeight = Math.max(9.9, 10.9 * squeeze / aspect, (layout.aspect * 8 + 1.4) / aspect);
      camera.left = -sceneHeight * aspect / 2;
      camera.right = sceneHeight * aspect / 2;
      camera.top = sceneHeight / 2;
      camera.bottom = -sceneHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      draw();
    }
    syncPlayback();
  }

  function onMotionChange() { draw(); syncPlayback(); }
  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    reason = 'context-lost';
    syncPlayback();
  }
  function onContextRestored() {
    contextLost = false;
    reason = null;
    resize();
  }

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', syncPlayback);
    motionPreference.removeEventListener('change', onMotionChange);
    renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
    renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored);
    geometry?.dispose();
    material?.dispose();
    mesh?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    root.remove();
  }

  const controller = {
    getState,
    pause() { if (!destroyed) { manuallyPaused = true; syncPlayback(); } },
    resume() { if (!destroyed) { manuallyPaused = false; syncPlayback(); } },
    replay() {
      if (destroyed) return;
      elapsed = 0; manuallyPaused = false; lastEmit = -Infinity;
      draw(); syncPlayback();
    },
    destroy: dispose,
  };

  // Reduced-motion visitors never allocate a WebGL context or load particle data.
  if (motionPreference.matches) { emit(); return controller; }
  const canvas = document.createElement('canvas');
  let context;
  try { context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' }); } catch { context = null; }
  if (!context) { emit(); return controller; }
  try {
    layout = createParticleLayout(await loadLogoMask(logoUrl), count, options.seed ?? 17, depthLayers);
    positions = new Float32Array(count * 3);
    orientations = new Float32Array(count * 4);
    renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0xffffff, 0);
    canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    root.append(canvas);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 40);
    // A modest angle exposes the layered sides without changing the glyph.
    camera.position.set(2.6, 0.7, 14);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-4, 7, 8);
    scene.add(light);
    geometry = createRoundedCubeGeometry();
    material = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x30351e, shininess: 36 });
    // Darken the seams and bevels in the existing draw call. This gives small
    // cubes contact shading without an expensive per-frame shadow-map pass.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCubeLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCubeLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCubeLocal;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 localAbs = abs(vCubeLocal);
          float edgeCoordinate = max(min(localAbs.x, localAbs.y), min(max(localAbs.x, localAbs.y), localAbs.z));
          diffuseColor.rgb *= 1.0 - 0.14 * smoothstep(0.32, 0.50, edgeCoordinate);`);
    };
    material.customProgramCacheKey = () => 'particle-cube-contact-shading-v2';
    mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // All cubes belong to one animated object; its initial ribbon bounds are not its later logo bounds.
    mesh.frustumCulled = false;
    const base = new THREE.Color(options.color ?? '#BDC950');
    const hsl = {};
    base.getHSL(hsl);
    const color = new THREE.Color();
    for (let index = 0; index < count; index++) {
      const variation = layout.colorVariation[index];
      color.setHSL(hsl.h + (variation - 0.5) * 0.018, hsl.s, Math.max(0.1, Math.min(0.85, hsl.l + (variation - 0.5) * 0.15)));
      // Baked interior occlusion: keep the front bright while the cubes seen
      // between it and along the sides reveal the darker, solid volume.
      const depth = layout.layers[index] / Math.max(1, layout.depthLayers - 1);
      color.multiplyScalar(1 - depth * 0.42);
      mesh.setColorAt(index, color);
    }
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    mode = 'animated'; reason = null;
    document.addEventListener('visibilitychange', syncPlayback);
    motionPreference.addEventListener('change', onMotionChange);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    intersectionObserver = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncPlayback(); }, { threshold: 0 });
    intersectionObserver.observe(root);
    resize();
    return controller;
  } catch (error) {
    dispose();
    if (!renderer) context.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
}
