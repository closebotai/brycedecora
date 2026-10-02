import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { manifest } from './manifest';

/**
 * Proof that the dev-only tooling is absent from the production build.
 *
 * The editor in `integrations/content-editor.ts` can write to
 * `src/content/articles/`, and the media library in
 * `integrations/media-library.ts` can write to `src/assets/media/` and serve
 * arbitrary bytes out of it. Both are registered only when `command === 'dev'`,
 * and production is static assets with no server to call anyway — but both of
 * those are claims about code that someone will edit later.
 *
 * This is the check that survives that edit. Delete the `command` guard and
 * this fails on the next build, which is the whole reason it exists.
 */

/** Strings that would only appear if dev tooling reached the output. */
const FORBIDDEN = [
  'content-editor', // the integration and its toolbar app id
  'content-editor:save', // the write message
  'content-editor:load',
  'media-library', // the media integration and its toolbar app id
  '__media', // the dev-only media routes
  '__bdArticleEditor', // the handle the media panel talks to the editor through
  'astro-dev-toolbar', // the toolbar itself
  'defineToolbarApp',
];

/**
 * Text-ish files only. Reading a font binary and scanning it for substrings is
 * slow and meaningless; a false positive inside a WOFF is not a leak.
 */
const TEXT = /\.(html|js|mjs|css|json|xml|txt|svg)$/i;

const textFiles = manifest.files.filter((file) => TEXT.test(file));

describe('dev-only tooling', () => {
  it('has text output to scan', () => {
    // Guards against the suite passing because the filter matched nothing.
    expect(textFiles.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN.map((needle) => [needle] as const))(
    'never ships %s to production',
    (needle) => {
      const hits = textFiles.filter((file) => {
        const contents = readFileSync(join('dist', file.slice(1)), 'utf8');
        return contents.includes(needle);
      });

      expect(
        hits,
        `"${needle}" reached the production build. The editor is supposed to be ` +
          'registered only when command === "dev" — check that guard in ' +
          'integrations/content-editor.ts.',
      ).toEqual([]);
    },
  );

  it('ships no route that could accept a write', () => {
    /*
     * A static build has no endpoints at all, so this is really asserting that
     * nothing has quietly added an adapter or an API route. `_worker.js` or a
     * `_routes.json` appearing here would mean the output is no longer purely
     * static, which is the precondition the whole guarantee rests on.
     */
    const serverArtifacts = manifest.files.filter((file) =>
      /^\/(_worker\.js|_routes\.json)/.test(file),
    );

    expect(
      serverArtifacts,
      'the build is no longer purely static — re-check the editor safety argument',
    ).toEqual([]);
  });
});
