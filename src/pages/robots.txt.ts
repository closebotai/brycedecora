import type { APIRoute } from 'astro';

/**
 * robots.txt, generated so the sitemap URL derives from `Astro.site` rather
 * than being a second place the domain is written down.
 *
 * Deliberately boring. Two things this file must never be used for:
 *
 *  - Removing pages from the index. Disallow prevents CRAWLING, not indexing;
 *    a blocked URL can still appear in results, and blocking it guarantees the
 *    `noindex` on the page is never seen. Use noindex (see NOINDEX_ROUTES in
 *    src/data/site.ts), which the sitemap filter already honours.
 *  - Crawler micro-management. Elaborate allow/disallow rules mostly create
 *    ways to accidentally block something important.
 */
export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error('Astro.site is undefined. Set `site` in astro.config.ts.');
  }

  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap-index.xml', site).href}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
