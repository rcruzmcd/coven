/**
 * The public site's navigation tree -- the single source the header nav, the
 * mobile sheet and the footer all render from.
 *
 * It used to be two hardcoded lists (NAV_GROUPS in site-nav.tsx and
 * FOOTER_LINKS in (public)/layout.tsx) that both duplicated the slot mapping
 * from PUBLIC_PAGE_SLOTS, and they had already drifted: the footer was missing
 * About and Learn entirely, so those sections would have stayed absent from it
 * even after the board turned them back on.
 */

import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { DEFAULT_LEXICON, applyLexicon, type Lexicon } from "@/lib/lexicon";

export type NavLink = {
  /**
   * May carry `{term}` placeholders from the lexicon registry (#896).
   * `visibleGroups()` resolves them; nothing else should render this raw.
   */
  label: string;
  href: string;
  slot?: string;
};

export type NavGroup = {
  /** A lexicon template, like `NavLink.label`. */
  label: string;
  /**
   * The section's landing page. Used as the footer link and as the mobile
   * sheet's group heading target, so every group is reachable as a whole and
   * not just through its children.
   */
  href: string;
  /**
   * Ties the group to an entry in PUBLIC_PAGE_SLOTS, so a section the board has
   * hidden from Website > Page visibility drops out of the nav and the
   * footer together. A group with no slot is always shown.
   */
  slot?: string;
  /** Dropdown children. Absent means a plain top-level link. */
  links?: readonly NavLink[];
};

/**
 * Where a section's landing page is a real page of its own rather than a
 * redirect to one of its children, it gets an explicit entry in `links` -- a
 * Base UI NavigationMenuTrigger opens its panel instead of navigating, so
 * without one the landing page is unreachable from the desktop nav.
 *
 * `/about` deliberately has no such entry: it redirects to a child that is
 * already listed (`/about/story`), so an overview item would be a second route
 * to the same page. `/inventory` is the catalog itself, listed as its own
 * first child for the same reason any landing page is.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  // Everything the site says about the product itself (#1328, #1329, #1330),
  // first because on a site that publishes any of it that is the point: a
  // reader arriving cold wants to know what this is, whether it is for them,
  // and what it costs, before they read anything else. Every child is hidden
  // for every tenant that has not turned its slot on, which is every tenant by
  // default, so the whole group is absent from a customer's nav.
  //
  // **One group rather than four**, and this is a width decision rather than a
  // taxonomy one. `site-nav.tsx` measures the header's budget at eight
  // sections; #1328 spent the ninth on this group and recorded that it already
  // wraps to two rows on a tenant with everything visible. A tenth needs the
  // nav to overflow instead, which is a change to that component -- so Pricing,
  // which would earn a top-level entry on any other marketing site, is a child
  // here until somebody makes it. The nav this actually renders on is short:
  // the site that publishes these four runs no Events, Programs or Get
  // Involved.
  //
  // **No slot on the group itself.** The four children become publishable at
  // different moments -- the tour when its screenshots exist, the prices when
  // somebody has decided them -- and a group-level slot would take the others
  // dark with whichever is not ready. `visibleGroups()` already drops a group
  // whose children are all hidden, and repoints `href` when the child it
  // pointed at is one of the hidden ones.
  //
  // Every child carries its own slot, including the first. The mapping in
  // `slotsForHref()` is derived from this tree and a child inherits nothing:
  // without its own slot, an in-page link to `/business` would go on reading as
  // live after the board hid the section.
  {
    label: "Product",
    href: "/modules",
    links: [
      { label: "What it does", href: "/modules", slot: "modules" },
      { label: "For nonprofits", href: "/nonprofits", slot: "audiences" },
      { label: "For business", href: "/business", slot: "audiences" },
      { label: "Pricing", href: "/pricing", slot: "pricing" },
    ],
  },
  {
    label: "About",
    href: "/about",
    slot: "about",
    links: [
      { label: "Our Story", href: "/about/story" },
      { label: "Mission & Values", href: "/about/mission" },
      { label: "Meet the Team", href: "/about/team" },
    ],
  },
  {
    label: "Events",
    href: "/events",
    slot: "events",
    links: [
      { label: "All Events", href: "/events" },
      { label: "Community Calendar", href: "/events/community" },
      // A child rather than a group of its own (#1655): the header's width
      // budget (see `site-nav.tsx`) has no room for another top-level item.
      // The public layout also hides it while there is nothing to show.
      { label: "Gallery", href: "/gallery", slot: "gallery" },
    ],
  },
  // A tenant's periodic publication (#1471), after Events because it is the
  // other thing that changes season to season. A plain link: the index is the
  // only page a reader starts from, and each issue is reached from it.
  {
    label: "{publication_plural}",
    href: "/publications",
    slot: "publications",
  },
  { label: "Programs", href: "/programs", slot: "programs" },
  { label: "Learn", href: "/learn", slot: "learn" },
  {
    // The one group whose labels are a tenant's word rather than the
    // platform's (#896): a nonprofit that lends tools, instruments or food
    // reads the same tables and calls this something else. `gears` here and
    // below is the internal slot key, not a product name -- it is not renamed
    // and does not appear on screen.
    label: "{item_plural}",
    href: "/inventory",
    slot: "gears",
    links: [
      { label: "{collection_public}", href: "/inventory" },
      {
        label: "Sizing Guide",
        href: "/inventory/sizing",
        slot: "gears-sizing",
      },
      // Was four separate entries pointing at #how-it-works, #request, #donate
      // and #gear-drives -- four rows in the menu that all land on the same
      // page. The page's own headings do that job once you are on it.
      { label: "Donate or Request {item_plural}", href: "/inventory/donate" },
    ],
  },
  {
    label: "Get Involved",
    href: "/get-involved",
    slot: "get-involved",
    links: [
      { label: "Ways to Get Involved", href: "/get-involved" },
      { label: "Attend", href: "/get-involved/attend" },
      {
        label: "Volunteer",
        href: "/get-involved/volunteer",
        slot: "get-involved-volunteer",
      },
      { label: "Become a Partner", href: "/get-involved/partner" },
    ],
  },
  {
    label: "Support",
    href: "/support",
    slot: "support",
    links: [
      { label: "Support us", href: "/support" },
      { label: "Donations", href: "/support/donations" },
      { label: "Sponsorship", href: "/support/sponsorship" },
    ],
  },
  { label: "Contact", href: "/contact", slot: "contact" },
] as const;

/**
 * The site's legal notices. These render in the footer's bottom bar, next to
 * the copyright line, rather than mixed into the section links above it --
 * they are utility links, not destinations, and listing them alongside Events
 * and Gear read as if the privacy policy were another part of the site.
 *
 * They are deliberately not NAV_GROUPS entries with slots: a section of the
 * marketing site is shown or hidden, and a legal document is adopted or not,
 * and those are different decisions. Which of these the footer actually renders
 * is the tenant's publication state (`@/lib/legal-publication.ts`), not page
 * visibility -- the privacy policy is always among them.
 *
 * Derived from the registry so the footer, the routes and the admin panel
 * cannot disagree about what the documents are.
 */
