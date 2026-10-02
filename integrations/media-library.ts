/**
 * Browse, import and annotate images from the browser, on localhost, and
 * nowhere else.
 *
 * Adds a second app to Astro's Dev Toolbar, beside `content-editor`. It lists
 * everything in `src/assets/media/`, imports new files into it, edits the alt
 * text and title stored against each one, and hands Markdown back to the
 * article editor.
 *
 *
 * WHY `src/assets/media/` AND NOT `public/`
 *
 * This is the whole reason the tool exists rather than a folder and a text
 * editor. `public/` is copied verbatim: no dimensions, no srcset, no format
 * conversion — and `tests/seo/images.spec.ts` fails a build where an image has
 * no width and height, because that is a direct CLS regression. Anything under
 * `src/assets/` goes through Astro's image pipeline instead, and a plain
 * Markdown `![alt](../../assets/media/x.png)` comes out the far side as a
 * sized, lazy-loaded WebP. The pipeline is doing the SEO work; the job here is
 * only to make sure files land where the pipeline can see them.
 *
 *
 * WHY THIS CANNOT TOUCH PRODUCTION
 *
 * The same four independent reasons that cover the article editor, and for the
 * same reason they are written out rather than assumed — no single one is
 * load-bearing. See the header of `content-editor.ts` for the long form:
 *
 *  1. Production is static files on Cloudflare. No Node, no filesystem, no
 *     endpoint to call.
 *  2. Registration is gated on `command === 'dev'`.
 *  3. The routes live on `astro:server:setup`, a hook with no execution path
 *     during a build.
 *  4. Reads and writes are confined by construction — every filename is matched
 *     against a pattern with no slashes and no dots before the extension, and
 *     the resolved path is re-checked to sit inside the media directory.
 *
 * `tests/seo/dev-only.spec.ts` asserts after every build that none of this
 * reached `dist/`, which is what catches someone later removing layer 2.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { AstroIntegration } from 'astro';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Where importable images live, relative to the project root. */
const MEDIA_DIR = 'src/assets/media/';

/** Articles are scanned for references, to report what is in use. */
const ARTICLES_DIR = 'src/content/articles/';

/** Sidecar holding the alt text and title stored against each file. */
const SIDECAR = 'media.json';

/**
 * The URL prefix every route below hangs off. Deliberately not under `/_` —
 * Astro reserves that — and deliberately not a name a real page could want.
 */
const ROUTE = '/__media';

/**
 * Formats allowed through the importer.
 *
 * SVG is absent on purpose. Astro passes SVG through without rasterising it,
 * so it arrives without the intrinsic width and height that
 * `tests/seo/images.spec.ts` requires, and a diagram imported here would fail
 * the build rather than render. Commit SVG by hand and place it with an
 * explicit `<Image>` or `<img width height>` if you need one.
 */
const FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] as const;

/**
 * Filenames that are allowed to resolve to a file.
 *
 * Same principle as the article editor's slug pattern: lowercase, digits and
 * hyphens, one dot, a known extension. No slashes and no second dot, which
 * makes `..` and absolute paths unrepresentable rather than merely rejected.
 */
const FILENAME = new RegExp(`^[a-z0-9][a-z0-9-]*\\.(${FORMATS.join('|')})$`);

/**
 * Longest edge kept for an imported original, in pixels.
 *
 * Templates request at most 1200px (`widths={[480, 800, 1200]}`), so anything
 * above roughly twice that is bytes the repository carries forever and the
 * pipeline immediately throws away. A phone screenshot is ~1200px and passes
 * through untouched; a camera original does not. The panel reports when it
 * resized, because silently rewriting someone's file is not acceptable even
 * when the output is identical.
 */
const MAX_SOURCE_WIDTH = 2400;

/** Refuse an import larger than this outright, before decoding it. */
const MAX_BYTES = 32 * 1024 * 1024;

interface MediaMeta {
  /** Default alt text, offered whenever the image is inserted. */
  alt: string;
  /** Optional `title` attribute — the tooltip in `![alt](src "title")`. */
  title: string;
}

interface Sidecar {
  version: 1;
  files: Record<string, MediaMeta>;
}

const EMPTY_META: MediaMeta = { alt: '', title: '' };

/** Normalise an arbitrary upload name into a filename worth having in a URL. */
export function slugifyFilename(raw: string): string | null {
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;

  const extension = raw.slice(dot + 1).toLowerCase();
  if (!FORMATS.includes(extension as (typeof FORMATS)[number])) return null;

  const stem = raw
    .slice(0, dot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!stem) return null;
  return `${stem}.${extension === 'jpeg' ? 'jpg' : extension}`;
}

/** Append `-2`, `-3`, … until the name is free. */
function uniqueFilename(dir: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot);
  const extension = name.slice(dot);

  let candidate = name;
  let n = 2;
  while (existsSync(`${dir}${candidate}`)) {
    candidate = `${stem}-${n}${extension}`;
    n += 1;
  }
  return candidate;
}

