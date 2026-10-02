import { expect, test } from '@playwright/test';

/**
 * Cloudflare edge behaviour.
 *
 * These assertions depend on wrangler.jsonc, not on anything in the HTML, so
 * they are invisible to the build-manifest suite. They are also the settings
 * most expensive to get wrong: a broken trailing-slash policy means
 * redirecting every indexed URL, and a soft 404 means Google indexing error
 * pages.
 */

test.describe('URL policy', () => {
  test('a non-trailing-slash URL redirects to the canonical form', async ({ request }) => {
    const response = await request.get('/about', { maxRedirects: 0 });

    expect(
      [301, 307, 308],
      `expected a redirect, got ${response.status()}`,
    ).toContain(response.status());

    const location = response.headers()['location'] ?? '';
    expect(new URL(location, 'http://localhost').pathname).toBe('/about/');
  });

  test('the canonical URL is served directly, with no redirect', async ({ request }) => {
    const response = await request.get('/about/', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });

  test('robots.txt is served and points at the sitemap index', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('Sitemap: https://brycedecora.com/sitemap-index.xml');
  });

  test('the sitemap index is served as XML', async ({ request }) => {
    const response = await request.get('/sitemap-index.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
  });
});

test.describe('404 handling', () => {
  test('an unknown URL returns a real 404 status, not a soft 404', async ({ request }) => {
    /*
     * This is what `not_found_handling: "404-page"` buys. Without it,
     * unmatched paths return 200 with the 404 body -- and Google indexes
     * them as real pages.
     */
    const response = await request.get('/this-page-does-not-exist/');
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Page not found');
  });

  test('the 404 page is noindex and declares no canonical', async ({ page }) => {
    await page.goto('/this-page-does-not-exist/');

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');

    // Served at whatever URL was requested, so it has no canonical of its own.
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
});