export const LEGAL_LINKS: readonly NavLink[] = LEGAL_DOCUMENTS.map(
  (document) => ({ label: document.label, href: document.route }),
);

/**
 * A tenant's top-level menu: the order of `NAV_GROUPS` and a label per group,
 * both keyed by the group's `href` (#1726). Stored as one `layout.nav` row.
 *
 * Only the top level is the tenant's. Which links sit under which group, the
 * slot gating and the header's width budget stay in code, so every entry still
 * leads to a known, gated, tested route.
 */
export type NavSettings = {
  order: string[];
  labels: Record<string, string>;
};

/** The `layout.*` slot the menu is stored under. */
export const NAV_SETTING_SLOT = "nav";

/**
 * Long enough for any real section name, short enough that one label cannot
 * blow the header's width budget on its own.
 */
export const NAV_LABEL_MAX_LENGTH = 32;

const NAV_HREFS: readonly string[] = NAV_GROUPS.map((group) => group.href);

export const DEFAULT_NAV_SETTINGS: NavSettings = {
  order: [...NAV_HREFS],
  labels: {},
};

/**
 * Folds a stored value over the default menu. Pure, and total: anything that
 * is not the shape above resolves to today's menu.
 *
 * - Unknown or repeated keys in `order` are dropped.
 * - Groups missing from `order` go at the end, in their default order -- so a
 *   group added to NAV_GROUPS after a tenant saved still appears.
 * - Labels for unknown groups are dropped, and an empty one means the default.
 */
export function resolveNavSettings(value: unknown): NavSettings {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const order: string[] = [];
  if (Array.isArray(stored.order)) {
    for (const href of stored.order) {
      if (
        typeof href === "string" &&
        NAV_HREFS.includes(href) &&
        !order.includes(href)
      ) {
        order.push(href);
      }
    }
  }
  for (const href of NAV_HREFS) if (!order.includes(href)) order.push(href);

  const labels: Record<string, string> = {};
  if (stored.labels && typeof stored.labels === "object") {
    for (const [href, label] of Object.entries(stored.labels)) {
      if (!NAV_HREFS.includes(href) || typeof label !== "string") continue;
      const trimmed = label.trim().slice(0, NAV_LABEL_MAX_LENGTH);
      if (trimmed) labels[href] = trimmed;
    }
  }

  return { order, labels };
}

