// Route discovery for the a11y scan (issue #477).
//
// The scan used to carry a hand-written list of routes. It drifted: the list
// named 70 paths while `src/app` had 92 page.tsx files, so 22 routes had never
// been scanned -- including /portal/login, the one page every user must get
// through. Nobody had done anything wrong; a list maintained by hand simply
// cannot keep up with a route tree this size.
//
// So the list is derived from the filesystem instead. A new page.tsx is scanned
// the day it lands, and the only thing that needs maintaining is the small set
// of deliberate exceptions below.
import { readdirSync } from "node:fs";
import { join } from "node:path";

export type RouteKind = "public" | "portal" | "auth";

export type DiscoveredRoute = {
  /** The route pattern as it appears in the app tree, e.g. /portal/people/[id]. */
  pattern: string;
  kind: RouteKind;
  isDynamic: boolean;
};

/**
 * Routes with no rendered page of their own. Each needs a reason -- "it errors"
 * is not one, that is a finding.
 */
const SKIP: Record<string, string> = {
  "/portal": "redirect shim to /portal/login or /portal/entry",
  "/portal/entry": "redirect shim to /portal/home",
  // The terms, the code of conduct and the accessibility statement are served
  // once a tenant has put them in force, and the seeded tenant this scan runs
  // against has not (#859), so all three 404 here -- scanning them would be
  // three more passes over the same 404 page. The privacy policy has no such
  // gate and is scanned: it is served for every tenant, from the platform's own
  // document when the tenant has published none of its own (#858).
  //
  // If one becomes part of the seed, delete its line rather than leaving a skip
  // that no longer describes anything.
  //
  // The accessibility statement is the uncomfortable one to have here (#1368),
  // since the page saying how this site is tested is the page the scan does not
  // reach. It is scanned by putting it in force by hand -- see
  // `docs/a11y-scan-findings.md` -- and a route that 404s cannot be scanned
  // whatever the subject of its text.
  "/terms": "not in force for the seeded tenant (#859)",
  "/code-of-conduct": "not in force for the seeded tenant (#859)",
  "/accessibility": "not in force for the seeded tenant (#859)",
  // The participant waiver (#686) is skipped for a stronger reason than those
  // three: the platform has no text for it at all, so it 404s for every tenant
  // that has not written and published its own, and no seed can change that
  // without writing somebody's release of legal rights. The agreement is still
  // scanned where it is read -- inside the registration form -- by
  // e2e/event-waiver.spec.ts, which publishes one and takes it away again.
  "/waiver":
    "the platform ships no waiver text, so it 404s until a tenant writes one (#686)",
  // The whole constituent area used to be skipped here, on both sides: five
  // `/my` routes and the staff claims queue, because `constituent_accounts` is
  // the one module in the catalog that defaults to off and the seed had not
  // asked for it. That meant #1161-#1165 shipped a signed-in area with no a11y
  // coverage at all. #1175 turned the module on in `supabase/seed.sql`, which
  // is the change those comments kept asking for: `/my/sign-in` now scans in
  // the anon pass and `/portal/people/claims` in the admin pass.
  //
  // The three routes below stay out of the *anon* pass, for the reason
  // /portal/set-password is out of it: they need a session, and scanned signed
  // out all three redirect to `/my/sign-in`, so the run would measure that one
  // page three times and file the results under three other names. They are not
  // unscanned -- a11y-scan.ts sweeps them as a signed-in account, where they
  // render what they are actually for. Any new signed-in `/my` route belongs
  // in both lists.
  "/my": "needs a session; scanned by the constituent sweep",
  "/my/details": "needs a session; scanned by the constituent sweep",
  "/my/notifications": "needs a session; scanned by the constituent sweep",
};

const APP_DIR = join(import.meta.dirname, "..", "src", "app");

/** Strips Next.js route groups: /portal/(app)/events -> /portal/events. */
function stripRouteGroups(path: string): string {
  return path.replace(/\/\([^)]+\)/g, "") || "/";
}

function walk(dir: string, urlPath: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name === "api") continue;
      // Parallel-route slots (`@name`) have no URL of their own: what they
      // hold is another route's pattern, rendered over the page the visitor
      // is already on. Walking into one would invent paths like
      // /events/@modal/(.)[id] (#847, removed in #1427) that no browser can
      // ask for; an overlay is scanned as a transient surface instead -- see
      // a11y-surfaces.ts.
      if (entry.name.startsWith("@")) continue;
      walk(join(dir, entry.name), `${urlPath}/${entry.name}`, found);
    } else if (entry.name === "page.tsx") {
      found.push(stripRouteGroups(urlPath) || "/");
    }
  }
}

function classify(pattern: string): RouteKind {
  if (pattern === "/portal/login" || pattern === "/portal/set-password") {
    return "auth";
  }
  return pattern.startsWith("/portal") ? "portal" : "public";
}

export function discoverRoutes(): DiscoveredRoute[] {
  const found: string[] = [];
  walk(APP_DIR, "", found);

  return [...new Set(found)]
    .filter((pattern) => !(pattern in SKIP))
    .sort()
    .map((pattern) => ({
      pattern,
      kind: classify(pattern),
      isDynamic: pattern.includes("["),
    }));
}

