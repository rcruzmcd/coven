import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";
import * as ImpactActions from "./impact-actions";
import * as RetroActions from "./retro-actions";
import { labelText } from "../../../../../test/labels";
import type { EventReport } from "@/lib/portal/event-report-metrics";
import type { EventReportView } from "./report-data-actions";
import type { EventRetro, EventRetroItem } from "./retro-actions";
import type { EventImpactNotes } from "./impact-actions";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";

type ActionResult = { error: string } | { success: true };

const getCanReopenEventReportActionMock = mock<
  () => Promise<{ data: { canReopen: boolean } }>
>(async () => ({ data: { canReopen: false } }));
const reopenEventReportActionMock = mock<
  (id: string, reason: string) => Promise<ActionResult>
>(async () => ({ success: true }));

const updateEventReportActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  getCanReopenEventReportAction: getCanReopenEventReportActionMock,
  reopenEventReportAction: reopenEventReportActionMock,
  updateEventReportAction: updateEventReportActionMock,
}));

const noImpact = async (): Promise<{ data: EventImpactNotes }> => ({
  data: { note: null, canView: false, canManage: false },
});
const getEventImpactActionMock =
  mock<(eventId: string) => Promise<{ data: EventImpactNotes }>>(noImpact);
const upsertEventImpactActionMock = mock<
  (eventId: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./impact-actions", () => ({
  ...ImpactActions,
  getEventImpactAction: getEventImpactActionMock,
  upsertEventImpactAction: upsertEventImpactActionMock,
}));

const derived: EventImpactDerived = {
  participants: 42,
  checkedIn: 30,
  firstTimeParticipants: 12,
  recurringParticipants: 18,
  volunteerParticipants: 6,
  beginnerParticipants: 9,
  firstTimeOnSnow: 4,
  profiledAttendees: 30,
  discountCodesAssigned: 5,
  rentalSubsidies: 3,
  assistance: {
    discountCodes: 150,
    distributions: 80,
    expenses: 200,
    total: 430,
  },
  autoAssignDiscountCodes: false,
  peopleServed: { distributed: 7, recipients: 5, value: 80 },
  discountValueOffered: {
    shared: 520,
    singleUse: 65,
    total: 585,
    codes: [],
  },
  placeReach: null,
};

const emptyMoney = {
  incomeStreams: [],
  income: 0,
  salesTax: 0,
  expensesByStatus: [],
  reimbursementsByStatus: [],
  paidSpend: 0,
  committedSpend: 0,
  pendingSpend: 0,
  net: 0,
  budget: null,
  budgetRemaining: null,
};

const emptyLive = {
  money: emptyMoney,
  goods: null,
  sponsors: null,
  team: null,
  operations: { incidents: 0, bySeverity: {} },
} satisfies EventReport;

const emptyReport = async () => ({
  data: { live: emptyLive, snapshot: null } satisfies EventReportView,
});

const getEventReportActionMock =
  mock<(eventId: string) => Promise<{ data: EventReportView }>>(emptyReport);

mock.module("./report-data-actions", () => ({
  getEventReportAction: getEventReportActionMock,
}));

const emptyRetro = async (): Promise<{ data: EventRetro }> => ({
  data: {
    items: [],
    canWrite: false,
    canManage: false,
    userId: "user-1",
    locked: false,
    owners: [],
  },
});

const getEventRetroActionMock =
  mock<(eventId: string) => Promise<{ data: EventRetro }>>(emptyRetro);

// Spread, so a later file in the same run still finds the exports this one
// does not replace (mock.module is process-wide).
mock.module("./retro-actions", () => ({
  ...RetroActions,
  getEventRetroAction: getEventRetroActionMock,
  createEventRetroItemAction: mock(async () => ({ success: true })),
  updateEventRetroItemAction: mock(async () => ({ success: true })),
  setEventRetroActionDoneAction: mock(async () => ({ success: true })),
  deleteEventRetroItemAction: mock(async () => ({ success: true })),
}));

