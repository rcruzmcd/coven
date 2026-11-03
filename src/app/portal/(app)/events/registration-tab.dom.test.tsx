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

const updateEventRegistrationActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventRegistrationAction: updateEventRegistrationActionMock,
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

const { RegistrationTab } = await import("./registration-tab");

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
      <RegistrationTab
        event={event}
        formId="registration-form"
        mode={mode}
        onSaved={() => {}}
      />
      <button type="submit" form="registration-form">
        Save
      </button>
    </>,
  );
}

const deadlineField = () => screen.getByLabelText("Registration deadline");
const registrationToggle = () =>
  screen.getByRole("checkbox", { name: "Registration enabled" });

describe("RegistrationTab registration deadline", () => {
  beforeEach(() => {
    updateEventRegistrationActionMock.mockClear();
    updateEventRegistrationActionMock.mockImplementation(async () => ({
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
      expect(updateEventRegistrationActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventRegistrationActionMock.mock.calls[0][1];
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
      expect(updateEventRegistrationActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventRegistrationActionMock.mock.calls[0][1];
    expect(submitted.get("registrationEnabled")).toBe("off");
    expect(submitted.get("registrationDeadline")).toBe("");
  });
});

describe("RegistrationTab fields (#1778)", () => {
  beforeEach(() => updateEventRegistrationActionMock.mockClear());

  test("saves capacity, and not the lead or budget", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ capacity: 20 }));

    expect(screen.queryByText("Event lead")).toBeNull();
    expect(screen.queryByLabelText("Budget ($)")).toBeNull();
    const capacity = screen.getByLabelText("Capacity");
    await user.clear(capacity);
    await user.type(capacity, "40");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventRegistrationActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventRegistrationActionMock.mock.calls[0][1];
    expect(submitted.get("capacity")).toBe("40");
    expect(submitted.has("eventLeadId")).toBe(false);
    expect(submitted.has("budgetAmount")).toBe(false);
    // #1777. Saved by the cards they moved to.
    for (const key of [
      "confirmationNote",
      "carpoolSeatsQuestionId",
      "carpoolNoticeMode",
      "reminderEnabled",
      "reminderDaysBefore",
      "reminderIntro",
    ]) {
      expect(submitted.has(key)).toBe(false);
    }
  });

  test("keeps the carpools switch, which the Carpools card can't hold", () => {
    renderTab(makeEvent());
    expect(
      screen.getByRole("switch", { name: "Organize carpools" }),
    ).toBeInTheDocument();
  });

  test("is read-only once the report is submitted", () => {
    renderTab(makeEvent({ report_status: "submitted", capacity: 20 }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});

describe("RegistrationTab per-person options", () => {
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
      const adults = screen.getAllByText("Age requirement")[0];
      const questions = screen.getByText("Additional questions");

      expect(follows(discounts, options)).toBe(true);
      expect(follows(options, adults)).toBe(true);
      expect(follows(options, questions)).toBe(true);
    });
  }
});

describe("RegistrationTab age requirement (#1417, #1782)", () => {
  beforeEach(() => updateEventRegistrationActionMock.mockClear());

  const savedAge = () =>
    updateEventRegistrationActionMock.mock.calls[0][1].get("minimumAge");

  async function chooseAndSave(
    user: ReturnType<typeof userEvent.setup>,
    option: string,
  ) {
    await user.click(screen.getByLabelText("Age requirement"));
    await user.click(screen.getByRole("option", { name: option }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateEventRegistrationActionMock).toHaveBeenCalledTimes(1),
    );
  }

  test("an event with none can be made 21+", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ minimum_age: null }));

    expect(screen.getByLabelText("Age requirement")).toHaveTextContent("None");
    await chooseAndSave(user, "21+");
    expect(savedAge()).toBe("21");
  });

  test("an 18+ event shows it and can be cleared", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ minimum_age: 18 }));

    expect(screen.getByLabelText("Age requirement")).toHaveTextContent("18+");
    await chooseAndSave(user, "None");
    expect(savedAge()).toBe("");
  });

  test("the read-only view names the age", () => {
    renderTab(makeEvent({ minimum_age: 21 }), "view");

    expect(screen.getByText("21+")).toBeTruthy();
  });
});
