import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import { getPublicTenant } from "@/lib/branding";
import { isPlatformTenant } from "@/lib/portal/tenants";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export type PublicPageSlot = {
  /**
   * The `app_settings` key this slot is stored under, and an internal
   * identifier -- never shown to anyone. `gears` reads like a product name and
   * is not one: it is the key that has always named this section, kept because
   * renaming it is a data migration that no administrator would ever see the
   * result of (#896).
   */
  key: string;
  /**
   * Shown in Website > Page visibility. May carry `{term}` placeholders
   * from the lexicon registry; `namedSlots()` resolves them, and the panel
   * renders what it returns rather than this.
   */
  label: string;
  /** A lexicon template, like `label`. */
  description: string;
  /**
   * Applied when no `page_visibility.<key>` row exists in app_settings.
   * Production is seeded with no rows at all, so this is what actually
   * decides whether a section is live on a fresh deploy. New sections should
   * be added `false`, so "not shown until the board approves it" is the
   * default a contributor has to opt out of rather than remember to opt in to.
   */
  defaultVisible: boolean;
  /**
   * The file under `src/app` that calls `requireVisiblePage()` for this slot.
   * Defaults to `(public)/<key>/layout.tsx`, which is where a section-wide slot
   * belongs. A slot covering a single route names that route's page instead,
   * and a route outside the `(public)` group names its own path -- `links` is
   * outside it, because that group's layout is the site header and footer the
   * page deliberately does without (#937). page-visibility.test.ts checks
   * whichever file this resolves to: registering a slot without gating it
   * hides the nav link and leaves the URL live.
   *
   * Several files, when one switch governs routes that are siblings rather
   * than a section with a shared layout -- `audiences` is `/nonprofits` and
   * `/business`, two front doors to the same argument with no parent segment
   * to put a gate in (#1328). Every named file is checked, because a list that
   * only had to name one of them would let the second route stay live.
   */
  gate?: string | readonly string[];
  /**
   * The module (#900) this section belongs to. When that module is off for the
   * tenant, the slot is forced hidden whatever the board has stored -- an
   * entitlement the platform sold, not a preference the organization set, so it
   * wins.
   *
   * Undefined means the section belongs to no module and is the organization's
   * own to show or hide: About, Learn and Brand are theirs whatever they are
   * paying for. `support` is the judgement call in the other direction -- it is
   * the fundraising ask, so it goes with Finance.
   */
  module?: string;
  /**
   * A section that exists only on the platform tenant's own site -- the
   * product's marketing pages (#1325). Every other tenant is forced hidden
   * whatever is stored, and never sees the switch or the copy: these pages are
   * about the software, and a customer has no use for a control whose only
   * effect would be publishing their vendor's pitch under their brand.
   *
   * Unlike `module` this is not an entitlement anyone can be sold, so the panel
   * leaves the row out rather than rendering it locked.
   */
  platformOnly?: true;
};

/**
 * Registry of every public site section the board can show or hide from
 * Website > Page visibility. Adding an entry here is enough to wire a
 * section up in the admin UI and in the gate -- no migration needed, since
 * every slot is just a keyed row in app_settings (same approach as
 * BRAND_COLOR_TOKENS in src/lib/branding.ts).
 *
 * A slot normally covers a whole section, not a single route: the gate goes in
 * the section's layout, so every page beneath it is hidden together. `gate`
 * is the exception, for a single page whose *content* rather than its shape is
 * what needs gating.
 */
