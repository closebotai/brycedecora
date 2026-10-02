/**
 * The media panel. Runs only in the dev toolbar — see media-library.ts for why
 * it cannot exist in a production build.
 *
 * Browse what is in `src/assets/media/`, import more, edit the alt text and
 * title stored against each file, and hand Markdown to the article editor.
 *
 *
 * THE LIST OF SEO ATTRIBUTES, AND WHY IT IS SHORT
 *
 * An image on this site has exactly seven things worth setting. Four of them
 * are not editable here because they are not editable anywhere — the pipeline
 * decides them, correctly, and a control that pretended otherwise would be a
 * lie:
 *
 *   alt          here, stored per file and offered on every insert
 *   title        here, the tooltip in ![alt](src "title")
 *   filename     here, at import — the one moment it is free to change
 *   cover role   here, via "Use as cover" — this is what sets og:image
 *   dimensions   automatic; Astro reads them from the file
 *   format       automatic; Astro emits WebP and friends from the original
 *   loading      automatic; a cover is eager, a body image is lazy
 *
 * If something feels missing from this panel, check that list before adding a
 * field. There is nothing else an <img> on this site carries.
 *
 * The panel renders into a ShadowRoot, so its styles cannot reach the page and
 * the page's cannot reach it.
 */
import { defineToolbarApp } from 'astro/toolbar';

