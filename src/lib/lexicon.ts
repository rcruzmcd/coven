import type { SupabaseClient } from "@supabase/supabase-js";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * The words an organization uses for the things the platform lends (#896).
 *
 * "Gear" is one organization's vocabulary for the concept these tables call
 * inventory. Another reads the same rows and calls it a tool library, a
 * lending library, a pantry, an equipment room. Before this, a tenant could
 * rename the heading on `/inventory` -- that heading is a `site_content`
 * slot -- and the navigation item directly above it still said "Gear", because
 * every other surface carried the word as a literal.
 *
 * So the handful of words that appear in navigation are data, on the same
 * keyed-row pattern as `BRAND_COLOR_TOKENS` in `src/lib/branding.ts`: the
 * registry below is the list of terms, a tenant stores the ones it wants under
 * `lexicon.<key>` in `app_settings`, and an unset term falls through to the
 * platform's own neutral word. No migration per term, and the admin surface is
 * the one that already exists for branding.
 *
 * **Resist growing this.** A lexicon with fifty terms is a translation system
 * nobody maintains, and every term added is one more thing a new tenant has to
 * fill in before its site reads as written rather than as configured. The
 * value is in the six words below, each of which is read by navigation that
 * no slot could reach; a seventh has to argue for itself.
 *
 * What is deliberately *not* renamed by any of this: the internal identifiers.
 * The `gears` visibility slot key, the `gears.*` content slot keys, the
 * `inventory` permission resource, the tables and their columns are names the
 * code calls things, not names a visitor reads, and renaming them is a data
 * migration for no user-visible gain.
 *
 * This module is imported by client components -- the portal sidebar renames
 * itself from it -- so it holds the registry, the pure resolution and the
 * host-resolved read only. The session-resolved and service-role reads live in
 * `src/lib/tenant-lexicon.ts`, the same split branding makes.
 */
export type LexiconTerm = {
  key: string;
  label: string;
  description: string;
  /** The platform's own word, used by every tenant that sets nothing. */
  default: string;
};

export const LEXICON_TERMS: readonly LexiconTerm[] = [
  {
    key: "collection",
    label: "The collection",
    description:
      "What this organization calls the whole collection in the portal: Inventory, Gear, Tool library, Pantry.",
    default: "Inventory",
  },
  {
    key: "collection_public",
    label: "The collection, publicly",
    description:
      "The same thing as visitors see it named on the public site, which is often longer: Free Gear, Tool Library, Food Pantry.",
    // Not "Library": the platform's request flow gives items away to keep,
    // and a library is something you bring back.
    default: "Free items",
  },
  {
    key: "item",
    label: "One item",
    description: "A single thing in the collection: Item, Gear item, Tool.",
    default: "Item",
  },
  {
    key: "item_plural",
    label: "Several items",
    description:
      "The plural, which is often not the singular plus an s: Items, Gear, Tools.",
    default: "Items",
  },
  // The publications section (#1471). Both words reach navigation -- the plural
  // is the nav label, the singular names one issue's back link and download
  // buttons -- and neither is inventory's, so they are the fifth and sixth
  // terms rather than a Site Content slot the nav could not read.
  {
    key: "publication",
    label: "One publication",
    description:
      "One issue of the organization's periodic publication: Publication, Zine, Newsletter, Issue.",
    default: "Publication",
  },
  {
    key: "publication_plural",
    label: "The publication, in the nav",
    description:
      "What the public site's navigation calls the section holding every issue: Publications, Zine, Newsletter.",
    default: "Publications",
  },
] as const;

/** The reserved `app_settings` namespace these rows live in (#888). */
export const LEXICON_PREFIX = "lexicon.";

export function lexiconSettingKey(term: string): string {
  return `${LEXICON_PREFIX}${term}`;
}

/** Every key that may exist under the public `lexicon.` prefix. */
export const LEXICON_SETTING_KEYS: readonly string[] = LEXICON_TERMS.map(
  (term) => lexiconSettingKey(term.key),
);

/**
 * The longest a term may be, enforced by the admin action.
 *
 * These words render in navigation, where a sentence breaks the layout rather
 * than the meaning; "Adaptive equipment library" is 27 characters and is the
 * kind of name this has to leave room for.
 */
export const MAX_LEXICON_TERM_LENGTH = 40;

/** Every term, resolved: the tenant's word where it has one, ours otherwise. */
export type Lexicon = Record<string, string>;

export type LexiconRow = { term: string; value: unknown };

/**
 * Folds the tenant's `lexicon.*` rows over the registry defaults.
 *
 * A blank row is a cleared field rather than an empty word -- the admin panel
 * writes `""` to clear, because `app_settings` has no delete grant -- so it
 * resolves to the default, exactly as a missing row does.
 */
export function lexiconFromRows(rows: readonly LexiconRow[]): Lexicon {
  const stored = new Map(rows.map((row) => [row.term, row.value]));
  const lexicon: Lexicon = {};
  for (const term of LEXICON_TERMS) {
    const value = stored.get(term.key);
    lexicon[term.key] =
      typeof value === "string" && value.trim() ? value.trim() : term.default;
  }
  return lexicon;
}

/** The lexicon with nothing set: the platform's own words. */
export const DEFAULT_LEXICON: Lexicon = lexiconFromRows([]);

const PLACEHOLDER = /\{([a-z_]+)(:lower)?\}/g;

/**
 * Substitutes `{term}` in a string a registry holds, `{term:lower}` where the
 * word has to sit mid-sentence.
 *
 * The case modifier is the whole reason this is a template rather than a
 * lookup. A term is stored as the tenant capitalises it -- "Gear Library",
 * because that is a heading and a nav item -- and the same word appears inside
 * sentences the platform wrote ("the gear library and the gear donation
 * pages"). Without `:lower` either the headings or the prose would be wrong for
 * every tenant, and the alternative -- a second registry entry per casing --
 * doubles the number of words an organization has to fill in to say one thing.
 *
 * An unknown placeholder is left standing rather than blanked, so a typo shows
 * up as `{colection}` in the UI and in `lexicon.test.ts`, which resolves every
 * template in every registry, instead of as a silent gap in a sentence.
 */
export function applyLexicon(template: string, lexicon: Lexicon): string {
  return template.replace(PLACEHOLDER, (match, key: string, lower?: string) => {
    const term = lexicon[key];
    if (term === undefined) return match;
    return lower ? term.toLocaleLowerCase() : term;
  });
}

/** `applyLexicon` over a list of templates. */
export function applyLexiconAll(
  templates: readonly string[],
  lexicon: Lexicon,
): string[] {
  return templates.map((template) => applyLexicon(template, lexicon));
}

/**
 * The lexicon of the tenant the *request host* resolves to, for the public
 * site. Read through `public_lexicon` for the same reason branding is read
 * through `public_branding`: an admin of one tenant looking at another
 * tenant's site must see that site's words, not their own.
 *
 * A failed read falls back to the platform's words and says so. Silence here
 * would look exactly like a tenant that has not set its lexicon.
 */
export async function getPublicLexicon(
  supabase: SupabaseClient,
): Promise<Lexicon> {
  const { data, error } = await supabase
    .from("public_lexicon")
    .select("term, value");
  if (error) {
    reportQueryError(error, {
      source: "lexicon.public_lexicon",
      message:
        "could not read public_lexicon; the site is using the platform's own words",
    });
    return DEFAULT_LEXICON;
  }
  return lexiconFromRows((data ?? []) as LexiconRow[]);
}