const { ResultsTab } = await import("./results-tab");

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

describe("ResultsTab", () => {
  beforeEach(() => {
    getEventImpactActionMock.mockImplementation(noImpact);
    upsertEventImpactActionMock.mockClear();
    updateEventReportActionMock.mockClear();
    getEventReportActionMock.mockImplementation(emptyReport);
    getEventRetroActionMock.mockImplementation(emptyRetro);
    getCanReopenEventReportActionMock.mockClear();
    reopenEventReportActionMock.mockClear();
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: false },
    }));
    reopenEventReportActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("hides the reopen button for a non-admin, even once the report is submitted", async () => {
    render(
      <ResultsTab
        event={makeEvent({ report_status: "submitted" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    await screen.findByText(/submitted/i);
    expect(
      screen.queryByRole("button", { name: "Reopen report" }),
    ).not.toBeInTheDocument();
  });

  test("hides the reopen button while the report isn't submitted, even for an admin", () => {
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: true },
    }));

    render(
      <ResultsTab
        event={makeEvent({ report_status: "in_progress" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Reopen report" }),
    ).not.toBeInTheDocument();
  });

  test("lets an admin reopen a submitted report after giving a reason", async () => {
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: true },
    }));

    render(
      <ResultsTab
        event={makeEvent({ report_status: "submitted" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    const reopenButton = await screen.findByRole("button", {
      name: "Reopen report",
    });
    fireEvent.click(reopenButton);

    const submitButton = screen
      .getAllByRole("button", { name: "Reopen report" })
      .find((button) => button.getAttribute("type") === "submit")!;

    fireEvent.change(screen.getByLabelText(labelText("Reason")), {
      target: { value: "Capacity needs correcting after the fact." },
    });
    fireEvent.click(submitButton);

    expect(reopenEventReportActionMock).toHaveBeenCalledWith(
      "event-1",
      "Capacity needs correcting after the fact.",
    );
  });

  // #1576: the summary is computed, not typed.
  test("shows computed sections the reader may see, and no summary textarea", async () => {
    getEventReportActionMock.mockImplementation(async () => ({
      data: {
        live: {
          money: {
            ...emptyMoney,
            incomeStreams: [{ key: "ticket_sales", count: 2, total: 300 }],
            income: 300,
            net: 300,
          },
          goods: null,
          sponsors: null,
          team: null,
          operations: { incidents: 1, bySeverity: { minor: 1 } },
        },
        snapshot: null,
      },
    }));

    render(
      <ResultsTab
        event={makeEvent()}
        formId="report-form"
        mode="edit"
        onSaved={() => {}}
      />,
    );

    const money = await screen.findByRole("region", { name: "Money" });
    expect(money).toHaveTextContent("Ticket sales");
    expect(money).toHaveTextContent("$300.00");
    expect(
      screen.getByRole("region", { name: "Operations" }),
    ).toHaveTextContent("1 minor");
    // Sections the RPC returned null for are not rendered at all.
    expect(screen.queryByRole("region", { name: "Goods" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Sponsors" })).toBeNull();
    expect(screen.queryByLabelText(/report summary/i)).toBeNull();
  });

  // #1579: a submitted report shows what it was submitted with.
  test("a submitted report shows its frozen figures and flags drift", async () => {
    const sales = [{ key: "ticket_sales", count: 4, total: 1240 }];
    const frozen = {
      ...emptyLive,
      money: { ...emptyMoney, incomeStreams: sales, income: 1240, net: 1240 },
    };
    getEventReportActionMock.mockImplementation(async () => ({
      data: {
        live: {
          ...emptyLive,
          money: {
            ...emptyMoney,
            incomeStreams: sales,
            income: 1240,
            paidSpend: 60,
            net: 1180,
          },
        },
        snapshot: { report: frozen, capturedAt: "2026-10-01T18:00:00Z" },
      },
    }));

    render(
      <ResultsTab
        event={makeEvent({ report_status: "submitted" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    const money = await screen.findByRole("region", { name: "Money" });
    expect(screen.getByRole("note")).toHaveTextContent(
      /Figures as submitted on .*Some have changed since/,
    );
    const figure = (label: string) =>
      within(money).getByText(label, { selector: "dt" }).closest("div")!;
    const net = figure("Net");
    expect(net).toHaveTextContent("$1,240.00");
    expect(net).toHaveTextContent("Changed since submission: $1,180.00 now");
    const income = figure("Income");
    expect(income).not.toHaveTextContent("Changed since submission");
  });

  test("says so when a visible section has nothing recorded", async () => {
    render(
      <ResultsTab
        event={makeEvent()}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText(
        "No income, expenses or budget recorded for this event.",
      ),
    ).toBeInTheDocument();
  });

  test("keeps an old typed summary readable", async () => {
    render(
      <ResultsTab
        event={makeEvent({ report_summary: "Great turnout despite the snow." })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText("Great turnout despite the snow."),
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier written summary")).toBeInTheDocument();
  });

  // #1588: Report and Impact are one card.
  test("shows Outcomes from the derived figures, before the rest", async () => {
    render(
      <ResultsTab
        event={makeEvent()}
        derived={derived}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    const participation = screen.getByRole("region", {
      name: "Participation",
    });
    expect(participation).toHaveTextContent("42");
    expect(participation).toHaveTextContent("First time on snow");
    expect(
      screen.getByRole("region", { name: "People served" }),
    ).toHaveTextContent("$80.00");
    const assistance = screen.getByRole("region", {
      name: "Assistance given",
    });
    expect(assistance).toHaveTextContent("Rental subsidies");
    expect(assistance).toHaveTextContent("$430.00");
    // #1589: offered value sits with the codes, split so it can be traced,
    // and never in assistance.
    const codes = screen.getByRole("region", { name: "Discount codes" });
    expect(codes).toHaveTextContent("Discount value offered: shared code");
    expect(codes).toHaveTextContent("$520.00");
    expect(codes).toHaveTextContent("$65.00");
    expect(codes).toHaveTextContent("$585.00");
    expect(assistance).not.toHaveTextContent("Discount value offered");
    // The Report's old Guests section is gone: participation shows once.
    expect(await screen.findByRole("region", { name: "Money" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Guests" })).toBeNull();
    expect(screen.getAllByText("Participants")).toHaveLength(1);
  });

  test("hides the figures a reader may not see", () => {
    render(
      <ResultsTab
        event={makeEvent()}
        derived={{
          ...derived,
          beginnerParticipants: null,
          firstTimeOnSnow: null,
          discountCodesAssigned: null,
          rentalSubsidies: null,
          assistance: null,
        }}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(screen.queryByText("First time on snow")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Assistance given" }),
    ).toBeNull();
    expect(screen.queryByRole("region", { name: "Discount codes" })).toBeNull();
  });

  test("leaves no numeric input on the card, only the free text", async () => {
    getEventImpactActionMock.mockImplementation(async () => ({
      data: {
        note: null,
        canView: true,
        canManage: true,
      },
    }));
    const { container } = render(
      <ResultsTab
        event={makeEvent()}
        derived={derived}
        formId="report-form"
        mode="edit"
        onSaved={() => {}}
      />,
    );

    expect(await screen.findByLabelText("Impact notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Participant feedback")).toBeInTheDocument();
    expect(screen.getByLabelText("Photos / content")).toBeInTheDocument();
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  test("shows archived hand-entered figures read-only, where they exist", async () => {
    getEventImpactActionMock.mockImplementation(async () => ({
      data: {
        note: {
          id: "note-1",
          event_id: "event-1",
          notes: "Great day.",
          first_time_riders: 11,
          rental_subsidies_count: null,
          assistance_total: "250.00",
          beginner_pairings_count: null,
        },
        canView: true,
        canManage: false,
      },
    }));
    render(
      <ResultsTab
        event={makeEvent()}
        derived={derived}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    const archived = await screen.findByRole("region", {
      name: "Entered by hand (archived)",
    });
    expect(archived).toHaveTextContent("First-time skiers/snowboarders");
    expect(archived).toHaveTextContent("$250.00");
    // Only the figures that hold a value.
    expect(archived).not.toHaveTextContent("Beginners paired");
    expect(screen.getByText("Great day.")).toBeInTheDocument();
  });

  test("saves impact notes only when they changed", async () => {
    getEventImpactActionMock.mockImplementation(async () => ({
      data: { note: null, canView: true, canManage: true },
    }));
    render(
      <ResultsTab
        event={makeEvent()}
        derived={derived}
        formId="report-form"
        mode="edit"
        onSaved={() => {}}
      />,
    );

    const notes = await screen.findByLabelText("Impact notes");
    fireEvent.change(notes, { target: { value: "Snow all day." } });
    fireEvent.submit(document.getElementById("report-form")!);

    await waitFor(() =>
      expect(upsertEventImpactActionMock).toHaveBeenCalledTimes(1),
    );
    expect(updateEventReportActionMock).toHaveBeenCalledTimes(1);
    const sent = upsertEventImpactActionMock.mock.calls[0][1];
    expect(sent.get("notes")).toBe("Snow all day.");
  });

  // #1578: the retro replaces the lessons-learned textarea.
  describe("retro", () => {
    const item = (overrides: Partial<EventRetroItem>): EventRetroItem => ({
      id: "item",
      event_id: "event-1",
      kind: "went_well",
      body: "",
      area: null,
      author_id: "user-1",
      author_name: "Jordan Lee",
      owner: null,
      status: null,
      completed_at: null,
      created_at: "2026-09-02T00:00:00.000Z",
      ...overrides,
    });

    test("groups items by kind, and lets an author change only their own", async () => {
      getEventRetroActionMock.mockImplementation(async () => ({
        data: {
          ...(await emptyRetro()).data,
          canWrite: true,
          items: [
            item({ id: "a", body: "Ability groups", area: "team" }),
            item({
              id: "b",
              kind: "improve",
              body: "Sign-in table",
              author_id: "someone-else",
              author_name: "Avery Morgan",
            }),
            item({
              id: "c",
              kind: "action",
              body: "Print the roster",
              status: "open",
              owner: { id: "p1", name: "Casey Rivera" },
            }),
          ],
        },
      }));

      render(
        <ResultsTab
          event={makeEvent()}
          formId="report-form"
          mode="view"
          onSaved={() => {}}
        />,
      );

      const wentWell = await screen.findByRole("region", {
        name: "Went well",
      });
      expect(wentWell).toHaveTextContent("Ability groups");
      expect(wentWell).toHaveTextContent("Team");
      expect(wentWell).toHaveTextContent("by Jordan Lee");
      expect(
        screen.getByRole("region", { name: "To improve" }),
      ).toHaveTextContent("Sign-in table");
      const actions = screen.getByRole("region", { name: "Action items" });
      expect(actions).toHaveTextContent("Owner: Casey Rivera");
      expect(
        screen.getByRole("checkbox", { name: 'Mark "Print the roster" done' }),
      ).not.toBeDisabled();

      // Two of the three are this reader's own.
      expect(
        screen.getAllByRole("button", { name: "Edit retro item" }),
      ).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: "+ Add to retro" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/lessons learned/i)).toBeNull();
    });

    test("offers no add button to a reader who cannot write", async () => {
      render(
        <ResultsTab
          event={makeEvent()}
          formId="report-form"
          mode="view"
          onSaved={() => {}}
        />,
      );
      expect(
        await screen.findByRole("region", { name: "Went well" }),
      ).toHaveTextContent("Nothing yet.");
      expect(
        screen.queryByRole("button", { name: "+ Add to retro" }),
      ).toBeNull();
    });
  });
});
