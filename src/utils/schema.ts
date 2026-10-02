/**
 * Typed JSON-LD builders.
 *
 * Structured data is an architectural property here, not something an author
 * remembers to add. `BaseLayout` always emits Person + WebSite + WebPage (and
 * BreadcrumbList where a trail exists); page templates add only the nodes that
 * describe their own content.
 *
 * Two rules the builders enforce structurally:
 *
 *  1. ONE DEFINITION PER ENTITY. The Person is described once, at a stable
 *     `@id`. Everywhere else references `{ '@id': ... }`. Two pages therefore
 *     cannot disagree about who the author is.
 *
 *  2. NO EMPTY OR FABRICATED VALUES. Optional fields are omitted rather than
 *     emitted as empty strings or arrays, and there are no builders for
 *     ratings, reviews, or counts -- data the site has no legitimate source
 *     for. Schema must describe what the page actually shows.
 */
import portrait from '../assets/bryce-decora.png';
import { person, sameAs } from '../data/person';
import { DEFAULT_LOCALE, SITE_NAME } from '../data/site';

export type JsonLdNode = Record<string, unknown>;

/** BCP-47 form of the site locale, for schema.org `inLanguage`. */
const IN_LANGUAGE = DEFAULT_LOCALE.replace('_', '-');

/**
 * Stable `@id`s. Site-level entities hang off the origin; page-level entities
 * off the page's own canonical URL. Because canonicals are unique, so are
 * these.
 */
export const ids = {
  person: (site: URL) => `${site.origin}/#person`,
  website: (site: URL) => `${site.origin}/#website`,
  webPage: (canonical: string) => `${canonical}#webpage`,
  breadcrumb: (canonical: string) => `${canonical}#breadcrumb`,
  article: (canonical: string) => `${canonical}#article`,
} as const;

/** A reference to an entity defined elsewhere in the graph. */
const ref = (id: string): JsonLdNode => ({ '@id': id });

/** Drop keys whose value is undefined, an empty string, or an empty array. */
function compact(node: JsonLdNode): JsonLdNode {
  const out: JsonLdNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** The canonical Person node. Defined once; referenced everywhere else. */
export function buildPerson(site: URL): JsonLdNode {
  return compact({
    '@type': 'Person',
    '@id': ids.person(site),
    name: person.name,
    givenName: person.givenName,
    familyName: person.familyName,
    jobTitle: person.jobTitle,
    description: person.description,
    url: `${site.origin}/`,
    email: `mailto:${person.email}`,
    worksFor: compact({
      '@type': 'Organization',
      name: person.worksFor.name,
      url: person.worksFor.url,
    }),
    knowsAbout: [...person.knowsAbout],
    // Derived from the same array the footer renders, so the graph can never
    // claim a profile the site does not link to. Omitted entirely while empty.
    sameAs: [...sameAs],
    /*
     * Google lists `image` among the properties that help identify a Person.
     * `portrait.src` is the post-optimisation path, so this URL always points
     * at the asset that actually shipped rather than at a guessed filename.
     */
    image: new URL(portrait.src, site).href,
  });
}

/**
 * The WebSite node.
 *
 * Deliberately has no `potentialAction`/SearchAction: the site has no search
 * endpoint, and declaring one that does not exist is exactly the kind of
 * fabricated markup this module is meant to prevent. Add it when search ships.
 */
export function buildWebSite(site: URL): JsonLdNode {
  return compact({
    '@type': 'WebSite',
    '@id': ids.website(site),
    url: `${site.origin}/`,
    name: SITE_NAME,
    description: person.description,
    publisher: ref(ids.person(site)),
    inLanguage: IN_LANGUAGE,
  });
}

export interface WebPageOptions {
  site: URL;
  canonical: string;
  title: string;
  description: string;
  /** Use 'ProfilePage' for /about/, 'CollectionPage' for index listings. */
  type?: 'WebPage' | 'ProfilePage' | 'CollectionPage' | 'ContactPage';
  /** Set when the page renders a breadcrumb trail. */
  hasBreadcrumb?: boolean;
  datePublished?: Date;
  dateModified?: Date;
}

export function buildWebPage(options: WebPageOptions): JsonLdNode {
  const { site, canonical, title, description, type = 'WebPage' } = options;
  return compact({
    '@type': type,
    '@id': ids.webPage(canonical),
    url: canonical,
    name: title,
    description,
    isPartOf: ref(ids.website(site)),
    about: ref(ids.person(site)),
    inLanguage: IN_LANGUAGE,
    breadcrumb: options.hasBreadcrumb ? ref(ids.breadcrumb(canonical)) : undefined,
    datePublished: options.datePublished?.toISOString(),
    dateModified: options.dateModified?.toISOString(),
  });
}

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL. */
  url: string;
}

/**
 * BreadcrumbList.
 *
 * The same `items` array drives the visible <Breadcrumbs> component, so the
 * markup and the structured data cannot describe different trails.
 */
export function buildBreadcrumbList(canonical: string, items: readonly BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': ids.breadcrumb(canonical),
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface ArticleOptions {
  site: URL;
  canonical: string;
  title: string;
  description: string;
  datePublished: Date;
  dateModified?: Date;
  /** Absolute URL of the article's primary image, if it has one. */
  image?: string;
  keywords?: readonly string[];
}

export function buildArticle(options: ArticleOptions): JsonLdNode {
  const { site, canonical } = options;
  return compact({
    '@type': 'BlogPosting',
    '@id': ids.article(canonical),
    // Google's guidance caps headline usefulness around 110 characters; the
    // content schema's 80-character title bound keeps this inside that.
    headline: options.title,
    description: options.description,
    datePublished: options.datePublished.toISOString(),
    dateModified: (options.dateModified ?? options.datePublished).toISOString(),
    author: ref(ids.person(site)),
    publisher: ref(ids.person(site)),
    mainEntityOfPage: ref(ids.webPage(canonical)),
    isPartOf: ref(ids.webPage(canonical)),
    inLanguage: IN_LANGUAGE,
    image: options.image,
    keywords: options.keywords ? [...options.keywords] : undefined,
  });
}



/**
 * Combine nodes into a single `@graph` document.
 *
 * One graph per page rather than several detached <script> blocks, so `@id`
 * cross-references resolve. Later nodes with a duplicate `@id` are dropped,
 * which makes it safe for a template to re-add a node the layout already
 * supplied.
 */
export function buildGraph(nodes: readonly JsonLdNode[]): JsonLdNode {
  const seen = new Set<string>();
  const unique: JsonLdNode[] = [];

  for (const node of nodes) {
    const id = typeof node['@id'] === 'string' ? node['@id'] : undefined;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    unique.push(node);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': unique,
  };
}
