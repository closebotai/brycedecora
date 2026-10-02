/**
 * The social share cards, generated.
 *
 * WHAT THIS REPLACES. `public/og/default.png` shipped as the scaffold's
 * placeholder: a blue rule on a blue-tinted charcoal, name set in a default
 * grotesque. Every page on the site pointed at it, so the one image that gets
 * seen *before* anyone visits was the only surface still rendering the exact
 * aesthetic DESIGN.md is written against. It was on the before-launch list in
 * AGENTS.md; this is that item.
 *
 * WHAT IT WRITES
 *
 *   public/og/default.png            the fallback, for every non-article page
 *   public/og/writing/<slug>.png     one per published article
 *
 * IT NEEDS A BUILD FIRST, because the article cards are titled from each
 * page's real `<h1>` in `.seo/manifest.json` -- see og-articles.mjs for why.
 * `pnpm og` runs the build for you.
 *
 * After changing an article title the loop is: build, og, build. The second
 * build is what copies the regenerated PNG out of `public/` and into `dist/`.
 * `tests/seo/og-cards.spec.ts` fails if you skip any of it.
 *
 * GENERATED, NOT DRAWN. Committed output, and the build never runs this --
 * same contract as the bean (see generate-bean.mjs). `sharp` is already a
 * devDependency for Astro's image pipeline, so this adds nothing to install.
 *
 * Layout and palette live in og-card.mjs. This file only decides what to draw
 * and where to put it.
 */
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDefaultCard, renderArticleCard, rasterise, CARD_W, CARD_H } from './og-card.mjs';
import { readArticles } from './og-articles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OG_DIR = resolve(ROOT, 'public/og');
const ARTICLE_DIR = resolve(OG_DIR, 'writing');

const articles = readArticles();

mkdirSync(ARTICLE_DIR, { recursive: true });

const written = [];

const defaultPng = await rasterise(renderDefaultCard());
writeFileSync(resolve(OG_DIR, 'default.png'), defaultPng);
written.push(['default.png', defaultPng.length]);

for (const article of articles) {
  const png = await rasterise(renderArticleCard(article));
  writeFileSync(resolve(ARTICLE_DIR, `${article.slug}.png`), png);
  written.push([`writing/${article.slug}.png`, png.length]);
}

/*
 * Delete cards for articles that no longer exist.
 *
 * Without this, unpublishing an article leaves its card committed forever --
 * a live URL, still crawlable, still unfurling, describing a page that now
 * 404s. Nothing else in the build would ever mention it again.
 */
const expected = new Set(articles.map((article) => `${article.slug}.png`));
const orphans = readdirSync(ARTICLE_DIR).filter(
  (file) => file.endsWith('.png') && !expected.has(file),
);
for (const orphan of orphans) {
  rmSync(resolve(ARTICLE_DIR, orphan));
}

const total = written.reduce((bytes, [, size]) => bytes + size, 0);
console.log(
  `og: ${CARD_W}x${CARD_H}, ${written.length} cards, ${(total / 1024).toFixed(1)} KB total` +
    (orphans.length ? ` (removed ${orphans.length} orphaned)` : ''),
);
for (const [name, bytes] of written) {
  console.log(`  public/og/${name} (${(bytes / 1024).toFixed(1)} KB)`);
}