export const SKIPPED_ROUTES = SKIP;

/**
 * How to turn a dynamic route pattern into a real URL.
 *
 * Most entries name a list page and the shape of the link to follow, so the
 * scan uses whatever the seed actually produced rather than a hard-coded id
 * that goes stale the next time seed.sql changes. That stays the default.
 *
 * A `path` entry is the escape hatch for a route nothing links to. It only
 * works because the record it points at now has a literal id in seed.sql (#665);
 * don't reach for it where a link exists. `expectHeading` is what keeps it
 * honest: following a link proves the record exists, a hard-coded id proves
 * nothing, so a `path` has to name the heading its record renders and the scan
 * checks for it before scanning.
 *
 * A pattern with no resolver is reported as skipped rather than silently
 * dropped.
 */
export type DynamicRouteSource =
  | { listPath: string; linkPattern: RegExp }
  | { path: string; expectHeading: string };

export const DYNAMIC_ROUTE_SOURCES: Record<string, DynamicRouteSource> = {
  "/events/e/[id]": {
    listPath: "/events",
    linkPattern: /^\/events\/e\/[0-9a-f-]{36}$/,
  },
  // The escape hatch this file keeps for a route nothing links to from a
  // listing: the promotion's rules are linked from its *event's* page, and the
  // seeded promotion belongs to a past event the public listing does not show.
  // The giveaway's id is a literal in seed.sql, and `expectHeading` is what
  // keeps that honest.
  "/giveaways/[giveawayId]/rules": {
    path: "/giveaways/babababa-0000-4000-8000-000000000002/rules",
    expectHeading: "Official Rules",
  },
  "/learn/[slug]": {
    listPath: "/learn",
    linkPattern: /^\/learn\/[a-z0-9-]+$/,
  },
  "/publications/[slug]": {
    listPath: "/publications",
    linkPattern: /^\/publications\/[a-z0-9-]+$/,
  },
  "/portal/events/[eventId]": {
    listPath: "/portal/events",
    linkPattern: /^\/portal\/events\/[0-9a-f-]{36}$/,
  },
  // The page is linked from the event's registrants card, which renders its
  // "View all" link client-side and only once the list overflows -- so there
  // is no listing link to follow, and the seeded upcoming event's literal id
  // is used instead. Its registrations make the page render the full table.
  "/portal/events/[eventId]/registrants": {
    path: "/portal/events/cccccccc-0000-4000-8000-000000000001/registrants",
    expectHeading: "Registrants",
  },
  // #1649. Linked only from the Carpools card, which an event lists only with
  // Organize carpools on -- and no seeded event has it on, so this scans the
  // page's switched-off state on the seeded upcoming event.
  "/portal/events/[eventId]/carpools": {
    path: "/portal/events/cccccccc-0000-4000-8000-000000000001/carpools",
    expectHeading: "Carpools",
  },
  "/portal/people/[id]": {
    listPath: "/portal/people",
    linkPattern: /^\/portal\/people\/[0-9a-f-]{36}$/,
  },
  // The queue links every case by its reference, which is what the scan
  // follows. Seeded reports exist on every reset (#687), so there is always
  // one to reach.
  "/portal/conduct/[id]": {
    listPath: "/portal/conduct",
    linkPattern: /^\/portal\/conduct\/[0-9a-f-]{36}$/,
  },
  "/portal/calendar/[itemId]": {
    listPath: "/portal/calendar",
    linkPattern: /^\/portal\/calendar\/[0-9a-f-]{36}$/,
  },
  // The list view links every scheduled post; the seed plans some (#1794).
  "/portal/social/[pieceId]": {
    listPath: "/portal/social?view=list",
    linkPattern: /^\/portal\/social\/[0-9a-f-]{36}$/,
  },
  "/portal/governance/meetings/[meetingId]": {
    listPath: "/portal/governance/meetings",
    linkPattern: /^\/portal\/governance\/meetings\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/donations/[donationId]": {
    listPath: "/portal/inventory/donations",
    linkPattern: /^\/portal\/inventory\/donations\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/distribution/[movementId]": {
    listPath: "/portal/inventory/distribution",
    linkPattern: /^\/portal\/inventory\/distribution\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/items/[itemId]": {
    listPath: "/portal/inventory/items",
    linkPattern: /^\/portal\/inventory\/items\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/requests/[requestId]": {
    listPath: "/portal/inventory/requests",
    linkPattern: /^\/portal\/inventory\/requests\/[0-9a-f-]{36}$/,
  },
  "/portal/website/articles/[id]": {
    listPath: "/portal/website/articles",
    linkPattern:
      /^\/portal\/administration\/site-content\/articles\/[0-9a-f-]{36}$/,
  },
  "/portal/website/publications/[id]": {
    listPath: "/portal/website/publications",
    linkPattern: /^\/portal\/website\/publications\/[0-9a-f-]{36}$/,
  },
  "/portal/technology/assets/[assetId]": {
    listPath: "/portal/technology",
    linkPattern: /^\/portal\/technology\/assets\/[0-9a-f-]{36}$/,
  },
};
