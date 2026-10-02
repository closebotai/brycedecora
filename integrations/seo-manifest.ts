/**
 * Build-time SEO manifest.
 *
 * After every build, parses the emitted HTML and writes a machine-readable
 * description of the whole site to `.seo/manifest.json`.
 *
 * Why this exists:
 *
 *  - Most SEO defects are WHOLE-SITE properties. Duplicate titles, orphaned
 *    pages, and broken internal links are invisible when reviewing one
 *    template and obvious in a manifest. The test suite asserts against this
 *    file rather than crawling with a browser, which is what makes the full
 *    check run in milliseconds instead of minutes -- and a check that is fast
 *    is a check that actually runs on every commit.
 *
 *  - It gives an agent a single file to read when asked "find the SEO
 *    problems in this codebase", instead of opening pages one at a time.
 *
 * The manifest is written OUTSIDE dist/ so it is never deployed.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';
import { parse, type HTMLElement } from 'node-html-parser';

export const MANIFEST_PATH = '.seo/manifest.json';

export interface ManifestImage {
  src: string;
  /** `null` when the attribute is absent. `''` is a valid decorative image. */
  alt: string | null;
  hasDimensions: boolean;
  loading: string | null;
  fetchpriority: string | null;
}

export interface ManifestLink {
  /** The href exactly as written in the markup. */
  href: string;
  /** Resolved site-relative path. */
  path: string;
  /** False when the href would trigger a trailing-slash redirect. */
  isCanonicalForm: boolean;
}

export interface ManifestPage {
  /** Canonical path form, e.g. '/writing/some-post/'. */
  url: string;
  /** Path of the emitted file, relative to dist. */
  file: string;

  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  indexable: boolean;

  openGraph: Record<string, string>;

  /** Text of every h1. More or fewer than one is a defect. */
  h1: string[];
  /** Heading tags in document order, e.g. ['h1','h2','h3','h2']. */
  headingOrder: string[];

  /** `@type` of every JSON-LD node found. */
  schemaTypes: string[];
  /** `@id`s DEFINED on this page (nodes carrying an `@type`). */
  schemaIds: string[];
  /** `@id`s REFERENCED by this page (bare `{ "@id": ... }` objects). */
  schemaRefs: string[];
  /** False when a JSON-LD block failed to parse. */
  jsonLdParses: boolean;

  internalLinksOut: ManifestLink[];
  externalLinksOut: string[];
  /** Hrefs that hard-code the production origin instead of using a path. */
  hardCodedOriginLinks: string[];
  /** Populated in a second pass by inverting the outbound link graph. */
  internalLinksIn: number;

  images: ManifestImage[];

  /** Non-JSON-LD <script> tags. The hydration budget, in effect. */
  scriptCount: number;

  /** Whether <link rel="alternate" type="application/rss+xml"> is present. */
  hasFeedLink: boolean;
}

export interface SeoManifest {
  site: string;
  generatedAt: string;
  /** Every file emitted to dist, as a site-relative path. */
  files: string[];
  /** <loc> values found in the generated sitemap(s). */
  sitemapUrls: string[];
  pages: ManifestPage[];
}

/* -------------------------------------------------------------------------- */

/** Recursively list every file under `dir`, returned as dist-relative paths. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, base)));
    } else {
      out.push(`/${relative(base, full).split(sep).join(posix.sep)}`);
    }
  }

  return out;
}

/**
 * Map an emitted file to the URL it is served at.
 *
 *   index.html        -> /
 *   about/index.html  -> /about/
 *   404.html          -> /404.html
 */
function fileToUrl(file: string): string {
  if (file === '/index.html') return '/';
  if (file.endsWith('/index.html')) return file.slice(0, -'index.html'.length);
  return file;
}

/** Canonical path form under `trailingSlash: 'always'`. */
function toCanonicalForm(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '/';
  if (clean === '') return '/';
  // Paths with a file extension (/robots.txt) are left alone.
  if (/\.[a-z0-9]+$/i.test(clean)) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const attr = (el: HTMLElement, name: string): string | null => el.getAttribute(name) ?? null;

/** Walk arbitrary JSON-LD, separating defined `@id`s from referenced ones. */
function walkJsonLd(
  value: unknown,
  acc: { types: string[]; defined: string[]; referenced: string[] },
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, acc);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const node = value as Record<string, unknown>;
  const id = typeof node['@id'] === 'string' ? node['@id'] : undefined;
  const type = node['@type'];

  if (type !== undefined) {
    if (typeof type === 'string') acc.types.push(type);
    else if (Array.isArray(type)) acc.types.push(...type.filter((t): t is string => typeof t === 'string'));
    if (id) acc.defined.push(id);
  } else if (id && Object.keys(node).length === 1) {
    // A bare { "@id": ... } is a reference to a node defined elsewhere.
    acc.referenced.push(id);
  }

  for (const [key, child] of Object.entries(node)) {
    if (key === '@id' || key === '@type' || key === '@context') continue;
    walkJsonLd(child, acc);
  }
}

