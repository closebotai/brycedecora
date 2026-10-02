/**
 * Shared layout prop types.
 *
 * Declared in a .ts module rather than inside BaseLayout.astro so the more
 * specific layouts can extend them instead of restating the list. A duplicated
 * prop interface is how a layout quietly starts dropping a prop it was meant
 * to forward.
 */
import type { SeoInput } from '../schemas/seo';
import type { BreadcrumbItem, JsonLdNode, WebPageOptions } from '../utils/schema';

export interface BaseLayoutProps {
  /** REQUIRED. Validated against seoInputSchema; invalid input fails the build. */
  seo: SeoInput;

  /** schema.org type for the WebPage node. */
  pageType?: WebPageOptions['type'];

  /** Breadcrumb trail. Derived from the URL when omitted; `false` suppresses it. */
  breadcrumbs?: BreadcrumbItem[] | false;

  /** Replace only the final crumb's label. */
  breadcrumbLabel?: string;

  /** Page-specific JSON-LD, given the resolved site and canonical URL. */
  schema?: (ctx: { site: URL; canonical: string }) => JsonLdNode[];

  datePublished?: Date;
  dateModified?: Date;

  /**
   * Measure for <main>. 'content' is a reading column; 'wide' suits indexes.
   *
   * 'full' removes the max-width AND the gutter so a full-bleed element can
   * reach both edges. It exists because the alternative -- a negative-margin
   * `100vw` break-out -- introduces a horizontal scrollbar whenever a vertical
   * one is present. Pages using it must restore the measure themselves.
   */
  width?: 'content' | 'wide' | 'full';
}

/**
 * Props for layouts that own the page's single <h1>.
 *
 * Pages never write an <h1> themselves -- they pass `heading` and the layout
 * renders it. That is what makes "exactly one descriptive H1 per page" a
 * structural property rather than a rule someone has to remember.
 */
export interface HeadedLayoutProps extends BaseLayoutProps {
  /** The page's single <h1>. */
  heading: string;
  /** Optional standfirst rendered under the heading. */
  lede?: string;
  /** Mono kicker rendered above the heading. */
  kicker?: string;
  /**
   * Which of the two type registers the page is in. See DESIGN.md.
   *
   * 'display' is the loud one: enormous <h1>, leading below 1, crop marks.
   * 'reading' is the default, and is correct for anything someone reads rather
   * than scans. There is deliberately no third option -- the comfortable middle
   * ground between them is exactly what the two-register rule exists to remove.
   */
  register?: 'display' | 'reading';
}
