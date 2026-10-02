/**
 * The SEO contract.
 *
 * Every indexable page must supply an object satisfying `seoInputSchema`.
 * `BaseLayout` parses it -- so a page with a missing or malformed SEO object
 * fails the build rather than shipping with a bad <head>.
 *
 * Division of labour:
 *   - the PAGE supplies data: title, description, and anything page-specific
 *   - the FRAMEWORK supplies implementation: canonical URL, Open Graph
 *     defaults, robots directives, image fallbacks, JSON-LD wiring
 *
 * That is deliberate. An author (human or agent) cannot forget the canonical
 * tag because they were never responsible for writing it.
 *
 * `z` comes from `astro/zod` -- a real package subpath, not the `astro:content`
 * virtual module -- so this file is importable from the Vitest suite as well as
 * from Astro components. Do not add a standalone `zod` dependency: two Zod
 * instances would produce schemas that fail each other's `instanceof` checks.
 */
import { z } from 'astro/zod';

import {
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  isIndexable,
  normalizePathname,
} from '../data/site';

/**
 * EDITORIAL GUARDRAILS, NOT SEARCH ENGINE REQUIREMENTS.
 *
 * Google does not enforce a 60-character title limit and routinely rewrites
 * titles it considers unhelpful. These bounds exist to stop an agent shipping
 * `<title>Home</title>` or omitting a description -- they are a floor on
 * effort, not a claim about how Google works. Widen them if an editorially
 * better title happens to be longer; do not remove the minimums.
 */
export const TITLE_MIN = 10;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

export const OG_TYPES = ['website', 'article', 'profile'] as const;

export const seoInputSchema = z.object({
  title: z
    .string()
    .min(TITLE_MIN, {
      message: `SEO title must be at least ${TITLE_MIN} characters. Placeholder titles like "Home" or "Blog" are not acceptable -- write what the page is actually about.`,
    })
    .max(TITLE_MAX, {
      message: `SEO title should stay under ${TITLE_MAX} characters so it is unlikely to be truncated or rewritten. This is an editorial guardrail, not a Google rule.`,
    }),

  description: z
    .string()
    .min(DESCRIPTION_MIN, {
      message: `SEO description must be at least ${DESCRIPTION_MIN} characters. Summarise the page's actual value; do not restate the title.`,
    })
    .max(DESCRIPTION_MAX, {
      message: `SEO description should stay under ${DESCRIPTION_MAX} characters. Editorial guardrail, not a Google rule.`,
    }),

  /**
   * Override the canonical path. Almost never needed -- the canonical is
   * derived from the current route by default. Supply this only when a page
   * genuinely canonicalises to a different URL (e.g. a paginated view folding
   * into page 1). Must be a site-relative path, never an absolute URL, so the
   * domain stays defined in exactly one place.
   */
  canonicalPath: z
    .string()
    .startsWith('/', { message: 'canonicalPath must be site-relative and start with "/". Never hard-code the domain.' })
    .optional(),

  /**
   * Omit the canonical tag entirely.
   *
   * Valid for exactly one situation: a response body served at arbitrary URLs
   * rather than at a URL of its own -- i.e. the 404 page. When Cloudflare
   * serves dist/404.html in response to /some/typo, a canonical tag would
   * declare that /some/typo is the same document as /404.html, which is both
   * false and self-contradictory on a noindex page.
   *
   * This is NOT a way to skip writing a canonical for a normal page. Every
   * real URL gets one, computed automatically.
   */
  noCanonical: z.boolean().optional(),

  /**
   * Robots directives. Omit entirely for normal pages -- indexability defaults
   * to the NOINDEX_ROUTES list in src/data/site.ts, which is the same source
   * the sitemap filter reads. Set this explicitly only for a genuine
   * exception, and prefer adding the route to NOINDEX_ROUTES instead so the
   * sitemap stays in agreement automatically.
   */
  robots: z
    .object({
      index: z.boolean().optional(),
      follow: z.boolean().optional(),
    })
    .optional(),

  /** Open Graph overrides. Every field falls back to a sensible default. */
  openGraph: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      /** Site-relative path or absolute URL to the share image. */
      image: z.string().optional(),
      imageAlt: z.string().optional(),
      /**
       * Only needed when `image` points at something that is not a generated
       * share card. Every card `pnpm og` produces is OG_IMAGE_WIDTH x
       * OG_IMAGE_HEIGHT, which is the default -- and declaring dimensions that
       * disagree with the file is worse than declaring none, because a crawler
       * believes them.
       */
      imageWidth: z.number().int().positive().optional(),
      imageHeight: z.number().int().positive().optional(),
      type: z.enum(OG_TYPES).optional(),
    })
    .optional(),
});

