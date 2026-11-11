import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionLevel,
  type PermissionMap,
} from "@/lib/auth/permissions";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";

/**
 * The portal's navigation tree, shared by the sidebar (which renders it) and
 * the section index routes (which resolve a landing page from it). It lives
 * outside the client component so both read one definition: when they didn't,
 * /portal/finance redirected to a fixed child the sidebar already knew the
 * user couldn't open.
 *
 * Icons are deliberately absent -- they're a rendering concern, mapped by
 * `value` in portal-nav.tsx, so server code can import this without pulling
 * an icon library into its bundle.
 */
export type NavSubItem = {
  value: string;
  /**
   * May carry `{term}` placeholders from the lexicon registry in
   * `src/lib/lexicon.ts` (#896). Whatever renders a label resolves it against
   * the current tenant's words -- `useLexicon()` in the portal shell -- so
   * nothing should print this raw.
   */
  label: string;
  href: string;
  /** Any one of these is enough, the way `hasAnyPermission` reads them. */
  access: readonly PermissionCheck[];
  /**
   * Optional heading this sub-item files under, for sections whose list has
   * grown past scanning (#942). A lexicon template like `label`.
   *
   * Grouping is derived rather than declared: `navGroups` walks the list
   * once and starts a new group whenever this value changes, so sub-items
   * sharing a group must be adjacent -- `nav.test.ts` asserts it. That keeps
   * one ordered array as the source of truth, so `visibleNavItems`,
   * `activeSubItemFor` and `firstAccessibleHref` need no knowledge of groups,
   * and a group whose every item is filtered out disappears on its own rather
   * than leaving a heading over nothing.
   */
  group?: string;
  /**
   * An extra condition that must hold *as well as* `access`, for a cross-link
   * whose route guard is not the section it is filed under (#903).
   *
   * Volunteers -> Directory is the only one: it points at the People directory
   * filtered to volunteers, so `access` says `people:view` -- the guard
   * people/layout.tsx actually has -- and without this a tenant whose
   * Volunteers module is off kept a Volunteers section in the sidebar holding
   * that one link, advertising a module it was never sold. `people` is a core
   * module and can never be disabled, so the link itself was never a dead end;
   * the section heading above it was the lie.
   */
  alsoRequires?: readonly PermissionCheck[];
};

export type NavItem = {
  value: string;
  /** A lexicon template, like `NavSubItem.label`. */
  label: string;
  href: string;
  basePath?: string;
  /** Omit for items always visible regardless of permissions (e.g. Dashboard). */
  access?: readonly PermissionCheck[];
  /**
   * Optional heading this section files under (#954). Same contract as
   * `NavSubItem.group`, read by the same `navGroups` helper: sections sharing
   * a group must be adjacent, and a group whose every section is filtered out
   * disappears rather than leaving a heading over nothing.
   *
   * Dashboard deliberately carries none -- it is the landing page rather than
   * one of the subject areas, and sits above the first heading.
   */
  group?: string;
  /**
   * Marks a section as thumb-reachable work, for the mobile shell's bottom tab
   * bar (#1079).
   *
   * A flag on this tree rather than a second list in the mobile shell: a
   * parallel list would let mobile and desktop entitlements drift, and
   * `nav-guards.test.ts` would stop meaning anything about what a phone can
   * reach. `primaryNavItems` below is what reads it; everything a phone can
   * open but is not flagged here is still reachable through the sheet and the
   * command palette.
   */
  primary?: boolean;
  subItems?: readonly NavSubItem[];
};

