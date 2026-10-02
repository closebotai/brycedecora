import { readdirSync, readFileSync } from 'node:fs';

import { defineConfig, envField, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import { contentEditor } from './integrations/content-editor';
import { mediaLibrary } from './integrations/media-library';
import { seoManifest } from './integrations/seo-manifest';
import { SITE_URL, isIndexable } from './src/data/site';

/**
 * Article slug -> the date its content last changed, for sitemap `<lastmod>`.
 *
 * Read straight from frontmatter rather than through `astro:content`, because
 * this file is evaluated before that virtual module exists. The same
 * frontmatter-regex approach is used in integrations/media-library.ts.
 *
 * ONLY ARTICLES GET A DATE, and that is the whole point. Google honours
 * `lastmod` only while it is accurate and stops trusting the file once it is
 * not, so a date invented for /about/ or the homepage -- neither of which
 * knows when it last changed -- would poison the signal for the pages that do.
 * AGENTS.md says the same thing about `updatedDate`: never backdate, the
 * signal is only worth anything while it is true. Pages with nothing honest to
 * declare declare nothing.
 */
function articleLastmod(): Map<string, string> {
  const dir = new URL('./src/content/articles/', import.meta.url);
  // W3C datetime strings, which is what a sitemap item's `lastmod` takes --
  // the integration's top-level `lastmod` option is a Date, the per-item one
  // is not.
  const dates = new Map<string, string>();

  for (const file of readdirSync(dir)) {
    if (!/\.mdx?$/.test(file)) continue;

    const source = readFileSync(new URL(file, dir), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';

    // `updatedDate` wins when present -- it is the substantive-revision date.
    const raw =
      /^updatedDate:\s*(\S+)/m.exec(frontmatter)?.[1] ??
      /^pubDate:\s*(\S+)/m.exec(frontmatter)?.[1];
    if (!raw) continue;

    const date = new Date(raw.replace(/^['"]|['"]$/g, ''));
    if (!Number.isNaN(date.getTime())) {
      dates.set(file.replace(/\.mdx?$/, ''), date.toISOString());
    }
  }

  return dates;
}

const LASTMOD = articleLastmod();

export default defineConfig({
  /**
   * The canonical origin, sourced from the one constant that defines it.
   * Everything downstream -- canonical tags, OG URLs, sitemap entries,
   * JSON-LD @ids -- derives from `Astro.site`, so the domain is never
   * hard-coded in a page or component.
   */
  site: SITE_URL,

  /**
   * URL POLICY. See the long note in src/data/site.ts.
   *
   * 'directory' emits dist/about/index.html; 'always' makes Astro emit
   * /about/ in links and canonicals; wrangler.jsonc's force-trailing-slash
   * makes Cloudflare enforce the same thing at the edge. All three must agree.
   */
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },

  /**
   * THE CHAT WIDGET'S ACCOUNT, OUT OF THE REPOSITORY.
   *
   * `CLOSEBOT_SOURCE` identifies which CloseBot agent the widget loads. It is
   * NOT a secret and cannot be made one -- it is interpolated into a <script
   * src> and served to every visitor, so `view-source:` on the live site shows
   * it. `access: 'public'` says exactly that, and Astro would refuse to put a
   * secret in client output anyway.
   *
   * It lives here rather than hard-coded for a different reason: FORK HYGIENE.
   * With the value baked into the source, anyone who clones this repository and
   * deploys it loads the original owner's agent, and their visitors'
   * conversations -- and the usage bill -- land in someone else's account. They
   * would have to notice and remove it. Optional-and-absent inverts that: a
   * fork gets no widget until it supplies its own id, which is the safe
   * default rather than the attentive one.
   *
   * Set it as a BUILD variable (Cloudflare Workers Builds, and a GitHub Actions
   * variable for CI) -- the value is needed at build time, because a static
   * site has no runtime to read it in. See README, "Build variables".
   */
  env: {
    schema: {
      CLOSEBOT_SOURCE: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },

  /**
   * Static output. No adapter: Cloudflare serves ./dist as assets without
   * invoking a Worker. Every indexable byte is in the initial HTML response.
   */
  output: 'static',

  /**
   * TYPOGRAPHY. See DESIGN.md, and the web-font note in AGENTS.md for why the
   * default answer of "no web fonts" was deliberately overridden here.
   *
   * Two families from one superfamily. The Fonts API is preferred over pulling
   * Fontsource in by hand because it does the three things that actually make a
   * self-hosted font cheap: it subsets to the characters we declare, inlines
   * the @font-face rules instead of costing a stylesheet round-trip, and
   * generates metric-matched fallbacks so nothing shifts while the face swaps.
   *
   * It emits <style> and <link>, never <script>, so none of this touches the
   * hydration budget.
   */
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'IBM Plex Sans',
      cssVariable: '--font-plex-sans',
      weights: [400, 600],
      /*
       * `styles` DEFAULTS TO ['normal', 'italic']. Leaving it implicit doubles
       * the payload and, worse, preloads italic faces that no page needs on the
       * critical path. Roman only: 128KB over six files becomes 62KB over three.
       *
       * The cost is synthetic oblique for <em> in prose. Acceptable here --
       * DESIGN.md leans on mono and hairlines for emphasis, not italics.
       */
      styles: ['normal'],
      subsets: ['latin'],
      display: 'swap',
      fallbacks: ['system-ui', 'sans-serif'],
      optimizedFallbacks: true,
    },
    {
      /*
       * Mono sets small labels only -- kickers, dates, panel titles. It is not
       * preloaded in BaseLayout: a brief swap at 11px is invisible, and the
       * bytes are better spent on the display face.
       */
      provider: fontProviders.fontsource(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      weights: [400],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'swap',
      fallbacks: ['ui-monospace', 'monospace'],
      optimizedFallbacks: true,
    },
  ],

  integrations: [
    mdx(),
    sitemap({
      /**
       * Sitemap membership is decided by the same predicate the <SEO>
       * component uses for the robots meta tag, so a page can never be
       * noindex-but-in-the-sitemap. tests/seo/indexability.spec.ts verifies it.
       */
      filter: (page) => isIndexable(page),

      /**
       * Attach `<lastmod>` to article URLs, and to nothing else. See
       * `articleLastmod` above for why the other pages stay bare.
       */
      serialize: (item) => {
        const slug = /\/writing\/([^/]+)\/$/.exec(new URL(item.url).pathname)?.[1];
        const lastmod = slug ? LASTMOD.get(slug) : undefined;
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    seoManifest(),

    /*
     * DEV ONLY. Registers nothing unless `command === 'dev'`, so it cannot
     * enter a production build — and production is static assets with no
     * server to talk to regardless. See the header of the integration, and
     * tests/seo/dev-only.spec.ts, which proves dist/ stays clean.
     */
    contentEditor(),

    /*
     * DEV ONLY, on the same four-layer argument as the editor above. Browses
     * and imports into src/assets/media/, and hands Markdown to the editor.
     */
    mediaLibrary(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },

    /*
     * NO rehypePlugins HERE, DELIBERATELY.
     *
     * Astro 7 uses Sätteri as its default Markdown processor. Setting
     * `rehypePlugins` (or `remarkPlugins`) silently reverts the whole pipeline
     * to the legacy unified processor and requires pulling
     * `@astrojs/markdown-remark` back in — a large change to opt into.
     *
     * It is also unnecessary for the thing it is usually added for: Sätteri
     * already injects a github-slugger `id` on every h1–h6, so headings are
     * addressable out of the box and `getHeadings()` returns those same slugs.
     * rehype-slug would be redundant.
     *
     * If visible "#" permalinks are ever wanted, build them in a component
     * rather than downgrading the processor for a piece of ornament.
     */
  },
});
