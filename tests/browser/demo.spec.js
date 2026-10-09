import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => document.querySelector('#animation').particleLogo.getState());

test('loading stays hidden until the first render, then fades in once over half a second', async ({ page }) => {
  let releaseLogo;
  const logoReady = new Promise((resolve) => { releaseLogo = resolve; });
  await page.route('**/logo.svg', async (route) => {
    await logoReady;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    const composition = page.locator('.particle-logo');
    await expect(composition).toHaveAttribute('data-ready', 'false');
    await expect(composition).toHaveCSS('opacity', '0');
    await expect(page.locator('.initial-mark')).toHaveCSS('opacity', '0');
    await expect(composition.locator('canvas')).toHaveCount(0);

    releaseLogo();
    await expect(composition).toHaveAttribute('data-mode', 'animated', { timeout: 15000 });
    await expect(composition).toHaveAttribute('data-ready', 'true');
    await expect(composition).toHaveCSS('transition-duration', '0.5s');
    await expect(composition).toHaveCSS('opacity', '1');
    await expect(composition.locator('canvas')).toBeVisible();
    await expect(page.locator('.particle-logo-fallback')).toBeHidden();
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(composition).toHaveCSS('opacity', '1');
    await expect(composition).toHaveAttribute('data-ready', 'true');
  } finally {
    releaseLogo();
  }
});

test('intro reaches a legible mark, drifts, pauses, and replays without changing particle count', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await expect(page.locator('.particle-logo')).toHaveCount(1);
  const initial = await state(page);
  expect(initial.particleCount).toBe(2400);
  expect(initial.depthLayers).toBe(3);
  expect(initial.driftingCount).toBe(240);
  expect(initial.drawCalls).toBe(1);
  await expect(page.locator('#phase-label')).toHaveText('Drifting', { timeout: 20000 });
  await page.getByRole('button', { name: 'Pause animation' }).click();
  const paused = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).elapsed).toBe(paused.elapsed);
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(paused.elapsed);
  await page.getByRole('button', { name: 'Replay' }).click();
  expect((await state(page)).elapsed).toBeLessThan(1);
  expect((await state(page)).particleCount).toBe(initial.particleCount);
  expect(errors).toEqual([]);
});

test('a gathering wave starts immediately and generates neighbor contacts', async ({ page }) => {
  await page.addInitScript(() => {
    window.observedContacts = 0;
    document.addEventListener('particlelogo:state', (event) => { window.observedContacts = Math.max(window.observedContacts, event.detail.contacts); });
  });
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await expect.poll(async () => (await state(page)).phase).not.toBe('flowing');
  expect((await state(page)).elapsed).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => window.observedContacts), { timeout: 20000 }).toBeGreaterThan(0);
});

test('small screens use fewer cubes; resizing and offscreen suspension preserve their identities', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  expect((await state(page)).particleCount).toBe(1200);
  expect((await state(page)).depthLayers).toBe(2);
  await page.setViewportSize({ width: 1280, height: 960 });
  expect((await state(page)).particleCount).toBe(1200);
  expect((await state(page)).depthLayers).toBe(2);
  await page.evaluate(() => { document.querySelector('#animation').style.marginTop = '2000px'; });
  await expect.poll(async () => (await state(page)).running).toBe(false);
  const stopped = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).elapsed).toBe(stopped.elapsed);
  await page.evaluate(() => { document.querySelector('#animation').style.marginTop = ''; });
  await expect.poll(async () => (await state(page)).running).toBe(true);
  expect((await state(page)).elapsed - stopped.elapsed).toBeLessThan(1);
});

test('reduced motion renders the static SVG without creating a canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#phase-label')).toHaveText('Still mark');
  await expect(page.locator('.particle-logo-fallback')).toBeVisible();
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.particle-logo')).toHaveCSS('opacity', '1');
  await expect(page.locator('.particle-logo')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.particle-logo canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeDisabled();
  expect((await state(page)).reason).toBe('reduced-motion');
});

test('hidden-tab suspension freezes time and respects a manual pause on return', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await page.evaluate(() => {
    window.testHidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.testHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const stopped = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).elapsed).toBe(stopped.elapsed);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  expect((await state(page)).running).toBe(false);
  expect((await state(page)).elapsed).toBe(stopped.elapsed);
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(async () => (await state(page)).running).toBe(true);
});

test('changing reduced-motion preference pauses and restores an existing scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.particle-logo-fallback')).toBeVisible();
  await expect(page.locator('.particle-logo canvas')).toBeHidden();
  const stopped = await state(page);
  await page.waitForTimeout(250);
  expect((await state(page)).elapsed).toBe(stopped.elapsed);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.particle-logo canvas')).toBeVisible();
  await expect.poll(async () => (await state(page)).running).toBe(true);
});

test('WebGL unavailable leaves a usable static mark', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : getContext.call(this, type, ...args); };
  });
  await page.goto('/');
  await expect(page.locator('#phase-label')).toHaveText('Still mark');
  await expect(page.locator('.particle-logo-fallback')).toBeVisible();
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.particle-logo')).toHaveCSS('opacity', '1');
  expect((await state(page)).reason).toBe('webgl-unavailable');
});

