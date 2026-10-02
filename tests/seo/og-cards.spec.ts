/**
 * The share cards are generated artefacts that are committed to the repo, and
 * this is what stops them going stale.
 *
 * THE FAILURE THIS EXISTS FOR: someone edits an article title, ships it, and
 * the card still shows the old one. Nothing else would ever notice — the page
 * is correct, the tags are correct, the image exists and 200s. It is only
 * wrong in a PNG nobody reopens.
 *
 * So every card is re-rendered here from the current build and compared to the
 * committed file. Change a title, a design token, or the card layout without
 * running `pnpm og`, and this fails.
 *
 * It compares PIXELS, not encoded bytes — see `toPixels` in scripts/og-card.mjs
 * for why.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readArticles, articleCardFile } from '../../scripts/og-articles.mjs';
import {
  renderDefaultCard,
  renderArticleCard,
  rasterise,
  toPixels,
  CARD_W,
  CARD_H,
} from '../../scripts/og-card.mjs';

import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  articleOgImage,
} from '../../src/data/site';
import { allPages, emittedFiles, pagesByUrl } from './manifest';

const PUBLIC = resolve(process.cwd(), 'public');

const articles: { slug: string; title: string }[] = readArticles();

/**
 * Proportion of pixels allowed to differ.
 *
 * Not zero, because librsvg is an external rasteriser and a point release may
 * legitimately shift a boundary pixel. Small enough that any real change —
 * a different word, a moved element, a retuned token — is orders of magnitude
 * above it: one character of the display type is already ~0.05%.
 */
const TOLERANCE = 0.0005;

async function differingFraction(expectedSvg: string, committedPath: string) {
  const [expected, actual] = await Promise.all([
    toPixels(await rasterise(expectedSvg)),
    toPixels(readFileSync(committedPath)),
  ]);

  expect(actual.length, 'committed card has unexpected dimensions').toBe(expected.length);

  let differing = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== actual[i]) differing += 1;
  }
  return differing / expected.length;
}

const STALE = 'card does not match what the generator produces — run `pnpm og` and commit the result';

describe('share cards are current', () => {
  it('the default card matches the generator', async () => {
    const fraction = await differingFraction(
      renderDefaultCard(),
      resolve(PUBLIC, DEFAULT_OG_IMAGE.replace(/^\//, '')),
    );
    expect(fraction, `default ${STALE}`).toBeLessThan(TOLERANCE);
  });

  it.each(articles.map((article) => [article.slug, article] as const))(
    '%s card matches the generator',
    async (_slug, article) => {
      const fraction = await differingFraction(
        renderArticleCard(article),
        resolve(PUBLIC, articleCardFile(article.slug)),
      );
      expect(fraction, `${article.slug} ${STALE}`).toBeLessThan(TOLERANCE);
    },
  );
});

describe('share cards are wired up', () => {
  it('the declared og:image dimensions match the rendered card', () => {
    // Otherwise a crawler reserves a box the image does not fill. The tags are
    // in src/data/site.ts and the geometry is in scripts/og-card.mjs; this is
    // the only thing keeping the two honest.
    expect(OG_IMAGE_WIDTH).toBe(CARD_W);
    expect(OG_IMAGE_HEIGHT).toBe(CARD_H);
  });

  it.each(articles.map((article) => [article.slug, article] as const))(
    '%s points at its own card, not the default',
    (_slug, article) => {
      const page = pagesByUrl.get(`/writing/${article.slug}/`);
      expect(page, 'article missing from the build manifest').toBeDefined();

      const image = new URL(page!.openGraph['og:image'] ?? '').pathname;

      // A cover image is a legitimate override and wins over the card.
      if (image.startsWith('/_astro/')) return;

      expect(image, 'article fell back to the site-wide default share image').toBe(
        articleOgImage(article.slug),
      );
    },
  );

  it('every generated card was emitted to dist', () => {
    // public/ is copied verbatim, so this catches a card that exists in the
    // repo but was written after the build that produced this manifest.
    for (const article of articles) {
      expect(emittedFiles.has(articleOgImage(article.slug)), `${article.slug} card missing from dist`).toBe(
        true,
      );
    }
    expect(emittedFiles.has(DEFAULT_OG_IMAGE)).toBe(true);
  });

  it('no page declares image dimensions it cannot honour', () => {
    for (const page of allPages) {
      const width = page.openGraph['og:image:width'];
      const height = page.openGraph['og:image:height'];
      expect(width, `${page.url} missing og:image:width`).toBeTruthy();
      expect(height, `${page.url} missing og:image:height`).toBeTruthy();
      expect(Number(width)).toBeGreaterThan(0);
      expect(Number(height)).toBeGreaterThan(0);
    }
  });
});
