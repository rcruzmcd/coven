import { describe, expect, test } from "bun:test";
import {
  DEFAULT_EVENT_PLAN_TEMPLATE,
  addDaysInZone,
  parseEventPlanTemplate,
  planEventPosts,
} from "./event-plan";

describe("parseEventPlanTemplate", () => {
  test("keeps valid entries and trims titles", () => {
    expect(
      parseEventPlanTemplate([
        { title: " Teaser ", offset_days: -14 },
        { title: "", offset_days: 1 },
        { title: "Half day", offset_days: 0.5 },
        { offset_days: 3 },
        null,
      ]),
    ).toEqual([{ title: "Teaser", offset_days: -14 }]);
  });

  test("falls back to the defaults when nothing usable is stored", () => {
    expect(parseEventPlanTemplate(null)).toEqual([
      ...DEFAULT_EVENT_PLAN_TEMPLATE,
    ]);
    expect(parseEventPlanTemplate([{ title: "x" }])).toEqual([
      ...DEFAULT_EVENT_PLAN_TEMPLATE,
    ]);
  });
});

describe("addDaysInZone", () => {
  test("keeps the wall-clock time across a DST change", () => {
    // 6pm EST on 2026-11-05 is 23:00Z; 7 days earlier is 6pm EDT, 22:00Z.
    expect(
      addDaysInZone("2026-11-05T23:00:00.000Z", -7, "America/New_York"),
    ).toBe("2026-10-29T22:00:00.000Z");
    // And forward over the spring change: 6pm EST -> 6pm EDT.
    expect(
      addDaysInZone("2027-03-12T23:00:00.000Z", 2, "America/New_York"),
    ).toBe("2027-03-14T22:00:00.000Z");
  });

  test("a zero offset keeps the instant in the hour DST repeats", () => {
    // 1:30am on 2026-11-01 happens twice in New York; this is the second (EST).
    expect(
      addDaysInZone("2026-11-01T06:30:00.000Z", 0, "America/New_York"),
    ).toBe("2026-11-01T06:30:00.000Z");
  });

  test("counts days in the zone, not in UTC", () => {
    // 8pm Pacific on 1 Dec is 04:00Z on 2 Dec; the day before is 8pm on 30 Nov.
    expect(
      addDaysInZone("2026-12-02T04:00:00.000Z", -1, "America/Los_Angeles"),
    ).toBe("2026-12-01T04:00:00.000Z");
  });

  test("rolls across month and year boundaries", () => {
    expect(addDaysInZone("2027-01-10T15:00:00.000Z", -30, "UTC")).toBe(
      "2026-12-11T15:00:00.000Z",
    );
  });
});

describe("planEventPosts", () => {
  const base = {
    template: DEFAULT_EVENT_PLAN_TEMPLATE,
    startsAt: "2026-11-05T23:00:00.000Z",
    timeZone: "America/New_York",
    leadTimeDays: 21,
    existingTitles: [] as string[],
  };

  test("lays the template out from the event start", () => {
    const plan = planEventPosts(base);
    expect(plan.map((post) => [post.title, post.publishDueAt])).toEqual([
      ["Announce", "2026-10-06T22:00:00.000Z"],
      ["Reminder", "2026-10-29T22:00:00.000Z"],
      ["Last call", "2026-11-04T23:00:00.000Z"],
      ["Day-of", "2026-11-05T23:00:00.000Z"],
      ["Recap / thank-you", "2026-11-07T23:00:00.000Z"],
    ]);
    // Draft and review count back by the lead time: 21 -> T-14, T-7.
    const dayOf = plan[3];
    expect(dayOf.draftDueAt).toBe("2026-10-22T23:00:00.000Z");
    expect(dayOf.reviewDueAt).toBe("2026-10-29T23:00:00.000Z");
  });

  test("marks titles the event already has, ignoring case and spaces", () => {
    const plan = planEventPosts({
      ...base,
      existingTitles: [" reminder", "DAY-OF"],
    });
    expect(
      plan.filter((post) => post.exists).map((post) => post.title),
    ).toEqual(["Reminder", "Day-of"]);
  });

  test("plans a repeated template title once", () => {
    const plan = planEventPosts({
      ...base,
      template: [
        { title: "Teaser", offset_days: -3 },
        { title: "teaser", offset_days: -2 },
      ],
    });
    expect(plan).toHaveLength(1);
  });
});

describe("addDaysInZone across a midnight DST gap", () => {
  test("a day before 00:30 on 7 Sep 2026 in Santiago stays on 6 Sep", () => {
    // 6 Sep 00:30 does not exist there; it moves forward to 01:30, not back
    // to 23:30 on the 5th.
    const startsAt = "2026-09-07T03:30:00.000Z"; // 00:30 -03
    const due = addDaysInZone(startsAt, -1, "America/Santiago");
    expect(due).toBe("2026-09-06T04:30:00.000Z");
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        dateStyle: "short",
      }).format(new Date(due)),
    ).toBe("2026-09-06");
  });
});
