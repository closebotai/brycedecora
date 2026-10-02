import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end smoke tests.
 *
 * Deliberately few. The SEO suite already asserts every structural property
 * from the build manifest in milliseconds; duplicating those checks in a
 * browser would only make CI slower. Playwright is here for the three things a
 * manifest cannot observe:
 *
 *   1. Cloudflare's edge behaviour -- trailing-slash redirects and real 404
 *      status codes, which come from wrangler.jsonc, not from the HTML.
 *   2. Whether the page actually works with JavaScript disabled.
 *   3. Whether anything fixed-position swallows a phone screen. The manifest
 *      has no viewport, and every other check runs at a desktop size, so a
 *      272px ornament sat over the content on mobile for a long time without
 *      one single test going red. See tests/e2e/mobile.spec.ts.
 *
 * It therefore runs against `wrangler dev`, the real Workers runtime serving
 * ./dist, rather than `astro preview`. `astro preview` would answer a
 * different question than the one that matters in production.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The site ships zero client JavaScript, so every page must be fully
      // functional with it switched off. This project proves it.
      name: 'no-javascript',
      use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
      testMatch: /no-js\.spec\.ts/,
    },
  ],

  webServer: {
    command: `pnpm build && pnpm exec wrangler dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
