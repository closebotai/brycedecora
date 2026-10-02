import { describe, expect, it } from 'vitest';

import { allPages, manifest } from './manifest';

describe('structured data', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s emits JSON-LD that parses',
    (_url, page) => {
      expect(page.jsonLdParses, 'a JSON-LD block failed to parse').toBe(true);
      expect(page.schemaTypes.length, 'no structured data at all').toBeGreaterThan(0);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s describes the canonical Person and WebSite',
    (_url, page) => {
      // Emitted by BaseLayout, so this holds for every page by construction.
      // The test guards against someone bypassing the layout.
      expect(page.schemaTypes).toContain('Person');
      expect(page.schemaTypes).toContain('WebSite');
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s resolves every @id it references',
    (_url, page) => {
      /*
       * The whole point of the @id scheme is that entities cross-reference a
       * single definition rather than each restating it. A reference pointing
       * at nothing means the graph is broken and consumers see an entity with
       * no properties.
       */
      const defined = new Set(page.schemaIds);
      const dangling = [...new Set(page.schemaRefs)].filter((id) => !defined.has(id));
      expect(dangling, 'these @id references have no matching node in the graph').toEqual([]);
    },
  );

  it('defines the Person and WebSite at one stable @id site-wide', () => {
    // Same entity, same identifier, on every page -- otherwise consumers see
    // one Person per page instead of one Person.
    const personIds = new Set<string>();
    const websiteIds = new Set<string>();

    for (const page of allPages) {
      for (const id of page.schemaIds) {
        if (id.endsWith('#person')) personIds.add(id);
        if (id.endsWith('#website')) websiteIds.add(id);
      }
    }

    expect([...personIds]).toEqual([`${manifest.site}/#person`]);
    expect([...websiteIds]).toEqual([`${manifest.site}/#website`]);
  });

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s emits a BreadcrumbList only alongside a visible trail',
    (_url, page) => {
      /*
       * Breadcrumb markup describing a trail the user cannot see is the exact
       * "schema that does not match visible content" failure mode. Both come
       * from one array in BaseLayout; this asserts that stayed true.
       */
      const hasSchema = page.schemaTypes.includes('BreadcrumbList');
      const isNested = page.url !== '/' && page.url.split('/').filter(Boolean).length > 0;
      if (hasSchema) {
        expect(isNested, 'BreadcrumbList on a page with no trail to show').toBe(true);
      }
    },
  );

  it('the homepage does not emit a BreadcrumbList', () => {
    const home = allPages.find((page) => page.url === '/');
    expect(home?.schemaTypes).not.toContain('BreadcrumbList');
  });

  it('no page claims schema types the site has no data for', () => {
    /*
     * Guard against an agent adding aggregate ratings, reviews, or business
     * entities that nothing on the site actually substantiates. Fabricated
     * structured data is a manual-action risk, not a ranking shortcut.
     */
    const forbidden = ['AggregateRating', 'Review', 'Offer', 'LocalBusiness', 'Product'];
    const violations: string[] = [];

    for (const page of allPages) {
      for (const type of page.schemaTypes) {
        if (forbidden.includes(type)) violations.push(`${page.url}: ${type}`);
      }
    }

    expect(violations, 'these types require real data the site does not have').toEqual([]);
  });
});
