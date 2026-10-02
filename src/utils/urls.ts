/**
 * URL helpers.
 *
 * Canonical-path normalisation itself lives in `src/data/site.ts` next to the
 * trailing-slash policy it implements -- importing it from there keeps one
 * definition rather than two that can drift.
 */
import { SITE_URL, normalizePathname } from '../data/site';
import type { BreadcrumbItem } from './schema';

export { normalizePathname };

/** Resolve a site-relative path to an absolute URL on the configured origin. */
export function absoluteUrl(path: string, site: URL | undefined = new URL(SITE_URL)): string {
  return new URL(normalizePathname(path), site).href;
}

/**
 * True when an href points somewhere on this site.
 *
 * Protocol-relative (`//evil.com`) is treated as EXTERNAL despite starting
 * with a slash -- getting that backwards would let an off-site link be
 * rewritten as internal.
 */
export function isInternalHref(href: string): boolean {
  if (href.startsWith('//')) return false;
  if (href.startsWith('/')) return true;
  if (/^(mailto:|tel:|#)/i.test(href)) return false;
  try {
    return new URL(href).origin === new URL(SITE_URL).origin;
  } catch {
    // Relative href like "foo/bar" -- internal, though pages should use
    // root-relative paths so links never depend on the current directory.
    return !/^[a-z][a-z0-9+.-]*:/i.test(href);
  }
}

/**
 * True when `current` is at or beneath `href`. Used for nav highlighting and
 * `aria-current`, so a nested article marks "Writing" as the active section.
 */
export function isActivePath(href: string, current: string): boolean {
  const target = normalizePathname(href);
  const here = normalizePathname(current);
  if (target === '/') return here === '/';
  return here === target || here.startsWith(target);
}

/** Human-readable label for a path segment, used to build breadcrumb trails. */
export function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Derive a breadcrumb trail from a pathname.
 *
 * Returns an empty array for the homepage -- a single-item breadcrumb is
 * meaningless, and emitting a one-entry BreadcrumbList is noise.
 *
 * The result feeds BOTH the visible <Breadcrumbs> component and the
 * BreadcrumbList JSON-LD, which is what guarantees the structured data
 * describes a trail the user can actually see.
 *
 * Templates override the final crumb's `name` when the humanised slug is a
 * poor label (an article title, for instance).
 */
export function deriveBreadcrumbs(pathname: string, site: URL): BreadcrumbItem[] {
  const path = normalizePathname(pathname);
  if (path === '/') return [];

  const segments = path.split('/').filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ name: 'Home', url: `${site.origin}/` }];

  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    crumbs.push({
      name: humanizeSegment(segment),
      url: new URL(normalizePathname(accumulated), site).href,
    });
  }

  return crumbs;
}
