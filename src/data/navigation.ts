/**
 * Site navigation.
 *
 * Declared as data rather than as markup inside Header/Footer so that:
 *   - every internal destination is enumerable at build time,
 *   - `tests/seo/links.spec.ts` can assert each one resolves to a built page,
 *   - the orphan-page check has a known set of entry points.
 *
 * Hrefs must be written in canonical form (leading + trailing slash) so they
 * never trigger a Cloudflare trailing-slash redirect.
 */

export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Longer text for aria-label / title where the label alone is terse. */
  readonly description?: string;
}

export const primaryNav: readonly NavItem[] = [
  { label: 'About', href: '/about/', description: 'Who I am and what I work on' },
  { label: 'Writing', href: '/writing/', description: 'Articles and notes' },
];

export const footerNav: readonly NavItem[] = [
  { label: 'About', href: '/about/' },
  { label: 'Writing', href: '/writing/' },
  /*
   * The explainer for the public repository, and the one place the GitHub link
   * lives. Footer-only: the header carries the same destination as a "Fork this
   * site" action rather than as a nav item, because it is a call to action and
   * is styled as one.
   */
  { label: 'Open source', href: '/open-source/' },
];

/**
 * Pages that are legitimately reachable without an inbound internal link.
 * Everything else with zero inbound links is treated as an orphan and fails
 * `tests/seo/links.spec.ts`.
 */
export const ORPHAN_ALLOWLIST: readonly string[] = [
  '/', // the homepage is the root entry point
  '/404.html', // error page, never linked
  '/thanks/', // post-submit destination, reached only via form redirect
];
