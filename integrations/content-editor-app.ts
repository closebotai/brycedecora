/**
 * The editor panel. Runs only in the dev toolbar — see content-editor.ts for
 * why it cannot exist in a production build.
 *
 * Two raw textareas: YAML frontmatter and Markdown body. Not a rich editor,
 * and not a set of parsed frontmatter fields, for the same reason in both
 * cases — anything that re-serialises would reflow hand-wrapped prose or
 * reorder YAML keys on every save, so a one-word change would produce a
 * hundred-line diff. Raw text round-trips exactly.
 *
 * The panel renders into a ShadowRoot, so its styles cannot reach the page and
 * the page's cannot reach it.
 *
 * It also publishes `window.__bdArticleEditor`, which is how the media panel
 * puts Markdown into the textareas. See the note on that object below.
 */
import { defineToolbarApp } from 'astro/toolbar';

/** `/writing/<slug>/` is the only shape that maps to an editable file. */
function slugFromPath(pathname: string): string | null {
  const match = /^\/writing\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

/** Insert at the caret, keeping the caret after what was inserted. */
function insertAtCaret(field: HTMLTextAreaElement, text: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;

  /*
   * A Markdown image has to be its own block, so it is padded to sit between
   * blank lines -- but only where one is not already there. Pasting into the
   * middle of a paragraph otherwise produces an inline image and a confusing
   * diff.
   */
  const before = field.value.slice(0, start);
  const after = field.value.slice(end);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const block = `${lead}${text}${tail}`;

  field.value = `${before}${block}${after}`;
  const caret = start + block.length - tail.length;
  field.setSelectionRange(caret, caret);
  field.focus();
}

export default defineToolbarApp({
  init(canvas, app, server) {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }

      /*
       * top:0/bottom:0 against the VIEWPORT.
       *
       * This used to pin to the bottom with a dvh height, on the belief that
       * the toolbar renders app canvases inside a transformed wrapper -- which
       * would make that wrapper the containing block for position:fixed. It
       * does not: the canvases are siblings of #dev-toolbar-root inside the
       * toolbar's shadow root, not descendants of it, so fixed positioning
       * resolves against the viewport as normal. Checked in the browser.
       *
       * z-index is explicit because the site header is sticky at z-50 and this
       * panel has to sit over it while editing.
       */
      .panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(42rem, 50vw);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        background: #14181f;
        color: #f2f4f8;
        border-left: 1px solid #f2f4f8;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        z-index: 2147483647;
        /*
         * hidden, not auto. The body textarea flexes to fill whatever is left,
         * so the panel must never scroll -- if it does, the title row and the
         * Save button scroll out of reach.
         */
        overflow: hidden;
      }

      /*
       * THE WAY OUT.
       *
       * Astro parks its toolbar at bottom:-40px and only slides it up on
       * hover, so with a full-height panel open the toolbar button that
       * toggled it is off-screen. Without this bar there is no visible way to
       * close the editor.
       */
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

      /* Everything below the title bar keeps the old padded column. */
      .stack {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
      }

      .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

      label { display: flex; flex-direction: column; gap: 0.25rem; }
      .label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }

      textarea {
        width: 100%;
        box-sizing: border-box;
        background: #0e1116;
        color: #f2f4f8;
        border: 1px solid #39404b;
        padding: 0.625rem;
        font: inherit;
        line-height: 1.5;
        resize: vertical;
        tab-size: 2;
      }
      textarea:focus-visible { outline: 2px solid #c98a5a; outline-offset: 1px; }

      /*
       * The body is the thing being edited, so it takes the remaining height.
       * min-height 0 on both the textarea and its label is what allows a flex
       * child to shrink below its content size; without it the textarea forces
       * the panel taller than the viewport. (No backticks in here -- this
       * block lives inside a JS template literal.)
       */
      .frontmatter { height: 10rem; flex: none; }
      .body-label { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      .body { flex: 1; min-height: 0; }

      button {
        cursor: pointer;
        background: #c98a5a;
        color: #14181f;
        border: 0;
        padding: 0.4rem 0.9rem;
        font: inherit;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      button:disabled { opacity: 0.45; cursor: default; }
      button:focus-visible { outline: 2px solid #f2f4f8; outline-offset: 2px; }

      .status { min-height: 1.2em; }
      .status[data-tone='error'] { color: #ff9f9f; }
      .status[data-tone='ok'] { color: #9fe0a8; }
      .note { opacity: 0.55; line-height: 1.5; }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="bar">
        <span class="grow">Edit article v1 <span data-slug></span></span>
        <button type="button" data-close title="Close (Esc)">&#10005; Close</button>
      </div>

      <div class="stack">
        <label>
          <span class="label">Frontmatter (YAML)</span>
          <textarea class="frontmatter" spellcheck="false" data-frontmatter></textarea>
        </label>

        <label class="body-label">
          <span class="label">Body (Markdown)</span>
          <textarea class="body" data-body></textarea>
        </label>

        <div class="row">
          <span class="status" role="status" data-status></span>
          <button type="button" data-save>Save</button>
        </div>

        <p class="note">
          Writes the file on disk; the page behind reloads. Frontmatter is validated
          by Astro on reload, not here. There is no undo — commit before a long session.
        </p>
      </div>
    `;

    canvas.append(style, panel);

    const slugEl = panel.querySelector<HTMLElement>('[data-slug]')!;
    const frontmatterEl = panel.querySelector<HTMLTextAreaElement>('[data-frontmatter]')!;
    const bodyEl = panel.querySelector<HTMLTextAreaElement>('[data-body]')!;
    const statusEl = panel.querySelector<HTMLElement>('[data-status]')!;
    const saveEl = panel.querySelector<HTMLButtonElement>('[data-save]')!;

    let slug: string | null = null;

    const setStatus = (message: string, tone: 'ok' | 'error' | '' = '') => {
      statusEl.textContent = message;
      if (tone) statusEl.dataset.tone = tone;
      else delete statusEl.dataset.tone;
    };

    const setEditable = (editable: boolean) => {
      frontmatterEl.disabled = !editable;
      bodyEl.disabled = !editable;
      saveEl.disabled = !editable;
    };

    /*
     * Loading happens on every toggle rather than once, because the file may
     * have changed on disk — in an editor, or by the previous save — since the
     * panel was last open. Showing stale text and then saving it would silently
     * revert whatever happened in between.
     */
    app.onToggled(({ state }) => {
      if (!state) return;

      slug = slugFromPath(window.location.pathname);
      slugEl.textContent = slug ? `· ${slug}` : '· not an article';

      if (!slug) {
        setEditable(false);
        frontmatterEl.value = '';
        bodyEl.value = '';
        setStatus('Open an article under /writing/ to edit it.', 'error');
        return;
      }

      setEditable(false);
      setStatus('Loading…');
      server.send('content-editor:load', { slug });
    });

    server.on<{ ok: boolean; slug?: string; frontmatter?: string; body?: string; reason?: string }>(
      'content-editor:loaded',
      (payload) => {
        if (!payload.ok) {
          setEditable(false);
          setStatus(payload.reason ?? 'Could not load this article.', 'error');
          return;
        }

        frontmatterEl.value = payload.frontmatter ?? '';
        bodyEl.value = payload.body ?? '';
        setEditable(true);
        setStatus('');
      },
    );

    server.on<{ ok: boolean; reason?: string }>('content-editor:saved', (payload) => {
      setEditable(true);
      if (payload.ok) setStatus('Saved. The page is reloading.', 'ok');
      else setStatus(payload.reason ?? 'Save failed.', 'error');
    });

    const save = () => {
      if (!slug) return;
      setEditable(false);
      setStatus('Saving…');
      server.send('content-editor:save', {
        slug,
        frontmatter: frontmatterEl.value,
        body: bodyEl.value,
      });
    };

    saveEl.addEventListener('click', save);

    panel.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click', () =>
      app.toggleState({ state: false }),
    );

    // Cmd/Ctrl+S is the reflex this panel is replacing; honour it.
    panel.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        save();
      }
    });

    /*
     * Esc closes. Bound to the window rather than the panel: the toolbar sits
     * at bottom:-40px until hovered, so its button is not a dependable way out
     * and focus is frequently still on the page behind.
     */
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && canvas.isConnected && slug !== null) {
        app.toggleState({ state: false });
      }
    });

    /*
     * THE HANDLE THE MEDIA PANEL USES.
     *
     * Both toolbar apps run in the page's JS context, so a shared object on
     * `window` is the entire integration between them -- no event bus, no
     * ordering problem, and the media panel degrades to the clipboard when
     * this is absent because the editor was never opened.
     *
     * It deliberately exposes no way to READ the body. The media panel has no
     * business with the prose, and keeping the surface to "put this text here"
     * is what stops the two apps growing into one.
     */
    window.__bdArticleEditor = {
      isOpen: () => canvas.isConnected && slug !== null && !bodyEl.disabled,
      slug: () => slug,
      insertBody: (text: string) => {
        if (!slug || bodyEl.disabled) return false;
        insertAtCaret(bodyEl, text);
        setStatus('Image inserted. Not saved yet.', 'ok');
        return true;
      },
      appendFrontmatter: (text: string) => {
        if (!slug || frontmatterEl.disabled) return false;
        /*
         * Appended whole, at the end, rather than inserted at the caret.
         * Frontmatter is YAML and a key dropped mid-line is a parse error, so
         * the one position that is always valid is after the last one.
         */
        frontmatterEl.value = `${frontmatterEl.value.replace(/\s+$/, '')}\n${text}\n`;
        frontmatterEl.focus();
        frontmatterEl.setSelectionRange(frontmatterEl.value.length, frontmatterEl.value.length);
        setStatus('Cover added to the frontmatter. Not saved yet.', 'ok');
        return true;
      },
      frontmatterHasKey: (key: string) =>
        new RegExp(`^${key.replace(/[^a-zA-Z0-9]/g, '')}:`, 'm').test(frontmatterEl.value),
    };
  },
});
