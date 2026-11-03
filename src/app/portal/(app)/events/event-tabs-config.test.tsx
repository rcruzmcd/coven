// Which cards the event detail page offers, and to whom (#903).
//
// The card catalog used to be a module-level constant holding all seventeen
// cards, and four of them read another section's tables: Expenses and Revenue
// on `event_expenses` / `event_revenue`, Donations on `finance`, Distributions
// on `inventory`. Their server actions always refused a reader without that
// access, so the cards simply came back empty -- and once #900 put
// `event_expenses` and `event_revenue` in the **Finance** module, a tenant that
// was never sold Finance got an Expenses card and an "Add expense" button that
// could not work. This file is the guard on that.
import { describe, expect, test } from "bun:test";
import { EVENT_ACCESS_AREAS, type EventGrant } from "@/lib/auth/event-access";
import type { PermissionLevel, PermissionMap } from "@/lib/auth/permissions";
import {
  EVENT_GROUPS,
  LEGACY_PHASE_CARDS,
  LEGACY_TAB_VALUES,
  LOCKED_ON_REPORT_SUBMIT_TABS,
  TAB_CONFIG,
  eventGroups,
  type EventGroupOptions,
  type TabValue,
} from "./event-tabs-config";

/** Everything the catalog knows about, at `manage`. */
const FULL_ACCESS: PermissionMap = Object.fromEntries(
  [
    "events",
    "finance",
    "event_expenses",
    "event_revenue",
    "sales",
    "inventory",
    "inventory_reports",
    "person_answers",
  ].map((resource) => [resource, "manage" as PermissionLevel]),
);

function without(...resources: string[]): PermissionMap {
  const map = { ...FULL_ACCESS };
  for (const resource of resources) map[resource] = "none";
  return map;
}

function cards(
  permissions: PermissionMap,
  options: EventGroupOptions = {
    carpoolsEnabled: true,
    hasPlaceQuestion: true,
    hasSnapshotQuestion: true,
  },
): TabValue[] {
  return eventGroups(permissions, options).flatMap((group) =>
    group.tabs.map((tab) => tab.value),
  );
}

function titles(permissions: PermissionMap): string[] {
  return eventGroups(permissions).flatMap((group) =>
    group.tabs.map((tab) => tab.label),
  );
}

