import { pinTimezone } from "../../../../../test/timezone";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

// The deadline field is a datetime-local input, so every expectation below is
// the fixture's instant read in the *process* zone, and the fixture is written
// as New York wall-clock times. This file never said so: until #1170 it
// inherited the zone from event-date-defaults.dom.test.tsx, which pinned New
// York and never handed it back, and the two happened to land in that order.
// Sharding the suite separated them and every assertion here came out four
// hours off.
pinTimezone("America/New_York");

type ActionResult = { error: string } | { success: true };

const updateEventPlanningActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventPlanningAction: updateEventPlanningActionMock,
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

const { PlanningTab } = await import("./planning-tab");

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

// The Save button lives on the event detail view's toolbar, wired to the tab's
// form by id -- stand in for it here.
function renderTab(event: EventRow, mode: "view" | "edit" = "edit") {
  return render(
    <>
      <PlanningTab
        event={event}
        formId="planning-form"
        people={[]}
        onPersonCreated={() => {}}
        mode={mode}
        onSaved={() => {}}
      />
      <button type="submit" form="planning-form">
        Save
      </button>
    </>,
  );
}

const deadlineField = () => screen.getByLabelText("Registration deadline");
const registrationToggle = () =>
  screen.getByRole("checkbox", { name: "Registration enabled" });

describe("PlanningTab registration deadline", () => {
  beforeEach(() => {
    updateEventPlanningActionMock.mockClear();
    updateEventPlanningActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("disables the deadline while registration is off", () => {
    renderTab(makeEvent());
    expect(deadlineField()).toBeDisabled();
  });

  test("enables the deadline and caps it at the event end", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());

    expect(deadlineField()).toBeEnabled();
    expect(deadlineField()).toHaveAttribute("max", "2026-09-01T14:00");
  });

  test("defaults a blank deadline to the event end date", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());

    expect(deadlineField()).toHaveValue("2026-09-01T14:00");
  });

  test("falls back to the start date when the event has no end", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ ends_at: null }));

    await user.click(registrationToggle());

    expect(deadlineField()).toHaveValue("2026-09-01T10:00");
    expect(deadlineField()).toHaveAttribute("max", "2026-09-01T10:00");
  });

  test("shows a stored deadline rather than the default", () => {
    renderTab(
      makeEvent({
        registration_enabled: true,
        registration_deadline: "2026-08-25T14:00:00.000Z",
      }),
    );

    expect(deadlineField()).toBeEnabled();
    expect(deadlineField()).toHaveValue("2026-08-25T10:00");
  });

  test("submits a deadline the user picked, not the default", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());
    await user.clear(deadlineField());
    await user.type(deadlineField(), "2026-08-25T10:00");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventPlanningActionMock.mock.calls[0][1];
    expect(submitted.get("registrationEnabled")).toBe("on");
    expect(submitted.get("registrationDeadline")).toBe(
      "2026-08-25T14:00:00.000Z",
    );
  });

  test("clears the deadline when registration is switched off", async () => {
    const user = userEvent.setup();
    renderTab(
      makeEvent({
        registration_enabled: true,
        registration_deadline: "2026-08-25T14:00:00.000Z",
      }),
    );

    await user.click(registrationToggle());

    expect(deadlineField()).toBeDisabled();
    expect(deadlineField()).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventPlanningActionMock.mock.calls[0][1];
    expect(submitted.get("registrationEnabled")).toBe("off");
    expect(submitted.get("registrationDeadline")).toBe("");
  });
});

describe("PlanningTab per-person options", () => {
  test("uses the distinct label in the read-only view", () => {
    renderTab(makeEvent(), "view");

    expect(screen.getByText("Per-person options")).toBeTruthy();
  });

  // #1732: capacity/pricing config, so it sits with the discount codes, not
  // beside the free-form Additional questions at the bottom.
  const follows = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  for (const mode of ["view", "edit"] as const) {
    test(`sits after the discount codes and before the questions (${mode})`, () => {
      renderTab(makeEvent(), mode);

      const discounts = screen.getByText(/^Auto-assign discount codes/);
      const options = screen.getByText("Per-person options");
      const adults = screen.getAllByText("Adults only (18+)")[0];
      const questions = screen.getByText("Additional questions");

      expect(follows(discounts, options)).toBe(true);
      expect(follows(options, adults)).toBe(true);
      expect(follows(options, questions)).toBe(true);
    });
  }
});

describe("PlanningTab adults only (#1417)", () => {
  beforeEach(() => updateEventPlanningActionMock.mockClear());

  const adultsOnlySwitch = () =>
    screen.getByRole("switch", { name: /Adults only \(18\+\)/ });

  test("starts from the stored value and saves the change", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ adults_only: false }));

    expect(adultsOnlySwitch()).not.toBeChecked();
    await user.click(adultsOnlySwitch());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    expect(
      updateEventPlanningActionMock.mock.calls[0][1].get("adultsOnly"),
    ).toBe("on");
  });

  test("an 18+ event shows it on and can turn it off", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ adults_only: true }));

    expect(adultsOnlySwitch()).toBeChecked();
    await user.click(adultsOnlySwitch());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    expect(
      updateEventPlanningActionMock.mock.calls[0][1].get("adultsOnly"),
    ).toBe("off");
  });
});

describe("PlanningTab reminder email (#1652)", () => {
  beforeEach(() => {
    updateEventPlanningActionMock.mockClear();
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
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const formData = updateEventPlanningActionMock.mock.calls[0][1];
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
