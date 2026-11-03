import { pinTimezone } from "../../../../../test/timezone";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

// The reminder status line reads its send time in the event's zone.
pinTimezone("America/New_York");

type ActionResult = { error: string } | { success: true };

const updateEventRegistrantEmailsActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventRegistrantEmailsAction: updateEventRegistrantEmailsActionMock,
}));

const loadEventReminderStatusActionMock = mock(async () => ({
  success: true as const,
  status: {
    sendAt: new Date(Date.now() + 86_400_000).toISOString(),
    recipients: 12,
    sent: 0,
  },
}));

mock.module("./reminder-actions", () => ({
  loadEventReminderStatusAction: loadEventReminderStatusActionMock,
  previewEventReminderAction: mock(async () => ({
    success: true,
    subject: "Reminder",
    html: "<p>Reminder</p>",
  })),
  sendEventReminderNowAction: mock(async () => ({ success: true })),
}));

const { RegistrantEmailsTab } = await import("./registrant-emails-tab");

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
    // 10:00-14:00 in America/New_York.
    starts_at: "2026-09-01T14:00:00.000Z",
    ends_at: "2026-09-01T18:00:00.000Z",
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

function renderTab(event: EventRow, mode: "view" | "edit" = "edit") {
  return render(
    <>
      <RegistrantEmailsTab
        event={event}
        formId="registrant-emails-form"
        mode={mode}
        onSaved={() => {}}
      />
      <button type="submit" form="registrant-emails-form">
        Save
      </button>
    </>,
  );
}

describe("RegistrantEmailsTab (#1779)", () => {
  beforeEach(() => updateEventRegistrantEmailsActionMock.mockClear());

  test("saves the note and reminder, and nothing of Registration's", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ registration_enabled: true }));

    await user.type(
      screen.getByLabelText("Confirmation email note"),
      "Bring gloves.",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventRegistrantEmailsActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventRegistrantEmailsActionMock.mock.calls[0][1];
    expect([...submitted.keys()].sort()).toEqual([
      "confirmationNote",
      "reminderDaysBefore",
      "reminderEnabled",
      "reminderIntro",
    ]);
    expect(submitted.get("confirmationNote")).toBe("Bring gloves.");
  });

  test("says the emails wait for registration while it is off", () => {
    renderTab(makeEvent({ registration_enabled: false }), "view");
    expect(screen.getByText(/these emails are not sent/)).toBeInTheDocument();
  });

  test("has no note once registration is on", () => {
    renderTab(makeEvent({ registration_enabled: true }), "view");
    expect(screen.queryByText(/these emails are not sent/)).toBeNull();
  });

  test("is read-only once the report is submitted", () => {
    renderTab(
      makeEvent({ report_status: "submitted", confirmation_note: "Hi" }),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });
});

describe("RegistrantEmailsTab reminder email (#1652)", () => {
  beforeEach(() => {
    updateEventRegistrantEmailsActionMock.mockClear();
  });

  test("shows the schedule and saves the days and intro", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ reminder_enabled: true, reminder_days_before: 2 }));

    const status = await screen.findByTestId("reminder-status");
    expect(status.textContent).toMatch(
      /^Scheduled for .*E[DS]T · 12 recipients$/,
    );
    const days = screen.getByLabelText("Days before the event");
    await user.clear(days);
    await user.type(days, "3");
    const intro = screen.getByLabelText("Reminder intro");
    await user.clear(intro);
    await user.type(intro, "Bring layers");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventRegistrantEmailsActionMock).toHaveBeenCalledTimes(1),
    );
    const formData = updateEventRegistrantEmailsActionMock.mock.calls[0][1];
    expect(formData.get("reminderEnabled")).toBe("on");
    expect(formData.get("reminderDaysBefore")).toBe("3");
    expect(formData.get("reminderIntro")).toBe("Bring layers");
  });

  test("hides the days and intro while it is off", () => {
    renderTab(makeEvent({ reminder_enabled: false }));
    expect(
      screen.getByRole("switch", { name: "Reminder email" }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText("Days before the event")).toBeNull();
  });
});