export const PUBLIC_PAGE_SLOTS: PublicPageSlot[] = [
  {
    key: "programs",
    label: "Programs",
    description:
      "The Programs page describing Access, Community, and Progression.",
    defaultVisible: false,
    module: "programs",
  },
  {
    key: "learn",
    label: "Learn",
    description:
      "The Learn section and every article category your organization has published in it.",
    // Off by default because a tenant that has written no articles would
    // otherwise carry a nav entry to an empty section (#894). It is no longer
    // off because the guides belonged to somebody else -- since #894 they are
    // the tenant's own rows -- so this is a switch to turn on once there is
    // something behind it, rather than a gate on another organization's
    // content.
    defaultVisible: false,
  },
  {
    key: "support",
    label: "Support",
    description:
      "The Support page, plus the Donations and Sponsorship pages beneath it.",
    defaultVisible: false,
    // Finance, not a section of its own: this is the fundraising ask, and the
    // donations and sponsorships it collects are Finance's records.
    module: "finance",
  },
  {
    key: "about",
    label: "About",
    description: "Our Story, Mission & Values, and Meet the Team.",
    defaultVisible: true,
  },
  {
    key: "events",
    label: "Events",
    description:
      "The events listing, event detail pages, and the community calendar.",
    defaultVisible: true,
    module: "events",
  },
  // Every event's public photos on one page (#1655). Its own slot rather than
  // part of `events`, because a tenant can run events without wanting a photo
  // page in its menu. Off by default like every new section. Even when on, the
  // public layout keeps it out of the menu while the Public event gallery
  // (Events > Media) is off or nothing is public yet, and the page 404s then.
  {
    key: "gallery",
    label: "Gallery",
    description:
      "The page at /gallery, every event's public photos in one place, linked from the Events menu. Shown only while the public event gallery is on and some photo is public.",
    defaultVisible: false,
    gate: "(public)/gallery/layout.tsx",
    module: "events",
  },
  {
    key: "gears",
    label: "{item_plural}",
    description:
      "The {collection_public:lower} and the {item_plural:lower} donation pages.",
    defaultVisible: true,
    // The only slot whose gate is spelled out because its key and its route
    // segment disagree: the section moved to `/inventory` in #897 while the
    // key stayed `gears`, since renaming the key is a data migration over
    // every tenant's `page_visibility.*` rows for a string nobody sees.
    gate: "(public)/inventory/layout.tsx",
    module: "inventory",
  },
  {
    key: "publications",
    label: "{publication_plural}",
    description:
      "The {publication_plural:lower} section: every published issue, each on its own page.",
    // Off until the tenant has an issue to show (#1470) -- the section is empty
    // otherwise, and the switch is theirs to flip once the first one is
    // published. No migration turns it on for anybody.
    defaultVisible: false,
    module: "publications",
  },
  // The one slot that gates a single route rather than a section, and the
  // reason is the content rather than the shape: the sizing charts are
  // snow-sports specific (ski lengths, mondopoint, DIN settings), authored by
  // Chatter Snow, and not editable from the portal. Gear as a whole is chrome
  // any organization can use, so it stays on by default; these charts are one
  // organization's guide and would otherwise publish under every tenant's
  // brand the moment they were provisioned (#795 Phase 3).
  {
    key: "gears-sizing",
    label: "Sizing Guide",
    description:
      "The ski and snowboard sizing charts under {item_plural}. Written for snow sports specifically, so it stays hidden until an organization says the guide is theirs.",
    defaultVisible: false,
    gate: "(public)/inventory/sizing/page.tsx",
    module: "inventory",
  },
  {
    // No module. #902's table proposed mapping this whole slot to `volunteers`,
    // and that is wrong on the evidence: the section is Attend, Volunteer and
    // Become a Partner, and only the middle one is about volunteers. Attend is
    // about events and the partner page is a partnership pitch that funnels to
    // /contact?topic=partnership -- a tenant that does not run volunteer
    // coordination still wants both. So the section stays the board's own and
    // the volunteer page gets the slot below, which is what the registry's
    // per-route `gate` is for.
    key: "get-involved",
    label: "Get Involved",
    description: "Attend, Volunteer, and Become a Partner.",
    defaultVisible: true,
  },
  {
    key: "get-involved-volunteer",
    label: "Volunteer",
    description:
      "The volunteer page under Get Involved, its application form and the reference-code status lookup.",
    defaultVisible: true,
    gate: "(public)/get-involved/volunteer/layout.tsx",
    module: "volunteers",
  },
  {
    key: "contact",
    label: "Contact",
    description: "The contact page and its message form.",
    defaultVisible: true,
    module: "communications",
  },
  // The two audience paths (#1328), and the first slot to gate a *pair* of
  // routes. They are siblings rather than a section -- neither is under the
  // other, and a `/audiences` parent nobody would ever link to exists only to
  // hold a layout -- so the gate is named twice below and `requireVisiblePage`
  // is called in both.
  //
  // No module: the pages describe what the platform does, and a tenant that
  // has bought three modules rather than eight still has something true to say
  // on them. Off by default like every new section, and this one would be
  // conspicuous turned on by accident -- it is the product's own pitch, and a
  // customer publishing it under their brand would be introducing their
  // visitors to their software vendor.
  {
    key: "audiences",
    platformOnly: true,
    label: "Audience paths",
    description:
      "The two pages at /nonprofits and /business, which describe what this platform does in each audience's own vocabulary.",
    defaultVisible: false,
    gate: ["(public)/nonprofits/layout.tsx", "(public)/business/layout.tsx"],
  },
  // The module tour (#1329) and the price list (#1330), the audience paths'
  // two neighbours. Three slots rather than one `marketing` switch, because
  // the three pages become publishable at different moments: the tour is ready
  // when the screenshots are (#1332) and the prices are ready when somebody
  // has decided what they are (#998, open question 4). One switch would mean
  // the last of the three held the other two dark.
  //
  // No module for either, for the reason `audiences` names: they describe what
  // the platform does, and what a tenant has been sold does not change whether
  // that description is true.
  {
    key: "modules",
    platformOnly: true,
    label: "What it does",
    description: "The page at /modules, one section per part of the platform.",
    defaultVisible: false,
  },
  {
    // The one slot whose page should stay dark even on the site it was written
    // for, until the numbers on it are ones somebody has agreed to. An
    // unapproved price is the single worst thing on this site to publish by
    // accident: it is quotable, it is screenshotted, and it is the one page a
    // reader will hold you to.
    key: "pricing",
    platformOnly: true,
    label: "Pricing",
    description:
      "The plans and prices at /pricing. Turn it on once the numbers in Site Content are the ones you mean to charge -- until then the page is written but unreachable.",
    defaultVisible: false,
  },
  // The second single-route slot, and hidden by default for the opposite
  // reason from `gears-sizing`. That one is off because its content is one
  // organization's. This page's content is never anyone else's -- every colour,
  // stop and specimen on it is read back from this tenant's own `brand.*` and
  // `site_content` rows. It is off because a tenant that has set *no* brand
  // tokens would publish a confident guide to the platform's neutral default
  // under their own name, which is worse than having no page at all. The board
  // turns it on once the branding is actually theirs.
  {
    key: "brand",
    label: "Brand",
    description:
      "The brand and design guide at /brand, for sharing with partners, sponsors and press. Derived from the colours, logo and copy set elsewhere in Administration, so turn it on once those are yours.",
    defaultVisible: false,
    gate: "(public)/brand/page.tsx",
  },
  // The link-in-bio page (#937): the one URL a social profile's bio points at,
  // and a stack of whatever the organization is currently asking people to do.
  //
  // No module -- it is a page about the organization itself, like About and
  // Brand, not a feature the platform sells. Off by default like every new
  // section, and unusually consequential here: it is not in the nav, so an
  // organization that has not written its links has no way to stumble onto the
  // page, and publishing the registry's example row under their own name would
  // be the only thing anyone arriving from Instagram ever saw.
  {
    key: "links",
    label: "Links",
    description:
      "The page at /links, for the single link a social profile allows in its bio. Not shown anywhere in the site's navigation -- the link you publish is the only way to it. Turn it on once the links are yours.",
    defaultVisible: false,
    gate: "links/layout.tsx",
  },
];