describe("eventGroups", () => {
  test("Carpools is listed only on an event that organizes them (#1649)", () => {
    expect(cards(FULL_ACCESS, {})).not.toContain("carpools");
    expect(cards(FULL_ACCESS, { carpoolsEnabled: false })).not.toContain(
      "carpools",
    );
    expect(cards(FULL_ACCESS, { carpoolsEnabled: true })).toContain("carpools");
  });

  test("Where registrants come from is listed only with a place question (#1701)", () => {
    expect(cards(FULL_ACCESS, {})).not.toContain("places");
    expect(cards(FULL_ACCESS, { hasPlaceQuestion: true })).toContain("places");
  });

  test("Profile answers is listed only with a snapshotted question and person_answers:view (#1745)", () => {
    expect(cards(FULL_ACCESS, {})).not.toContain("answers");
    expect(cards(FULL_ACCESS, { hasSnapshotQuestion: true })).toContain(
      "answers",
    );
    expect(
      cards(
        { ...FULL_ACCESS, person_answers: "none" },
        { hasSnapshotQuestion: true },
      ),
    ).not.toContain("answers");
  });

  test("an admin holding everything gets every card in the catalog", () => {
    expect(cards(FULL_ACCESS)).toEqual(TAB_CONFIG.map((entry) => entry.value));
  });

  test("Finance off takes the Expenses, Revenue and Sales cards", () => {
    // The four resources a tenant loses when the Finance module is disabled --
    // `sales` joined them in #907: my_permissions() reports `none` for each,
    // whatever the matrix says.
    const visible = cards(
      without("finance", "event_expenses", "event_revenue", "sales"),
    );

    expect(visible).not.toContain("expenses");
    expect(visible).not.toContain("revenue");
    expect(visible).not.toContain("sales");

    // And nothing else moves -- the event's own cards are untouched. In-kind
    // donations are inventory too, so their card stays (#1572).
    expect(visible).toContain("donations");
    expect(visible).toContain("overview");
    expect(visible).toContain("results");
    expect(visible).toContain("distributions");
  });

  test("Inventory off takes the Distributions card and leaves the rest", () => {
    const visible = cards(without("inventory", "inventory_reports"));
    expect(visible).not.toContain("distributions");
    // Finance alone still reads the Donations card.
    expect(visible).toContain("donations");
    expect(visible).toContain("giveaway");
    expect(visible).toContain("expenses");
  });

  test("without Finance or Inventory there is no Donations card", () => {
    const visible = cards(without("finance", "inventory", "inventory_reports"));
    expect(visible).not.toContain("donations");
  });

  test("either half of a two-resource gate is enough", () => {
    // Distributions matches listEventDistributionsAction, which takes
    // inventory:manage OR inventory_reports:view. A board member holding only
    // the read-only report permission still gets the card.
    expect(cards(without("inventory"))).toContain("distributions");
  });

  test("every group the rail lists has at least one card in it", () => {
    // A reader with nothing but the events access the route layout requires.
    const eventsOnly: PermissionMap = { events: "view" };
    for (const group of eventGroups(eventsOnly)) {
      expect(group.tabs.length).toBeGreaterThan(0);
    }
    // Money holds only Finance cards, so it drops out rather than standing
    // empty; every other group keeps an ungated card.
    expect(eventGroups(eventsOnly).map((group) => group.key)).toEqual([
      "overview",
      "guests",
      "team",
      "goods",
      "operations",
      "results",
    ]);
  });

  test("lists the catalog in group order", () => {
    // eventGroups() walks EVENT_GROUPS, so a card listed out of its group's
    // place in TAB_CONFIG would still render in order -- but `visible[0]` and
    // FORM_TAB_VALUES read the catalog's own order, so keep the two aligned.
    const order = EVENT_GROUPS.map((group) => group.key);
    const positions = TAB_CONFIG.map((entry) => order.indexOf(entry.group));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("lands each legacy ?phase= link on a card every reader can see", () => {
    const visible = cards({ events: "view" });
    for (const card of Object.values(LEGACY_PHASE_CARDS)) {
      expect(visible).toContain(card);
    }
  });

  test("Report and Impact are one Results card, and old links land on it", () => {
    // #1588: one card, with both old values pointing at it.
    const visible = cards({ events: "view" });
    expect(visible).toContain("results");
    expect(visible).not.toContain("report" as TabValue);
    expect(visible).not.toContain("impact" as TabValue);
    expect(LEGACY_TAB_VALUES.report).toBe("results");
    expect(LEGACY_TAB_VALUES.impact).toBe("results");
    // Submitting the report locks all of it, Outcomes included.
    expect(LOCKED_ON_REPORT_SUBMIT_TABS.has("results")).toBe(true);
  });

  test("carries each card's display title, not its bare catalog label", () => {
    // The rail row and the card heading it opens have to read the same, and
    // "Overview" is also the group heading above it.
    const shown = titles(FULL_ACCESS);
    expect(shown).toContain("Event details");
  });

  test("splits Registration out of Planning (#1778)", () => {
    const shown = titles(FULL_ACCESS);
    expect(shown).toContain("Planning");
    expect(shown).toContain("Registration");
    expect(shown).not.toContain("Registration & planning");

    const entry = (value: TabValue) =>
      TAB_CONFIG.find((candidate) => candidate.value === value)!;
    for (const value of ["planning", "registration"] as const) {
      expect(entry(value).group).toBe("overview");
      expect(entry(value).kind).toBe("form");
      expect(entry(value).area).toBe("details");
      expect(LOCKED_ON_REPORT_SUBMIT_TABS.has(value)).toBe(true);
    }
    expect(entry("planning").keywords).toEqual(["budget", "lead"]);
    for (const keyword of ["deadline", "capacity", "questions"]) {
      expect(entry("registration").keywords).toContain(keyword);
    }
    // Old ?phase=planning links still open Planning.
    expect(LEGACY_PHASE_CARDS.planning).toBe("planning");
  });

  test("moves the settings off Registration onto their cards (#1777)", () => {
    const entry = (value: TabValue) =>
      TAB_CONFIG.find((candidate) => candidate.value === value)!;
    const emails = entry("registrant-emails");
    expect(emails.group).toBe("guests");
    expect(emails.kind).toBe("form");
    expect(emails.area).toBe("details");
    expect(LOCKED_ON_REPORT_SUBMIT_TABS.has("registrant-emails")).toBe(true);
    expect(emails.keywords).toEqual(["reminder", "confirmation"]);
    for (const keyword of ["reminder", "confirmation"]) {
      expect(entry("registration").keywords).not.toContain(keyword);
    }
    for (const value of ["carpools"] as const) {
      expect(entry(value).settingsActions).toBeDefined();
    }
  });

  test("every declared keyword is lowercase and non-empty", () => {
    // The rail lowercases the query once and compares; a capitalised keyword
    // would simply never match.
    for (const entry of TAB_CONFIG) {
      for (const keyword of entry.keywords ?? []) {
        expect(keyword).toBe(keyword.toLowerCase());
        expect(keyword.trim()).not.toBe("");
      }
    }
  });
});

// A guest holds no role, only a grant on the event (#1688): the cards are the
// ones its areas cover, and only a `manage` grant edits them.
describe("eventGroups for a guest's grant", () => {
  const NO_ROLE: PermissionMap = {};

  function guestSections(level: "view" | "manage", areas: EventGrant["areas"]) {
    return eventGroups(
      NO_ROLE,
      { carpoolsEnabled: true },
      { event_id: "event-1", level, areas },
    ).flatMap((group) => group.tabs);
  }

  test("shows exactly the cards in the granted areas", () => {
    const shown = guestSections("view", ["details", "registrations"]).map(
      (section) => section.value,
    );
    expect(shown).toEqual(
      TAB_CONFIG.filter(
        (entry) => entry.area === "details" || entry.area === "registrations",
      ).map((entry) => entry.value),
    );
    expect(shown).not.toContain("expenses");
    expect(shown).not.toContain("staff");
  });

  test("a view grant edits nothing, a manage grant edits its cards", () => {
    expect(
      guestSections("view", ["details"]).some((section) => section.canManage),
    ).toBe(false);
    expect(
      guestSections("manage", ["details"]).every(
        (section) => section.canManage,
      ),
    ).toBe(true);
  });

  test("card settings take a manage grant on details, the area of events (#1777)", () => {
    const settingsOf = (areas: EventGrant["areas"]) =>
      Object.fromEntries(
        guestSections("manage", areas).map((section) => [
          section.value,
          section.canManageSettings,
        ]),
      );
    // Manages the registrants list, but RLS does not let it write the event.
    expect(settingsOf(["registrations"])).toMatchObject({
      carpools: false,
    });
    expect(settingsOf(["registrations", "details", "sponsors"])).toMatchObject({
      carpools: true,
      // No settings dialog to show.
      attendance: false,
    });
    expect(
      guestSections("view", ["registrations", "details"]).some(
        (section) => section.canManageSettings,
      ),
    ).toBe(false);
  });

  test("no grant and no role shows nothing", () => {
    expect(eventGroups(NO_ROLE)).toEqual([]);
  });

  test("a role holder's cards keep the role's edit level beside a grant", () => {
    const sections = eventGroups(
      without("event_expenses"),
      {},
      { event_id: "event-1", level: "view", areas: ["expenses"] },
    ).flatMap((group) => group.tabs);
    expect(sections.find((s) => s.value === "expenses")?.canManage).toBe(true);
  });
});

// Who has access to an event is for its coordinators and administrators
// (#1689); no grant ever shows the card, whatever its areas.
describe("the Access card", () => {
  test("events: manage or administration: manage sees it, events: view does not", () => {
    expect(cards({ events: "manage" })).toContain("access");
    expect(cards({ events: "view", administration: "manage" })).toContain(
      "access",
    );
    expect(cards({ events: "view" })).not.toContain("access");
  });

  test("a guest never sees it, even holding every area at manage", () => {
    const shown = eventGroups(
      {},
      {},
      { event_id: "event-1", level: "manage", areas: [...EVENT_ACCESS_AREAS] },
    ).flatMap((group) => group.tabs.map((tab) => tab.value));
    expect(shown).not.toContain("access");
  });
});