// Grouped and reordered (#954). Twelve sections sat in one ungrouped column
// ordered neither alphabetically, nor by frequency, nor by the module
// catalog's own sort_order -- so a section's position carried no meaning, and
// a plain link (Messages) looked exactly like a ten-page subsystem
// (Governance). The four headings are the first deliberate order the sidebar
// has had.
//
// This also absorbs the cost of #943, #944 and #945: the three sections they
// promote out of Administration land inside "Organization" rather than
// extending a flat list, so the sidebar stays four headings wide.
//
// Dashboard is deliberately ungrouped, above the first heading: it is the
// landing page, not one of the subject areas.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    value: "overview",
    label: "Dashboard",
    href: "/portal/home",
    primary: true,
  },
  {
    value: "events",
    label: "Events",
    group: "Delivery",
    href: "/portal/events",
    access: [{ resource: "events", level: "view" }],
    primary: true,
  },
  {
    value: "calendar",
    label: "Calendar",
    group: "Delivery",
    href: "/portal/calendar",
    basePath: "/portal/calendar",
    primary: true,
    subItems: [
      {
        value: "items",
        label: "Calendar",
        href: "/portal/calendar",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        // Lives at its own path, not under /portal/calendar (#1794): a post
        // need not be related to a calendar item at all (#1792). Filed here
        // because it is the same module and the same grant; the sub-item
        // match in activeSectionFor files the route under Calendar.
        value: "social",
        label: "Social content",
        href: "/portal/social",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "categories",
        label: "Categories",
        href: "/portal/calendar/categories",
        // view, not manage: the page is readable by anyone who works the
        // calendar -- the vocabulary is what their pickers are made of -- and
        // the write controls are gated on manage inside it, the way Item
        // Categories does it.
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "import",
        label: "Import",
        href: "/portal/calendar/import",
        access: [{ resource: "content_calendar", level: "manage" }],
      },
    ],
  },
  {
    value: "programs",
    label: "Programs",
    group: "Delivery",
    href: "/portal/programs",
    basePath: "/portal/programs",
    subItems: [
      {
        value: "list",
        label: "Programs",
        href: "/portal/programs",
        access: [{ resource: "programs", level: "view" }],
      },
      {
        value: "reports",
        label: "Impact Report",
        href: "/portal/programs/reports",
        access: [{ resource: "programs_reports", level: "view" }],
      },
    ],
  },
  {
    value: "artwork",
    label: "Artwork",
    group: "Delivery",
    href: "/portal/artwork",
    basePath: "/portal/artwork",
    // Its own section rather than a child of Events (#870): the queue is
    // gated on artwork_submissions alone, so a curator who holds nothing else
    // can still reach it.
    subItems: [
      {
        value: "submissions",
        label: "Submissions",
        href: "/portal/artwork",
        access: [{ resource: "artwork_submissions", level: "view" }],
      },
      {
        value: "calls",
        label: "Calls",
        href: "/portal/artwork/calls",
        access: [{ resource: "artwork_submissions", level: "manage" }],
      },
    ],
  },
  {
    // One entry, eight segments (#957). Donors, Sponsors, Attendees, Staff,
    // Partners and Organizations were sub-items here pointing at six
    // top-level routes outside People's own path -- #622 consolidated the
    // sidebar and left the routes behind, leaving the only section in the
    // portal with more navigation than content. They are one directory seen
    // through eight filters, so they are segments of /portal/people and the
    // strip on that page is where a reader picks one.
    value: "people",
    label: "People",
    group: "People",
    href: "/portal/people",
    basePath: "/portal/people",
    // On the section itself now that it has no sub-items to inherit the gate
    // from: visibleNavItems keeps an access-less section unconditionally,
    // which is right for Dashboard and wrong for this.
    access: [{ resource: "people", level: "view" }],
    primary: true,
  },
  {
    value: "volunteers",
    label: "Volunteers",
    group: "People",
    href: "/portal/volunteers/roles",
    basePath: "/portal/volunteers",
    subItems: [
      {
        value: "roles",
        label: "Roles",
        href: "/portal/volunteers/roles",
        access: [{ resource: "volunteers", level: "view" }],
      },
      {
        value: "participation",
        label: "Participation",
        href: "/portal/volunteers/participation",
        access: [{ resource: "volunteers", level: "view" }],
      },
      {
        value: "applications",
        label: "Applications",
        href: "/portal/volunteers/applications",
        access: [{ resource: "volunteers", level: "view" }],
      },
      // Its own resource rather than `volunteers` (#1360), so this is the one
      // sub-item in the section a `volunteers:view` holder does not see. It
      // sits above Directory rather than below it because Directory points
      // outside the section: for somebody holding screening and nothing else,
      // firstAccessibleHref should land them on /portal/volunteers/screening,
      // not on the People directory.
      //
      // No `alsoRequires`. Unlike Directory, this route's own resource carries
      // module_key = 'volunteers', so has_permission() already answers false
      // when the tenant has the module off (20260910010000).
      {
        value: "screening",
        label: "Screening levels",
        href: "/portal/volunteers/screening",
        access: [{ resource: "volunteer_screening", level: "view" }],
      },
      // The People directory filtered to volunteers. Cross-linked rather than
      // duplicated, and gated on the guard its route actually has
      // (people/layout.tsx), which is why this one says people:view. Listed
      // last so firstAccessibleHref still lands /portal/volunteers on Roles.
      //
      // `alsoRequires` is what keeps it from holding the whole Volunteers
      // section open on its own: people:view is held by almost everyone and
      // `people` is a core module, so without it a tenant with Volunteers off
      // still got a Volunteers heading with this single link under it (#903).
      {
        value: "directory",
        label: "Directory",
        href: "/portal/people/volunteers",
        access: [{ resource: "people", level: "view" }],
        alsoRequires: [{ resource: "volunteers", level: "view" }],
      },
    ],
  },
  {
    value: "messages",
    label: "Messages",
    group: "People",
    href: "/portal/communications",
    access: [{ resource: "communications", level: "view" }],
  },
  {
    // The one section named in the tenant's own words rather than the
    // platform's (#896): Chatter Snow runs a gear library, and a nonprofit
    // lending tools or distributing food reads the same tables. `inventory`
    // here is the section value and the permission resource -- both internal,
    // neither renamed.
    value: "inventory",
    label: "{collection}",
    group: "Resources",
    href: "/portal/inventory/items",
    basePath: "/portal/inventory",
    subItems: [
      {
        value: "items",
        label: "{item_plural}",
        href: "/portal/inventory/items",
        access: [{ resource: "inventory", level: "view" }],
      },
      {
        // Public requests from the library (#1032): a different job from the
        // items list -- a queue to work rather than a catalogue to keep -- so
        // a destination of its own, which is also what the bell links to.
        value: "requests",
        label: "Requests",
        href: "/portal/inventory/requests",
        access: [{ resource: "inventory", level: "view" }],
      },
      {
        value: "donations",
        label: "Donations",
        href: "/portal/inventory/donations",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "distribution",
        label: "Distribution",
        href: "/portal/inventory/distribution",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "categories",
        // `{collection} Categories`, not `{item} Categories`: a tenant whose
        // singular is "Gear item" would read "Gear item Categories".
        label: "{collection} Categories",
        href: "/portal/inventory/categories",
        access: [{ resource: "inventory", level: "view" }],
      },
      {
        value: "reports",
        label: "{collection} Reports",
        href: "/portal/inventory/reports",
        access: [{ resource: "inventory_reports", level: "view" }],
      },
    ],
  },
  {
    value: "finance",
    label: "Finance",
    group: "Resources",
    href: "/portal/finance/expenses",
    basePath: "/portal/finance",
    // Grouped and reordered (#988). Finance's problem was never the item
    // count: Sales, Sales Register and Products took three of the eight slots
    // -- 37% of the section -- for one subject, rendered as three peers even
    // though the routes say parent and children (finance/sales,
    // finance/sales/register, finance/sales/products). The sidebar gave no
    // hint that Register and Products belong to Sales rather than to Finance.
    //
    // They are not three views of one object, so they are not tabs: the
    // register is a till, Products is a catalog, Sales is a ledger of what the
    // till recorded. Under docs/portal-navigation.md they are different jobs
    // and stay separate destinations -- they just needed to sit under Sales
    // rather than beside it. `NavItem` has no third level and inventing one
    // would be an eighth navigation pattern, so the group heading does the
    // work the nesting would.
    //
    // Reimbursements stays here (#951) even though the entitlement catalog
    // makes it a peer module of `finance`, the same shape #943 promoted
    // Access Management out of Administration for. The answer differs because
    // the sections do: Administration was a misc drawer with a six-resource
    // union gate, while Finance is one job with one audience, and a
    // reimbursement is money out under the same approval thresholds.
    //
    // The section's href stays /portal/finance/expenses, so reordering moves
    // nobody's landing page: visibleNavItems keeps item.href whenever a
    // reachable sub-item still has it.
    subItems: [
      {
        // Donations is one of two pages by that name -- inventory/donations is
        // the other (#949 gave them distinct titles, #948 breadcrumbs). This
        // heading is the last piece: the sidebar now says which is which.
        value: "donations",
        label: "Donations",
        href: "/portal/finance/donations",
        group: "Money in",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "revenue",
        label: "Revenue",
        href: "/portal/finance/revenue",
        group: "Money in",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "expenses",
        label: "Expenses",
        href: "/portal/finance/expenses",
        group: "Money out",
        access: [
          { resource: "finance", level: "manage" },
          { resource: "finance_approvals", level: "manage" },
        ],
      },
      {
        value: "reimbursements",
        label: "Reimbursements",
        href: "/portal/finance/reimbursements",
        group: "Money out",
        access: [
          { resource: "reimbursements", level: "manage" },
          { resource: "reimbursement_approvals", level: "manage" },
        ],
      },
      // Sales before Register before Products: the ledger is the section's
      // read-only landing place and the only one a `sales:view` holder can
      // open, and the register is used far more often than the catalog behind
      // it.
      {
        value: "sales",
        label: "Sales",
        href: "/portal/finance/sales",
        group: "Sales",
        access: [{ resource: "sales", level: "view" }],
      },
      {
        value: "register",
        label: "Sales Register",
        href: "/portal/finance/sales/register",
        group: "Sales",
        access: [{ resource: "sales", level: "manage" }],
      },
      {
        value: "products",
        label: "Products",
        href: "/portal/finance/sales/products",
        group: "Sales",
        access: [{ resource: "sales", level: "manage" }],
      },
      // Deliberately ungrouped, and last. It is the one entry with a different
      // audience -- `board` holds finance_reports:view and reaches nothing
      // else in the section -- and a heading over a single item says less than
      // its absence does.
      {
        value: "reports",
        label: "Financial Reports",
        href: "/portal/finance/reports",
        access: [{ resource: "finance_reports", level: "view" }],
      },
    ],
  },
  // Promoted out of Administration (#943). `access_management` is a peer
  // module in the entitlement catalog, not part of Administration: a tenant
  // can be sold it without Administration, yet the only way in was through
  // Administration's disclosure, and the section gate had to be widened to
  // admit it (#903).
  //
  // Named "Technology" rather than "Access Management": the old label read as
  // RBAC while the section is a registry of vendor accounts, domains and MFA
  // status -- and it sat two rows from Roles and Permissions, which are the
  // actual access control.
  // Promoted out of Administration (#944). Site Content is a website CMS
  // filed as an administration setting: 15 pages, 35 sections and 121 content
  // slots, plus the Learn articles and a draft -> publish workflow, with its
  // own page switcher, cross-page search and outline. Three levels of
  // navigation inside one sub-item.
  //
  // It was also the only Administration entry whose gate admitted a reader
  // holding nothing else. The job is writing the public website and the
  // audience is comms, not admins.
  // Promoted out of Administration (#945). Platform is the console for
  // administering *every* organization on the platform -- provisioning
  // tenants, custom domains, module entitlements -- and it sat as the seventh
  // bullet under a single tenant's own Administration disclosure. Those are
  // two different product levels one triangle apart.
  //
  // Unlike #943 this is not a module argument: `platform_tenants` maps to the
  // `administration` module. It needs no nav logic of its own to stay hidden
  // either -- my_permissions() reports the resource as `none` unless
  // is_platform_operator() holds, which carries the internal-plan and
  // membership-kind conditions too, so visibleNavItems drops the section for
  // everyone else. It did until #795, when the resource was granted to every
  // tenant's `admin` role as an inert grant and the nav dutifully showed a
  // link to a page that then refused to load.
  {
    value: "platform",
    label: "Platform",
    group: "Organization",
    href: "/portal/platform",
    basePath: "/portal/platform",
    access: [{ resource: "platform_tenants", level: "manage" }],
  },
  {
    value: "website",
    label: "Website",
    group: "Organization",
    href: "/portal/website",
    basePath: "/portal/website",
    subItems: [
      {
        value: "pages",
        label: "Pages",
        href: "/portal/website",
        group: "Content",
        access: [{ resource: "site_content", level: "view" }],
      },
      // Both of these were reachable only from a link inside their parent --
      // two of the four routes the IA audit found outside every navigation
      // surface.
      {
        value: "articles",
        label: "Articles",
        href: "/portal/website/articles",
        group: "Content",
        access: [{ resource: "site_content", level: "view" }],
      },
      // Operator-only, and it takes both checks to say so. `access` is the
      // section's own gate, which website/layout.tsx actually enforces;
      // `alsoRequires` is the extra condition the page enforces itself, since
      // it notFound()s without `platform_tenants:manage`.
      //
      // Gating on platform_tenants alone would have the nav offering a link
      // the layout above it refuses -- the shape #903 fixed, and the one
      // nav-guards.test.ts exists to catch.
      {
        value: "content-packs",
        label: "Content Packs",
        href: "/portal/website/articles/packs",
        group: "Content",
        access: [{ resource: "site_content", level: "view" }],
        alsoRequires: [{ resource: "platform_tenants", level: "manage" }],
      },
      // The tenant's periodic publication (#1472), on its own resource and
      // module: `publications` carries module_key = 'publications', so a tenant
      // without the module never sees the link. Labelled with the tenant's own
      // word ("Zine" for Chatter Snow).
      {
        value: "publications",
        label: "{publication_plural}",
        href: "/portal/website/publications",
        group: "Content",
        access: [{ resource: "publications", level: "view" }],
      },
      // The three settings panels #990 moved out of System Settings, grouped
      // because they are a different job from writing the copy above -- and
      // because they are what a different reader comes here for. `board` holds
      // system_settings:manage and no site_content at all, so this group is
      // the whole of the Website section as they see it, with no "Content"
      // heading over anything (navGroups drops a heading whose every item is
      // filtered out).
      //
      // system_settings:manage rather than site_content:view: that is the
      // resource `writeAppSetting` checks, and a link shown to a reader whose
      // every save would fail is the dead end nav-guards.test.ts exists to
      // catch. The section gate above is a union of the two so that both
      // audiences get in.
      {
        value: "page-layout",
        label: "Layout",
        href: "/portal/website/page-layout",
        group: "Site settings",
        access: [{ resource: "system_settings", level: "manage" }],
      },
      {
        value: "page-visibility",
        label: "Page visibility",
        href: "/portal/website/page-visibility",
        group: "Site settings",
        access: [{ resource: "system_settings", level: "manage" }],
      },
      {
        value: "legal-documents",
        label: "Legal documents",
        href: "/portal/website/legal-documents",
        group: "Site settings",
        access: [{ resource: "system_settings", level: "manage" }],
      },
      // Beside Legal documents rather than under Events, and the same reader
      // comes for both (#1322): these are the organization's standing answers
      // about a promotion it runs -- who the sponsor is, who may enter, how to
      // enter without paying -- not the recording of one giveaway, which
      // stays in that event's Giveaway tab.
      {
        value: "giveaway-rules",
        label: "Giveaway rules",
        href: "/portal/website/giveaway-rules",
        group: "Site settings",
        access: [{ resource: "system_settings", level: "manage" }],
      },
    ],
  },
  {
    value: "technology",
    label: "Technology",
    group: "Organization",
    href: "/portal/technology",
    basePath: "/portal/technology",
    // No `administration:manage` alternative, unlike the rest of the admin
    // sections: that resource maps to the core `administration` module, so it
    // admitted every admin even when the tenant had `access_management`
    // switched off, and the section stayed in the sidebar. The admin role
    // holds access_management_assets:manage outright
    // (20260828100000_add_access_management_resources.sql), and
    // my_permissions() reports it `none` when the module is off, so these two
    // checks alone follow the entitlement.
    subItems: [
      {
        value: "assets",
        label: "Assets",
        href: "/portal/technology",
        access: [
          { resource: "access_management_assets", level: "view" },
          { resource: "access_management_reviews", level: "view" },
        ],
      },
      // Was reachable only from a link inside the assets page -- one of the
      // four routes the IA audit found outside every navigation surface.
      {
        value: "services",
        label: "Services",
        href: "/portal/technology/services",
        access: [
          { resource: "access_management_assets", level: "view" },
          { resource: "access_management_reviews", level: "view" },
        ],
      },
    ],
  },
  // A section of its own rather than a page under Governance (#687), and the
  // nav follows the permission rather than the other way round: `governance`
  // is what a board administers and `conduct_reports` is deliberately not part
  // of it, so a board member holding governance:manage sees no Conduct link
  // until somebody grants them the resource.
  //
  // `view` rather than `manage` on the access check, because a reviewer holding
  // view and nothing else has real work here -- the cases they are assigned to.
  // Their queue is empty until they are assigned one, which is the intended
  // shape rather than a dead end: the page says so.
  //
  // No `alsoRequires`: the resource carries module_key = 'conduct', so
  // has_permission() already answers false for a tenant without the module
  // (20260910010000).
  {
    value: "conduct",
    label: "Conduct",
    group: "Organization",
    href: "/portal/conduct",
    basePath: "/portal/conduct",
    access: [{ resource: "conduct_reports", level: "view" }],
  },
  {
    value: "governance",
    label: "Governance",
    group: "Organization",
    href: "/portal/governance/board-members",
    basePath: "/portal/governance",
    // Grouped and reordered (#987). Ten entries, all gated on
    // governance:manage, presented flat in an order that was neither
    // alphabetical nor thematic: Resolutions sat eighth, four places from
    // Meetings, which is where resolutions are made. Nothing here is misfiled
    // the way Access Management and Site Content were under Administration
    // (#943, #944) -- every one of the ten is something a board does, gated on
    // the resource named after the section, living under its path. The list
    // was simply ten items long, so this is three headings and one move.
    //
    // Partnerships and Grants stay (#951): both are pipelines -- prospect,
    // stages, close -- not ledgers, and `board` holds governance:manage with
    // finance: none, so filing them under Finance would take both away from
    // the readers who use them. The finance module's description claiming
    // "grants" is the thing that is wrong.
    subItems: [
      {
        // Deliberately ungrouped, above the first heading (#1658): it lists
        // the open items of five of the entries below, so it belongs to none
        // of their headings.
        value: "open-work",
        label: "Open work",
        href: "/portal/governance/open-work",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "board-members",
        label: "Board Members",
        href: "/portal/governance/board-members",
        group: "Board proceedings",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "meetings",
        label: "Meetings",
        href: "/portal/governance/meetings",
        group: "Board proceedings",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        // Moved up from eighth to sit beside Meetings, which is where a
        // resolution is made.
        value: "resolutions",
        label: "Resolutions",
        href: "/portal/governance/resolutions",
        group: "Board proceedings",
        access: [{ resource: "governance", level: "manage" }],
      },
      // Five items, the largest group, and the one a reader scans least often
      // -- the right place for the long tail.
      {
        value: "bylaws",
        label: "Bylaws",
        href: "/portal/governance/bylaws",
        group: "Standing obligations",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "policies",
        label: "Policies",
        href: "/portal/governance/policies",
        group: "Standing obligations",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "conflict-of-interest",
        label: "Conflict of Interest",
        href: "/portal/governance/conflict-of-interest",
        group: "Standing obligations",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "annual-requirements",
        label: "Annual Requirements",
        href: "/portal/governance/annual-requirements",
        group: "Standing obligations",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "nonprofit-status",
        label: "Nonprofit Status",
        href: "/portal/governance/nonprofit-status",
        group: "Standing obligations",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "partnerships",
        label: "Partnerships",
        href: "/portal/governance/partnerships",
        group: "External relationships",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "grants",
        label: "Grants",
        href: "/portal/governance/grants",
        group: "External relationships",
        access: [{ resource: "governance", level: "manage" }],
      },
    ],
  },
  {
    value: "administration",
    label: "Administration",
    group: "Organization",
    href: "/portal/administration/users",
    basePath: "/portal/administration",
    // Grouped and reordered (#942). Nine flat entries spanned identity, org
    // configuration, website copy, an IT asset registry, cross-tenant operator
    // tooling and compliance -- six jobs with no heading to tell them apart.
    // The order also split the one job it had: Access Management sat between
    // Roles and Permissions, which are two halves of defining a role.
    //
    // Three of these are proposed to leave the section entirely (#943, #944,
    // #945). The groups are chosen so that when they do, what remains is
    // already correct: "Technology & platform" empties, Site Content leaves
    // Organization, and the other two groups are untouched.
    subItems: [
      {
        value: "users",
        label: "Users",
        href: "/portal/administration/users",
        group: "Access & identity",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        // Permissions was a third entry here until #946 folded it in as a tab:
        // a role's name and a role's access are one object, and Access
        // Management sitting between the two entries made that unguessable.
        value: "roles",
        label: "Roles",
        href: "/portal/administration/roles",
        group: "Access & identity",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        // The catalog explained, rather than a third view of a role (#1324).
        // A sibling entry rather than a tab on Roles: a tab is another view of
        // one object, and this is about the resources a grant names, not about
        // any one role. It is also the destination the portal help panel
        // points at, which a tab of a tabbed page makes awkward to link.
        value: "permission-reference",
        label: "Permission Reference",
        href: "/portal/administration/permission-reference",
        group: "Access & identity",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        // Renamed from System Settings by #992: nothing on the page was about
        // "the system", and once #990 took Layout, Page visibility and Legal
        // documents to Website, the five that remain are all org-wide
        // defaults and identity. The resource key stays `system_settings` --
        // it is an identifier in role_permissions rows in every environment,
        // not a label.
        value: "organization-settings",
        label: "Organization Settings",
        href: "/portal/administration/organization-settings",
        group: "Organization",
        access: [
          { resource: "administration", level: "manage" },
          { resource: "system_settings", level: "manage" },
        ],
      },
      {
        // Administration rather than Communications: these five replies span
        // events, volunteers, inventory and communications, and what governs
        // the organization as a whole is filed here while feature-local
        // vocabulary stays with its feature (docs/portal-navigation.md).
        //
        // A page of its own rather than a sixth tab on Organization Settings:
        // a tab is another view of one object, and five templates are five
        // objects. Organization Settings -> Notifications still owns the kill
        // switch and the sender identity, and the two cross-link (#1235).
        //
        // `system_settings:manage` alone, matching the table's RLS rather
        // than Organization Settings' wider nav entry, so the sidebar shows
        // this to exactly the people the row-level policies admit.
        value: "automatic-replies",
        label: "Automatic Replies",
        href: "/portal/administration/automatic-replies",
        group: "Organization",
        access: [{ resource: "system_settings", level: "manage" }],
      },
      {
        value: "audit-log",
        label: "Audit Log",
        href: "/portal/administration/audit-log",
        group: "Oversight",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        // #1310. Beside the audit log rather than under Organization, because
        // it answers the same shape of question -- what did the platform do,
        // and when -- and shares its audience. administration:manage is
        // notification_deliveries' own select policy (20260906140000), not a
        // wider gate chosen for the sidebar.
        value: "delivery-log",
        label: "Email Delivery",
        href: "/portal/administration/delivery-log",
        group: "Oversight",
        access: [{ resource: "administration", level: "manage" }],
      },
      // administration:manage rather than a resource of its own: the audience is
      // exactly the one that already reads the audit log and system settings,
      // and a new resources row would add a column to every role's permission
      // matrix without anyone ever setting it differently.
      {
        value: "data-retention",
        label: "Data Retention",
        href: "/portal/administration/data-retention",
        group: "Oversight",
        access: [{ resource: "administration", level: "manage" }],
      },
    ],
  },
] as const;

