/**
 * Shared loader for the build-time SEO manifest.
 *
 * The suite asserts against `.seo/manifest.json` rather than crawling a live
 * server, which is what lets the whole thing run in milliseconds. A check that
 * is fast is a check that runs on every commit.
 */
import { readFileSync } from 'node:fs';

import type { ManifestPage, SeoManifest } from '../../integrations/seo-manifest';
import { MANIFEST_PATH } from '../../integrations/seo-manifest';

let cached: SeoManifest | undefined;

export function loadManifest(): SeoManifest {
  if (cached) return cached;

  let raw: string;
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    throw new Error(
      `${MANIFEST_PATH} not found. The SEO suite asserts against a real build -- run \`pnpm build\` first (\`pnpm test\` does both).`,
    );
  }

  cached = JSON.parse(raw) as SeoManifest;

  if (cached.pages.length === 0) {
    throw new Error(
      `${MANIFEST_PATH} contains no pages. A suite that asserts over an empty set passes vacuously, which is worse than failing.`,
    );
  }

  return cached;
}

export const manifest = loadManifest();

/** Every emitted page, including non-indexable ones. */
export const allPages: ManifestPage[] = manifest.pages;

/**
 * Pages that are meant to rank. Most rules apply only to these -- the 404
 * page has no business having a unique description or inbound links.
 */
export const indexablePages: ManifestPage[] = manifest.pages.filter((page) => page.indexable);

export const pagesByUrl = new Map(manifest.pages.map((page) => [page.url, page]));

/** Every file the build emitted, for resolving links to non-HTML assets. */
export const emittedFiles = new Set(manifest.files);

/** Label used in test output so a failure names the offending route. */
export const label = (page: ManifestPage) => page.url;

export type { ManifestPage, SeoManifest };