/**
 * Why a required page has no switch. Each reads as one line in Website >
 * Page visibility, beside a locked "Always on" switch.
 */
export const REQUIRED_PAGE_REASONS = {
  entry: "The front door every link to the site lands on.",
  legal:
    "A legal notice. Whether it is served is decided in Legal documents, not here.",
  account:
    "Part of a visitor's own account, or a link emailed to them. Hiding it would strand people mid-task.",
  link: "Reached only from a link the organization hands out or emails, never from the site's navigation.",
} as const;

export type RequiredPageReason = keyof typeof REQUIRED_PAGE_REASONS;

export type RequiredPublicPage = {
  /** Identifier for React keys and tests; never shown. */
  key: string;
  label: string;
  reason: RequiredPageReason;
  /**
   * The directories under `src/app/(public)` this entry covers, each with every
   * route beneath it. `""` is the group root itself, and covers only `/` --
   * otherwise it would cover the whole site. Checked by page-visibility.test.ts
   * against the filesystem.
   */
  routes: readonly string[];
};

/**
 * Every public route that is on whatever the board has stored (#1726). Not a
 * slot, because there is no decision to make: the site has to have a home
 * page, a person's own account has to work, and a legal notice is adopted or
 * not in Legal documents rather than shown or hidden here.
 *
 * Listed rather than implied by having no slot, so the panel can say so out
 * loud and so a new page cannot ship without someone choosing: the test beside
 * this file fails any route under `(public)` that is neither gated by a slot
 * nor listed here.
 */
