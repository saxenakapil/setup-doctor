import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The optional @resvg/resvg-js native binary (PNG export) can be slow to
    // load on some CI runners; give wrapped-command tests room for that.
    testTimeout: 20_000,
  },
});