/*
 * NOTE: JSON-LD is deliberately NOT part of this schema.
 *
 * Page-specific structured data needs the page's canonical URL to build its
 * `@id`s -- and if pages computed their own canonical to pass in here, the
 * domain and trailing-slash logic would be duplicated at every call site,
 * which is exactly the failure this architecture exists to prevent.
 *
 * Instead `BaseLayout` accepts a `schema` callback that receives the already
 * resolved `{ site, canonical }`. See src/layouts/BaseLayout.astro.
 */

export type SeoInput = z.input<typeof seoInputSchema>;

/** The fully-resolved SEO object consumed by <SEO>. Nothing here is optional. */
export interface ResolvedSeo {
  title: string;
  description: string;
  /** `null` only when `noCanonical` was set -- see the note on that field. */
  canonical: string | null;
  /** The page's own URL, always computed, even when no canonical is emitted. */
  url: string;
  path: string;
  robots: { index: boolean; follow: boolean };
  openGraph: {
    title: string;
    description: string;
    image: string;
    imageAlt: string;
    imageWidth: number;
    imageHeight: number;
    type: (typeof OG_TYPES)[number];
    url: string;
  };
}

export interface ResolveSeoContext {
  /** `Astro.site`. Configured in astro.config.ts from SITE_URL. */
  site: URL | undefined;
  /** `Astro.url.pathname` for the page being rendered. */
  pathname: string;
}

/**
 * Validate a page's SEO input and fill in everything the page did not supply.
 *
 * Throws on invalid input. Because this runs during a static build, throwing
 * fails `astro build` -- which is the point.
 */
export function resolveSeo(input: SeoInput, ctx: ResolveSeoContext): ResolvedSeo {
  if (!ctx.site) {
    throw new Error(
      'Astro.site is undefined. Set `site` in astro.config.ts -- canonical URLs, Open Graph URLs, and JSON-LD @ids all derive from it.',
    );
  }

  const parsed = seoInputSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid SEO data for route "${ctx.pathname}":\n${issues}`);
  }

  const data = parsed.data;
  const path = normalizePathname(data.canonicalPath ?? ctx.pathname);
  const url = new URL(path, ctx.site).href;
  const canonical = data.noCanonical ? null : url;

  // Indexability defaults to the shared NOINDEX_ROUTES predicate so the
  // sitemap and the robots meta tag cannot drift apart. An explicit
  // `robots.index` overrides it for genuine one-offs.
  const index = data.robots?.index ?? isIndexable(path);
  const follow = data.robots?.follow ?? true;

  const ogImagePath = data.openGraph?.image ?? DEFAULT_OG_IMAGE;

  return {
    title: data.title,
    description: data.description,
    canonical,
    url,
    path,
    robots: { index, follow },
    openGraph: {
      title: data.openGraph?.title ?? data.title,
      description: data.openGraph?.description ?? data.description,
      // Open Graph requires an absolute URL; resolve relative paths against
      // the site origin so pages never need to know the domain.
      image: new URL(ogImagePath, ctx.site).href,
      imageAlt: data.openGraph?.imageAlt ?? DEFAULT_OG_IMAGE_ALT,
      imageWidth: data.openGraph?.imageWidth ?? OG_IMAGE_WIDTH,
      imageHeight: data.openGraph?.imageHeight ?? OG_IMAGE_HEIGHT,
      type: data.openGraph?.type ?? 'website',
      url,
    },
  };
}
