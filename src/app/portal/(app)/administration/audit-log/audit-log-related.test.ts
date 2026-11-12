import { describe, expect, test } from "bun:test";
import { pieceLinksOf } from "./audit-log-related";

describe("pieceLinksOf", () => {
  test("ignores tables other than social posts", () => {
    expect(
      pieceLinksOf({
        table_name: "events",
        old_data: null,
        new_data: { event_id: "e1" },
      }),
    ).toBeNull();
  });

  test("reads the row after the change", () => {
    expect(
      pieceLinksOf({
        table_name: "content_opportunities",
        old_data: { event_id: null, calendar_item_id: "c0" },
        new_data: { event_id: "e1", calendar_item_id: null },
      }),
    ).toEqual({ event_id: "e1", calendar_item_id: null, program_id: null });
  });

  test("falls back to the row before a delete", () => {
    expect(
      pieceLinksOf({
        table_name: "content_opportunities",
        old_data: { event_id: "e1", calendar_item_id: "c1", program_id: "p1" },
        new_data: null,
      }),
    ).toEqual({ event_id: "e1", calendar_item_id: "c1", program_id: "p1" });
  });

  test("treats a snapshot without the keys as standalone", () => {
    expect(
      pieceLinksOf({
        table_name: "content_opportunities",
        old_data: null,
        new_data: { title: "Older row" },
      }),
    ).toEqual({ event_id: null, calendar_item_id: null, program_id: null });
  });
});
