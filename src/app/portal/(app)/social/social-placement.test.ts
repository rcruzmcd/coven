import { expect, test } from "bun:test";
import { localDayKey, monthGridDays, placePieces } from "./social-placement";

test("a dated post lands on its day in the given zone; an undated one goes to the tray", () => {
  const morning = { id: "a", publish_due_at: "2026-11-14T15:00:00Z" };
  // 01:00 UTC on the 14th is still the evening of the 13th in New York.
  const lateUtc = { id: "b", publish_due_at: "2026-11-14T01:00:00Z" };
  const undated = { id: "c", publish_due_at: null };

  const utc = placePieces([morning, undated, lateUtc], "UTC");
  expect(utc.byDay.get("2026-11-14")).toEqual([morning, lateUtc]);
  expect(utc.unscheduled).toEqual([undated]);

  const newYork = placePieces([morning, lateUtc], "America/New_York");
  expect(newYork.byDay.get("2026-11-13")).toEqual([lateUtc]);
  expect(newYork.byDay.get("2026-11-14")).toEqual([morning]);
});

test("localDayKey pads month and day", () => {
  expect(localDayKey(new Date(2027, 0, 5))).toBe("2027-01-05");
});

test("monthGridDays covers whole weeks with each date once, across a DST change", () => {
  // November 2026 starts on the Sunday US clocks fall back.
  const days = monthGridDays(2026, 10).map(localDayKey);
  expect(days.length).toBe(35);
  expect(new Set(days).size).toBe(35);
  expect(days[0]).toBe("2026-11-01");
  expect(days.at(-1)).toBe("2026-12-05");
});
