/**
 * Edit articles from the browser, on localhost, and nowhere else.
 *
 * Adds an app to Astro's Dev Toolbar that loads the Markdown source behind the
 * article you are looking at, lets you edit it, and writes it back. Astro's
 * content watcher then hot-reloads the page, so the rendered article updates
 * behind the panel as you save.
 *
 *
 * WHY THIS CANNOT TOUCH PRODUCTION
 *
 * Four independent reasons, listed strongest first. The point of listing them
 * is that no single one is load-bearing:
 *
 *  1. PRODUCTION HAS NOTHING TO TALK TO. The site builds to static files served
 *     by Cloudflare — no Node process, no filesystem, no endpoint. An editor
 *     cannot function there even if every other layer failed. This is why the
 *     guarantee is architectural rather than a matter of getting a flag right.
 *
 *  2. REGISTRATION IS GATED ON `command === 'dev'`. During `build` and
 *     `preview` the toolbar app is never registered, so its entrypoint is never
 *     referenced and cannot enter the module graph.
 *
 *  3. `astro:server:setup` IS A DEV-ONLY HOOK. The read and write handlers
 *     below have no execution path during a build.
 *
 *  4. WRITES ARE CONFINED BY CONSTRUCTION. The slug is matched against a strict
 *     pattern with no slashes and no dots before it is used, and the resolved
 *     path is then re-checked to be inside the articles directory. Traversal is
 *     rejected twice, on two different principles.
 *
 * `tests/seo/dev-only.spec.ts` asserts after every build that none of this
 * reached `dist/`, which is what catches someone later removing layer 2.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

/** Where editable content lives, relative to the project root. */
const ARTICLES_DIR = 'src/content/articles/';

/**
 * Slugs that are allowed to resolve to a file.
 *
 * Deliberately narrower than "a valid filename": lowercase, digits and hyphens
 * only, starting with an alphanumeric. No slashes, no dots, no leading hyphen.
 * That makes `..`, absolute paths, and nested directories unrepresentable
 * rather than merely rejected, which is a stronger property than sanitising.
 */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const EXTENSIONS = ['.md', '.mdx'] as const;

export interface EditorFile {
  slug: string;
  /** Raw YAML between the --- fences, without the fences. */
  frontmatter: string;
  /** Everything after the closing fence. */
  body: string;
}

/**
 * Split a Markdown file into raw frontmatter and raw body.
 *
 * Both halves stay as text. Parsing the YAML and re-serialising it would
 * silently reorder keys, restyle quoting, and drop comments on every save —
 * the file would churn even when nothing meaningful changed.
 */
export function splitSource(source: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontmatter: '', body: source };
  return { frontmatter: match[1] ?? '', body: source.slice(match[0].length) };
}

/**
 * Recombine the two halves into exactly the shape the files already have:
 * fences, one blank line, body, one trailing newline.
 *
 * The leading-newline strip is load-bearing. `splitSource` leaves the body
 * starting with the newline that followed the closing fence, and the header
 * below adds its own blank line -- without this the file gains a blank line on
 * every save, so saving a file you did not change still produces a diff.
 */
export function joinSource(frontmatter: string, body: string): string {
  const fm = frontmatter.trim();
  const text = body.replace(/^[\r\n]+/, '').replace(/\s+$/, '');
  const head = fm ? `---\n${fm}\n---\n\n` : '';
  return `${head}${text}\n`;
}

export function contentEditor(): AstroIntegration {
  /*
   * Captured in config:setup so the toolbar handlers can resolve paths. The
   * root is only known once Astro has resolved its config.
   */
  let articlesDir = '';

  /** Resolve a slug to an existing file inside the articles directory, or null. */
  const resolveEntry = (slug: unknown): string | null => {
    if (typeof slug !== 'string' || !SLUG.test(slug)) return null;
    if (!articlesDir) return null;

    for (const extension of EXTENSIONS) {
      const path = `${articlesDir}${slug}${extension}`;
      // Second check, on a different principle to the pattern above: whatever
      // the input was, the resolved path has to sit inside the directory.
      if (path.startsWith(articlesDir) && existsSync(path)) return path;
    }

    return null;
  };

  return {
    name: 'content-editor',
    hooks: {
      'astro:config:setup': ({ command, config, addDevToolbarApp, logger }) => {
        // LAYER 2. Nothing below runs for `build` or `preview`, so the
        // entrypoint is never referenced and cannot enter the module graph.
        if (command !== 'dev') return;

        articlesDir = fileURLToPath(new URL(ARTICLES_DIR, config.root));

        addDevToolbarApp({
          id: 'content-editor',
          name: 'Edit article',
          icon: '✎',
          entrypoint: fileURLToPath(new URL('./content-editor-app.ts', import.meta.url)),
        });

        logger.info('article editor available in the dev toolbar (dev only)');
      },

      /*
       * LAYER 3. `astro:server:setup` runs only when the dev server starts, so
       * these handlers have no execution path in a build.
       *
       * The toolbar helpers hang off THIS hook, not an `astro:toolbar:setup`
       * one -- the docs recipe shows the latter, but no such hook exists in
       * Astro 7. Checked against the installed integration types.
       */
      'astro:server:setup': ({ toolbar }) => {
        toolbar.on<{ slug?: string }>('content-editor:load', ({ slug }) => {
          const path = resolveEntry(slug);

          if (!path) {
            toolbar.send('content-editor:loaded', {
              ok: false,
              reason: 'This page is not an article. Open something under /writing/ to edit it.',
            });
            return;
          }

          const { frontmatter, body } = splitSource(readFileSync(path, 'utf8'));
          toolbar.send('content-editor:loaded', { ok: true, slug, frontmatter, body });
        });

        toolbar.on<{ slug?: string; frontmatter?: string; body?: string }>(
          'content-editor:save',
          ({ slug, frontmatter, body }) => {
            const path = resolveEntry(slug);

            if (!path) {
              toolbar.send('content-editor:saved', { ok: false, reason: 'Unknown article.' });
              return;
            }

            if (typeof frontmatter !== 'string' || typeof body !== 'string') {
              toolbar.send('content-editor:saved', { ok: false, reason: 'Malformed payload.' });
              return;
            }

            try {
              writeFileSync(path, joinSource(frontmatter, body), 'utf8');
              /*
               * No schema validation here. Re-implementing the Zod schema
               * outside the `astro:content` virtual module would give two
               * definitions that drift. Astro's own content validation reports
               * a bad edit on the reload that follows, and the build refuses it
               * regardless — which is the check that actually matters.
               */
              toolbar.send('content-editor:saved', { ok: true });
            } catch (error) {
              toolbar.send('content-editor:saved', {
                ok: false,
                reason: error instanceof Error ? error.message : 'Write failed.',
              });
            }
          },
        );
      },
    },
  };
}