export function mediaLibrary(): AstroIntegration {
  /* Captured in config:setup; the root is only known once Astro resolves it. */
  let mediaDir = '';
  let articlesDir = '';

  const sidecarPath = () => `${mediaDir}${SIDECAR}`;

  const readSidecar = (): Sidecar => {
    try {
      const parsed = JSON.parse(readFileSync(sidecarPath(), 'utf8')) as Partial<Sidecar>;
      if (parsed && typeof parsed === 'object' && parsed.files) {
        return { version: 1, files: parsed.files };
      }
    } catch {
      /* Missing or unparseable: an empty library is the right starting state. */
    }
    return { version: 1, files: {} };
  };

  const writeSidecar = (sidecar: Sidecar) => {
    writeFileSync(sidecarPath(), `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  };

  /** Resolve a filename to an existing file inside the media directory, or null. */
  const resolveFile = (name: unknown): string | null => {
    if (typeof name !== 'string' || !FILENAME.test(name)) return null;
    if (!mediaDir) return null;

    const path = `${mediaDir}${name}`;
    // Second check, on a different principle to the pattern above: whatever the
    // input was, the resolved path has to sit inside the directory.
    if (!path.startsWith(mediaDir) || !existsSync(path)) return null;
    return path;
  };

  const listArticles = (): { id: string; source: string }[] => {
    if (!existsSync(articlesDir)) return [];
    return readdirSync(articlesDir)
      .filter((file) => /\.mdx?$/.test(file))
      .map((file) => ({
        id: file.replace(/\.mdx?$/, ''),
        source: readFileSync(`${articlesDir}${file}`, 'utf8'),
      }));
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          reject(new Error(`Larger than the ${MAX_BYTES / 1024 / 1024}MB import limit.`));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  return {
    name: 'media-library',
    hooks: {
      'astro:config:setup': ({ command, config, addDevToolbarApp, updateConfig, logger }) => {
        // LAYER 2. Nothing below runs for `build` or `preview`, so the
        // entrypoint is never referenced and cannot enter the module graph.
        if (command !== 'dev') return;

        mediaDir = fileURLToPath(new URL(MEDIA_DIR, config.root));
        articlesDir = fileURLToPath(new URL(ARTICLES_DIR, config.root));

        // Created on demand so a fresh clone does not need a tracked empty dir.
        mkdirSync(mediaDir, { recursive: true });

        /*
         * KEEP THE FILE WATCHER OUT OF THE MEDIA DIRECTORY.
         *
         * `src/assets/media/` sits inside the watched tree, so importing a file
         * or saving alt text into media.json triggers a full page reload. That
         * reload tears down the toolbar and discards whatever unsaved prose is
         * in the article editor's textareas — writing image metadata must not
         * be able to destroy an article edit.
         *
         * Set here rather than with `server.watcher.unwatch()` in server:setup,
         * which does not hold: Astro re-globs the tree and the directory comes
         * straight back under watch.
         *
         * Nothing is lost by ignoring it. An image only changes a rendered page
         * once an article references it, and saving that article reloads the
         * page anyway.
         */
        updateConfig({ vite: { server: { watch: { ignored: [`${mediaDir}**`] } } } });

        addDevToolbarApp({
          id: 'media-library',
          name: 'Media',
          icon: '▦',
          entrypoint: fileURLToPath(new URL('./media-library-app.ts', import.meta.url)),
        });

        logger.info('media library available in the dev toolbar (dev only)');
      },

      /*
       * LAYER 3. `astro:server:setup` runs only when the dev server starts, so
       * these routes have no execution path in a build.
       *
       * These are Vite middlewares rather than toolbar messages — unlike the
       * article editor, this app moves binary data, and base64 over the HMR
       * socket would be both slower and larger than a request body.
       */
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(ROUTE, async (req, res, next) => {
          // `req.url` is already relative to ROUTE here.
          const url = new URL(req.url ?? '/', 'http://localhost');
          const route = url.pathname;

          try {
            /* ---- the library, with usage and dimensions ------------------ */
            if (route === '/list' && req.method === 'GET') {
              const sidecar = readSidecar();
              const articles = listArticles();
              const names = readdirSync(mediaDir).filter((file) => FILENAME.test(file));

              const files = await Promise.all(
                names.map(async (name) => {
                  const path = `${mediaDir}${name}`;
                  const { size } = statSync(path);

                  let width: number | null = null;
                  let height: number | null = null;
                  try {
                    const meta = await sharp(path).metadata();
                    width = meta.width ?? null;
                    height = meta.height ?? null;
                  } catch {
                    /* Unreadable image: still listed, just without dimensions. */
                  }

                  return {
                    name,
                    size,
                    width,
                    height,
                    meta: sidecar.files[name] ?? EMPTY_META,
                    /*
                     * Which articles reference the file. This is what makes
                     * deleting by hand safe: an image shown as unused is one
                     * `git rm` away from gone, and one in use names the pages
                     * that would break.
                     */
                    usedIn: articles.filter((a) => a.source.includes(name)).map((a) => a.id),
                  };
                }),
              );

              files.sort((a, b) => a.name.localeCompare(b.name));
              send(res, 200, { ok: true, files });
              return;
            }

            /* ---- the bytes, optionally as a thumbnail -------------------- */
            if (route.startsWith('/file/') && req.method === 'GET') {
              const path = resolveFile(decodeURIComponent(route.slice('/file/'.length)));
              if (!path) {
                send(res, 404, { ok: false, reason: 'No such file.' });
                return;
              }

              const thumb = url.searchParams.get('w');
              if (thumb) {
                const width = Math.min(Math.max(Number(thumb) || 320, 32), 1024);
                const buffer = await sharp(path)
                  .resize({ width, withoutEnlargement: true })
                  .webp({ quality: 72 })
                  .toBuffer();
                res.statusCode = 200;
                res.setHeader('content-type', 'image/webp');
                res.setHeader('cache-control', 'no-store');
                res.end(buffer);
                return;
              }

              res.statusCode = 200;
              res.setHeader('cache-control', 'no-store');
              res.end(readFileSync(path));
              return;
            }

            /* ---- import ------------------------------------------------- */
            if (route === '/upload' && req.method === 'POST') {
              /*
               * The name arrives percent-encoded: a header cannot carry
               * arbitrary Unicode, and filenames routinely do. A malformed
               * sequence is treated as no name at all rather than throwing.
               */
              const header = String(req.headers['x-media-name'] ?? '');
              let decoded = '';
              try {
                decoded = decodeURIComponent(header);
              } catch {
                decoded = '';
              }

              const requested = slugifyFilename(decoded);
              if (!requested) {
                send(res, 400, {
                  ok: false,
                  reason: `Name it something.${FORMATS.map((f) => ` .${f}`).join(',')} only — and no SVG, which would arrive without intrinsic dimensions.`,
                });
                return;
              }

              const body = await readBody(req);
              if (body.length === 0) {
                send(res, 400, { ok: false, reason: 'Empty file.' });
                return;
              }

              const name = uniqueFilename(mediaDir, requested);
              const path = `${mediaDir}${name}`;
              if (!path.startsWith(mediaDir)) {
                send(res, 400, { ok: false, reason: 'Refused.' });
                return;
              }

              const image = sharp(body);
              const meta = await image.metadata();
              const original = meta.width ?? 0;

              let resizedFrom: number | null = null;
              if (original > MAX_SOURCE_WIDTH) {
                /*
                 * Re-encoded in the SAME format. Converting here would fight
                 * the pipeline, which picks the output format itself and does
                 * it better with the original to work from.
                 */
                await image.resize({ width: MAX_SOURCE_WIDTH }).toFile(path);
                resizedFrom = original;
              } else {
                writeFileSync(path, body);
              }

              const sidecar = readSidecar();
              sidecar.files[name] = { ...EMPTY_META };
              writeSidecar(sidecar);

              logger.info(`imported ${MEDIA_DIR}${name}`);
              send(res, 200, { ok: true, name, resizedFrom });
              return;
            }

            /* ---- alt text and title ------------------------------------- */
            if (route === '/meta' && req.method === 'POST') {
              const payload = JSON.parse((await readBody(req)).toString('utf8')) as {
                name?: string;
                alt?: string;
                title?: string;
              };

              if (!resolveFile(payload.name)) {
                send(res, 404, { ok: false, reason: 'No such file.' });
                return;
              }

              const sidecar = readSidecar();
              sidecar.files[payload.name!] = {
                alt: typeof payload.alt === 'string' ? payload.alt : '',
                title: typeof payload.title === 'string' ? payload.title : '',
              };

              /*
               * Prune entries whose file is gone. Deletion happens in git, not
               * here, so this is where the sidecar catches up with it.
               */
              for (const key of Object.keys(sidecar.files)) {
                if (!resolveFile(key)) delete sidecar.files[key];
              }

              writeSidecar(sidecar);
              send(res, 200, { ok: true });
              return;
            }

            /*
             * ---- what the open article already has ----------------------
             *
             * Answers the one question that decides whether inserting an image
             * is safe: does this article have a cover? Markdown always emits
             * `loading="lazy"`, and `tests/seo/images.spec.ts` requires that
             * the FIRST image on a page is not lazy. So an article with no
             * cover and no body images cannot take a body image without
             * failing the build — the first one has to become the cover.
             */
            if (route === '/context' && req.method === 'GET') {
              const slug = url.searchParams.get('slug') ?? '';
              const article = listArticles().find((a) => a.id === slug);

              if (!article) {
                send(res, 200, { ok: true, slug: null });
                return;
              }

              const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(article.source);
              const frontmatter = match?.[1] ?? '';
              const body = match ? article.source.slice(match[0].length) : article.source;

              send(res, 200, {
                ok: true,
                slug,
                hasCover: /^cover:/m.test(frontmatter),
                bodyImageCount: (body.match(/!\[[^\]]*\]\(/g) ?? []).length,
              });
              return;
            }
          } catch (error) {
            send(res, 500, {
              ok: false,
              reason: error instanceof Error ? error.message : 'Request failed.',
            });
            return;
          }

          next();
        });
      },
    },
  };
}