test('context loss shows a static fallback and restoration resumes the same particles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await page.evaluate(() => {
    const canvas = document.querySelector('.particle-logo canvas');
    window.contextLoss = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    window.contextLoss.loseContext();
  });
  await expect(page.locator('.particle-logo-fallback')).toBeVisible();
  await expect.poll(async () => (await state(page)).running).toBe(false);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.contextLoss.restoreContext());
  await expect.poll(async () => (await state(page)).running).toBe(true);
  expect((await state(page)).particleCount).toBe(2400);
});

test('destroy is idempotent and invalid SVG initialization cleans up its DOM', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await page.evaluate(() => {
    const animation = document.querySelector('#animation').particleLogo;
    animation.destroy(); animation.destroy(); animation.replay(); animation.resume();
  });
  await expect(page.locator('.particle-logo')).toHaveCount(0);
  expect((await state(page)).destroyed).toBe(true);
  const result = await page.evaluate(async () => {
    const { createParticleLogo } = await import('/src/particle-logo.js');
    const host = document.querySelector('#animation');
    try { await createParticleLogo(host, { logoUrl: '/index.html' }); } catch (error) { return { message: error.message, roots: host.querySelectorAll('.particle-logo').length }; }
  });
  expect(result.message).toMatch(/valid SVG/);
  expect(result.roots).toBe(0);
});

test('hover tilts the composition, attracts nearby cubes, and settles when the pointer leaves', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  const bounds = await page.locator('#animation').boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.54, bounds.y + bounds.height * 0.42);
  await expect.poll(async () => Math.abs((await state(page)).interaction.tiltY), { timeout: 15000 }).toBeGreaterThan(0.0005);
  await expect.poll(async () => (await state(page)).interaction.affectedParticles).toBeGreaterThan(0);
  const hovering = await state(page);
  expect(hovering.interactive).toBe(true);
  expect(hovering.interaction.pointerActive).toBe(true);
  expect(hovering.interaction.maxDisplacement).toBeGreaterThan(0.001);
  expect(hovering.particleCount).toBe(2400);
  expect(hovering.drawCalls).toBe(1);
  await page.mouse.move(10, 10);
  await expect.poll(async () => (await state(page)).interaction.pointerActive).toBe(false);
  await expect.poll(async () => (await state(page)).interaction.maxDisplacement, { timeout: 15000 }).toBeLessThan(0.001);
  await expect.poll(async () => Math.abs((await state(page)).interaction.tiltY), { timeout: 15000 }).toBeLessThan(0.0001);
});

test('click ripples animate, pause with the clock, stay inside the demo, and reset on replay', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await expect.poll(async () => (await state(page)).elapsed, { timeout: 25000 }).toBeGreaterThan(3.6);
  const bounds = await page.locator('#animation').boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
  await expect.poll(async () => (await state(page)).interaction.activeRipples).toBe(1);
  await expect.poll(async () => (await state(page)).interaction.maxDisplacement, { timeout: 10000 }).toBeGreaterThan(0.16);
  await page.evaluate(() => document.querySelector('#animation').particleLogo.pause());
  const paused = await state(page);
  await page.mouse.click(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.52);
  await page.waitForTimeout(300);
  const frozen = await state(page);
  expect(frozen.elapsed).toBe(paused.elapsed);
  expect(frozen.interaction.activeRipples).toBe(paused.interaction.activeRipples);
  expect(frozen.interaction.maxDisplacement).toBe(paused.interaction.maxDisplacement);
  expect(frozen.interaction.tiltY).toBe(paused.interaction.tiltY);
  await page.evaluate(() => document.querySelector('#animation').particleLogo.resume());
  await expect.poll(async () => (await state(page)).interaction.activeRipples, { timeout: 15000 }).toBe(0);
  await page.mouse.click(250, 200);
  expect((await state(page)).interaction.activeRipples).toBe(0);
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
  await page.getByRole('button', { name: 'Replay' }).click();
  const replayed = await state(page);
  expect(replayed.elapsed).toBeLessThan(1);
  expect(replayed.interaction.activeRipples).toBe(0);
  expect(replayed.interaction.tiltY).toBe(0);
  expect(replayed.particleCount).toBe(2400);
});

test('touch taps produce ripples without a persistent hover or tilt', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:5174/');
    await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
    const bounds = await page.locator('#animation').boundingBox();
    await page.touchscreen.tap(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    const tapped = await state(page);
    expect(tapped.particleCount).toBe(1200);
    expect(tapped.interaction.activeRipples).toBe(1);
    expect(tapped.interaction.pointerActive).toBe(false);
    expect(tapped.interaction.tiltX).toBe(0);
    expect(tapped.interaction.tiltY).toBe(0);
  } finally { await context.close(); }
});

test('embedding can disable interaction while the automatic animation continues', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.particle-logo')).toHaveAttribute('data-mode', 'animated');
  await page.evaluate(async () => {
    const host = document.querySelector('#animation');
    host.particleLogo.destroy();
    const { createParticleLogo } = await import('/src/particle-logo.js');
    host.particleLogo = await createParticleLogo(host, { particleCount: 300, interactive: false });
  });
  const initial = await state(page);
  expect(initial.interactive).toBe(false);
  const bounds = await page.locator('#animation').boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.45);
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(initial.elapsed);
  expect((await state(page)).interaction).toEqual({ pointerActive: false, tiltX: 0, tiltY: 0, activeRipples: 0, affectedParticles: 0, maxDisplacement: 0 });
});