/** NAV_GROUPS in the tenant's order, with its labels in place of the defaults. */
export function orderedGroups(
  nav: NavSettings = DEFAULT_NAV_SETTINGS,
): NavGroup[] {
  const rank = (href: string) => {
    const index = nav.order.indexOf(href);
    return index === -1 ? NAV_HREFS.length + NAV_HREFS.indexOf(href) : index;
  };
  return [...NAV_GROUPS]
    .sort((a, b) => rank(a.href) - rank(b.href))
    .map((group) =>
      nav.labels[group.href]
        ? { ...group, label: nav.labels[group.href] }
        : group,
    );
}

/**
 * Drops every group and sub-link belonging to a hidden section, and resolves
 * the lexicon placeholders in what is left. A group is removed when its own
 * slot is hidden, and also when filtering its sub-links leaves it empty --
 * otherwise the board hiding the last page in a group would leave an empty
 * dropdown behind.
 *
 * The lexicon is resolved here rather than at each of the three call sites
 * (the header, the mobile sheet and the footer) because this is the one
 * function all three already go through, and a label that reached a caller
 * unresolved would render braces at them. It defaults to the platform's own
 * words so a caller that has no tenant still gets readable navigation.
 *
 * `nav` is the tenant's menu order and labels (#1726); omitted, the menu is
 * NAV_GROUPS as written.
 */
export function visibleGroups(
  hidden: readonly string[],
  lexicon: Lexicon = DEFAULT_LEXICON,
  nav: NavSettings = DEFAULT_NAV_SETTINGS,
): NavGroup[] {
  const isHidden = (slot?: string) => Boolean(slot && hidden.includes(slot));
  const named = <T extends { label: string }>(entry: T): T => ({
    ...entry,
    label: applyLexicon(entry.label, lexicon),
  });

  // A tenant's own label goes through the lexicon too, so `{item_plural}`
  // typed into it still resolves.
  return orderedGroups(nav)
    .filter((group) => !isHidden(group.slot))
    .map((group) => {
      if (!group.links) return named(group);
      const links = group.links.filter((l) => !isHidden(l.slot)).map(named);
      return named({ ...group, href: landingHref(group, links), links });
    })
    .filter((group) => group.links === undefined || group.links.length > 0);
}

/**
 * A group's landing page once its hidden children are gone: the page it names,
 * or the first child still standing when that page is one of the ones the
 * board has hidden.
 *
 * The footer links this href and the mobile sheet makes it the group heading's
 * target, so a group that survives filtering has to land somewhere that still
 * renders. It only matters for a group whose children carry *different* slots
 * -- `Product` is the only one (#1329), where the tour, the two audience paths
 * and the price list are each switched on separately -- but the rule is
 * written for any group rather than for that one.
 *
 * A group whose href is not among its children keeps it: `/about` and
 * `/inventory` redirect to a child, so their landing page is live exactly when
 * the group is.
 */
function landingHref(group: NavGroup, surviving: readonly NavLink[]): string {
  const named = group.links?.some((link) => link.href === group.href);
  if (!named || surviving.some((link) => link.href === group.href)) {
    return group.href;
  }
  return surviving[0]?.href ?? group.href;
}

/** Whether a section is currently shown, for gating header/in-page CTAs. */
export function isSlotVisible(hidden: readonly string[], slot: string) {
  return !hidden.includes(slot);
}

/**
 * Every section slot a public href sits under, from this tree rather than from
 * a second hand-written mapping -- NAV_GROUPS already records which slot owns
 * which path, and a duplicate of that is exactly the drift the tree was
 * introduced to end.
 *
 * A nested slot matches alongside its parent: `/inventory/sizing` is under both
 * `gears` and `gears-sizing`, and the page is unreachable when either is off.
 * In-page anchors and ungated routes (the legal notices) match nothing.
 */
export function slotsForHref(href: string): string[] {
  const gated = NAV_GROUPS.flatMap((group) => [
    ...(group.slot ? [{ base: group.href, slot: group.slot }] : []),
    ...(group.links ?? []).flatMap((link) =>
      link.slot ? [{ base: link.href, slot: link.slot }] : [],
    ),
  ]);

  return gated
    .filter(({ base }) => href === base || href.startsWith(`${base}/`))
    .map(({ slot }) => slot);
}

/**
 * Whether an in-page link to a public route still goes somewhere. Use it for
 * links written into content -- an article's "further reading", a CTA -- which
 * the nav filter never sees and which 404 once the board hides the section
 * they point into.
 */
export function isHrefVisible(
  hidden: readonly string[],
  href: string,
): boolean {
  return !slotsForHref(href).some((slot) => hidden.includes(slot));
}
