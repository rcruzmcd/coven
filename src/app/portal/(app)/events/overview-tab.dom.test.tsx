import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import type { Program } from "../programs/actions";
import * as EventsActions from "./actions";
import * as MeetingsActions from "../governance/meetings/actions";
import * as PieceActions from "@/lib/social-content/piece-actions";
import type { ContentPieceRow } from "@/lib/social-content/pieces";
import type { EventMeeting } from "../governance/meetings/actions";

type ActionResult = { error: string } | { success: true };

const updateEventActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventAction: updateEventActionMock,
}));

const listEventMeetingsActionMock = mock<
  (eventId: string) => Promise<EventMeeting[]>
>(async () => []);

mock.module("../governance/meetings/actions", () => ({
  ...MeetingsActions,
  listEventMeetingsAction: listEventMeetingsActionMock,
}));

const shiftEventPostsActionMock = mock<
  (
    eventId: string,
    fromStartsAt: string,
    toStartsAt: string,
  ) => Promise<{ success: true; moved: number }>
>(async () => ({ success: true, moved: 1 }));

mock.module("@/lib/social-content/piece-actions", () => ({
  ...PieceActions,
  shiftEventPostsAction: shiftEventPostsActionMock,
}));

const { OverviewTab } = await import("./overview-tab");
const { EventSocialContentProvider } = await import("./social-content-tab");

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
    starts_at: "2026-09-01T18:00:00.000Z",
    ends_at: null,
    timezone: "America/New_York",
    visibility: "public",
    status: "published",
    attendance_count: null,
    attendance_notes: null,
    description: null,
    capacity: null,
    registration_enabled: false,
    registration_deadline: null,
    auto_assign_discount_codes: false,
    budget_amount: null,
    event_lead_id: null,
    event_lead: null,
    report_status: "not_started",
    report_summary: null,
    feedback_notes: null,
    content_notes: null,
    report_submitted_at: null,
    report_submitted_by: null,
    program_ids: [],
    flier_url: null,
    ...overrides,
  };
}

const PROGRAMS: Program[] = [
  { id: "program-1", name: "Winter Access", status: "active" },
  { id: "program-2", name: "Gear Library", status: "active" },
];

// The Save button lives on the event detail view's toolbar, wired to the tab's
// form by id -- stand in for it here.
function renderTab(
  event: EventRow,
  mode: "view" | "edit" = "edit",
  programs: Program[] = PROGRAMS,
) {
  return render(
    <>
      <OverviewTab
        event={event}
        programs={programs}
        formId="overview-form"
        mode={mode}
        onSaved={() => {}}
      />
      <button type="submit" form="overview-form">
        Save
      </button>
    </>,
  );
}

// An event can count toward more than one program's impact report -- a single
// access day serving both the mountain-access and the gear program has to show
// up in both. The single program_id this replaced could only ever pick one.
describe("OverviewTab programs", () => {
  beforeEach(() => {
    updateEventActionMock.mockClear();
    updateEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("lists every linked program in view mode", () => {
    renderTab(makeEvent({ program_ids: ["program-1", "program-2"] }), "view");

    expect(screen.getByText("Winter Access, Gear Library")).toBeInTheDocument();
  });

  test("shows a dash when the event belongs to no program", () => {
    renderTab(makeEvent(), "view");

    expect(screen.getByText("Programs")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  test("submits every checked program", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ program_ids: ["program-1"] }));

    await user.click(screen.getByRole("checkbox", { name: "Gear Library" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    const submitted = updateEventActionMock.mock.calls[0][1];
    expect(submitted.getAll("programIds")).toEqual(["program-1", "program-2"]);
  });

  test("submits an empty list when the last program is unchecked", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ program_ids: ["program-1"] }));

    await user.click(screen.getByRole("checkbox", { name: "Winter Access" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    expect(updateEventActionMock.mock.calls[0][1].getAll("programIds")).toEqual(
      [],
    );
  });

  test("reports the form dirty only once the selection actually changes", async () => {
    const user = userEvent.setup();
    const onDirtyChange = mock((_dirty: boolean) => {});
    render(
      <OverviewTab
        event={makeEvent({ program_ids: ["program-1"] })}
        programs={PROGRAMS}
        formId="overview-form"
        mode="edit"
        onSaved={() => {}}
        onDirtyChange={onDirtyChange}
      />,
    );

    // program_ids is an array, so a reference comparison would report the form
    // dirty on the very first render, before anything was touched.
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled());
    expect(onDirtyChange.mock.calls.at(-1)?.[0]).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "Gear Library" }));
    await waitFor(() =>
      expect(onDirtyChange.mock.calls.at(-1)?.[0]).toBe(true),
    );
  });

  test("stays read-only once the report is submitted", () => {
    renderTab(
      makeEvent({ report_status: "submitted", program_ids: ["program-1"] }),
      "edit",
    );

    expect(screen.getByText("Winter Access")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Winter Access" }),
    ).toBeNull();
  });
});