export const REQUIRED_PUBLIC_PAGES: readonly RequiredPublicPage[] = [
  // `/` is a redirect to /home (#1467), so it goes wherever home goes.
  { key: "home", label: "Home", reason: "entry", routes: ["", "home"] },
  // Derived, so a new legal document cannot be added without being covered.
  ...LEGAL_DOCUMENTS.map((document): RequiredPublicPage => ({
    key: document.key,
    label: document.label,
    reason: "legal",
    routes: [document.route.slice(1)],
  })),
  {
    key: "giveaway-rules",
    label: "Giveaway official rules",
    reason: "link",
    routes: ["giveaways"],
  },
  {
    key: "acknowledge",
    label: "Handout acknowledgement",
    reason: "link",
    routes: ["acknowledge"],
  },
  { key: "my", label: "My account", reason: "account", routes: ["my"] },
  {
    key: "confirm-email",
    label: "Email confirmation",
    reason: "account",
    routes: ["confirm-email-change", "confirm-notification-email"],
  },
  {
    key: "artwork",
    label: "Call for artwork",
    reason: "link",
    routes: ["artwork"],
  },
];

/**
 * The registry with this organization's own words in it (#896), for the
 * Administration panel -- the one place these labels are read.
 *
 * Done here rather than in the panel because the panel is a client component
 * that receives the slot list as a prop, and a template that reached it
 * unresolved would render braces at an administrator.
 */
export function namedSlots(lexicon: Lexicon): PublicPageSlot[] {
  return PUBLIC_PAGE_SLOTS.map((slot) => ({
    ...slot,
    label: applyLexicon(slot.label, lexicon),
    description: applyLexicon(slot.description, lexicon),
  }));
}

/**
 * The slots a tenant's administration panels should offer at all: every slot
 * for the platform tenant, and every slot but the platform's own marketing
 * pages for anyone else.
 */
export function slotsForTenant<T extends Pick<PublicPageSlot, "platformOnly">>(
  slots: readonly T[],
  tenant: { plan: string } | null,
): T[] {
  return isPlatformTenant(tenant)
    ? [...slots]
    : slots.filter((slot) => !slot.platformOnly);
}

/** The keys of the slots `slotsForTenant` leaves out for this tenant. */
export function platformOnlySlotKeys(
  tenant: { plan: string } | null,
): Set<string> {
  return new Set(
    isPlatformTenant(tenant)
      ? []
      : PUBLIC_PAGE_SLOTS.filter((slot) => slot.platformOnly).map(
          (slot) => slot.key,
        ),
  );
}

export const PAGE_VISIBILITY_PREFIX = "page_visibility.";

export function pageVisibilitySettingKey(slot: string): string {
  return `${PAGE_VISIBILITY_PREFIX}${slot}`;
}

/**
 * Resolves a stored app_settings value to a boolean. Anything that isn't an
 * explicit boolean (a missing row, a null, a value someone typed by hand into
 * the table) falls back to the slot's registry default rather than guessing --
 * an unreadable flag must not accidentally publish an unapproved section.
 */
function resolveVisibility(value: unknown, defaultVisible: boolean): boolean {
  return typeof value === "boolean" ? value : defaultVisible;
}

/**
 * Module entitlements for the tenant the *request host* resolves to (#902),
 * as `{ [module_key]: enabled }`.
 *
 * A module missing from the answer -- or an unreadable view -- resolves to
 * **enabled**, which is the opposite of how a missing visibility row resolves
 * two functions down, and deliberately so. A missing `page_visibility` row
 * means "nobody has approved publishing this yet", so the safe answer is dark.
 * A missing module row means "this tenant predates the table", and blacking out
 * an organization's whole Events section because a seed missed it is the worse
 * failure. Same decision the database makes in `module_enabled_for_tenant()`.
 *
 * Loud on failure for the same reason the visibility read is: this exact
 * function's counterpart swallowed a PGRST205 on every request for a while
 * once, and the symptom was admin toggles that looked like they refused to
 * save.
 */
