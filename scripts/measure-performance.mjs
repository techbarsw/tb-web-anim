import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.DEMO_URL || 'http://127.0.0.1:5173';
const artifacts = new URL('../artifacts/', import.meta.url);
let server;
let browser;

async function serverAvailable() {
  try { return (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

async function captureAt(page, elapsed, file) {
  await page.waitForFunction((elapsed) => {
    return document.querySelector('#animation').particleLogo?.getState().elapsed >= elapsed;
  }, elapsed, { timeout: 45000 });
  await page.evaluate(() => document.querySelector('#animation').particleLogo.pause());
  await page.screenshot({ path: fileURLToPath(new URL(file, artifacts)), fullPage: true });
  await page.evaluate(() => document.querySelector('#animation').particleLogo.resume());
}

try {
  await mkdir(artifacts, { recursive: true });
  if (!(await serverAvailable())) {
    if (process.env.DEMO_URL) throw new Error(`No demo server at ${baseUrl}.`);
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'ignore' });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await serverAvailable()) { ready = true; break; }
      if (server.exitCode !== null) throw new Error('Could not start Vite.');
      await delay(200);
    }
    if (!ready) throw new Error('Timed out starting the demo server.');
  }
  const softwareRendering = process.env.PERFORMANCE_GPU !== '1';
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: process.env.MEASURE_HEADED !== '1',
    args: softwareRendering ? ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  const results = [];
  for (const scenario of [
    { name: 'desktop', viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ]) {
    const context = await browser.newContext(scenario);
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForSelector('.particle-logo[data-mode="animated"]', { timeout: 60000 });
    if (scenario.name === 'desktop') {
      await captureAt(page, 0.05, 'desktop-ribbon.png');
      await captureAt(page, 1.5, 'desktop-wave.png');
    }
    await captureAt(page, 3.8, `${scenario.name}-mark.png`);
    if (scenario.name === 'desktop') await captureAt(page, 8, 'desktop-drift.png');
    const measured = await page.evaluate(async () => {
      const animation = document.querySelector('#animation').particleLogo;
      const intervals = [];
      let previous;
      const started = performance.now();
      await new Promise((resolve) => {
        function measure(timestamp) {
          if (previous !== undefined) intervals.push(timestamp - previous);
          previous = timestamp;
          if (timestamp - started >= 8000) resolve();
          else requestAnimationFrame(measure);
        }
        requestAnimationFrame(measure);
      });
      const sorted = [...intervals].sort((a, b) => a - b);
      const canvas = document.querySelector('.particle-logo canvas');
      const gl = canvas.getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        averageFps: Number((1000 * intervals.length / intervals.reduce((sum, interval) => sum + interval, 0)).toFixed(1)),
        p95FrameMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
        frames: intervals.length,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        state: animation.getState(),
      };
    });
    results.push({ ...scenario, ...measured });
    console.log(`${scenario.name}: ${measured.averageFps} FPS, p95 ${measured.p95FrameMs} ms, ${measured.state.particleCount} particles, ${measured.state.drawCalls} draw call`);
    await context.close();
  }
  const report = { measuredAt: new Date().toISOString(), browser: browser.version(), softwareRendering, note: 'Desktop and mobile viewport emulations on this host; these do not substitute for physical-device profiling.', results };
  await writeFile(new URL('performance.json', artifacts), JSON.stringify(report, null, 2) + '\n');
  console.log('Saved screenshots and performance.json in artifacts/.');
} finally {
  await browser?.close();
  if (server) server.kill('SIGTERM');
}
