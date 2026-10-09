import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => document.querySelector('#animation').particleLogo.getState());

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