export const getPublicTenantModules = cache(
  async (supabase: SupabaseClient): Promise<Record<string, boolean>> => {
    const { data, error } = await supabase
      .from("public_tenant_modules")
      .select("module_key, enabled");

    if (error) {
      console.error(
        "[page-visibility] could not read public_tenant_modules; every module is falling back to enabled",
        error,
      );
      return {};
    }

    const modules: Record<string, boolean> = {};
    for (const row of data ?? []) {
      modules[String(row.module_key)] = row.enabled !== false;
    }
    return modules;
  },
);

/**
 * Whether the module that owns a slot is off. `true` only for a slot that names
 * a module and whose module is explicitly disabled -- an unmapped slot and an
 * unknown module both answer `false`, so the failure direction is "shown".
 */
function moduleBlocks(
  slot: PublicPageSlot,
  modules: Record<string, boolean>,
): boolean {
  return slot.module !== undefined && modules[slot.module] === false;
}

/**
 * Reads the visibility of every registered section. Wrapped in React `cache()`
 * so the public layout (which filters the nav and footer) and the section
 * layout (which gates the route) share a single query per render.
 *
 * Two reads since #902, issued together: what the board has published, and what
 * the platform has sold -- three counting the host's tenant, which decides
 * whether the platform-only slots can be on at all. A section needs both -- the entitlement is the
 * platform's and wins, so a slot whose module is off is hidden whatever the
 * board stored, and turning the module back on returns the section to whatever
 * the board had set rather than to a default.
 */
export const getPageVisibility = cache(
  async (supabase: SupabaseClient): Promise<Record<string, boolean>> => {
    const [{ data, error }, modules, tenant] = await Promise.all([
      supabase.from("public_page_visibility").select("slot, value"),
      getPublicTenantModules(supabase),
      getPublicTenant(supabase),
    ]);

    // The platform's own marketing pages are dark on every other host. An
    // unresolved or unreadable tenant counts as "not the platform": the price
    // list is the last page to publish on a guess.
    const platformHost =
      tenant.status === "resolved" && isPlatformTenant(tenant.tenant);

    // A failed read and "nothing configured yet" both land on the registry
    // defaults below. Falling back is the right call -- an unreadable flag must
    // not publish an unapproved section -- but it must not be silent: this view
    // was missing from production for a while, and the PGRST205 that came back
    // on every request was swallowed here, so the admin toggles looked like
    // they simply refused to save. A broken read has to say so out loud.
    if (error) {
      console.error(
        "[page-visibility] could not read public_page_visibility; every section is falling back to its registry default",
        error,
      );
    }

    const visibility: Record<string, boolean> = {};
    for (const slot of PUBLIC_PAGE_SLOTS) {
      const row = data?.find((setting) => setting.slot === slot.key);
      visibility[slot.key] =
        (platformHost || !slot.platformOnly) &&
        !moduleBlocks(slot, modules) &&
        resolveVisibility(row?.value, slot.defaultVisible);
    }
    return visibility;
  },
);

/**
 * The same flags for the tenant the signed-in admin has selected, for the
 * Page visibility panel. Read straight from `app_settings` -- RLS scopes it to
 * the current tenant -- rather than through `public_page_visibility`, which
 * answers for the *request host* and so shows a portal admin whichever tenant
 * owns `portal.<domain>` rather than the one they are editing. Same split as
 * `getTenantLayoutValues` / `getSiteLayout`.
 *
 * The two are the same row until they are not: the write goes to `app_settings`
 * with `tenant_id` defaulting to `default_tenant_id()` -- the admin's own
 * tenant -- so any host that resolves elsewhere leaves the panel reading a row
 * it did not write, and the switch snaps back to the other tenant's answer
 * after a save that really did happen.
 */
