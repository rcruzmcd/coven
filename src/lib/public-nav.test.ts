import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NAV_SETTINGS,
  LEGAL_LINKS,
  NAV_GROUPS,
  NAV_LABEL_MAX_LENGTH,
  resolveNavSettings,
  isHrefVisible,
  isSlotVisible,
  slotsForHref,
  visibleGroups,
} from "./public-nav";
import { PUBLIC_PAGE_SLOTS } from "./page-visibility";
import { DEFAULT_LEXICON } from "./lexicon";

/**
 * The four sections the board had hidden when this nav was reworked, plus the
 * three that make up the Product group (#1328, #1329, #1330) -- those are off
 * for every tenant that has not deliberately turned them on, so a realistic
 * "reduced nav" has them out too, and the group itself with them. Publications
 * (#1471) is off by default the same way.
 */
const HIDDEN = [
  "about",
  "programs",
  "learn",
  "support",
  "audiences",
  "modules",
  "pricing",
  "publications",
];

describe("NAV_GROUPS", () => {
  test("every group's slot is a registered page-visibility slot", () => {
    const registered = new Set(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));

    for (const group of NAV_GROUPS) {
      if (!group.slot) continue;
      expect(
        registered.has(group.slot),
        `${group.label} -> ${group.slot}`,
      ).toBe(true);
    }
  });

  /**
   * Slots whose page is deliberately not a nav destination, and is reached
   * some other way. Listing them by name keeps this test doing its real job --
   * catching a section that fell out of the nav by accident -- while recording
   * that these did not.
   *
   * `brand` is the footer's Resources link, cross-linked from Become a Partner
   * and Sponsorship (#845). Its value is its URL: it gets pasted into an email
   * to a sponsor or a print shop, not browsed to, and a header entry for it
   * would compete with Events and Programs for no one's benefit.
   *
   * `links` is reached from a social profile's bio and nowhere else (#937). It
   * is a stack of buttons to About, Events and Support, so a nav entry for it
   * would be a menu item offering the menu -- and the page itself deliberately
   * renders outside the `(public)` layout so that its visitors do not get the
   * header nav either.
   */
  const REACHED_OUTSIDE_THE_NAV = new Set(["brand", "links"]);

  // The nav and the footer render from this one list, so a section missing here
  // is missing from both. The old footer had its own list and had already
  // drifted -- it was missing About and Learn.
  test("every registered slot appears in the nav", () => {
    // Sub-links carry slots too since the sizing guide got its own, so a slot
    // counts as present whether it gates a group or one item inside one.
    const inNav = new Set(
      [
        ...NAV_GROUPS.map((group) => group.slot),
        ...NAV_GROUPS.flatMap((group) =>
          (group.links ?? []).map((link) => link.slot),
        ),
      ].filter(Boolean),
    );

    for (const slot of PUBLIC_PAGE_SLOTS) {
      if (REACHED_OUTSIDE_THE_NAV.has(slot.key)) continue;
      expect(inNav.has(slot.key), `${slot.key} missing from NAV_GROUPS`).toBe(
        true,
      );
    }
  });

  test("every sub-link slot is a registered page-visibility slot", () => {
    const registered = new Set(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));

    for (const group of NAV_GROUPS) {
      for (const link of group.links ?? []) {
        if (!link.slot) continue;
        expect(
          registered.has(link.slot),
          `${group.label} > ${link.label} -> ${link.slot}`,
        ).toBe(true);
      }
    }
  });

  test("every group has a landing page href", () => {
    for (const group of NAV_GROUPS) {
      expect(group.href.startsWith("/"), group.label).toBe(true);
    }
  });

  // A NavigationMenuTrigger opens its panel instead of navigating, so a group
  // whose landing page is a distinct page needs it listed as a child or the
  // page is unreachable from the nav. /about and /inventory are exempt: both
  // redirect to a child that is already listed.
  test("a dropdown group reaches its own landing page", () => {
    const redirectsToAChild = ["/about", "/inventory"];

    for (const group of NAV_GROUPS) {
      if (!group.links || redirectsToAChild.includes(group.href)) continue;
      const hrefs = group.links.map((link) => link.href);
      expect(hrefs, `${group.label} never links to ${group.href}`).toContain(
        group.href,
      );
    }
  });

  test("no group links to the same page twice", () => {
    for (const group of NAV_GROUPS) {
      if (!group.links) continue;
      const hrefs = group.links.map((link) => link.href);
      expect(new Set(hrefs).size, `${group.label} has duplicate hrefs`).toBe(
        hrefs.length,
      );
    }
  });

  // The four #anchor entries into /inventory/donate presented one page as four
  // destinations; collapsing them is why the Gear menu is three items.
  test("no group links to a fragment of another page", () => {
    for (const group of NAV_GROUPS) {
      for (const link of group.links ?? []) {
        expect(link.href, `${group.label} > ${link.label}`).not.toContain("#");
      }
    }
  });

  test("Home is not a nav item -- the logo already links there", () => {
    expect(NAV_GROUPS.some((group) => group.href === "/home")).toBe(false);
  });
});

