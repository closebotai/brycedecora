import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { allPages } from './manifest';

const pagesWithImages = allPages.filter((page) => page.images.length > 0);

/** `/writing/<slug>/` — an article page, as opposed to the index at `/writing/`. */
const ARTICLE_URL = /^\/writing\/([^/]+)\/$/;

const articleSlug = (url: string) => ARTICLE_URL.exec(url)?.[1] ?? null;

/**
 * Whether an article declares a cover in its frontmatter.
 *
 * Read from source rather than inferred from the rendered markup, because the
 * rule below needs to know what the author ASKED for. Inferring it from "is
 * the first image eager" would make the assertion circular.
 */
function hasCover(slug: string): boolean {
  for (const extension of ['.md', '.mdx']) {
    const path = `src/content/articles/${slug}${extension}`;
    if (!existsSync(path)) continue;
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'));
    return /^cover:/m.test(match?.[1] ?? '');
  }
  return false;
}

describe('images', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s declares alt on every image',
    (_url, page) => {
      /*
       * The requirement is a DECLARED alt attribute, not a non-empty one.
       * `alt=""` is the correct, meaningful markup for decorative imagery --
       * it tells a screen reader to skip the image. Forcing descriptive text
       * onto decoration makes the page worse to listen to. A MISSING alt is
       * the defect, because then assistive tech falls back to announcing the
       * filename.
       */
      const missing = page.images.filter((image) => image.alt === null).map((image) => image.src);
      expect(missing, 'these images have no alt attribute at all').toEqual([]);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s declares width and height on every image',
    (_url, page) => {
      // Without intrinsic dimensions the browser cannot reserve space, and the
      // page shifts as images load. That is a direct CLS regression.
      const missing = page.images
        .filter((image) => !image.hasDimensions)
        .map((image) => image.src);
      expect(missing, 'these images would cause layout shift').toEqual([]);
    },
  );

  /*
   * THE LCP RULE, AND WHY IT SPLITS BY PAGE TYPE.
   *
   * This used to read "the first <img> in the document is the most likely LCP
   * element" for every page. On an ordinary page that holds. On an ARTICLE it
   * does not, and the difference is not a technicality:
   *
   * An article's first image is either its cover -- which the layout renders
   * above the prose, eagerly, with fetchpriority=high -- or it is a Markdown
   * image somewhere down the body, below the h1, the byline and the lead
   * paragraph, at a 38rem measure. The second case is never the LCP element,
   * and Markdown gives no way to say so: `![alt](src)` always comes out
   * `loading="lazy"`. So the old rule failed any article that illustrated a
   * point halfway down, and the only way to satisfy it was to promote that
   * image to the cover -- which moves it to the top of the page and hijacks
   * og:image. A rule that can only be satisfied by making the page worse is
   * measuring the wrong thing.
   *
   * What replaces it keeps the full force of the original everywhere it was
   * actually right:
   *
   *   every page    - nothing below the first image may be eager
   *   article       - IF it declares a cover, that cover must be eager
   *   other pages   - the first image must be eager
   *
   * The one case now permitted is an article whose first image is a body
   * image. That is the case the old rule got wrong.
   */
  it.each(pagesWithImages.map((page) => [page.url, page] as const))(
    '%s does not lazy-load its likely LCP image',
    (url, page) => {
      const slug = articleSlug(url);
      const first = page.images[0]!;

      if (slug) {
        if (!hasCover(slug)) return; // every image here is a body image
        expect(
          first.loading,
          `${first.src} is the cover of ${slug} and must not be lazy-loaded`,
        ).not.toBe('lazy');
        return;
      }

      expect(first.loading, `${first.src} is the likely LCP image but is lazy-loaded`).not.toBe(
        'lazy',
      );
    },
  );

  it.each(pagesWithImages.map((page) => [page.url, page] as const))(
    '%s lazy-loads images below the first',
    (_url, page) => {
      const eagerBelowFold = page.images
        .slice(1)
        .filter((image) => image.loading !== 'lazy')
        .map((image) => image.src);
      expect(eagerBelowFold, 'these below-the-fold images should be lazy-loaded').toEqual([]);
    },
  );

  /*
   * The counterpart to the split above: an article with no cover must have no
   * eager image at all. Without this, dropping the cover requirement would
   * also quietly drop the guarantee that a body image is lazy -- which is the
   * part that was always correct.
   */
  it.each(
    pagesWithImages
      .filter((page) => articleSlug(page.url) !== null)
      .map((page) => [page.url, page] as const),
  )('%s loads every body image lazily', (url, page) => {
    const slug = articleSlug(url)!;
    const body = hasCover(slug) ? page.images.slice(1) : page.images;

    const eager = body.filter((image) => image.loading !== 'lazy').map((image) => image.src);
    expect(eager, 'body images are below the fold and must be lazy').toEqual([]);
  });
});
