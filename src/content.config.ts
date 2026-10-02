import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
// `astro/zod` rather than the deprecated `z` re-export from `astro:content`.
// Same Zod instance (4.x), so schema types still infer exactly.
import { z } from 'astro/zod';

/**
 * Content collections.
 *
 * Shape is chosen for a personal authority brand: a single `articles`
 * collection.
 * There are deliberately no `services` or `locations` collections -- those
 * belong to a local-business site and would invite thin, near-duplicate pages
 * here.
 *
 * WHY THESE SCHEMAS LIVE HERE RATHER THAN IN src/schemas/
 *
 * `image()` and `reference()` are bound to the `astro:content` virtual module.
 * An earlier version of this file injected them into schema factories in
 * src/schemas/ so the test suite could import them -- but typing the injected
 * helpers erased their real return types, which cascaded: `relatedArticles`
 * became `any[]`, and so did every template that mapped over it.
 *
 * The sharing bought nothing. The SEO suite asserts against the build manifest,
 * and Astro already validates frontmatter at build time with far better error
 * messages than a unit test would produce. So these stay inline, where
 * inference is exact.
 *
 * src/schemas/seo.ts is genuinely shared and stays where it is: it imports
 * only `astro/zod`, a real package subpath, so Vitest can load it.
 */

/**
 * Fields shared by every content type that becomes an indexable page.
 *
 * `title` and `seoTitle` are deliberately bounded DIFFERENTLY, because they
 * are different things:
 *
 *   - `title` is the visible H1. It is a name, and names are sometimes short
 *     and complete: "CloseBot" is a perfectly good H1. A 10-character minimum
 *     here would force padding a product name into a sentence, making the page
 *     worse to read in order to satisfy a rule about something else.
 *
 *   - `seoTitle` is the <title> -- a search-result label competing for a click.
 *     The editorial guardrails belong here.
 *
 * When `seoTitle` is omitted the <title> falls back to `title`, and
 * `seoInputSchema` then enforces the 10-60 bound at the layout. A short name
 * is allowed as an H1 but still cannot silently become a thin <title>.
 */
const indexableFields = {
  /** The visible H1. May be a short proper noun. */
  title: z.string().min(3).max(80),

  /**
   * The <title>, when it should differ from the H1. Required in practice for
   * any entry whose `title` is shorter than the SEO minimum.
   */
  seoTitle: z.string().min(10).max(60).optional(),

  description: z.string().min(50).max(160),

  /**
   * Drafts are excluded from production builds entirely -- not published with
   * noindex. A page that does not exist cannot be indexed by accident.
   */
  draft: z.boolean().default(false),
};

/**
 * Requires alt text whenever a cover image is set.
 *
 * A cover is content, never decoration, so `alt=""` is not valid for it. (The
 * refinement is on the parent object because Astro does not support
 * `image().refine()`.)
 */
const coverAltRule = {
  check: (data: { cover?: unknown; coverAlt?: string }) =>
    !data.cover || (data.coverAlt?.trim().length ?? 0) > 0,
  options: {
    message:
      'coverAlt is required when cover is set. Describe what the image shows -- a cover image is content, not decoration, so alt="" is not valid here.',
    path: ['coverAlt'],
  },
};

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: ({ image }) =>
    z
      .object({
        ...indexableFields,

        cover: image().optional(),
        coverAlt: z.string().min(1).optional(),

        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),

        tags: z.array(z.string().min(1)).default([]),

        /**
         * Internal linking is part of the content model, not something each
         * template invents. `reference()` fails the build if a slug does not
         * exist, so related-article links can never 404.
         */
        relatedArticles: z.array(reference('articles')).default([]),
      })
      .refine(coverAltRule.check, coverAltRule.options),
});


export const collections = { articles };
