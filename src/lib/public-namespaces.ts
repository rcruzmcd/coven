import { BRAND_PREFIX, BRAND_TOKENS } from "@/lib/branding";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PUBLICATION_PREFIX,
} from "@/lib/legal-documents";
import {
  PAGE_VISIBILITY_PREFIX,
  PUBLIC_PAGE_SLOTS,
} from "@/lib/page-visibility";
import { LAYOUT_PREFIX, LAYOUT_SLOTS } from "@/lib/site-layout";
import { NAV_SETTING_SLOT } from "@/lib/public-nav";
import { LEXICON_PREFIX, LEXICON_SETTING_KEYS } from "@/lib/lexicon";
import { IMAGE_SLOT_KEY_PREFIX, SITE_CONTENT_SLOTS } from "@/lib/site-content";

/**
 * The `app_settings` and `site_content` key namespaces that `anon` can read
 * (#888).
 *
 * Six of the views serving the public site match a key **prefix** rather than
 * an enumerated list of keys -- `public_branding` over `brand.%`,
 * `public_page_visibility` over `page_visibility.%`, `public_site_layout` over
 * `layout.%`, `public_legal_publication` over `legal_publication.%`,
 * `public_lexicon` over `lexicon.%` (#896), and `public_site_images` over
 * `site_images.%`. That is deliberate: which slots
 * exist is decided by the TypeScript registries below rather than by a
 * migration, so adding one is a registry entry and not a schema change.
 *
 * The cost of that convenience is that **any row inserted under one of those
 * prefixes becomes world-readable the moment it exists** -- no migration to the
 * view, no review of the public surface, no signal anywhere. Every key under
 * them today is legitimately public; the risk is the next one, since
 * `brand.` and `layout.` are generic enough that a `brand.internal_notes` or a
 * `layout.admin_only_flag` is a plausible thing for a future migration to add.
 *
 * So the prefixes are **reserved**: nothing that is not meant for `anon` may be
 * stored under them. The same holds one level up for `site_content`, which
 * `public_site_content` exposes with no prefix filter at all -- the table *is*
 * the public site's copy, and drafts are protected by the view's column list
 * (`draft_value` is simply not selected) rather than by a predicate. Nothing
 * non-public may ever be stored in `site_content` either.
 *
 * The database cannot see the registries, so it cannot tell a registered slot
 * from a typo or from a secret. This module is what lets a test do it instead:
 * `test/public-namespaces.integration.test.ts` reads every key out of both
 * tables and fails on one no registry knows about. The day a genuinely
 * non-public setting has to live under one of these prefixes, the answer is to
 * enumerate the keys in SQL rather than to relax this rule.
 */
export type ReservedNamespace = {
  /** The key prefix, trailing dot included. */
  prefix: string;
  /** The table the rows live in. */
  table: "app_settings" | "site_content";
  /** The view that serves the prefix to `anon`. */
  view: string;
  /** Where the registry of legitimate keys lives, for the failure message. */
  registry: string;
  /** Every key the registry knows about, prefix included. */
  keys: readonly string[];
};

export const RESERVED_NAMESPACES: readonly ReservedNamespace[] = [
  {
    prefix: BRAND_PREFIX,
    table: "app_settings",
    view: "public_branding",
    registry: "src/lib/branding.ts",
    keys: BRAND_TOKENS.map((token) => `${BRAND_PREFIX}${token}`),
  },
  {
    prefix: PAGE_VISIBILITY_PREFIX,
    table: "app_settings",
    view: "public_page_visibility",
    registry: "src/lib/page-visibility.ts",
    keys: PUBLIC_PAGE_SLOTS.map(
      (slot) => `${PAGE_VISIBILITY_PREFIX}${slot.key}`,
    ),
  },
  {
    prefix: LAYOUT_PREFIX,
    table: "app_settings",
    view: "public_site_layout",
    registry: "src/lib/site-layout.ts",
    keys: [
      ...LAYOUT_SLOTS.map((slot) => `${LAYOUT_PREFIX}${slot.key}`),
      // Structured settings with resolvers of their own (#1726).
      `${LAYOUT_PREFIX}${NAV_SETTING_SLOT}`,
    ],
  },
  {
    prefix: LEGAL_PUBLICATION_PREFIX,
    table: "app_settings",
    view: "public_legal_publication",
    registry: "src/lib/legal-documents.ts",
    keys: LEGAL_DOCUMENTS.map(
      (document) => `${LEGAL_PUBLICATION_PREFIX}${document.key}`,
    ),
  },
  {
    prefix: LEXICON_PREFIX,
    table: "app_settings",
    view: "public_lexicon",
    registry: "src/lib/lexicon.ts",
    keys: LEXICON_SETTING_KEYS,
  },
  {
    prefix: IMAGE_SLOT_KEY_PREFIX,
    table: "site_content",
    view: "public_site_images",
    registry: "src/lib/site-content.ts",
    keys: SITE_CONTENT_SLOTS.filter((slot) => slot.type === "image").map(
      (slot) => slot.key,
    ),
  },
];

/**
 * `site_content` is reserved **whole**, not by prefix: `public_site_content`
 * has no predicate, so a row is public wherever in the table it sits. That
 * makes it the wider rule, and it subsumes the `site_images.` namespace above
 * -- which is listed anyway, because it is one of the five prefixes the views
 * and `docs/spec/multi-tenancy.md` name and a reader should find it here.
 *
 * The asymmetry with `app_settings` is the point: there, a key outside every
 * reserved namespace is an ordinary private setting and none of this module's
 * business.
 */
export const SITE_CONTENT_KEYS: readonly string[] = SITE_CONTENT_SLOTS.map(
  (slot) => slot.key,
);

export type SettingRow = {
  table: "app_settings" | "site_content";
  key: string;
};

export type UnregisteredKey = SettingRow & {
  /** What a reader of the failure needs in order to act on it. */
  detail: string;
};

/**
 * The namespace a row falls in, or undefined for a private setting.
 *
 * Keyed on the table as well as the prefix: `site_images.` rows lived in
 * `app_settings` until `20260908030000` moved them, and a stray one left there
 * is a dead row rather than a public one, so it should not be reported against
 * `public_site_images`.
 */
export function reservedNamespaceFor(
  row: SettingRow,
): ReservedNamespace | undefined {
  return RESERVED_NAMESPACES.find(
    (namespace) =>
      namespace.table === row.table && row.key.startsWith(namespace.prefix),
  );
}

/**
 * The rows that would be served to `anon` without any registry claiming them.
 *
 * Every finding is one of two mistakes: a key under a reserved prefix that no
 * registry lists (a typo, or a setting that does not belong in public), or a
 * `site_content` row for a slot that no longer exists.
 */
export function unregisteredPublicKeys(
  rows: readonly SettingRow[],
): UnregisteredKey[] {
  const findings: UnregisteredKey[] = [];
  for (const row of rows) {
    if (row.table === "site_content") {
      if (!SITE_CONTENT_KEYS.includes(row.key)) {
        findings.push({
          ...row,
          detail:
            "every site_content row is served to anon by public_site_content; add the slot to SITE_CONTENT_SLOTS in src/lib/site-content.ts or delete the row",
        });
      }
      continue;
    }
    const namespace = reservedNamespaceFor(row);
    if (namespace && !namespace.keys.includes(row.key)) {
      findings.push({
        ...row,
        detail: `${namespace.prefix}% is a reserved public namespace served to anon by ${namespace.view}; register the key in ${namespace.registry} or store it under a private prefix`,
      });
    }
  }
  return findings;
}
