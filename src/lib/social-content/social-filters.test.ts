import { describe, expect, test } from "bun:test";
import {
  activeSocialFilterCount,
  parseSocialFilters,
  socialHref,
} from "./social-filters";

const NOW = new Date(2026, 10, 10);
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";

function paramsOf(href: string) {
  return Object.fromEntries(new URL(href, "https://x.test").searchParams);
}

describe("parseSocialFilters", () => {
  test("defaults to this month's grid with nothing narrowed", () => {
    expect(parseSocialFilters({}, NOW)).toEqual({
      view: "month",
      month: "2026-11",
      status: "all",
      owner: "all",
      reviewer: "all",
      linkedTo: "all",
      event: "all",
      overlay: false,
    });
  });

  test("drops values it does not recognise rather than erroring", () => {
    const filters = parseSocialFilters(
      {
        view: "agenda",
        month: "2026-13",
        status: "bogus",
        owner: "not-a-uuid",
        linked: "elsewhere",
        event: "nope",
      },
      NOW,
    );
    expect(filters).toMatchObject({
      view: "month",
      month: "2026-11",
      status: "all",
      owner: "all",
      linkedTo: "all",
      event: "all",
    });
  });

  test("naming one event implies linked to an event", () => {
    const filters = parseSocialFilters(
      { linked: "standalone", event: EVENT_ID },
      NOW,
    );
    expect(filters.linkedTo).toBe("event");
    expect(filters.event).toBe(EVENT_ID);
  });

  test("keeps 'none' for owner and reviewer", () => {
    const filters = parseSocialFilters(
      { owner: "none", reviewer: PERSON_ID },
      NOW,
    );
    expect(filters.owner).toBe("none");
    expect(filters.reviewer).toBe(PERSON_ID);
  });
});

describe("socialHref", () => {
  // What makes filters survive a reload: the URL written is the URL read.
  test("round-trips through parseSocialFilters", () => {
    const filters = parseSocialFilters(
      {
        view: "list",
        month: "2027-02",
        status: "in_review",
        owner: PERSON_ID,
        reviewer: "none",
        event: EVENT_ID,
        overlay: "1",
      },
      NOW,
    );
    expect(parseSocialFilters(paramsOf(socialHref(filters)), NOW)).toEqual(
      filters,
    );
  });

  test("writes only what differs from the defaults, plus the month", () => {
    expect(socialHref(parseSocialFilters({}, NOW))).toBe(
      "/portal/social?month=2026-11",
    );
    expect(
      paramsOf(socialHref(parseSocialFilters({ linked: "standalone" }, NOW))),
    ).toEqual({ month: "2026-11", linked: "standalone" });
  });
});

test("activeSocialFilterCount counts the narrowing filters, not view or overlay", () => {
  expect(
    activeSocialFilterCount(
      parseSocialFilters({ view: "list", overlay: "1" }, NOW),
    ),
  ).toBe(0);
  expect(
    activeSocialFilterCount(
      parseSocialFilters({ status: "draft", event: EVENT_ID }, NOW),
    ),
  ).toBe(2);
});
