// A day with more entries than fit opens them in place (#1794): the "+N more"
// indicator is a control, so every post on a busy day can still be reached.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import { todayInZone } from "@/lib/time";
import { SocialMonthView } from "./social-month-view";

function piece(id: string): SocialPieceRow {
  return {
    id,
    calendar_item_id: null,
    event_id: null,
    program_id: null,
    title: `Post ${id}`,
    content: null,
    post_format: null,
    collaborator_handles: [],
    content_status: "draft",
    skip_reason: null,
    internal_notes: null,
    owner_id: null,
    reviewer_id: null,
    lead_time_days: 21,
    publish_due_at: "2026-11-10T15:00:00.000Z",
    review_due_at: null,
    draft_due_at: null,
    status_changed_by: null,
    status_changed_at: null,
    series_id: null,
    occurrence_date: null,
    event: null,
    calendar_item: null,
    program: null,
    series: null,
  };
}

describe("SocialMonthView", () => {
  test("+N more reveals and links every post on the day", async () => {
    const user = userEvent.setup();
    const pieces = ["1", "2", "3", "4", "5"].map(piece);
    render(
      <SocialMonthView
        month="2026-11"
        piecesByDay={new Map([["2026-11-10", pieces]])}
        overlay={[]}
        timeZone="UTC"
        monthHref={(month) => `/portal/social?month=${month}`}
      />,
    );

    expect(screen.queryByRole("link", { name: "Post 5" })).toBeNull();
    const more = screen.getByRole("button", {
      name: "Show 2 more for November 10",
    });
    expect(more).toHaveAttribute("aria-expanded", "false");

    await user.click(more);
    for (const id of ["1", "2", "3", "4", "5"]) {
      expect(screen.getByRole("link", { name: `Post ${id}` })).toHaveAttribute(
        "href",
        `/portal/social/${id}`,
      );
    }

    const fewer = screen.getByRole("button", {
      name: "Show fewer for November 10",
    });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await user.click(fewer);
    expect(screen.queryByRole("link", { name: "Post 5" })).toBeNull();
  });

  test("marks today's date, in the zone the posts are placed in", () => {
    const today = todayInZone("UTC");
    const { container } = render(
      <SocialMonthView
        month={today.slice(0, 7)}
        piecesByDay={new Map()}
        overlay={[]}
        timeZone="UTC"
        monthHref={(month) => `/portal/social?month=${month}`}
      />,
    );

    const current = container.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("dateTime", today);
  });

  test("colours each post by its status", () => {
    const draft = { ...piece("1"), content_status: "draft" };
    const changes = { ...piece("2"), content_status: "changes_requested" };
    const published = { ...piece("3"), content_status: "published" };
    render(
      <SocialMonthView
        month="2026-11"
        piecesByDay={new Map([["2026-11-10", [draft, changes, published]]])}
        overlay={[]}
        timeZone="UTC"
        monthHref={(month) => `/portal/social?month=${month}`}
      />,
    );

    expect(screen.getByRole("link", { name: "Post 1" })).toHaveClass(
      "border-l-primary",
    );
    expect(screen.getByRole("link", { name: "Post 2" })).toHaveClass(
      "border-l-destructive",
    );
    // Published is the one solid chip.
    expect(screen.getByRole("link", { name: "Post 3" })).toHaveClass(
      "bg-success",
    );
  });
});
