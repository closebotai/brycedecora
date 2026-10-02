import { describe, expect, it } from 'vitest';

import { NOINDEX_ROUTES } from '../../src/data/site';
import { allPages, indexablePages, manifest, pagesByUrl } from './manifest';

const sitemapPaths = new Set(manifest.sitemapUrls.map((url) => new URL(url).pathname));

describe('indexability', () => {
  it('no page is unintentionally noindex', () => {
    /*
     * An accidental noindex is the single most expensive SEO mistake, and the
     * quietest -- the page builds, deploys, looks perfect, and never ranks.
     * Anything noindex must be declared in NOINDEX_ROUTES (or be the 404).
     */
    const unexpected = allPages
      .filter((page) => !page.indexable)
      .filter((page) => !NOINDEX_ROUTES.includes(page.url) && page.url !== '/404.html')
      .map((page) => page.url);

    expect(unexpected, 'these pages are noindex but not declared as such').toEqual([]);
  });

  it.each(NOINDEX_ROUTES.map((route) => [route] as const))(
    '%s is actually noindex',
    (route) => {
      const page = pagesByUrl.get(route);
      expect(page, `NOINDEX_ROUTES lists ${route} but no such page was built`).toBeDefined();
      expect(page!.indexable, 'declared noindex but the meta tag says otherwise').toBe(false);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has an explicit robots directive',
    (_url, page) => {
      expect(page.robots, 'missing <meta name="robots">').toBeTruthy();
    },
  );
});

describe('sitemap', () => {
  it('contains every indexable page', () => {
    const missing = indexablePages
      .filter((page) => page.url !== '/404.html')
      .filter((page) => !sitemapPaths.has(page.url))
      .map((page) => page.url);

    expect(missing, 'these indexable pages are absent from the sitemap').toEqual([]);
  });

  it('excludes every noindex page', () => {
    /*
     * The contradiction this prevents: listing a URL in the sitemap ("please
     * index this") while the page says noindex ("do not index this"). Both
     * derive from NOINDEX_ROUTES, so they cannot disagree -- this asserts the
     * wiring is still intact.
     */
    const contradictions = allPages
      .filter((page) => !page.indexable)
      .filter((page) => sitemapPaths.has(page.url))
      .map((page) => page.url);

    expect(contradictions, 'these pages are noindex but listed in the sitemap').toEqual([]);
  });

  it('lists only canonical URLs that were actually built', () => {
    const problems: string[] = [];

    for (const url of manifest.sitemapUrls) {
      const parsed = new URL(url);

      if (parsed.origin !== manifest.site) {
        problems.push(`${url} (wrong origin)`);
        continue;
      }

      const page = pagesByUrl.get(parsed.pathname);
      if (!page) {
        problems.push(`${url} (no such page)`);
        continue;
      }

      // A sitemap URL that canonicalises elsewhere sends a mixed signal.
      if (page.canonical !== url) {
        problems.push(`${url} (canonicalises to ${page.canonical})`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('has no duplicate entries', () => {
    const counts = new Map<string, number>();
    for (const url of manifest.sitemapUrls) {
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([url]) => url);
    expect(duplicates).toEqual([]);
  });
});

describe('robots.txt', () => {
  it('was emitted and points at the sitemap index', () => {
    expect(manifest.files).toContain('/robots.txt');
    expect(manifest.files).toContain('/sitemap-index.xml');
  });
});