export const getTenantPageVisibility = cache(
  async (supabase: SupabaseClient): Promise<Record<string, boolean>> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${PAGE_VISIBILITY_PREFIX}%`);

    if (error) {
      console.error(
        "[page-visibility] could not read page_visibility.* from app_settings; the panel is showing registry defaults",
        error,
      );
    }

    const stored = new Map(
      (data ?? []).map((row) => [
        String(row.key).slice(PAGE_VISIBILITY_PREFIX.length),
        row.value,
      ]),
    );

    const visibility: Record<string, boolean> = {};
    for (const slot of PUBLIC_PAGE_SLOTS) {
      visibility[slot.key] = resolveVisibility(
        stored.get(slot.key),
        slot.defaultVisible,
      );
    }
    return visibility;
  },
);

/**
 * The modules of the tenant the signed-in admin has *selected* (#902), which is
 * not always the one their host resolves to -- the same split as
 * `getTenantPageVisibility` above, and it matters here for the same reason: a
 * panel that told an admin a section is unavailable because of some other
 * tenant's entitlements would be worse than one that said nothing.
 *
 * Fails open, like its public counterpart: an unreadable answer leaves every
 * control editable rather than locking the panel over a failed query.
 */
export const getTenantModules = cache(
  async (supabase: SupabaseClient): Promise<Record<string, boolean>> => {
    const { data, error } = await supabase.rpc("my_modules");

    if (error) {
      console.error(
        "[page-visibility] could not read my_modules; the panel is treating every module as available",
        error,
      );
      return {};
    }

    const modules: Record<string, boolean> = {};
    for (const row of (data ?? []) as {
      module_key: string;
      enabled: boolean;
    }[]) {
      modules[row.module_key] = row.enabled !== false;
    }
    return modules;
  },
);

/**
 * The slots an administration panel must render read-only, mapped to the module
 * that is withholding them. Empty for a tenant with everything it needs, which
 * is every tenant until an operator says otherwise.
 *
 * A control that silently ignores what you set is worse than one that explains
 * itself -- the same stance `notifications.from_address` takes when a domain is
 * not verified.
 */
export function moduleBlockedSlots(
  modules: Record<string, boolean>,
): Record<string, string> {
  const blocked: Record<string, string> = {};
  for (const slot of PUBLIC_PAGE_SLOTS) {
    if (moduleBlocks(slot, modules)) blocked[slot.key] = slot.module!;
  }
  return blocked;
}

/** The slots that are currently hidden, for filtering nav and footer links. */
export function hiddenSlots(visibility: Record<string, boolean>): string[] {
  return PUBLIC_PAGE_SLOTS.filter((slot) => !visibility[slot.key]).map(
    (slot) => slot.key,
  );
}

/**
 * Whether a section is currently live. Use it to hide a call-to-action that
 * links into another section -- the nav and footer are filtered centrally, but
 * an in-page CTA (the homepage's Donate button, say) would otherwise point at
 * a page the board has hidden and 404.
 */
export async function isPageVisible(slot: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const visibility = await getPageVisibility(supabase);
  return Boolean(visibility[slot]);
}

/**
 * Route gate. Call at the top of a section's layout: hiding a section from the
 * nav doesn't make its URLs unreachable, so the section itself has to 404.
 *
 * `unlessAllowed` lets a hidden section through for somebody specific -- a
 * tenant's editors previewing it before it goes live (#1472). It is only asked
 * when the section is hidden, so a visible one costs nothing extra.
 */
export async function requireVisiblePage(
  slot: string,
  unlessAllowed?: () => Promise<boolean>,
): Promise<void> {
  if (!(await isPageVisible(slot)) && !(await unlessAllowed?.())) {
    notFound();
  }
}

/**
 * Whether the tenant asks a person any profile question after registration or
 * on `/my/details` (#1746): the privacy policy's `profileQuestions` surface.
 * `public_asks_profile_questions()` on the public side, its portal twin for
 * the selected tenant. Fails open, like the module reads: describing a
 * question nobody is asked is survivable, leaving out one that is is not.
 */
async function readAsksProfileQuestions(
  supabase: SupabaseClient,
  rpc: "public_asks_profile_questions" | "tenant_asks_profile_questions",
): Promise<boolean> {
  const { data, error } = await supabase.rpc(rpc);
  if (error) {
    console.error(
      `[page-visibility] could not read ${rpc}; the privacy policy is describing profile questions`,
      error,
    );
    return true;
  }
  return data !== false;
}

export const getPublicAsksProfileQuestions = cache((supabase: SupabaseClient) =>
  readAsksProfileQuestions(supabase, "public_asks_profile_questions"),
);

export const getTenantAsksProfileQuestions = cache((supabase: SupabaseClient) =>
  readAsksProfileQuestions(supabase, "tenant_asks_profile_questions"),
);
