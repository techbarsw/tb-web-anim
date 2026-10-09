import { defineConfig } from '@playwright/test';
import demoConfig from './playwright.config.js';

export default defineConfig({
  ...demoConfig,
  testDir: './tests/production',
  use: {
    ...demoConfig.use,
    baseURL: 'http://127.0.0.1:5175',
  },
  webServer: {
    command: 'node tests/fixtures/serve-build.mjs',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
});
