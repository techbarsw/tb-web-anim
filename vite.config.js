import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    // Browser tests need a stable scene even while the demo is being edited.
    hmr: mode === 'test' ? false : undefined,
    watch: mode === 'test' ? null : {
      ignored: ['**/artifacts/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
}));