/**
 * The nav section that owns `pathname`, or undefined when none does. Pages
 * outside the tree (/portal/account, /portal/welcome, the 404) used to fall
 * back to "overview", so the sidebar highlighted Dashboard while the user
 * was somewhere else.
 */
export function activeSectionFor(pathname: string): string | undefined {
  // Two passes, not one interleaved pass: a section that owns the path
  // outright beats one that merely cross-links to it. /portal/people/volunteers
  // is listed under both Volunteers and People, and Volunteers comes first in
  // NAV_ITEMS -- so a single pass would highlight Volunteers for a page that
  // lives in, and is gated by, People.
  for (const item of NAV_ITEMS) {
    const testPath = item.basePath ?? item.href;
    if (pathname === testPath || pathname.startsWith(`${testPath}/`)) {
      return item.value;
    }
  }
  // A section can still cross-link to a page another section owns -- the
  // volunteer directory is listed under Volunteers as well as living under
  // People -- so a sub-item match is the fallback when no basePath claims the
  // path outright.
  for (const item of NAV_ITEMS) {
    if (
      item.subItems?.some(
        (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`),
      )
    ) {
      return item.value;
    }
  }
  return undefined;
}

export function activeSubItemFor(
  pathname: string,
  item: NavItem,
): string | undefined {
  if (!item.subItems) return undefined;
  let best: NavSubItem | undefined;
  for (const sub of item.subItems) {
    if (pathname === sub.href || pathname.startsWith(`${sub.href}/`)) {
      if (!best || sub.href.length > best.href.length) best = sub;
    }
  }
  return best?.value;
}

export type NavGroup<T> = {
  /** Undefined for entries filed under no group. */
  label?: string;
  items: T[];
};

/**
 * Nav entries split into the groups the sidebar renders, in order. Generic
 * because both levels group the same way: sections at the top level (#954)
 * and a section's sub-items below it (#942).
 *
 * Runs are contiguous by construction: a new group starts wherever `group`
 * changes, so an ungrouped list comes back as one unlabelled group and
 * nothing has to special-case it. Callers pass the *already filtered* list
 * from `visibleNavItems`, which is what makes an empty group impossible --
 * a heading only exists if at least one item under it survived.
 */
export function navGroups<T extends { group?: string }>(
  items: readonly T[],
): NavGroup<T>[] {
  const groups: NavGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) {
      last.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }
  return groups;
}

/**
 * The only sections a guest -- no tenant role, per-event grants only (#1688)
 * -- is shown. Every other section's route guard refuses them on its own.
 */
export const GUEST_SECTIONS: readonly string[] = ["events"];

/**
 * The nav tree reduced to what `permissions` can actually reach: sections with
 * no reachable sub-item are dropped, unreachable sub-items are removed, and a
 * section's href is rewritten to its first reachable sub-item.
 */
export function visibleNavItems(
  permissions: PermissionMap,
  lexicon: Lexicon = DEFAULT_VOCABULARY,
  { guest = false }: { guest?: boolean } = {},
): NavItem[] {
  const reachable = (sub: NavSubItem) =>
    hasAnyPermission(permissions, sub.access) &&
    (!sub.alsoRequires || hasAnyPermission(permissions, sub.alsoRequires));

  return NAV_ITEMS.filter((item) => {
    // A guest holds no role, only per-event grants (#1688), so the map would
    // hide Events too and leave Dashboard -- the one page with nothing for
    // them. Their section list is fixed instead.
    if (guest) return GUEST_SECTIONS.includes(item.value);
    if (item.subItems) return item.subItems.some(reachable);
    return !item.access || hasAnyPermission(permissions, item.access);
  }).map((item) => {
    const subItems = item.subItems?.filter(reachable);
    const href =
      subItems &&
      subItems.length > 0 &&
      !subItems.some((s) => s.href === item.href)
        ? subItems[0].href
        : item.href;
    return {
      ...item,
      href,
      // Resolved here rather than at each renderer: the sidebar, the command
      // palette and the section index routes all come through this function,
      // and a template that escaped one of them would print braces (#896).
      label: applyLexicon(item.label, lexicon),
      ...(item.group ? { group: applyLexicon(item.group, lexicon) } : {}),
      subItems:
        subItems && subItems.length > 0
          ? subItems.map((sub) => ({
              ...sub,
              label: applyLexicon(sub.label, lexicon),
              // Group headings are user-facing copy like any other label, so
              // a tenant that renames `{collection}` sees its own word in the
              // heading too rather than braces.
              ...(sub.group ? { group: applyLexicon(sub.group, lexicon) } : {}),
            }))
          : undefined,
    };
  });
}

/**
 * How many destinations the mobile tab bar holds beside its "More" button.
 * Four plus More is five targets across a phone's width, which is as many as
 * stay thumb-sized at 360px.
 */
export const PRIMARY_NAV_LIMIT = 4;

/**
 * The tab bar's entries, from the sections this user can actually reach.
 *
 * Takes `visibleNavItems()`'s output, so entitlements are applied once and the
 * tab bar can never advertise a module a tenant does not have. `primary`
 * sections come first in tree order; if fewer than `limit` of them survive the
 * permission filter -- a treasurer with finance and nothing else -- the rest
 * of the visible tree fills the gap in order, so the bar is never a single
 * lonely Dashboard tab beside More. Ordering within the result stays the
 * tree's, which is what keeps a tab from moving between two people's phones
 * for reasons neither can see.
 */
export function primaryNavItems(
  items: readonly NavItem[],
  limit: number = PRIMARY_NAV_LIMIT,
): NavItem[] {
  const flagged = items.filter((item) => item.primary);
  const rest = items.filter((item) => !item.primary);
  return [...flagged, ...rest].slice(0, limit);
}

/**
 * The first page of `sectionValue` this user can open, or null when they can
 * open none of it. Section index routes redirect here rather than to a
 * hardcoded child, so a bookmark or typed URL lands where the sidebar would.
 */
export function firstAccessibleHref(
  permissions: PermissionMap,
  sectionValue: string,
): string | null {
  const item = visibleNavItems(permissions).find(
    (candidate) => candidate.value === sectionValue,
  );
  return item?.href ?? null;
}

/** One sidebar destination a grant reveals, and the level it takes. */
export type NavPlacement = {
  /** "Finance > Reimbursements", or "Events" for a section with no children. */
  label: string;
  href: string;
  level: PermissionLevel;
};

/**
 * Every sidebar entry this resource reveals (#1324).
 *
 * The permission reference answers "where does this grant show up?" from here
 * rather than from a hand-written list, so the answer cannot drift from the
 * tree the sidebar actually renders. `alsoRequires` is deliberately ignored:
 * it narrows what the sidebar shows, so an entry carrying one is revealed by
 * *less* than `access` alone, which makes `access` the honest answer to what a
 * grant reaches.
 *
 * Labels are lexicon templates, like everything else out of this tree, so a
 * caller resolves them against the tenant's words before printing them.
 */
export function navPlacementsForResource(resource: string): NavPlacement[] {
  const placements: NavPlacement[] = [];

  const add = (
    label: string,
    href: string,
    access: readonly PermissionCheck[],
  ) => {
    for (const check of access) {
      if (check.resource !== resource) continue;
      placements.push({ label, href, level: check.level });
    }
  };

  for (const item of NAV_ITEMS) {
    if (item.access) add(item.label, item.href, item.access);
    for (const sub of item.subItems ?? []) {
      add(`${item.label} > ${sub.label}`, sub.href, sub.access);
    }
  }

  return placements;
}
