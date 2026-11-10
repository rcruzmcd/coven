// DOM coverage for an event's Social content section (#1795): its posts by
// publish date with the Unscheduled ones after, an overdue marker, a link to
// each post's own page, and adding only with content_calendar: manage.
import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { ContentPieceRow } from "@/lib/social-content/pieces";
import type { EventRow } from "./event-badges";
import {
  EventSocialContentProvider,
  SocialContentTab,
  defaultEventPublishDueAt,
  type EventSocialContent,
} from "./social-content-tab";

const event = {
  id: "event-1",
  name: "Winter Gear Swap",
  starts_at: "2026-09-01T14:00:00.000Z",
} as EventRow;

function piece(overrides: Partial<ContentPieceRow> = {}): ContentPieceRow {
  return {
    id: "piece-1",
    calendar_item_id: null,
    event_id: "event-1",
    title: "Save the date",
    content: null,
    content_status: "draft",
    skip_reason: null,
    internal_notes: null,
    owner_id: "owner-1",
    reviewer_id: null,
    lead_time_days: 21,
    publish_due_at: "2099-08-25T14:00:00.000Z",
    review_due_at: null,
    draft_due_at: null,
    status_changed_by: null,
    status_changed_at: null,
    ...overrides,
  };
}

function renderTab(social: Partial<EventSocialContent> = {}) {
  return render(
    <EventSocialContentProvider
      value={{
        pieces: [],
        owners: [
          {
            person_id: "owner-1",
            auth_user_id: null,
            name: "Sam Rivera",
            preferred_name: null,
            email: null,
          },
        ],
        defaultLeadTimeDays: 21,
        canManage: true,
        error: false,
        ...social,
      }}
    >
      <SocialContentTab event={event} />
    </EventSocialContentProvider>,
  );
}

describe("SocialContentTab", () => {
  test("lists scheduled posts, then the unscheduled, each linking to its page", () => {
    renderTab({
      pieces: [
        piece(),
        piece({ id: "piece-2", title: "Recap reel", publish_due_at: null }),
      ],
    });

    expect(screen.getByRole("link", { name: "Save the date" })).toHaveAttribute(
      "href",
      "/portal/social/piece-1",
    );
    const unscheduled = screen.getByRole("heading", { name: /Unscheduled/ })
      .parentElement as HTMLElement;
    expect(within(unscheduled).getByText("(1)")).toBeInTheDocument();
    expect(
      within(unscheduled).getByRole("link", { name: "Recap reel" }),
    ).toHaveAttribute("href", "/portal/social/piece-2");
    expect(screen.getAllByText("Owner: Sam Rivera")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Add social post" }),
    ).toBeInTheDocument();
  });

  test("marks a post whose deadline has passed", () => {
    renderTab({
      pieces: [piece({ publish_due_at: "2020-01-01T00:00:00.000Z" })],
    });
    expect(screen.getByText("Publish overdue")).toBeInTheDocument();
  });

  test("offers adding only with content_calendar: manage", () => {
    renderTab({ pieces: [], canManage: false });
    expect(
      screen.getByText("No social posts planned for this event yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add social post" }),
    ).not.toBeInTheDocument();
  });

  test("says so when the posts could not be read", () => {
    renderTab({ error: true });
    expect(
      screen.getByText("Could not load social posts. Please try again."),
    ).toBeInTheDocument();
  });
});

describe("defaultEventPublishDueAt", () => {
  test("suggests a week before the event starts", () => {
    expect(defaultEventPublishDueAt("2026-09-01T14:00:00.000Z")).toBe(
      "2026-08-25T14:00:00.000Z",
    );
  });
});
