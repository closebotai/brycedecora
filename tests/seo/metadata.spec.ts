import { describe, expect, it } from 'vitest';

import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
} from '../../src/schemas/seo';
import { allPages, indexablePages, manifest } from './manifest';

describe('titles', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has a non-empty title',
    (_url, page) => {
      expect(page.title, 'missing <title>').toBeTruthy();
    },
  );

  it.each(indexablePages.map((page) => [page.url, page] as const))(
    '%s title respects the editorial guardrails',
    (_url, page) => {
      const title = page.title ?? '';
      expect(title.length).toBeGreaterThanOrEqual(TITLE_MIN);
      expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    },
  );

  it('every indexable page has a unique title', () => {
    const seen = new Map<string, string[]>();
    for (const page of indexablePages) {
      const key = (page.title ?? '').toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), page.url]);
    }

    const duplicates = [...seen.entries()].filter(([, urls]) => urls.length > 1);
    expect(duplicates, `duplicate titles: ${JSON.stringify(duplicates)}`).toEqual([]);
  });
});

describe('descriptions', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has a meta description',
    (_url, page) => {
      expect(page.description, 'missing meta description').toBeTruthy();
    },
  );

  it.each(indexablePages.map((page) => [page.url, page] as const))(
    '%s description respects the editorial guardrails',
    (_url, page) => {
      const description = page.description ?? '';
      expect(description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    },
  );

  it('every indexable page has a unique description', () => {
    const seen = new Map<string, string[]>();
    for (const page of indexablePages) {
      const key = (page.description ?? '').toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), page.url]);
    }

    const duplicates = [...seen.entries()].filter(([, urls]) => urls.length > 1);
    expect(duplicates, `duplicate descriptions: ${JSON.stringify(duplicates)}`).toEqual([]);
  });
});

describe('canonical URLs', () => {
  /**
   * The 404 body is served at whatever URL was requested, so it has no URL of
   * its own to be canonical to. It is the only legitimate exception, and it
   * is enumerated here rather than skipped by a wildcard.
   */
  const NO_CANONICAL_ALLOWED = ['/404.html'];
  const canonicalPages = allPages.filter((page) => !NO_CANONICAL_ALLOWED.includes(page.url));

  it.each(canonicalPages.map((page) => [page.url, page] as const))(
    '%s has exactly one self-referencing canonical',
    (_url, page) => {
      expect(page.canonical, 'missing <link rel="canonical">').toBeTruthy();

      const canonical = new URL(page.canonical!);
      expect(canonical.origin, 'canonical points at the wrong origin').toBe(manifest.site);
      expect(canonical.pathname, 'canonical does not point at this page').toBe(page.url);
    },
  );

  it.each(NO_CANONICAL_ALLOWED.map((url) => [url] as const))(
    '%s deliberately emits no canonical',
    (url) => {
      const page = allPages.find((candidate) => candidate.url === url);
      expect(page, `${url} was not built`).toBeDefined();
      expect(page!.canonical, 'this page should not declare a canonical').toBeNull();
    },
  );

  it.each(indexablePages.map((page) => [page.url, page] as const))(
    '%s canonical is trailing-slashed',
    (_url, page) => {
      // The one policy that is expensive to change after launch. See the note
      // in src/data/site.ts.
      expect(new URL(page.canonical!).pathname.endsWith('/')).toBe(true);
    },
  );
});

describe('Open Graph and Twitter', () => {
  const required = [
    'og:title',
    'og:description',
    'og:url',
    'og:image',
    'og:type',
    'og:site_name',
    'twitter:card',
  ];

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has the full social card set',
    (_url, page) => {
      for (const key of required) {
        expect(page.openGraph[key], `missing ${key}`).toBeTruthy();
      }
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s og:url points at the page itself',
    (_url, page) => {
      // Compared against the page's own URL rather than its canonical, so the
      // assertion still holds for the 404 page, which has no canonical.
      const ogUrl = page.openGraph['og:url'] ?? '';
      expect(new URL(ogUrl).pathname).toBe(page.url);

      if (page.canonical) {
        expect(ogUrl, 'og:url and canonical disagree').toBe(page.canonical);
      }
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s og:image is absolute and was actually emitted',
    (_url, page) => {
      const image = page.openGraph['og:image'] ?? '';
      expect(image.startsWith('http'), 'og:image must be an absolute URL').toBe(true);

      // A share image that 404s is worse than none -- it fails silently.
      const path = new URL(image).pathname;
      const wasEmitted =
        manifest.files.includes(path) || path.startsWith('/_astro/');
      expect(wasEmitted, `og:image ${path} was not emitted to dist`).toBe(true);
    },
  );
});