describe("visibleGroups", () => {
  test("returns every group when nothing is hidden", () => {
    expect(visibleGroups([])).toHaveLength(NAV_GROUPS.length);
  });

  test("drops the groups the board has hidden", () => {
    const labels = visibleGroups(HIDDEN).map((group) => group.label);

    // "Items" rather than "Gear": the group is named from the lexicon (#896),
    // and this call passes none, so it reads the platform's own word.
    expect(labels).toEqual(["Events", "Items", "Get Involved", "Contact"]);
  });

  // The reduced nav still has to reach the section landing pages.
  test("keeps the overview link when a group survives filtering", () => {
    const getInvolved = visibleGroups(HIDDEN).find(
      (group) => group.label === "Get Involved",
    );

    expect(getInvolved?.links?.map((link) => link.href)).toContain(
      "/get-involved",
    );
  });

  test("drops a group whose sub-links are all hidden", () => {
    const groups = visibleGroups([]).map((group) => ({ ...group }));
    expect(groups.some((group) => group.links?.length === 0)).toBe(false);
  });

  /**
   * The Product group is the one whose children carry different slots (#1329):
   * the module tour, the two audience paths and the price list are switched on
   * separately. Its `href` is the tour's route, and the footer links that href
   * while the mobile sheet makes it the group heading's target -- so a group
   * that survives filtering because *some* child did has to land on that child
   * rather than on the page the board hid.
   */
  test("repoints a group's landing page at a child that survived", () => {
    const groups = visibleGroups(["modules", "pricing"]);
    const product = groups.find((group) => group.label === "Product");

    expect(product?.href).toBe("/nonprofits");
    expect(product?.links?.map((link) => link.href)).toEqual([
      "/nonprofits",
      "/business",
    ]);
  });

  test("leaves a landing page alone while its own page is live", () => {
    const product = visibleGroups(["pricing"]).find(
      (group) => group.label === "Product",
    );

    expect(product?.href).toBe("/modules");
  });

  // /about and /inventory redirect to a child rather than being one of them, so
  // there is nothing to repoint: the landing page is live exactly when the
  // group is.
  test("leaves a redirecting group's landing page alone", () => {
    const about = visibleGroups(["gears-sizing"]).find(
      (group) => group.label === "About",
    );

    expect(about?.href).toBe("/about");
  });

  test("does not mutate NAV_GROUPS", () => {
    const before = JSON.stringify(NAV_GROUPS);
    visibleGroups(HIDDEN);
    expect(JSON.stringify(NAV_GROUPS)).toBe(before);
  });
});

describe("LEGAL_LINKS", () => {
  test("links to the privacy policy and the terms of use", () => {
    const hrefs = LEGAL_LINKS.map((link) => link.href);
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/terms");
  });

  // The whole point of these links is that the board can't hide them and the
  // header doesn't carry them -- a slot, or a duplicate NAV_GROUPS entry,
  // would undo one or the other.
  test("carries no visibility slot", () => {
    for (const link of LEGAL_LINKS) {
      expect(link.slot, link.label).toBeUndefined();
    }
  });

  test("does not duplicate a nav destination", () => {
    const navHrefs = new Set([
      ...NAV_GROUPS.map((group) => group.href),
      ...NAV_GROUPS.flatMap((group) =>
        (group.links ?? []).map((link) => link.href),
      ),
    ]);

    for (const link of LEGAL_LINKS) {
      expect(
        navHrefs.has(link.href),
        `${link.label} is already in the nav`,
      ).toBe(false);
    }
  });
});

describe("slotsForHref", () => {
  test("resolves a section landing page and its children to that slot", () => {
    expect(slotsForHref("/programs")).toEqual(["programs"]);
    expect(slotsForHref("/learn/getting-started")).toEqual(["learn"]);
    expect(slotsForHref("/inventory")).toEqual(["gears"]);
  });

  // The sizing guide lives under Gear and has its own slot, so it depends on
  // both -- hiding either has to take the link with it.
  test("returns a nested slot alongside its parent", () => {
    expect(slotsForHref("/inventory/sizing").sort()).toEqual([
      "gears",
      "gears-sizing",
    ]);
  });

  // A prefix match on the raw string would put /inventory-something under /inventory.
  test("matches on path segments, not on string prefixes", () => {
    expect(slotsForHref("/inventory-and-more")).toEqual([]);
  });

  test("an in-page anchor and an ungated route belong to no slot", () => {
    expect(slotsForHref("#buying-vs-renting")).toEqual([]);
    expect(slotsForHref("/privacy")).toEqual([]);
  });
});

