import { describe, expect, it } from 'vitest';

import { allPages } from './manifest';

/**
 * The hydration budget.
 *
 * Astro ships no JavaScript unless a component asks for it, so the budget
 * starts at zero and every script is a deliberate decision. This test is the
 * thing that makes that decision visible: adding an island is fine, but it
 * cannot happen by accident or go unnoticed in review.
 *
 * Raise this number when there is a real reason to, in the same commit that
 * introduces the island -- never as a follow-up fix to a red build.
 */
/*
 * Raised from 0 to 3. None of these is an island -- no framework integration is
 * installed and none was added.
 *
 *   0. The CloseBot chat widget, `async`, on every page. The only third-party
 *      script on the site and a deliberate exception to the "avoid third-party
 *      scripts" rule: it is the owner's own product. It is also the only one of
 *      the three whose cost is not fully under our control, so it is the first
 *      thing to look at if the Lighthouse performance budget ever slips.
 *
 *   1. The theme bootstrap in BaseLayout.astro. On every page, and `is:inline`
 *      because a deferred one would paint the wrong palette before switching.
 *      A persistent light/dark toggle cannot be built without it: CSS alone
 *      cannot remember a choice across a navigation on a static multi-page
 *      site, so the toggle would reset on every click-through.
 *
 *   2. The chat-launcher callout (components/ui/WidgetCallout.astro). It needs
 *      JS because it has to know whether the third-party widget is open, and
 *      that state is only expressed as inline styles inside cb.js. See the long
 *      note in that component for why a CSS-only version would be a guess.
 *
 * WAS 4. "CLOCK TOOL 1.1" held the fourth slot -- a homepage ornament that
 * upgraded a server-rendered build timestamp to a ticking one. It was removed
 * because it was not wanted, and the budget came down with it in the same
 * commit. A budget that only ever ratchets upward stops being a budget: the
 * number has to fall when a script goes, or the next island inherits the
 * headroom the last one left behind.
 *
 * This is a CEILING, not an allowance. Every page now spends exactly three, so
 * there is no slack at all -- and tests/e2e/no-js.spec.ts asserts the count
 * per path, which is what stops a single page quietly growing a fourth.
 */
const MAX_SCRIPTS_PER_PAGE = 3;

describe('client JavaScript', () => {
  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s stays within the hydration budget',
    (_url, page) => {
      expect(
        page.scriptCount,
        `${page.url} ships ${page.scriptCount} script tag(s); budget is ${MAX_SCRIPTS_PER_PAGE}. ` +
          'If this island is justified, raise MAX_SCRIPTS_PER_PAGE in the same commit and say why.',
      ).toBeLessThanOrEqual(MAX_SCRIPTS_PER_PAGE);
    },
  );

  it.each(allPages.map((page) => [page.url, page] as const))(
    '%s navigation works without JavaScript',
    (_url, page) => {
      /*
       * Every page must expose at least one real <a href> to another page.
       * Navigation driven by click handlers is invisible to crawlers that do
       * not execute JS and broken for anyone whose JS fails to load.
       */
      expect(
        page.internalLinksOut.length,
        'no plain internal links -- navigation may depend on JavaScript',
      ).toBeGreaterThan(0);
    },
  );
});
