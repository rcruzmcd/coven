// DOM coverage for an event's Social content section (#1795): its posts by
// publish date with the Unscheduled ones after, an overdue marker, a link to
// each post's own page, and adding only with content_calendar: manage.
import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  timezone: "America/New_York",
} as EventRow;

function piece(overrides: Partial<ContentPieceRow> = {}): ContentPieceRow {
  return {
    id: "piece-1",
    calendar_item_id: null,
    event_id: "event-1",
    program_id: null,
    title: "Save the date",
    content: null,
    post_format: null,
    collaborator_handles: [],
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

function renderTab(
  social: Partial<EventSocialContent> = {},
  eventRow: EventRow = event,
) {
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
        planTemplate: [
          { title: "Save the date", offset_days: -30 },
          { title: "Reminder", offset_days: -7 },
        ],
        orgTimeZone: "America/New_York",
        canManage: true,
        error: false,
        ...social,
      }}
    >
      <SocialContentTab event={eventRow} />
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

  test("renders deadlines as instants in the event's zone until the viewer's is known", () => {
    renderTab({ pieces: [piece()] });
    const publish = document.querySelector(
      'time[datetime="2099-08-25T14:00:00.000Z"]',
    );
    expect(publish).not.toBeNull();
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

  test("Generate plan previews the template and leaves out titles the event has (#1798)", async () => {
    renderTab({ pieces: [piece()] });
    await userEvent.click(
      screen.getByRole("button", { name: "Generate plan" }),
    );

    const existing = screen.getByRole("checkbox", { name: /Save the date/ });
    expect(existing).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Already planned")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Reminder/ })).toBeChecked();
    expect(
      screen.getByText("7 days before ·", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 post" })).toBeEnabled();
  });

  test("a cancelled event lists its open posts with Skip all (#1799)", () => {
    renderTab(
      {
        pieces: [
          piece(),
          piece({ id: "p2", title: "Recap", content_status: "published" }),
        ],
      },
      { ...event, status: "cancelled" },
    );
    const banner = screen.getByRole("alert");
    expect(
      within(banner).getByText(/1 social post is still open/),
    ).toBeInTheDocument();
    expect(within(banner).getByText("Save the date")).toBeInTheDocument();
    expect(within(banner).queryByText("Recap")).not.toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: "Skip all" }),
    ).toBeInTheDocument();
  });

  test("no cancelled banner while the event is on", () => {
    renderTab({ pieces: [piece()] }, { ...event, status: "published" });
    expect(screen.queryByRole("button", { name: "Skip all" })).toBeNull();
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
