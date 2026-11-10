import { describe, expect, test } from "bun:test";
import { parseContentPieceForm } from "./piece-form";
import { leadTimeSchedule, nextDueAt, summaryContentStatus } from "./pieces";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  title: "Instagram carousel: how the gear swap works",
  contentStatus: "draft",
  leadTimeDays: "21",
  publishDueAt: "2027-03-31T09:00",
  reviewDueAt: "2027-03-24T09:00",
  draftDueAt: "2027-03-17T09:00",
};

describe("parseContentPieceForm", () => {
  test("parses valid input", () => {
    const result = parseContentPieceForm(formData(validFields));
    expect("data" in result && result.data.title).toBe(
      "Instagram carousel: how the gear swap works",
    );
    expect("data" in result && result.data.contentStatus).toBe("draft");
    expect("data" in result && result.data.leadTimeDays).toBe(21);
    expect("data" in result && result.data.skipReason).toBeNull();
  });

  test("requires a title", () => {
    expect(
      parseContentPieceForm(formData({ ...validFields, title: "   " })),
    ).toEqual({ error: "Give this post a title." });
  });

  test("requires a valid content status", () => {
    expect(
      parseContentPieceForm(
        formData({ ...validFields, contentStatus: "made_up" }),
      ),
    ).toEqual({
      error: "Select a valid content status.",
    });
  });

  test("requires a reason when content is skipped", () => {
    const result = parseContentPieceForm(
      formData({ ...validFields, contentStatus: "skipped" }),
    );
    expect(result).toEqual({
      error: "A reason is required when content is skipped.",
    });
  });

  test("accepts a skip status with a reason", () => {
    const result = parseContentPieceForm(
      formData({
        ...validFields,
        contentStatus: "skipped",
        skipReason: "No capacity this year.",
      }),
    );
    expect("data" in result && result.data.skipReason).toBe(
      "No capacity this year.",
    );
  });

  test("asks nothing of a piece beyond its title and status (#1231)", () => {
    // The org-connection requirement went with the prose fields it guarded:
    // a piece at any status saves with only a title, a status and a lead time.
    const result = parseContentPieceForm(
      formData({
        title: "Day-of story",
        contentStatus: "approved",
        leadTimeDays: "7",
      }),
    );
    expect("data" in result).toBe(true);
    expect("data" in result && result.data.content).toBeNull();
  });

  test("round-trips the content textarea and internal notes", () => {
    const result = parseContentPieceForm(
      formData({
        ...validFields,
        content: "  Five slides, ending on the accessibility note.  ",
        internalNotes: "  Waiting on final photo.  ",
      }),
    );
    expect("data" in result && result.data.content).toBe(
      "Five slides, ending on the accessibility note.",
    );
    expect("data" in result && result.data.internalNotes).toBe(
      "Waiting on final photo.",
    );
  });

  test("requires a positive whole-number lead time", () => {
    expect(
      parseContentPieceForm(formData({ ...validFields, leadTimeDays: "0" })),
    ).toEqual({
      error: "Lead time must be a whole number of days greater than zero.",
    });
    expect(
      parseContentPieceForm(formData({ ...validFields, leadTimeDays: "7.5" })),
    ).toEqual({
      error: "Lead time must be a whole number of days greater than zero.",
    });
  });

  test("requires draft due on or before review due", () => {
    const result = parseContentPieceForm(
      formData({ ...validFields, draftDueAt: "2027-03-25T09:00" }),
    );
    expect(result).toEqual({
      error: "Draft due date must be on or before the review due date.",
    });
  });

  test("requires review due on or before publish due", () => {
    const result = parseContentPieceForm(
      formData({ ...validFields, reviewDueAt: "2027-04-01T09:00" }),
    );
    expect(result).toEqual({
      error: "Review due date must be on or before the publish due date.",
    });
  });

  test("allows empty due dates", () => {
    const result = parseContentPieceForm(
      formData({
        title: "Day-of story",
        contentStatus: "not_planned",
        leadTimeDays: "21",
      }),
    );
    expect("data" in result && result.data.publishDueAt).toBeNull();
  });
});

