import { describe, expect, it } from 'vitest';

import { allPages } from './manifest';

describe('headings', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s has exactly one h1',
    (_url, page) => {
      expect(page.h1, `found ${page.h1.length} h1 elements: ${JSON.stringify(page.h1)}`).toHaveLength(1);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s h1 is descriptive',
    (_url, page) => {
      const heading = page.h1[0] ?? '';
      expect(heading.length, 'h1 is empty').toBeGreaterThan(0);
      // Catches an h1 left as a single placeholder word.
      expect(heading.length, `h1 "${heading}" is too short to be descriptive`).toBeGreaterThan(2);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s starts its heading outline with the h1',
    (_url, page) => {
      expect(page.headingOrder[0], 'first heading on the page is not the h1').toBe('h1');
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s heading hierarchy never skips a level',
    (_url, page) => {
      const levels = page.headingOrder.map((tag) => Number(tag.slice(1)));

      let previous = levels[0] ?? 1;
      for (const [index, level] of levels.entries()) {
        // Going deeper may only ever descend one level at a time; jumping back
        // up any distance is fine (h3 -> h2 closes a subsection).
        expect(
          level,
          `heading ${index + 1} jumps from h${previous} to h${level} in ${page.headingOrder.join(' > ')}`,
        ).toBeLessThanOrEqual(previous + 1);
        previous = level;
      }
    },
  );
});
