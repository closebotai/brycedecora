import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { emittedFiles } from './manifest';

/**
 * The Lighthouse budget runs against a hand-written list of paths, and a hand-
 * written list of paths rots.
 *
 * THE FAILURE THIS EXISTS FOR, which already happened: an article was
 * unpublished and renamed, `lighthouserc.json` kept pointing at the old URL,
 * and CI went red in the Lighthouse job -- a separate, slower job, three runs
 * per URL, minutes after the fast suite had already gone green. The error there
 * says a page could not be collected, which reads like a Lighthouse problem
 * rather than a stale config.
 *
 * This moves that failure forward: same breakage, caught in milliseconds, with
 * a message naming the actual cause.
 */

interface LighthouseConfig {
  ci: { collect: { url: string[] } };
}

const config = JSON.parse(readFileSync('lighthouserc.json', 'utf8')) as LighthouseConfig;
const urls = config.ci.collect.url;

describe('lighthouse budget URLs', () => {
  it('has a non-empty list to check', () => {
    // Guards against this suite passing because the list was emptied.
    expect(urls.length).toBeGreaterThan(2);
  });

  it.each(urls.map((url) => [url] as const))('%s exists in the build', (url) => {
    expect(
      emittedFiles.has(url),
      `lighthouserc.json collects "${url}", which this build did not emit. ` +
        'An article was probably renamed or unpublished -- point the list at a ' +
        'page that exists.',
    ).toBe(true);
  });

  it('still measures an article', () => {
    /*
     * The budget is meaningless if it only ever sees the chrome-heavy index
     * pages. An article is the page type most of the site is made of, and the
     * one whose LCP a cover image can actually move -- so losing article
     * coverage to a careless edit should fail, not pass quietly.
     */
    const articles = urls.filter((url) => /^\/writing\/[^/]+\/index\.html$/.test(url));
    expect(articles, 'no article is covered by the Lighthouse budget').not.toEqual([]);
  });
});
