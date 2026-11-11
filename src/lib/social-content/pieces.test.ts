// When a social post's work is overdue (#1795): the badge on an event's Social
// content section and the rail's outstanding count both read this.
import { describe, expect, test } from "bun:test";
import { overduePieceTaskLabels, overdueStage } from "./pieces";

const NOW = new Date("2026-03-20T12:00:00.000Z");
const PAST = "2026-03-10T12:00:00.000Z";
const FUTURE = "2026-03-30T12:00:00.000Z";

function piece(
  content_status: string,
  dates: { draft?: string; review?: string; publish?: string } = {},
) {
  return {
    title: "Teaser",
    content_status,
    draft_due_at: dates.draft ?? null,
    review_due_at: dates.review ?? null,
    publish_due_at: dates.publish ?? null,
  };
}

describe("overdueStage", () => {
  test("a passed draft date is overdue only while the piece is still short of a draft", () => {
    expect(overdueStage(piece("idea", { draft: PAST }), NOW)).toBe("draft");
    expect(overdueStage(piece("draft", { draft: PAST }), NOW)).toBe("draft");
    expect(overdueStage(piece("in_review", { draft: PAST }), NOW)).toBeNull();
  });

  test("a passed review date is overdue until the piece is approved", () => {
    expect(overdueStage(piece("in_review", { review: PAST }), NOW)).toBe(
      "review",
    );
    expect(
      overdueStage(piece("changes_requested", { review: PAST }), NOW),
    ).toBe("review");
    expect(overdueStage(piece("approved", { review: PAST }), NOW)).toBeNull();
  });

  test("the furthest missed deadline wins", () => {
    expect(
      overdueStage(
        piece("idea", { draft: PAST, review: PAST, publish: PAST }),
        NOW,
      ),
    ).toBe("publish");
    expect(
      overdueStage(piece("idea", { draft: PAST, publish: FUTURE }), NOW),
    ).toBe("draft");
  });

  test("published and skipped pieces owe nothing, and future dates are on time", () => {
    expect(overdueStage(piece("published", { publish: PAST }), NOW)).toBeNull();
    expect(overdueStage(piece("skipped", { publish: PAST }), NOW)).toBeNull();
    expect(overdueStage(piece("scheduled", { publish: PAST }), NOW)).toBe(
      "publish",
    );
    expect(overdueStage(piece("idea", { publish: FUTURE }), NOW)).toBeNull();
    expect(overdueStage(piece("idea"), NOW)).toBeNull();
  });
});

describe("overduePieceTaskLabels", () => {
  test("one label per overdue piece, naming it", () => {
    expect(
      overduePieceTaskLabels(
        [piece("draft", { review: PAST }), piece("approved", { review: PAST })],
        NOW,
      ),
    ).toEqual(["Teaser: review overdue"]);
  });
});
