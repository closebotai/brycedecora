/**
 * The canonical Person entity.
 *
 * This is the single source of truth for who the site is about. Every
 * component, meta tag, and JSON-LD block reads from it -- the name, title, and
 * links are never retyped elsewhere. That is what keeps the structured-data
 * graph internally consistent as the site grows.
 *
 * A personal authority site's equivalent of the "business entity" pattern: for
 * a local business this would be LocalBusiness with NAP data; here it is
 * schema.org/Person.
 */

export interface Organization {
  readonly name: string;
  readonly url: string;
}

/**
 * A social profile.
 *
 * ONE array drives two things: the visible links in the footer, and the
 * schema.org `sameAs` on every page. They are generated from the same source,
 * so the structured data can never claim a profile the site does not link to,
 * and adding a profile in one place cannot forget the other.
 */
export interface SocialProfile {
  /** Visible link text, e.g. 'LinkedIn'. Also used as the accessible name. */
  readonly label: string;
  /**
   * The CANONICAL profile URL — the one the platform itself resolves to.
   * For X use `https://x.com/<handle>`, not the twitter.com form, which
   * redirects. `sameAs` should point at the destination, not a hop.
   */
  readonly url: string;
}

export interface PersonEntity {
  readonly name: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly jobTitle: string;
  /** One-sentence bio. Used as the fallback meta description on the homepage. */
  readonly description: string;
  readonly email: string;
  readonly worksFor: Organization;
  /**
   * Verified social profiles. Rendered in the footer AND emitted as
   * schema.org `sameAs`.
   *
   * Only add profiles that genuinely belong to this person and are actively
   * maintained. `sameAs` is an entity-resolution signal — search engines use
   * it to decide that this Person and those accounts are the same real
   * individual. A wrong URL is an active misidentification, and a dead profile
   * is a worse first impression than no profile.
   *
   * Order here is the order shown in the footer.
   */
  readonly socialProfiles: readonly SocialProfile[];
  /** Topics the person has demonstrable expertise in. Feeds `knowsAbout`. */
  readonly knowsAbout: readonly string[];
}

/*
 * NO `image` FIELD HERE, DELIBERATELY.
 *
 * The portrait is an optimised asset, so its final URL is only known after the
 * build hashes it. Importing the asset into this module would resolve that —
 * but this module is also imported by the Vitest suite, which has no image
 * pipeline, and the import would break every test that touches it.
 *
 * So src/utils/schema.ts owns the portrait instead. See buildPerson().
 */

/*
 * Annotated with the interface rather than `as const satisfies`, so optional
 * properties absent from the literal still exist on the type.
 */
export const person: PersonEntity = {
  name: 'Bryce DeCora',
  givenName: 'Bryce',
  familyName: 'DeCora',
  jobTitle: 'Co-founder & CEO, CloseBot',
  description:
    'Co-founder and CEO of CloseBot. Former Boeing engineer who taught himself to code and now builds AI that handles sales conversations.',
  email: 'info@closebot.ai',
  worksFor: {
    name: 'CloseBot',
    // closebot.ai 301s here — `sameAs` and entity URLs should name the
    // destination, not a hop.
    url: 'https://closebot.com',
  },
  /*
   * PERSONAL PROFILES ONLY. Everything here is asserted as identity -- it
   * feeds schema.org `sameAs` and the footer's rel="me" -- so the bar is "this
   * is the same human", not "this account has something to do with Bryce".
   *
   * LinkedIn is corroborated independently: /in/iambryce appears across many
   * unrelated sources carrying the "Co-Founder CEO CloseBot" headline.
   * Instagram and Facebook were given by the site's owner directly, which is
   * the strongest verification a personal account can have. The Facebook
   * handle matching the LinkedIn one is a further consistency check, not the
   * reason either is listed.
   *
   * X IS DELIBERATELY ABSENT, and this is the paragraph to read before adding
   * one. @closebotai exists on X, as does facebook.com/groups/closebot -- and
   * both are COMPANY accounts. Listing a company account in a Person's
   * `sameAs` tells search engines that the company and the person are one
   * entity, which is false and is the specific failure this field causes.
   * There is no personal X account to list. If one appears it belongs here;
   * the CloseBot accounts still do not.
   */
  socialProfiles: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/iambryce' },
    { label: 'Instagram', url: 'https://www.instagram.com/brycedecora/' },
    { label: 'Facebook', url: 'https://www.facebook.com/iambryce' },
  ],
  knowsAbout: [
    'Conversational AI',
    'AI sales agents',
    'Lead qualification',
    'Marketing automation',
    'SaaS',
  ],
};

/**
 * Profile URLs for schema.org `sameAs`, derived from `socialProfiles`.
 *
 * Derived rather than maintained separately: that is what guarantees the
 * structured data and the visible footer links describe the same set.
 */
export const sameAs: readonly string[] = person.socialProfiles.map((profile) => profile.url);