/** `/writing/<slug>/` is the only shape that maps to an editable article. */
function slugFromPath(pathname: string): string | null {
  const match = /^\/writing\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

/** Path an article uses to reach the media directory, from its own location. */
const MEDIA_PATH = '../../assets/media/';

interface MediaMeta {
  alt: string;
  title: string;
}

interface MediaFile {
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  meta: MediaMeta;
  usedIn: string[];
}

/**
 * The handle the article editor publishes on `window`.
 *
 * Both toolbar apps run in the page's JS context, so a shared object is the
 * whole integration — no events, no channel, no ordering problem. Declared
 * structurally rather than imported because neither app should depend on the
 * other's module: the media panel works with the editor closed, it just falls
 * back to the clipboard.
 */
interface ArticleEditorHandle {
  isOpen(): boolean;
  slug(): string | null;
  insertBody(text: string): boolean;
  appendFrontmatter(text: string): boolean;
  frontmatterHasKey(key: string): boolean;
}

declare global {
  interface Window {
    __bdArticleEditor?: ArticleEditorHandle;
  }
}

/** `]` would close the alt early; `[` unbalances it. Nothing else needs it. */
const escapeAlt = (text: string) => text.replace(/([[\]])/g, '\\$1');
const escapeTitle = (text: string) => text.replace(/"/g, '\\"');

function markdownFor(file: MediaFile): string {
  const alt = escapeAlt(file.meta.alt.trim());
  const title = file.meta.title.trim();
  const src = `${MEDIA_PATH}${file.name}`;
  return title ? `![${alt}](${src} "${escapeTitle(title)}")` : `![${alt}](${src})`;
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

export default defineToolbarApp({
  init(canvas, app) {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }

      /*
       * top:0/bottom:0 against the VIEWPORT.
       *
       * An earlier version of the article editor pinned itself with a dvh
       * height because app canvases were believed to live inside the toolbar's
       * transformed wrapper, which would make that wrapper the containing
       * block. They do not -- the canvases are siblings of #dev-toolbar-root in
       * the toolbar's shadow root, so fixed positioning resolves against the
       * viewport as normal. Verified in the browser, not assumed.
       */
      .panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(46rem, 60vw);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        background: #14181f;
        color: #f2f4f8;
        border-left: 1px solid #f2f4f8;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        /*
         * The toolbar sits at bottom:-40px until hovered, so it cannot be
         * relied on as the way out. This panel owns its own close button and
         * must paint above the site header, which is z-50.
         */
        z-index: 2147483647;
        overflow: hidden;
      }
      .panel[data-wide='true'] { width: 100vw; }

      /* The house panel title bar, in the dev tool's own palette. */
      .bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.25rem 0.5rem;
        background: #f2f4f8;
        color: #14181f;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        flex: none;
      }
      .bar .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bar button {
        background: none;
        border: 0;
        color: inherit;
        font: inherit;
        cursor: pointer;
        padding: 0.125rem 0.375rem;
      }
      .bar button:hover { background: #14181f; color: #f2f4f8; }
      .bar button:focus-visible { outline: 2px solid #c98a5a; outline-offset: -2px; }

      .scroll { flex: 1; min-height: 0; overflow: auto; padding: 0.75rem; }

      .import {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        border: 1px dashed #39404b;
        padding: 0.625rem 0.75rem;
        margin-bottom: 0.75rem;
      }
      .import[data-dropping='true'] { border-color: #c98a5a; background: #1b2029; }
      .import .hint { opacity: 0.55; flex: 1; line-height: 1.4; }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
        gap: 0.5rem;
      }

      .tile {
        border: 1px solid #39404b;
        background: #0e1116;
        padding: 0;
        cursor: pointer;
        font: inherit;
        color: inherit;
        text-align: left;
        display: flex;
        flex-direction: column;
      }
      .tile[aria-pressed='true'] { border-color: #c98a5a; }
      .tile:focus-visible { outline: 2px solid #c98a5a; outline-offset: 1px; }
      .tile img {
        width: 100%;
        height: 5.5rem;
        object-fit: contain;
        background: #000;
        display: block;
      }
      .tile .name {
        padding: 0.25rem 0.375rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tile .sub { padding: 0 0.375rem 0.25rem; font-size: 10px; opacity: 0.55; }
      .tile .warn { color: #e8b57a; }

      .detail {
        flex: none;
        border-top: 1px solid #39404b;
        padding: 0.75rem;
        display: grid;
        grid-template-columns: 7rem 1fr;
        gap: 0.75rem;
        background: #11151b;
      }
      .detail[hidden] { display: none; }
      .detail img { width: 7rem; height: 7rem; object-fit: contain; background: #000; border: 1px solid #39404b; }

      .fields { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
      label { display: flex; flex-direction: column; gap: 0.25rem; }
      .label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }

      input[type='text'], textarea {
        width: 100%;
        box-sizing: border-box;
        background: #0e1116;
        color: #f2f4f8;
        border: 1px solid #39404b;
        padding: 0.375rem;
        font: inherit;
        line-height: 1.4;
        resize: vertical;
      }
      input[type='text']:focus-visible, textarea:focus-visible { outline: 2px solid #c98a5a; outline-offset: 1px; }

      .actions { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; }

      button.action {
        cursor: pointer;
        background: #c98a5a;
        color: #14181f;
        border: 0;
        padding: 0.3rem 0.6rem;
        font: inherit;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      button.action.ghost { background: none; color: #f2f4f8; border: 1px solid #39404b; font-weight: 400; }
      button.action:disabled { opacity: 0.4; cursor: default; }
      button.action:focus-visible { outline: 2px solid #f2f4f8; outline-offset: 2px; }

      .meta { font-size: 10px; opacity: 0.6; line-height: 1.5; }
      .status { padding: 0.375rem 0.75rem; min-height: 1.6em; border-top: 1px solid #39404b; flex: none; }
      .status[data-tone='error'] { color: #ff9f9f; }
      .status[data-tone='ok'] { color: #9fe0a8; }
      .status[data-tone='warn'] { color: #e8b57a; }
      .empty { opacity: 0.55; line-height: 1.6; padding: 1rem 0; }
      input[type='file'] { display: none; }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="bar">
        <span class="grow">Media library v1 <span data-slug></span></span>
        <button type="button" data-wide title="Toggle full width">Wide</button>
        <button type="button" data-close title="Close (Esc)">&#10005; Close</button>
      </div>

      <div class="scroll">
        <div class="import" data-drop>
          <button type="button" class="action" data-pick>Import images</button>
          <span class="hint">
            …or drop files here. They are written to src/assets/media/ and go through
            Astro's image pipeline, which is what supplies width, height and WebP.
            PNG, JPG, WebP, AVIF, GIF — no SVG.
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" multiple data-file />
        </div>

        <div class="grid" data-grid></div>
        <p class="empty" data-empty hidden>
          Nothing in src/assets/media/ yet. Import something to start.
        </p>
      </div>

      <div class="detail" data-detail hidden>
        <img alt="" data-preview />
        <div class="fields">
          <label>
            <span class="label">Alt text — describes the image to a screen reader and to Google</span>
            <textarea rows="2" data-alt spellcheck="true"></textarea>
          </label>
          <label>
            <span class="label">Title (optional) — the tooltip; leave empty unless it adds something</span>
            <input type="text" data-title spellcheck="true" />
          </label>
          <div class="actions">
            <button type="button" class="action ghost" data-save>Save attributes</button>
            <button type="button" class="action" data-insert>Insert in body</button>
            <button type="button" class="action" data-cover>Use as cover</button>
            <button type="button" class="action ghost" data-copy>Copy Markdown</button>
          </div>
          <p class="meta" data-filemeta></p>
        </div>
      </div>

      <p class="status" role="status" data-status></p>
    `;

    canvas.append(style, panel);

    const q = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;

    const slugEl = q('[data-slug]');
    const gridEl = q('[data-grid]');
    const emptyEl = q('[data-empty]');
    const detailEl = q('[data-detail]');
    const previewEl = q<HTMLImageElement>('[data-preview]');
    const altEl = q<HTMLTextAreaElement>('[data-alt]');
    const titleEl = q<HTMLInputElement>('[data-title]');
    const fileMetaEl = q('[data-filemeta]');
    const statusEl = q('[data-status]');
    const fileInput = q<HTMLInputElement>('[data-file]');
    const dropEl = q('[data-drop]');

    let files: MediaFile[] = [];
    let selected: string | null = null;
    let slug: string | null = null;
    let context: { hasCover: boolean; bodyImageCount: number } | null = null;

    const setStatus = (message: string, tone: 'ok' | 'error' | 'warn' | '' = '') => {
      statusEl.textContent = message;
      if (tone) statusEl.dataset.tone = tone;
      else delete statusEl.dataset.tone;
    };

    const api = () => window.__bdArticleEditor;

    const current = () => files.find((file) => file.name === selected) ?? null;

    /* ---- rendering ------------------------------------------------------ */

    const renderGrid = () => {
      gridEl.textContent = '';
      emptyEl.hidden = files.length > 0;

      for (const file of files) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile';
        tile.setAttribute('aria-pressed', String(file.name === selected));

        const img = document.createElement('img');
        img.src = `/__media/file/${encodeURIComponent(file.name)}?w=320`;
        img.alt = '';
        img.loading = 'lazy';

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = file.name;

        const sub = document.createElement('span');
        sub.className = 'sub';
        const dimensions = file.width && file.height ? `${file.width}×${file.height}` : 'unknown size';
        const used = file.usedIn.length ? `used ×${file.usedIn.length}` : 'unused';
        sub.textContent = `${dimensions} · ${formatBytes(file.size)} · ${used}`;
        if (!file.meta.alt.trim()) {
          sub.classList.add('warn');
          sub.textContent += ' · no alt';
        }

        tile.append(img, name, sub);
        tile.addEventListener('click', () => select(file.name));
        gridEl.append(tile);
      }
    };

    const renderDetail = () => {
      const file = current();
      detailEl.hidden = !file;
      if (!file) return;

      previewEl.src = `/__media/file/${encodeURIComponent(file.name)}?w=320`;
      altEl.value = file.meta.alt;
      titleEl.value = file.meta.title;

      const where = file.usedIn.length
        ? `Referenced by ${file.usedIn.join(', ')}.`
        : 'Not referenced by any article. Safe to git rm.';
      fileMetaEl.textContent = `${file.name} · ${file.width ?? '?'}×${file.height ?? '?'} · ${formatBytes(file.size)} · ${where}`;
    };

    const select = (name: string) => {
      selected = name;
      renderGrid();
      renderDetail();
      setStatus('');
    };

    /* ---- server --------------------------------------------------------- */

    const refresh = async () => {
      const response = await fetch('/__media/list');
      const payload = (await response.json()) as { ok: boolean; files?: MediaFile[] };
      files = payload.files ?? [];
      if (selected && !files.some((file) => file.name === selected)) selected = null;
      renderGrid();
      renderDetail();
    };

    const loadContext = async () => {
      slug = slugFromPath(window.location.pathname);
      slugEl.textContent = slug ? `· ${slug}` : '· not an article';
      context = null;
      if (!slug) return;

      const response = await fetch(`/__media/context?slug=${encodeURIComponent(slug)}`);
      const payload = (await response.json()) as {
        slug: string | null;
        hasCover?: boolean;
        bodyImageCount?: number;
      };
      if (payload.slug) {
        context = { hasCover: !!payload.hasCover, bodyImageCount: payload.bodyImageCount ?? 0 };
      }
    };

    const saveMeta = async (): Promise<boolean> => {
      const file = current();
      if (!file) return false;

      const response = await fetch('/__media/meta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, alt: altEl.value, title: titleEl.value }),
      });
      const payload = (await response.json()) as { ok: boolean; reason?: string };

      if (!payload.ok) {
        setStatus(payload.reason ?? 'Could not save.', 'error');
        return false;
      }

      file.meta = { alt: altEl.value, title: titleEl.value };
      renderGrid();
      return true;
    };

    const upload = async (list: FileList | File[]) => {
      const chosen = [...list];
      if (!chosen.length) return;

      setStatus(`Importing ${chosen.length} file(s)…`);
      const notes: string[] = [];

      for (const file of chosen) {
        const response = await fetch('/__media/upload', {
          method: 'POST',
          headers: {
            // Encoded because a header cannot carry arbitrary Unicode, and
            // filenames routinely do.
            'x-media-name': encodeURIComponent(file.name),
            'content-type': file.type || 'application/octet-stream',
          },
          body: file,
        });

        const payload = (await response.json()) as {
          ok: boolean;
          name?: string;
          resizedFrom?: number | null;
          reason?: string;
        };

        if (!payload.ok) {
          notes.push(`${file.name}: ${payload.reason ?? 'failed'}`);
          continue;
        }

        notes.push(
          payload.resizedFrom
            ? `${payload.name} (resized from ${payload.resizedFrom}px)`
            : String(payload.name),
        );
        selected = payload.name ?? selected;
      }

      await refresh();
      renderDetail();
      setStatus(`Imported: ${notes.join('; ')}`, 'ok');
    };

    /* ---- actions -------------------------------------------------------- */

    q('[data-close]').addEventListener('click', () => app.toggleState({ state: false }));

    q('[data-wide]').addEventListener('click', () => {
      panel.dataset.wide = panel.dataset.wide === 'true' ? 'false' : 'true';
    });

    q('[data-pick]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files) void upload(fileInput.files);
      fileInput.value = '';
    });

    for (const event of ['dragenter', 'dragover'] as const) {
      dropEl.addEventListener(event, (e) => {
        e.preventDefault();
        dropEl.dataset.dropping = 'true';
      });
    }
    for (const event of ['dragleave', 'drop'] as const) {
      dropEl.addEventListener(event, () => {
        dropEl.dataset.dropping = 'false';
      });
    }
    dropEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files) void upload(e.dataTransfer.files);
    });

    q('[data-save]').addEventListener('click', async () => {
      if (await saveMeta()) setStatus('Attributes saved to media.json.', 'ok');
    });

    q('[data-copy]').addEventListener('click', async () => {
      const file = current();
      if (!file || !(await saveMeta())) return;
      await navigator.clipboard.writeText(markdownFor(file));
      setStatus('Markdown copied to the clipboard.', 'ok');
    });

    q('[data-insert]').addEventListener('click', async () => {
      const file = current();
      if (!file) return;

      if (!altEl.value.trim()) {
        setStatus('Write alt text first. A missing alt fails tests/seo/images.spec.ts.', 'error');
        altEl.focus();
        return;
      }
      if (!(await saveMeta())) return;

      /*
       * The one genuine trap in the whole feature. Markdown always emits
       * loading="lazy", and images.spec.ts requires the FIRST image on a page
       * not to be lazy. So the first image in a coverless article cannot be a
       * body image -- it has to be the cover, which the layout loads eagerly
       * with fetchpriority=high.
       */
      if (context && !context.hasCover && context.bodyImageCount === 0) {
        setStatus(
          'This article has no cover, so this would become the page’s first <img> — and Markdown always emits loading="lazy", which fails images.spec.ts. Use "Use as cover" instead.',
          'warn',
        );
        return;
      }

      const editor = api();
      const markdown = markdownFor(file);

      if (!editor?.isOpen()) {
        await navigator.clipboard.writeText(markdown);
        setStatus('Article editor is closed — Markdown copied to the clipboard instead.', 'ok');
        return;
      }

      if (!editor.insertBody(markdown)) {
        setStatus('The editor has no article loaded.', 'error');
        return;
      }

      if (context) context.bodyImageCount += 1;
      setStatus('Inserted at the cursor. Save the article to write it to disk.', 'ok');
    });

    q('[data-cover]').addEventListener('click', async () => {
      const file = current();
      if (!file) return;

      if (!altEl.value.trim()) {
        // The content schema refuses a cover without coverAlt, so this would
        // fail on reload anyway -- better to say so before writing it.
        setStatus('A cover needs alt text. The content schema requires coverAlt.', 'error');
        altEl.focus();
        return;
      }
      if (!(await saveMeta())) return;

      const editor = api();
      const yaml = `cover: ${MEDIA_PATH}${file.name}\ncoverAlt: ${JSON.stringify(altEl.value.trim())}`;

      if (!editor?.isOpen()) {
        await navigator.clipboard.writeText(yaml);
        setStatus('Article editor is closed — cover frontmatter copied to the clipboard.', 'ok');
        return;
      }

      if (editor.frontmatterHasKey('cover')) {
        setStatus('This article already has a cover. Edit or remove it first.', 'error');
        return;
      }

      if (!editor.appendFrontmatter(yaml)) {
        setStatus('The editor has no article loaded.', 'error');
        return;
      }

      if (context) context.hasCover = true;
      setStatus('Cover added to the frontmatter. Save the article to write it.', 'ok');
    });

    /* ---- lifecycle ------------------------------------------------------ */

    /*
     * Reloaded on every toggle rather than once: files may have arrived on
     * disk, and the article behind the panel may have changed, since it was
     * last open.
     */
    app.onToggled(({ state }) => {
      if (!state) return;
      setStatus('Loading…');
      void (async () => {
        await Promise.all([refresh(), loadContext()]);
        setStatus('');
      })();
    });

    /*
     * Esc closes. Bound to the window rather than the panel because the
     * toolbar hides itself at bottom:-40px until hovered, so the toolbar
     * button is not a reliable way out and focus is often still on the page.
     */
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden && canvas.isConnected) {
        app.toggleState({ state: false });
      }
    });
  },
});
