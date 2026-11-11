import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  daysInMonth,
  eventTiming,
  formatDueRelative,
  isEventActiveToday,
  localDayKey,
  monthGridDays,
  todayInZone,
  utcDateFromIsoDay,
  zonedWallTimeToUtcIso,
} from "@/lib/time";

describe("formatDueRelative", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  test("reports a same-day due date as due today", () => {
    expect(formatDueRelative("2026-08-24T18:00:00Z", now)).toBe("Due today");
  });

  test("reports a future due date in days", () => {
    expect(formatDueRelative("2026-08-27T12:00:00Z", now)).toBe(
      "Due in 3 days",
    );
  });

  test("singularizes a one-day-out due date", () => {
    expect(formatDueRelative("2026-08-25T12:00:00Z", now)).toBe("Due in 1 day");
  });

  test("reports a past due date as overdue", () => {
    expect(formatDueRelative("2026-08-20T12:00:00Z", now)).toBe(
      "4 days overdue",
    );
  });

  test("singularizes a one-day overdue date", () => {
    expect(formatDueRelative("2026-08-23T12:00:00Z", now)).toBe(
      "1 day overdue",
    );
  });
});

describe("isEventActiveToday", () => {
  test("matches an event starting today in its own timezone", () => {
    const now = new Date("2026-08-23T18:00:00Z");
    const event = {
      starts_at: "2026-08-23T15:00:00Z",
      ends_at: "2026-08-23T20:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("respects the event's own timezone for 'today', not UTC", () => {
    // 2026-08-23T02:00:00Z is 2026-08-22 evening in America/Los_Angeles.
    const now = new Date("2026-08-23T02:00:00Z");
    const event = {
      starts_at: "2026-08-22T22:00:00-07:00",
      ends_at: null,
      timezone: "America/Los_Angeles",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("stays active for a multi-day event that started yesterday", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-21T10:00:00Z",
      ends_at: "2026-08-25T10:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("excludes a future event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-25T10:00:00Z",
      ends_at: "2026-08-25T18:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("excludes a past event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-20T10:00:00Z",
      ends_at: "2026-08-20T18:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("falls back to UTC instead of throwing on a malformed timezone", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-23T10:00:00Z",
      ends_at: null,
      timezone: "Not/AZone",
    };
    expect(() => isEventActiveToday(event, now)).not.toThrow();
    expect(isEventActiveToday(event, now)).toBe(true);
  });
});

describe("eventTiming", () => {
  const now = new Date("2026-08-24T18:00:00Z");
  const zone = "America/Denver";

  test("an event that has ended is past", () => {
    const event = {
      starts_at: "2026-08-24T14:00:00Z",
      ends_at: "2026-08-24T16:00:00Z",
      timezone: zone,
    };
    expect(eventTiming(event, now)).toBe("past");
  });

  test("an event with no end is past once it has started", () => {
    const event = {
      starts_at: "2026-08-24T17:00:00Z",
      ends_at: null,
      timezone: zone,
    };
    expect(eventTiming(event, now)).toBe("past");
  });

  test("an event still running is today", () => {
    const event = {
      starts_at: "2026-08-22T14:00:00Z",
      ends_at: "2026-08-26T02:00:00Z",
      timezone: zone,
    };
    expect(eventTiming(event, now)).toBe("today");
  });

  test("an event later on the same local day is today", () => {
    const event = {
      starts_at: "2026-08-25T01:00:00Z", // 7pm Denver on the 24th
      ends_at: "2026-08-25T04:00:00Z",
      timezone: zone,
    };
    expect(eventTiming(event, now)).toBe("today");
  });

  test("an event on a later day is upcoming", () => {
    const event = {
      starts_at: "2026-08-26T18:00:00Z",
      ends_at: "2026-08-26T20:00:00Z",
      timezone: zone,
    };
    expect(eventTiming(event, now)).toBe("upcoming");
  });
});

describe("daysInMonth", () => {
  test("returns 28 for February in a non-leap year", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  test("returns 29 for February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  test("returns 30 for a 30-day month", () => {
    expect(daysInMonth(2027, 4)).toBe(30);
  });
});

describe("zonedWallTimeToUtcIso", () => {
  test("converts a Mountain Time (MDT, UTC-6) midnight in June", () => {
    expect(zonedWallTimeToUtcIso(2027, 6, 1, 0, 0, 0, "America/Denver")).toBe(
      "2027-06-01T06:00:00.000Z",
    );
  });

  test("converts a Mountain Time (MST, UTC-7) midnight in December", () => {
    expect(zonedWallTimeToUtcIso(2026, 12, 1, 0, 0, 0, "America/Denver")).toBe(
      "2026-12-01T07:00:00.000Z",
    );
  });

  test("converts an end-of-day instant in a zone with no DST", () => {
    expect(
      zonedWallTimeToUtcIso(2027, 5, 17, 23, 59, 59, "America/Phoenix"),
    ).toBe("2027-05-18T06:59:59.000Z");
  });

  test("round-trips through UTC itself", () => {
    expect(zonedWallTimeToUtcIso(2027, 1, 1, 0, 0, 0, "UTC")).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  // Santiago springs forward at midnight on 6 Sep 2026: 00:00-00:59 is skipped.
  test("resolves a wall time in a midnight DST gap forward, on the same date", () => {
    expect(
      zonedWallTimeToUtcIso(2026, 9, 6, 0, 30, 0, "America/Santiago"),
    ).toBe("2026-09-06T04:30:00.000Z"); // 01:30 -03
  });

  test("resolves a wall time in a 2am DST gap forward", () => {
    expect(
      zonedWallTimeToUtcIso(2027, 3, 14, 2, 30, 0, "America/New_York"),
    ).toBe("2027-03-14T07:30:00.000Z"); // 03:30 EDT
  });
});

describe("todayInZone", () => {
  // The case the whole of #1065 turns on: an evening in Denver is already
  // tomorrow in UTC, which is the zone the server process runs in.
  const lateEvening = new Date("2026-03-01T02:00:00Z");

  test("gives the organization's day, not the server's", () => {
    expect(todayInZone("America/Denver", lateEvening)).toBe("2026-02-28");
    expect(todayInZone("UTC", lateEvening)).toBe("2026-03-01");
  });

  test("agrees with UTC once the org's day has caught up", () => {
    const midday = new Date("2026-03-01T18:00:00Z");
    expect(todayInZone("America/Denver", midday)).toBe("2026-03-01");
    expect(todayInZone("UTC", midday)).toBe("2026-03-01");
  });

  test("pads a single-digit month and day", () => {
    expect(
      todayInZone("America/Denver", new Date("2026-07-04T18:00:00Z")),
    ).toBe("2026-07-04");
  });
});

describe("utcDateFromIsoDay", () => {
  test("reads back as the same day in UTC, which the fiscal-year math uses", () => {
    const date = utcDateFromIsoDay("2026-08-31");
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth() + 1).toBe(8);
    expect(date.getUTCDate()).toBe(31);
    expect(date.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  test("round-trips a zone-anchored day", () => {
    const day = todayInZone("America/Denver", new Date("2026-03-01T02:00:00Z"));
    expect(utcDateFromIsoDay(day).toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
  });
});

describe("localDayKey", () => {
  test("pads month and day", () => {
    expect(localDayKey(new Date(2027, 0, 5))).toBe("2027-01-05");
  });
});

describe("monthGridDays", () => {
  // The bug (#1803) only shows in a zone with daylight saving, so pin one
  // rather than depend on the zone the suite happens to run in.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  test("shows each date of a fall-back month once", () => {
    // November 2026 starts on the Sunday US clocks fall back.
    const days = monthGridDays(2026, 10).map(localDayKey);
    expect(days.length).toBe(35);
    expect(new Set(days).size).toBe(35);
    expect(days[0]).toBe("2026-11-01");
    expect(days[1]).toBe("2026-11-02");
    expect(days.at(-1)).toBe("2026-12-05");
  });

  test("shows each date of a spring-forward month once, skipping none", () => {
    // US clocks spring forward on Sunday 14 March 2027.
    const days = monthGridDays(2027, 2).map(localDayKey);
    expect(days.length).toBe(35);
    expect(new Set(days).size).toBe(35);
    expect(days[0]).toBe("2027-02-28");
    expect(days.slice(14, 17)).toEqual([
      "2027-03-14",
      "2027-03-15",
      "2027-03-16",
    ]);
    expect(days.at(-1)).toBe("2027-04-03");
  });
});
