import { expect, test } from "bun:test";
import { placePieces } from "./social-placement";

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