// The parser expects instants (#1063); a naive wall-clock string reaching the
// server is read in UTC, which moved a 2:00 PM Eastern event to 10:00 AM on
// every save.
describe("OverviewTab start and end times", () => {
  beforeEach(() => {
    updateEventActionMock.mockClear();
    updateEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("saves the stored instants unchanged when the times aren't edited", async () => {
    const user = userEvent.setup();
    renderTab(
      makeEvent({
        starts_at: "2026-10-10T18:00:00.000Z",
        ends_at: "2026-10-10T23:00:00.000Z",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    const submitted = updateEventActionMock.mock.calls[0][1];
    expect(submitted.get("startsAt")).toBe("2026-10-10T18:00:00.000Z");
    expect(submitted.get("endsAt")).toBe("2026-10-10T23:00:00.000Z");
  });

  test("submits an empty end when the event has none", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ ends_at: null }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    expect(updateEventActionMock.mock.calls[0][1].get("endsAt")).toBe("");
  });
});

// #1622: the governance meetings linked to the event, each linking back.
describe("OverviewTab linked meetings", () => {
  beforeEach(() => {
    listEventMeetingsActionMock.mockReset();
  });

  test("lists the event's meetings with a link to each", async () => {
    listEventMeetingsActionMock.mockImplementation(async () => [
      {
        id: "meeting-1",
        meeting_date: "2026-08-20T23:00:00.000Z",
        meeting_type: "committee",
        status: "scheduled",
      },
    ]);
    renderTab(makeEvent(), "view");

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/portal/governance/meetings/meeting-1",
    );
    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.getByText("committee")).toBeInTheDocument();
    expect(listEventMeetingsActionMock).toHaveBeenCalledWith("event-1");
  });

  test("shows no meetings field when none are linked", async () => {
    listEventMeetingsActionMock.mockImplementation(async () => []);
    renderTab(makeEvent(), "view");

    await waitFor(() =>
      expect(listEventMeetingsActionMock).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByText("Meetings")).not.toBeInTheDocument();
  });
});

// #1799: moving the start offers to move the event's open, dated posts too.
describe("OverviewTab social post shift", () => {
  const DAY = 24 * 60 * 60 * 1000;

  function post(overrides: Partial<ContentPieceRow>): ContentPieceRow {
    return {
      id: "piece-1",
      calendar_item_id: null,
      event_id: "event-1",
      program_id: null,
      title: "Reminder",
      content: null,
      post_format: null,
      collaborator_handles: [],
      content_status: "idea",
      skip_reason: null,
      internal_notes: null,
      owner_id: null,
      reviewer_id: null,
      lead_time_days: 21,
      publish_due_at: "2099-01-01T00:00:00.000Z",
      review_due_at: null,
      draft_due_at: null,
      status_changed_by: null,
      status_changed_at: null,
      series_id: null,
      occurrence_date: null,
      ...overrides,
    };
  }

  function renderWithPosts(event: EventRow, pieces: ContentPieceRow[]) {
    return render(
      <EventSocialContentProvider
        value={{
          pieces,
          owners: [],
          defaultLeadTimeDays: 21,
          planTemplate: [],
          orgTimeZone: "UTC",
          canManage: true,
          error: false,
        }}
      >
        <OverviewTab
          event={event}
          programs={PROGRAMS}
          formId="overview-form"
          mode="edit"
          onSaved={() => {}}
        />
        <button type="submit" form="overview-form">
          Save
        </button>
      </EventSocialContentProvider>,
    );
  }

  function moveStartBy(days: number) {
    const input = document.getElementById(
      "details-startsAt",
    ) as HTMLInputElement;
    const [date, time] = input.value.split("T");
    const moved = new Date(`${date}T00:00:00Z`);
    moved.setUTCDate(moved.getUTCDate() + days);
    fireEvent.change(input, {
      target: { value: `${moved.toISOString().slice(0, 10)}T${time}` },
    });
  }

  beforeEach(() => {
    updateEventActionMock.mockClear();
    updateEventActionMock.mockImplementation(async () => ({ success: true }));
    shiftEventPostsActionMock.mockClear();
  });

  test("asks to move only the open, dated posts, by the same amount", async () => {
    const user = userEvent.setup();
    renderWithPosts(makeEvent(), [
      post({ id: "a" }),
      post({ id: "b", content_status: "published" }),
      post({ id: "c", content_status: "skipped" }),
      post({ id: "d", publish_due_at: null }),
    ]);

    moveStartBy(3);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Move 1 social post by the same amount?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/now starts 3 days later/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move 1 post" }));
    await waitFor(() =>
      expect(shiftEventPostsActionMock).toHaveBeenCalledTimes(1),
    );
    const [eventId, fromStartsAt, toStartsAt] =
      shiftEventPostsActionMock.mock.calls[0];
    expect(eventId).toBe("event-1");
    expect(fromStartsAt).toBe(makeEvent().starts_at);
    const shiftMs = Date.parse(toStartsAt) - Date.parse(fromStartsAt);
    // Within an hour of 3 days: the runner's zone may cross a DST change.
    expect(Math.abs(shiftMs - 3 * DAY)).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test("does not ask when the start did not move", async () => {
    const user = userEvent.setup();
    renderWithPosts(makeEvent(), [post({})]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/by the same amount\?/)).not.toBeInTheDocument();
  });
});
