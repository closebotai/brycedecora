import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { person } from '../data/person';
import { SITE_NAME } from '../data/site';
import { articlePath, getPublishedArticles } from '../utils/collections';

/**
 * RSS feed for the writing collection.
 *
 * Worth having even though feed readers are a niche habit now: a feed is the
 * one distribution channel nobody else owns. It is also the cheapest way for
 * anything automated -- aggregators, newsletter tools, other people's
 * tooling -- to discover new posts without scraping HTML.
 *
 * Generated from the same `getPublishedArticles()` the site uses, so the feed
 * cannot list a draft or miss a post. `<link rel="alternate">` in BaseLayout
 * makes it discoverable.
 */
export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error('Astro.site is undefined. Set `site` in astro.config.ts.');
  }

  const articles = await getPublishedArticles();

  /**
   * The newest article date, for `<lastBuildDate>`.
   *
   * NOT the build clock. RSS defines lastBuildDate as "the last time the
   * content of the channel changed", and a rebuild is not a content change --
   * using `new Date()` would announce a fresh feed to every aggregator on
   * every deploy, including deploys that only touched CSS. Deriving it from
   * the content also keeps the output deterministic, so two builds of the same
   * commit produce the same bytes.
   */
  const lastBuild = articles.reduce<Date | null>((newest, article) => {
    const changed = article.data.updatedDate ?? article.data.pubDate;
    return !newest || changed > newest ? changed : newest;
  }, null);

  /*
   * `<atom:link rel="self">` is how a feed states its own canonical address.
   * Without it an aggregator that acquired the feed by some other route has no
   * authoritative URL to poll, and feed validators flag it.
   */
  const feedUrl = new URL('/rss.xml', site).href;

  return rss({
    title: `${SITE_NAME} — Writing`,
    description: person.description,
    site,

    // Declared so the `atom:` prefix below resolves instead of being invalid XML.
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },

    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.pubDate,
      link: articlePath(article.id),
      categories: [...article.data.tags],
    })),

    // Feed readers use `language` for language-aware display and sorting.
    customData: [
      '<language>en-us</language>',
      `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>`,
      ...(lastBuild ? [`<lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`] : []),
    ].join(''),
  });
};
