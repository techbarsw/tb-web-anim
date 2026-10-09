import { test, expect } from '@playwright/test';

for (const prefix of ['/', '/tb-web-anim/']) {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    test(`built demo loads at ${prefix} with ${reducedMotion} motion`, async ({ page }) => {
      const errors = [], failedAssets = [], requestedPaths = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => failedAssets.push(request.url()));
      page.on('response', (response) => {
        if (response.status() >= 400) failedAssets.push(response.url());
        if (response.url().startsWith('http:')) requestedPaths.push(new URL(response.url()).pathname);
      });
      await page.emulateMedia({ reducedMotion });
      await page.goto(prefix);
      const composition = page.locator('.particle-logo');
      await expect(composition).toHaveAttribute('data-ready', 'true');
      await expect(composition).toHaveCSS('opacity', '1');
      const assetLinks = await page.evaluate(async () => {
        const logo = document.querySelector('.source-link').href;
        const favicon = document.querySelector('link[rel="icon"]').href;
        const responses = await Promise.all([fetch(logo), fetch(favicon)]);
        return { paths: [logo, favicon].map((url) => new URL(url).pathname), ok: responses.every((response) => response.ok) };
      });
      expect(assetLinks).toEqual({ paths: [`${prefix}logo.svg`, `${prefix}favicon.svg`], ok: true });

      if (reducedMotion === 'reduce') {
        await expect(composition).toHaveAttribute('data-mode', 'static');
        await expect(composition.locator('canvas')).toHaveCount(0);
        await expect(page.locator('.particle-logo-fallback')).toBeVisible();
        expect(await page.locator('.particle-logo-fallback').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      } else {
        await expect(composition).toHaveAttribute('data-mode', 'animated');
        await expect(composition.locator('canvas')).toBeVisible();
        await page.getByRole('button', { name: 'Pause animation' }).click();
        const elapsed = await page.evaluate(() => document.querySelector('#animation').particleLogo.getState().elapsed);
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => document.querySelector('#animation').particleLogo.getState().elapsed)).toBe(elapsed);
        await page.getByRole('button', { name: 'Replay' }).click();
        const replayed = await page.evaluate(() => document.querySelector('#animation').particleLogo.getState());
        expect(replayed.running).toBe(true);
        expect(replayed.elapsed).toBeLessThan(1);
        expect(replayed.particleCount).toBe(2400);
      }
      expect(requestedPaths).toContain(`${prefix}logo.svg`);
      expect(requestedPaths.every((path) => path.startsWith(prefix))).toBe(true);
      expect(failedAssets).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
