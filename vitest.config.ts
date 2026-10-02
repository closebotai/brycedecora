import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/seo/**/*.spec.ts'],
    // Each spec reads the same manifest from disk; no browser, no server.
    globals: false,
  },
});
