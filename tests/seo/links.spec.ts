import { describe, expect, it } from 'vitest';

import { ORPHAN_ALLOWLIST } from '../../src/data/navigation';
import { person, sameAs } from '../../src/data/person';
import { allPages, emittedFiles, indexablePages, pagesByUrl } from './manifest';

/** A link target resolves if it is a built page or any other emitted file. */
const resolves = (path: string, href: string) =>
  pagesByUrl.has(path) || emittedFiles.has(path) || emittedFiles.has(href.split(/[?#]/)[0] ?? href);

describe('internal links', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has no broken internal links',
    (_url, page) => {
      const broken = page.internalLinksOut.filter((link) => !resolves(link.path, link.href));
      expect(broken.map((l) => l.href), 'these hrefs do not match any emitted file').toEqual([]);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s never links to a URL that would redirect',
    (_url, page) => {
      /*
       * Under `html_handling: force-trailing-slash`, linking to /about costs a
       * redirect before the page is served. Every hop dilutes crawl budget and
       * slows the user down for no reason, so internal links must already be
       * in canonical form.
       */
      const redirecting = page.internalLinksOut.filter((link) => !link.isCanonicalForm);
      expect(
        redirecting.map((l) => l.href),
        'these internal links are not in canonical (trailing-slash) form',
      ).toEqual([]);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s never hard-codes the production origin in a link',
    (_url, page) => {
      /*
       * Hard-coded origins break preview deployments and local development,
       * and they scatter the domain across files. The domain is defined once,
       * in src/data/site.ts.
       */
      expect(page.hardCodedOriginLinks, 'use root-relative paths instead').toEqual([]);
    },
  );
});

describe('site graph', () => {
  it('has no orphaned pages', () => {
    /*
     * A page nothing links to is one crawlers may never find and users
     * certainly will not. Intentional exceptions are declared in
     * ORPHAN_ALLOWLIST rather than silently tolerated here.
     */
    const orphans = allPages
      .filter((page) => page.internalLinksIn === 0)
      .filter((page) => !ORPHAN_ALLOWLIST.includes(page.url))
      .map((page) => page.url);

    expect(orphans, 'add a link to these pages, or allowlist them deliberately').toEqual([]);
  });

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s links to every declared social profile',
    (_url, page) => {
      /*
       * The footer and the schema.org `sameAs` are generated from one array
       * (person.socialProfiles), so they cannot disagree by construction.
       * This asserts the rendering half still happens -- a broken Footer would
       * otherwise leave `sameAs` claiming profiles the site never links to,
       * which is exactly the "schema does not match visible content" failure
       * the architecture is meant to prevent.
       *
       * Vacuous until profiles are added. That is intended: no profiles means
       * no links and no sameAs.
       */
      const missing = person.socialProfiles
        .map((profile) => profile.url)
        .filter((url) => !page.externalLinksOut.includes(url));

      expect(missing, 'declared in socialProfiles but not linked in the footer').toEqual([]);
    },
  );

  it('every social profile URL is absolute and https', () => {
    const bad = sameAs.filter((url) => !/^https:\/\/./.test(url));
    expect(bad, 'sameAs entries must be absolute https URLs').toEqual([]);
  });

  it('every indexable page is reachable from at least two others', () => {
    /*
     * One inbound link is technically reachable but fragile -- delete that one
     * page and the target is orphaned. Two is the cheapest meaningful margin.
     */
    const weak = indexablePages
      .filter((page) => page.internalLinksIn < 2)
      .filter((page) => !ORPHAN_ALLOWLIST.includes(page.url))
      .map((page) => `${page.url} (${page.internalLinksIn} inbound)`);

    expect(weak, 'these pages are weakly linked').toEqual([]);
  });
});
