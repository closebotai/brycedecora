/**
 * Which article cards should exist, and what each one says.
 *
 * READ FROM THE BUILD MANIFEST, NOT FROM FRONTMATTER. Each card is titled from
 * that page's real `<h1>` in `.seo/manifest.json`. Parsing the Markdown here
 * would mean a second, worse implementation of Astro's frontmatter handling,
 * and the failure it invites is the quiet one: a card whose title no longer
 * matches the page it links to. Reading real build output is the same rule
 * AGENTS.md gives for numbers on a page.
 *
 * Its own module so that generate-og.mjs and tests/seo/og-cards.spec.ts agree
 * on the set by construction. A test that computed the expected cards
 * differently from the generator would pass while both were wrong.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const MANIFEST_PATH = resolve(ROOT, '.seo/manifest.json');

/** Where an article's card lives, relative to `public/`. */
export const articleCardFile = (slug) => `og/writing/${slug}.png`;

/**
 * Every published article page, as `{ slug, title }`, sorted by slug.
 *
 * Only `/writing/<slug>/` -- the index at `/writing/` is not an article and
 * takes the default card. Drafts never reach the manifest, because a
 * production build does not emit them at all.
 */
export function readArticles(manifestPath = MANIFEST_PATH) {
  let raw;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error(
      `${manifestPath} not found. The cards are titled from real build output -- ` +
        `run \`pnpm build\` first (\`pnpm og\` does it for you).`,
    );
  }

  const manifest = JSON.parse(raw);
  const articles = [];

  for (const page of manifest.pages) {
    const match = page.url.match(/^\/writing\/([^/]+)\/$/);
    if (!match) continue;

    const title = page.h1?.[0];
    if (!title) {
      throw new Error(
        `og: ${page.url} has no <h1> in the manifest, so there is nothing to title its card with.`,
      );
    }

    articles.push({ slug: match[1], title });
  }

  if (articles.length === 0) {
    throw new Error(
      `og: no article pages found in ${manifestPath}. A generator that silently ` +
        `produces nothing looks exactly like one that succeeded.`,
    );
  }

  return articles.sort((a, b) => a.slug.localeCompare(b.slug));
}
