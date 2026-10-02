/**
 * Collection queries and route helpers.
 *
 * Route shapes are defined here once. A template that builds its own
 * `/writing/${id}` string is how a trailing slash goes missing and a link
 * starts costing a redirect.
 *
 * This module imports `astro:content`, so it is only usable inside the Astro
 * build -- not from the Vitest suite. Anything the tests need lives in
 * src/data/ or src/schemas/ instead.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Article = CollectionEntry<'articles'>;

/** Canonical path for an article. Always trailing-slashed. */
export const articlePath = (id: string) => `/writing/${id}/`;


/**
 * Drafts are visible in `astro dev` and excluded from production builds.
 * Excluded, not noindexed -- a page that was never built cannot be indexed by
 * accident.
 *
 * Applied with `.filter()` after fetching rather than as `getCollection`'s
 * second argument: the predicate's parameter type has to match the collection
 * entry exactly, and a looser annotation silently degrades the whole return
 * type to `any[]`.
 */
const isPublished = (entry: { data: { draft: boolean } }) =>
  import.meta.env.PROD ? !entry.data.draft : true;

/** Articles, newest first. */
export async function getPublishedArticles(): Promise<Article[]> {
  const entries = await getCollection('articles');
  return entries
    .filter(isPublished)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}


/** The `<title>` for a content entry: the SEO override, else the heading. */
export const entrySeoTitle = (data: { seoTitle?: string; title: string }) =>
  data.seoTitle ?? data.title;