describe("isHrefVisible", () => {
  test("keeps a link into a live section", () => {
    expect(isHrefVisible(HIDDEN, "/inventory/sizing")).toBe(true);
  });

  test("drops a link into a hidden section", () => {
    expect(isHrefVisible(HIDDEN, "/programs")).toBe(false);
    expect(isHrefVisible(HIDDEN, "/learn/gear-care")).toBe(false);
  });

  test("drops a link whose own slot is hidden even though its parent is live", () => {
    expect(isHrefVisible(["gears-sizing"], "/inventory/sizing")).toBe(false);
    expect(isHrefVisible(["gears-sizing"], "/inventory")).toBe(true);
  });

  test("drops a link whose parent section is hidden even though its own slot is live", () => {
    expect(isHrefVisible(["gears"], "/inventory/sizing")).toBe(false);
  });

  test("never drops an anchor or an ungated route", () => {
    expect(isHrefVisible(HIDDEN, "#used-and-secondhand-gear")).toBe(true);
    expect(isHrefVisible(HIDDEN, "/privacy")).toBe(true);
  });
});

describe("isSlotVisible", () => {
  test("gates the header CTA on the section it points at", () => {
    expect(isSlotVisible(HIDDEN, "events")).toBe(true);
    expect(isSlotVisible([...HIDDEN, "events"], "events")).toBe(false);
  });
});

describe("resolveNavSettings (#1726)", () => {
  const defaultOrder = NAV_GROUPS.map((group) => group.href);

  test("no row, or anything not the stored shape, is today's menu", () => {
    for (const value of [undefined, null, 3, "x", [], { order: "nope" }]) {
      expect(resolveNavSettings(value)).toEqual(DEFAULT_NAV_SETTINGS);
    }
    expect(DEFAULT_NAV_SETTINGS.order).toEqual(defaultOrder);
  });

  test("drops unknown and repeated keys, appends missing groups in default order", () => {
    const { order } = resolveNavSettings({
      order: ["/contact", "/nowhere", "/contact", 7, "/events"],
    });
    expect(order).toEqual([
      "/contact",
      "/events",
      ...defaultOrder.filter(
        (href) => href !== "/contact" && href !== "/events",
      ),
    ]);
  });

  test("keeps only known, non-empty labels, trimmed and capped", () => {
    const { labels } = resolveNavSettings({
      labels: {
        "/events": "  What's on  ",
        "/learn": "   ",
        "/nowhere": "Ghost",
        "/contact": 5,
        "/about": "x".repeat(NAV_LABEL_MAX_LENGTH + 10),
      },
    });
    expect(labels).toEqual({
      "/events": "What's on",
      "/about": "x".repeat(NAV_LABEL_MAX_LENGTH),
    });
  });
});

describe("visibleGroups with a tenant menu (#1726)", () => {
  test("no settings renders NAV_GROUPS unchanged", () => {
    expect(visibleGroups([])).toEqual(
      visibleGroups([], DEFAULT_LEXICON, DEFAULT_NAV_SETTINGS),
    );
  });

  test("follows the stored order and labels, still filtering hidden slots", () => {
    const nav = resolveNavSettings({
      order: ["/contact", "/events", "/about"],
      labels: { "/events": "Calendar", "/contact": "Say hi" },
    });
    const groups = visibleGroups(["about"], DEFAULT_LEXICON, nav);
    expect(groups.slice(0, 2).map((group) => group.label)).toEqual([
      "Say hi",
      "Calendar",
    ]);
    expect(groups.some((group) => group.href === "/about")).toBe(false);
    // Children are untouched.
    expect(groups[1].links?.map((link) => link.href)).toEqual([
      "/events",
      "/events/community",
    ]);
  });

  test("a tenant label still goes through the lexicon", () => {
    const nav = resolveNavSettings({
      labels: { "/inventory": "Borrow {item_plural}" },
    });
    const lexicon = { ...DEFAULT_LEXICON, item_plural: "Tools" };
    const group = visibleGroups([], lexicon, nav).find(
      (entry) => entry.href === "/inventory",
    );
    expect(group?.label).toBe("Borrow Tools");
  });
});
