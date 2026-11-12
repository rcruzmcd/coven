import { describe, expect, test } from "bun:test";
import { planSeriesRun, type GeneratorSeries } from "./series-generator";

function series(overrides: Partial<GeneratorSeries> = {}): GeneratorSeries {
  return {
    id: "s1",
    cadence: "weekly",
    anchor_date: "2027-03-02",
    publish_time: "09:00:00",
    time_zone: "America/Denver",
    ends_on: null,
    lead_time_days: 14,
    generated_through: null,
    ...overrides,
  };
}

describe("planSeriesRun (#1840)", () => {
  test("creates every date whose lead time has started, and stops there", () => {
    // 2027-03-02 09:00 MST is 16:00Z; lead 14 days.
    const plan = planSeriesRun(series(), new Date("2027-02-20T00:00:00Z"));
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual(["2027-03-02"]);
    expect(plan.missed).toEqual([]);
    expect(plan.through).toBe("2027-03-02");
  });

  test("the window opens at publish time minus the lead time exactly", () => {
    const open = new Date("2027-02-16T16:00:00Z");
    expect(planSeriesRun(series(), open).through).toBe("2027-03-02");
    const before = new Date(open.getTime() - 1);
    expect(planSeriesRun(series(), before)).toEqual({
      posts: [],
      missed: [],
      through: null,
    });
  });

  test("copies the publish, review and draft dates from the occurrence", () => {
    const [post] = planSeriesRun(
      series({ lead_time_days: 21 }),
      new Date("2027-02-10T00:00:00Z"),
    ).posts;
    expect(post).toEqual({
      occurrence_date: "2027-03-02",
      publish_due_at: "2027-03-02T16:00:00.000Z",
      review_due_at: "2027-02-23T16:00:00.000Z",
      draft_due_at: "2027-02-16T16:00:00.000Z",
    });
  });

  test("keeps the wall-clock time across DST", () => {
    // DST starts 2027-03-14 in Denver: 09:00 is 15:00Z after it.
    const plan = planSeriesRun(
      series({ generated_through: "2027-03-09" }),
      new Date("2027-03-03T00:00:00Z"),
    );
    expect(plan.posts[0]).toMatchObject({
      occurrence_date: "2027-03-16",
      publish_due_at: "2027-03-16T15:00:00.000Z",
    });
  });

  test("starts after generated_through", () => {
    const plan = planSeriesRun(
      series({ generated_through: "2027-03-02" }),
      new Date("2027-02-26T00:00:00Z"),
    );
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual(["2027-03-09"]);
  });

  test.each([
    ["weekly", ["2027-03-02", "2027-03-09"]],
    ["biweekly", ["2027-03-02"]],
    ["monthly", ["2027-03-02"]],
  ] as const)("%s: one post per period in the window", (cadence, dates) => {
    const plan = planSeriesRun(
      series({ cadence }),
      new Date("2027-02-24T00:00:00Z"),
    );
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual([...dates]);
  });

  test("dates whose publish time has passed are missed, not created", () => {
    const plan = planSeriesRun(series(), new Date("2027-03-10T00:00:00Z"));
    expect(plan.missed).toEqual(["2027-03-02", "2027-03-09"]);
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual([
      "2027-03-16",
      "2027-03-23",
    ]);
    expect(plan.through).toBe("2027-03-23");
  });

  test("stops at ends_on", () => {
    const plan = planSeriesRun(
      series({ ends_on: "2027-03-09" }),
      new Date("2027-03-01T00:00:00Z"),
    );
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual([
      "2027-03-02",
      "2027-03-09",
    ]);
  });

  test("a monthly series on the 31st takes a short month's last day", () => {
    const plan = planSeriesRun(
      series({
        cadence: "monthly",
        anchor_date: "2027-01-31",
        generated_through: "2027-01-31",
      }),
      new Date("2027-02-20T00:00:00Z"),
    );
    expect(plan.posts.map((p) => p.occurrence_date)).toEqual(["2027-02-28"]);
  });

  test("an old anchor is bounded per run", () => {
    const plan = planSeriesRun(
      series({ anchor_date: "2000-01-04" }),
      new Date("2027-03-01T00:00:00Z"),
    );
    expect(plan.missed.length + plan.posts.length).toBe(400);
    expect(plan.posts).toEqual([]);
  });
});
