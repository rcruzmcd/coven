// DOM coverage for the event rows the calendar list view gained in #530: they
// link to the Events module, are marked as events, and are excluded from the
// bulk actions, which only ever write `calendar_items`.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListView } from "./list-view";
import { calendarItemEntry, eventEntry } from "./calendar-entries";
import type { CalendarItemRow } from "./calendar-shared";
import { focusedName } from "../../../../../test/focused";

function item(overrides: Partial<CalendarItemRow> = {}): CalendarItemRow {
  return {
    id: "item-1",
    title: "Trans Day of Visibility",
    item_type: "heritage_social_justice_moment",
    starts_at: "2026-03-31T10:00:00.000Z",
    ends_at: null,
    time_zone: "America/Denver",
    recurrence_rule: null,
    summary: null,
    priority_tier: 3,
    priority_rationale: null,
    calendar_status: "active",
    visibility: "internal",
    owner_id: null,
    decision: null,
    decision_note: null,
    source: null,
    region: null,
    exceptions: [],
    is_sensitive_topic: false,
    tone_guidance: null,
    series_key: null,
    recurrence_start_month: null,
    recurrence_start_day: null,
    recurrence_end_month: null,
    recurrence_end_day: null,
    recurrence_end_is_month_end: false,
    categories: [],
    program_ids: [],
    content_pieces: [],
    ...overrides,
  };
}

const entries = [
  calendarItemEntry(item()),
  eventEntry({
    id: "event-1",
    title: "Season kickoff day",
    starts_at: "2026-04-02T16:00:00.000Z",
    ends_at: null,
    time_zone: "America/Denver",
    summary: null,
    location: "Loveland",
    status: "draft",
    visibility: "private",
    program_ids: [],
  }),
];

function renderList(canManage = true) {
  return render(
    <ListView
      entries={entries}
      owners={[]}
      canManage={canManage}
      sort="starts_at"
      dir="asc"
      sortHref={() => "#"}
    />,
  );
}

describe("ListView with event entries", () => {
  test("links an event row to its Events detail page", () => {
    renderList();
    expect(
      screen.getByLabelText("View Season kickoff day").getAttribute("href"),
    ).toBe("/portal/events/event-1");
    expect(
      screen
        .getByLabelText("View Trans Day of Visibility")
        .getAttribute("href"),
    ).toBe("/portal/calendar/item-1");
  });

  test("marks the event row and shows its own lifecycle status", () => {
    renderList();
    expect(screen.getByText("Event")).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByText("Private")).toBeDefined();
  });

  test("offers no bulk-action checkbox on an event row", () => {
    renderList();
    expect(screen.queryByLabelText("Select Season kickoff day")).toBeNull();
    expect(
      screen.getByLabelText("Select Trans Day of Visibility"),
    ).toBeDefined();
  });
});

// Clear selection and a successful Apply both empty the selection, which
// takes the toolbar and the button just pressed away (#1863). Focus goes
// back to Select all instead of falling to <body>.
describe("ListView bulk toolbar focus", () => {
  test("Clear selection hands focus to Select all", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(
      screen.queryByRole("button", { name: "Clear selection" }),
    ).toBeNull();
    expect(focusedName()).toBe("Select all");
  });
});