describe("parseContentPieceForm: Related to (#1793)", () => {
  const ITEM = "11111111-1111-4111-8111-111111111111";
  const EVENT = "22222222-2222-4222-8222-222222222222";

  test("relates a piece to nothing by default", () => {
    const result = parseContentPieceForm(formData(validFields));
    expect("data" in result && result.data.calendarItemId).toBeNull();
    expect("data" in result && result.data.eventId).toBeNull();
  });

  test("relates a piece to a community date, an event, or both", () => {
    const both = parseContentPieceForm(
      formData({ ...validFields, calendarItemId: ITEM, eventId: EVENT }),
    );
    expect("data" in both && both.data.calendarItemId).toBe(ITEM);
    expect("data" in both && both.data.eventId).toBe(EVENT);

    const eventOnly = parseContentPieceForm(
      formData({ ...validFields, eventId: EVENT }),
    );
    expect("data" in eventOnly && eventOnly.data.calendarItemId).toBeNull();
    expect("data" in eventOnly && eventOnly.data.eventId).toBe(EVENT);
  });

  test("refuses a malformed link", () => {
    expect(
      parseContentPieceForm(formData({ ...validFields, eventId: "nope" })),
    ).toEqual({ error: "Select a valid event.", field: "eventId" });
    expect(
      parseContentPieceForm(
        formData({ ...validFields, calendarItemId: "nope" }),
      ),
    ).toEqual({
      error: "Select a valid community date.",
      field: "calendarItemId",
    });
  });
});

describe("summaryContentStatus", () => {
  const piece = (content_status: string) => ({ content_status });

  test("has nothing to say about an item with no pieces", () => {
    expect(summaryContentStatus([])).toBeNull();
  });

  test("reports the least-advanced piece still needing work", () => {
    expect(
      summaryContentStatus([piece("scheduled"), piece("draft"), piece("idea")]),
    ).toBe("idea");
  });

  test("ignores published and skipped pieces while any piece is open", () => {
    expect(
      summaryContentStatus([
        piece("published"),
        piece("skipped"),
        piece("in_review"),
      ]),
    ).toBe("in_review");
  });

  test("reports published once every piece is terminal", () => {
    expect(summaryContentStatus([piece("published"), piece("skipped")])).toBe(
      "published",
    );
    expect(summaryContentStatus([piece("skipped")])).toBe("skipped");
  });
});

describe("nextDueAt", () => {
  const now = new Date("2027-03-20T00:00:00.000Z");

  test("is the earliest deadline still ahead", () => {
    expect(
      nextDueAt(
        {
          draft_due_at: "2027-03-17T09:00:00.000Z",
          review_due_at: "2027-03-24T09:00:00.000Z",
          publish_due_at: "2027-03-31T09:00:00.000Z",
        },
        now,
      ),
    ).toBe("2027-03-24T09:00:00.000Z");
  });

  test("falls back to the last deadline once they have all passed", () => {
    expect(
      nextDueAt(
        {
          draft_due_at: "2027-03-01T09:00:00.000Z",
          review_due_at: "2027-03-08T09:00:00.000Z",
          publish_due_at: "2027-03-15T09:00:00.000Z",
        },
        now,
      ),
    ).toBe("2027-03-15T09:00:00.000Z");
  });

  test("is null when a piece has no dates at all", () => {
    expect(
      nextDueAt(
        { draft_due_at: null, review_due_at: null, publish_due_at: null },
        now,
      ),
    ).toBeNull();
  });
});

describe("leadTimeSchedule", () => {
  test("matches the issue's worked example: 21-day lead time -> draft T-14, review T-7", () => {
    const publishDueAt = new Date("2027-03-31T00:00:00.000Z");
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(publishDueAt, 21);
    expect(draftDueAt.toISOString()).toBe("2027-03-17T00:00:00.000Z");
    expect(reviewDueAt.toISOString()).toBe("2027-03-24T00:00:00.000Z");
  });
});
