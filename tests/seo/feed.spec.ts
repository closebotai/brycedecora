import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allPages, manifest } from './manifest';

const feed = readFileSync(join('dist', 'rss.xml'), 'utf8');
const feedLinks = [...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]!);
/** The first <link> is the channel's own; the rest are items. */
const itemLinks = feedLinks.slice(1);

describe('RSS feed', () => {
  it('was emitted', () => {
    expect(manifest.files).toContain('/rss.xml');
  });

  it('lists every published article, and nothing else', () => {
    const articleUrls = allPages
      .filter((page) => /^\/writing\/.+\//.test(page.url))
      .map((page) => `${manifest.site}${page.url}`)
      .sort();

    expect(itemLinks.sort()).toEqual(articleUrls);
  });

  it('uses absolute URLs', () => {
    // A relative link in a feed resolves against the reader's context, not the
    // site — which usually means it resolves to nothing.
    const relative = itemLinks.filter((url) => !url.startsWith('https://'));
    expect(relative).toEqual([]);
  });

  it('is discoverable from every page', () => {
    /*
     * Readers and aggregators look for <link rel="alternate">. Without it the
     * feed exists but nothing finds it, which is the same as not having one.
     */
    const undiscoverable = allPages
      .filter((page) => !page.hasFeedLink)
      .map((page) => page.url);

    expect(undiscoverable, 'missing <link rel="alternate" type="application/rss+xml">').toEqual([]);
  });

  it('excludes the feed from the sitemap', () => {
    // The sitemap is for indexable HTML pages. A feed in it is noise.
    const paths = manifest.sitemapUrls.map((url) => new URL(url).pathname);
    expect(paths).not.toContain('/rss.xml');
  });
});
