import { describe, expect, test } from "bun:test";
import {
  anchorFromPublishAt,
  cadenceLabel,
  occurrenceDate,
  occurrencePublishAt,
  occurrencesFrom,
  seriesState,
  type SeriesSchedule,
} from "./series";

function schedule(overrides: Partial<SeriesSchedule> = {}): SeriesSchedule {
  return {
    cadence: "weekly",
    anchor_date: "2026-11-03",
    publish_time: "09:00:00",
    time_zone: "America/New_York",
    ends_on: null,
    ...overrides,
  };
}

describe("occurrenceDate", () => {
  test("weekly and every 2 weeks repeat the anchor's weekday", () => {
    expect(occurrenceDate(schedule(), 0)).toBe("2026-11-03");
    expect(occurrenceDate(schedule(), 1)).toBe("2026-11-10");
    expect(occurrenceDate(schedule(), 9)).toBe("2027-01-05");
    expect(occurrenceDate(schedule({ cadence: "biweekly" }), 1)).toBe(
      "2026-11-17",
    );
    expect(occurrenceDate(schedule({ cadence: "biweekly" }), 4)).toBe(
      "2026-12-29",
    );
  });

  test("monthly on the 31st takes the last day of a short month and returns after it", () => {
    const monthly = schedule({ cadence: "monthly", anchor_date: "2027-01-31" });
    expect(occurrenceDate(monthly, 1)).toBe("2027-02-28");
    expect(occurrenceDate(monthly, 2)).toBe("2027-03-31");
    expect(occurrenceDate(monthly, 3)).toBe("2027-04-30");
    expect(occurrenceDate(monthly, 13)).toBe("2028-02-29");
  });

  test("monthly crosses the year", () => {
    const monthly = schedule({ cadence: "monthly", anchor_date: "2026-11-14" });
    expect(occurrenceDate(monthly, 2)).toBe("2027-01-14");
    expect(occurrenceDate(monthly, 14)).toBe("2028-01-14");
  });
});

describe("occurrencesFrom", () => {
  test("starts at the first date on or after the given day", () => {
    expect(occurrencesFrom(schedule(), "2026-11-11", 3)).toEqual([
      "2026-11-17",
      "2026-11-24",
      "2026-12-01",
    ]);
    expect(occurrencesFrom(schedule(), "2026-11-10", 1)).toEqual([
      "2026-11-10",
    ]);
  });

  test("never goes before the anchor", () => {
    expect(occurrencesFrom(schedule(), "2026-01-01", 2)).toEqual([
      "2026-11-03",
      "2026-11-10",
    ]);
  });

  test("stops at the end date", () => {
    expect(
      occurrencesFrom(schedule({ ends_on: "2026-11-17" }), "2026-11-01", 5),
    ).toEqual(["2026-11-03", "2026-11-10", "2026-11-17"]);
  });

  test("monthly from far after the anchor", () => {
    const monthly = schedule({ cadence: "monthly", anchor_date: "2026-01-31" });
    expect(occurrencesFrom(monthly, "2027-02-15", 3)).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });
});

describe("occurrencePublishAt", () => {
  test("keeps the wall-clock time across DST", () => {
    // New York leaves daylight time on 2026-11-01.
    const before = schedule({ anchor_date: "2026-10-27" });
    expect(occurrencePublishAt(before, "2026-10-27")).toBe(
      "2026-10-27T13:00:00.000Z",
    );
    expect(occurrencePublishAt(before, "2026-11-03")).toBe(
      "2026-11-03T14:00:00.000Z",
    );
  });
});

describe("anchorFromPublishAt", () => {
  test("reads the day and time in the series' zone", () => {
    // 02:30 UTC on the 4th is still the 3rd in New York.
    expect(
      anchorFromPublishAt("2026-11-04T02:30:00.000Z", "America/New_York"),
    ).toEqual({ anchor_date: "2026-11-03", publish_time: "21:30" });
  });
});

describe("cadenceLabel", () => {
  test("names the weekday or day of month", () => {
    expect(cadenceLabel("weekly", "2026-11-03")).toBe("Weekly on Tuesday");
    expect(cadenceLabel("biweekly", "2026-11-03")).toBe(
      "Every 2 weeks on Tuesday",
    );
    expect(cadenceLabel("monthly", "2026-11-03")).toBe("Monthly on the 3rd");
    expect(cadenceLabel("monthly", "2026-11-11")).toBe("Monthly on the 11th");
    expect(cadenceLabel("monthly", "2026-10-31")).toBe(
      "Monthly on the 31st (or the last day)",
    );
  });
});

describe("seriesState", () => {
  test("ended wins over paused", () => {
    expect(seriesState({ paused_at: null, ended_at: null })).toBe("active");
    expect(seriesState({ paused_at: "x", ended_at: null })).toBe("paused");
    expect(seriesState({ paused_at: "x", ended_at: "y" })).toBe("ended");
  });
});