function parsePage(file: string, html: string, origin: string): ManifestPage {
  const root = parse(html, { comment: false });

  const head = {
    title: root.querySelector('title'),
    description: root.querySelector('meta[name="description"]'),
    canonical: root.querySelector('link[rel="canonical"]'),
    robots: root.querySelector('meta[name="robots"]'),
  };

  const openGraph: Record<string, string> = {};
  for (const meta of root.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')) {
    const key = attr(meta, 'property') ?? attr(meta, 'name');
    const content = attr(meta, 'content');
    if (key && content !== null) openGraph[key] = content;
  }

  const robots = head.robots ? attr(head.robots, 'content') : null;
  const indexable = !(robots ?? '').toLowerCase().includes('noindex');

  const headingEls = root.querySelectorAll('h1, h2, h3, h4, h5, h6');

  const schema = { types: [] as string[], defined: [] as string[], referenced: [] as string[] };
  let jsonLdParses = true;
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walkJsonLd(JSON.parse(script.rawText), schema);
    } catch {
      jsonLdParses = false;
    }
  }

  const internalLinksOut: ManifestLink[] = [];
  const externalLinksOut: string[] = [];
  const hardCodedOriginLinks: string[] = [];

  for (const anchor of root.querySelectorAll('a[href]')) {
    const href = attr(anchor, 'href');
    if (!href) continue;

    if (href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    // The `origin &&` guard is load-bearing: every string starts with '', so
    // an undetected origin would classify every link as hard-coded.
    if (origin && href.startsWith(origin)) {
      // Same site, but written with the domain baked in.
      hardCodedOriginLinks.push(href);
      const path = href.slice(origin.length) || '/';
      internalLinksOut.push({ href, path: toCanonicalForm(path), isCanonicalForm: false });
      continue;
    }

    // Protocol-relative and absolute URLs are external.
    if (href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
      externalLinksOut.push(href);
      continue;
    }

    if (href.startsWith('/')) {
      const path = href.split(/[?#]/)[0] ?? '/';
      const canonicalPath = toCanonicalForm(path);
      internalLinksOut.push({
        href,
        path: canonicalPath,
        isCanonicalForm: path === canonicalPath,
      });
      continue;
    }

    // Relative href -- resolvable, but pages should use root-relative paths.
    externalLinksOut.push(href);
  }

  const images: ManifestImage[] = root.querySelectorAll('img').map((img) => ({
    src: attr(img, 'src') ?? '',
    alt: attr(img, 'alt'),
    hasDimensions: attr(img, 'width') !== null && attr(img, 'height') !== null,
    loading: attr(img, 'loading'),
    fetchpriority: attr(img, 'fetchpriority'),
  }));

  const scriptCount = root
    .querySelectorAll('script')
    .filter((s) => attr(s, 'type') !== 'application/ld+json').length;

  return {
    url: fileToUrl(file),
    file,
    title: head.title ? normalizeText(head.title.text) : null,
    description: head.description ? attr(head.description, 'content') : null,
    canonical: head.canonical ? attr(head.canonical, 'href') : null,
    robots,
    indexable,
    openGraph,
    h1: root.querySelectorAll('h1').map((el) => normalizeText(el.text)),
    headingOrder: headingEls.map((el) => el.tagName.toLowerCase()),
    schemaTypes: schema.types,
    schemaIds: schema.defined,
    schemaRefs: schema.referenced,
    jsonLdParses,
    internalLinksOut,
    externalLinksOut,
    hardCodedOriginLinks,
    internalLinksIn: 0,
    images,
    scriptCount,
    hasFeedLink:
      root.querySelector('link[rel="alternate"][type="application/rss+xml"]') !== null,
  };
}

/** Pull <loc> values out of every sitemap the build produced. */
async function readSitemapUrls(distDir: string, files: string[]): Promise<string[]> {
  const sitemaps = files.filter((f) => /^\/sitemap.*\.xml$/.test(f));
  const urls: string[] = [];

  for (const file of sitemaps) {
    if (file.includes('index')) continue; // the index only points at other sitemaps
    const xml = await readFile(join(distDir, file.slice(1)), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = match[1];
      if (loc) urls.push(loc.trim());
    }
  }

  return urls;
}

/* -------------------------------------------------------------------------- */

export function seoManifest(): AstroIntegration {
  return {
    name: 'seo-manifest',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const files = await listFiles(distDir);
        const htmlFiles = files.filter((f) => f.endsWith('.html'));

        // Read everything first, then determine the origin, THEN parse.
        //
        // The origin is recovered from what actually shipped rather than
        // re-imported from config, so the manifest describes the real output.
        // It must be resolved before any page is parsed: parsing uses it to
        // classify links, and a page that legitimately has no canonical (the
        // 404) would otherwise leave it empty for every page after it.
        const sources = new Map<string, string>();
        for (const file of htmlFiles) {
          sources.set(file, await readFile(join(distDir, file.slice(1)), 'utf8'));
        }

        let origin = '';
        for (const html of sources.values()) {
          const match =
            html.match(/<link rel="canonical" href="(https?:\/\/[^/"]+)/) ??
            html.match(/<meta property="og:url" content="(https?:\/\/[^/"]+)/);
          if (match?.[1]) {
            origin = match[1];
            break;
          }
        }

        if (!origin) {
          logger.warn(
            'could not determine the site origin from the build output; hard-coded-origin detection is disabled for this run',
          );
        }

        const pages: ManifestPage[] = [];
        for (const [file, html] of sources) {
          pages.push(parsePage(file, html, origin));
        }

        // Second pass: invert the outbound link graph to get inbound counts,
        // which is what makes orphan detection possible.
        const inbound = new Map<string, number>();
        for (const page of pages) {
          const unique = new Set(page.internalLinksOut.map((link) => link.path));
          for (const path of unique) {
            inbound.set(path, (inbound.get(path) ?? 0) + 1);
          }
        }
        for (const page of pages) {
          page.internalLinksIn = inbound.get(page.url) ?? 0;
        }

        const manifest: SeoManifest = {
          site: origin,
          generatedAt: new Date().toISOString(),
          files,
          sitemapUrls: await readSitemapUrls(distDir, files),
          pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
        };

        await mkdir('.seo', { recursive: true });
        await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

        logger.info(`wrote ${MANIFEST_PATH} (${pages.length} pages)`);
      },
    },
  };
}
