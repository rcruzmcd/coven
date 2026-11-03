import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

type ActionResult = { error: string } | { success: true };

const updateEventPlanningActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventPlanningAction: updateEventPlanningActionMock,
}));

const { PlanningTab } = await import("./planning-tab");

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
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

describe("PlanningTab (#1778)", () => {
  beforeEach(() => updateEventPlanningActionMock.mockClear());

  test("holds only the lead and budget", () => {
    renderTab(makeEvent());

    expect(screen.getByText("Event lead")).toBeInTheDocument();
    expect(screen.getByLabelText("Budget ($)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capacity")).toBeNull();
    expect(screen.queryByText(/Registration/)).toBeNull();
  });

  test("saves the budget and lead, and nothing else", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ budget_amount: 100 }));

    const budget = screen.getByLabelText("Budget ($)");
    await user.clear(budget);
    await user.type(budget, "250");
    // Submitted directly: happy-dom's step check rounds, so it calls any
    // nonzero amount on a `step="0.01"` input a mismatch and the button would
    // refuse to submit. Browsers do not.
    fireEvent.submit(document.getElementById("planning-form")!);

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventPlanningActionMock.mock.calls[0][1];
    expect([...submitted.keys()].sort()).toEqual([
      "budgetAmount",
      "eventLeadId",
    ]);
    expect(submitted.get("budgetAmount")).toBe("250");
    expect(submitted.get("eventLeadId")).toBe("");
  });

  for (const [why, mode, report] of [
    ["in view mode", "view", "not_started"],
    ["once the report is submitted", "edit", "submitted"],
  ] as const) {
    test(`is read-only ${why}`, () => {
      renderTab(
        makeEvent({
          report_status: report,
          budget_amount: 500,
          event_lead: {
            id: "person-1",
            name: "Sam Rivera",
          } as EventRow["event_lead"],
        }),
        mode,
      );

      expect(screen.queryByRole("spinbutton")).toBeNull();
      expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
      expect(screen.getByText("$500.00")).toBeInTheDocument();
    });
  }
});
