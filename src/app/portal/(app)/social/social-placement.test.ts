import { expect, test } from "bun:test";
import { localDayKey, monthGridDays, placePieces } from "./social-placement";

test("a dated post lands on its local day; an undated one goes to the tray", () => {
  const dated = {
    id: "a",
    publish_due_at: new Date(2026, 10, 14, 9).toISOString(),
  };
  const sameDay = {
    id: "b",
    publish_due_at: new Date(2026, 10, 14, 23).toISOString(),
  };
  const undated = { id: "c", publish_due_at: null };

  const { byDay, unscheduled } = placePieces([dated, undated, sameDay]);

  expect(byDay.get("2026-11-14")).toEqual([dated, sameDay]);
  expect(byDay.size).toBe(1);
  expect(unscheduled).toEqual([undated]);
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
