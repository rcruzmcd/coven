import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import * as PeopleActions from "../../people/actions";
import * as VolunteersActions from "../volunteers-actions";
import * as ShiftsActions from "../shifts-actions";
import * as SponsorsActions from "../sponsors-actions";
import * as StaffActions from "../staff-actions";
import * as RegistrantsActions from "../registrants-actions";
import * as DiscountCodesActions from "../discount-codes-actions";
import * as DistributionActions from "../../home/distribution-actions";
import * as IncidentsActions from "../incidents-actions";
import * as ChecklistActions from "../checklist-actions";
import * as MeetingsActions from "../../governance/meetings/actions";
import * as GiveawayActions from "../giveaway-actions";
import * as ExpensesActions from "../../finance/expenses/actions";
import * as RevenueActions from "../../finance/revenue/actions";
import * as SalesActions from "../../finance/sales/actions";
import * as ImpactActions from "../impact-actions";
import * as ImpactDerivedActions from "../impact-derived-actions";
import * as RetroActions from "../retro-actions";
import * as HomeActions from "../../home/actions";
import * as LogisticsActions from "../logistics-actions";
import * as RoleTypesActions from "../../volunteers/roles/actions";
import * as EventsActions from "../actions";
import type { EventRow } from "../event-badges";
import { eventGroups } from "../event-tabs-config";
import { mockUrlTabState } from "@/../test/url-tab-state-mock";

mockUrlTabState();

// The reads the shared provider owns (event-shared-data.tsx) are held by name
// so the tests below can count how many times reaching a card fetches each one.
const listPeopleActionMock = mock(async () => ({ data: [] }));
const listEventPeopleActionMock = mock(async () => ({
  data: [],
  canCreate: false,
}));
const listEventRegistrantsActionMock = mock(async () => ({ data: [] }));
const getEventImpactDerivedActionMock = mock(async () => ({
  data: {
    participants: 0,
    checkedIn: 0,
    firstTimeParticipants: 0,
    recurringParticipants: 0,
    volunteerParticipants: 0,
    discountCodesAssigned: 0,
    autoAssignDiscountCodes: false,
    peopleServed: { distributed: 0, recipients: 0, value: 0 },
  },
}));

mock.module("../event-people-actions", () => ({
  listEventPeopleAction: listEventPeopleActionMock,
}));
mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));
mock.module("../volunteers-actions", () => ({
  ...VolunteersActions,
  listEventVolunteersAction: mock(async () => ({ data: [] })),
  listEventVolunteerHoursAction: mock(async () => ({ data: [] })),
}));
mock.module("../shifts-actions", () => ({
  ...ShiftsActions,
  listEventShiftsAction: mock(async () => ({ data: [] })),
}));
mock.module("../sponsors-actions", () => ({
  ...SponsorsActions,
  listEventSponsorsAction: mock(async () => ({ data: [] })),
}));
mock.module("../staff-actions", () => ({
  ...StaffActions,
  listEventStaffAction: mock(async () => ({ data: [] })),
}));
mock.module("../registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
}));
mock.module("../discount-codes-actions", () => ({
  ...DiscountCodesActions,
  listDiscountCodesAction: mock(async () => ({ data: [] })),
}));
mock.module("../../home/distribution-actions", () => ({
  ...DistributionActions,
  listEventDistributionsAction: mock(async () => ({ data: [] })),
}));
mock.module("../incidents-actions", () => ({
  ...IncidentsActions,
  listEventIncidentsAction: mock(async () => ({ data: [] })),
}));
mock.module("../../governance/meetings/actions", () => ({
  ...MeetingsActions,
  listEventMeetingsAction: mock(async () => []),
}));
mock.module("../checklist-actions", () => ({
  ...ChecklistActions,
  listEventChecklistItemsAction: mock(async () => ({ data: [] })),
}));
mock.module("../giveaway-actions", () => ({
  ...GiveawayActions,
  getEventGiveawayAction: mock(async () => ({ data: null })),
}));
mock.module("../../finance/expenses/actions", () => ({
  ...ExpensesActions,
  listEventExpensesAction: mock(async () => ({ data: [] })),
  getExpenseApprovalContextAction: mock(async () => ({
    data: {
      userId: null,
      canApprove: false,
      canSelfApprove: false,
      canMarkPaid: false,
      threshold: null,
    },
  })),
}));
mock.module("../../finance/revenue/actions", () => ({
  ...RevenueActions,
  listEventRevenueAction: mock(async () => ({ data: [] })),
}));
mock.module("../../finance/sales/actions", () => ({
  ...SalesActions,
  listEventSalesAction: mock(async () => ({ data: [] })),
}));
mock.module("../impact-actions", () => ({
  ...ImpactActions,
  getEventImpactAction: mock(async () => ({
    data: { note: null, canView: false, canManage: false },
  })),
}));
// The Results card reads these on open (#1588).
mock.module("../report-data-actions", () => ({
  getEventReportAction: mock(async () => ({
    data: {
      live: {
        money: null,
        goods: null,
        sponsors: null,
        team: null,
        operations: null,
      },
      snapshot: null,
    },
  })),
}));
mock.module("../retro-actions", () => ({
  ...RetroActions,
  getEventRetroAction: mock(async () => ({
    data: {
      items: [],
      canWrite: false,
      canManage: false,
      userId: "user-1",
      locked: false,
      owners: [],
    },
  })),
}));
mock.module("../impact-derived-actions", () => ({
  ...ImpactDerivedActions,
  getEventImpactDerivedAction: getEventImpactDerivedActionMock,
}));
mock.module("../../home/actions", () => ({
  ...HomeActions,
  listEventDonationsAction: mock(async () => ({ data: [] })),
}));
mock.module("../logistics-actions", () => ({
  ...LogisticsActions,
  getEventLogisticsAction: mock(async () => ({ data: null })),
}));
mock.module("../../volunteers/roles/actions", () => ({
  ...RoleTypesActions,
  listRoleTypesAction: mock(async () => ({ data: [] })),
}));
mock.module("../actions", () => ({
  ...EventsActions,
  getCanReopenEventReportAction: mock(async () => ({
    data: { canReopen: false },
  })),
}));

const { EventDetailView } = await import("./event-detail-view");

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

// Every card, as an admin holding the lot gets them. #903 made the rail's
// groups a function of the permission map -- the Finance and Inventory cards
// drop out for a reader (or a tenant) without those sections -- and these tests
// are about the rail's behaviour, not about who sees what. eventGroups() is
// covered on its own in event-tabs-config.test.tsx.
const ALL_GROUPS = eventGroups(
  Object.fromEntries(
    [
      "events",
      "finance",
      "event_expenses",
      "event_revenue",
      "sales",
      "inventory",
      "inventory_reports",
    ].map((resource) => [resource, "manage" as const]),
  ),
);

// The same cards for a reader with `events: view` and the rest, so every card
// is listed and none of them may be edited (#1688: edit access is per card).
const VIEW_ONLY_GROUPS = eventGroups(
  Object.fromEntries(
    [
      "events",
      "finance",
      "event_expenses",
      "event_revenue",
      "sales",
      "inventory_reports",
    ].map((resource) => [resource, "view" as const]),
  ),
);

/** The section rail (#1008), which replaced the two strips of tabs. */
function rail() {
  return within(screen.getByRole("navigation", { name: "Event sections" }));
}

/** A rail row, by the section title it shows. */
function railRow(name: string) {
  return rail().getByRole("button", { name: new RegExp(`^${name}`) });
}

/** The card on screen, addressed by its own title. */
function cardTitled(title: string) {
  const heading = screen
    .getAllByText(title)
    .find((node) => node.dataset.slot === "card-title");
  return heading?.closest("[data-slot=card]") ?? null;
}

function renderView(
  props: Partial<Parameters<typeof EventDetailView>[0]> = {},
) {
  return render(
    <EventDetailView
      device="desktop"
      event={makeEvent()}
      programs={[]}
      canDelete={true}
      deleteBlockers={[]}
      groups={ALL_GROUPS}
      initialCard="overview"
      nowIso="2026-01-01T00:00:00.000Z"
      {...props}
    />,
  );
}

describe("EventDetailView", () => {
  test("lists every section at once, under its group heading", () => {
    renderView();

    // The whole point of the rail (#1008): every section is readable
    // without opening anything, so finding one is not a memory test. Media
    // joined Results in #1606, Access in #1689, Registration in #1778,
    // Registrant emails in #1779.
    expect(rail().getAllByRole("button")).toHaveLength(23);
    for (const heading of [
      "Overview",
      "Guests",
      "Team",
      "Goods",
      "Operations",
      "Money",
      "Results",
    ]) {
      // getAll: the Results heading holds a card of the same name (#1588).
      expect(rail().getAllByText(heading)[0]).toBeInTheDocument();
    }
    for (const section of [
      "Event details",
      "Checklist",
      "Planning",
      "Registration",
      "Sponsors",
      "Registrants",
      "Results",
      "Media",
    ]) {
      expect(railRow(section)).toBeVisible();
    }

    expect(
      screen.getByRole("heading", { name: "Winter Gear Swap" }),
    ).toBeInTheDocument();
    // One card on screen at a time, as before.
    expect(cardTitled("Event details")).not.toBeNull();
    expect(cardTitled("Checklist")).toBeNull();
    expect(railRow("Event details")).toHaveAttribute("aria-current", "page");
  });

  test("opens a section from any group without passing through a phase", () => {
    renderView();

    // Reaching Sponsors used to mean selecting the Planning phase first, and
    // knowing that was where it lived.
    fireEvent.click(railRow("Sponsors"));

    expect(cardTitled("Sponsors")).not.toBeNull();
    expect(cardTitled("Event details")).toBeNull();
    expect(railRow("Sponsors")).toHaveAttribute("aria-current", "page");

    // And back across the lifecycle in one click, which is the other half of
    // it: Planning is still edited after the event has happened.
    fireEvent.click(railRow("Results"));
    expect(cardTitled("Results")).not.toBeNull();
    fireEvent.click(railRow("Planning"));
    expect(cardTitled("Planning")).not.toBeNull();
  });

  test("searches sections by title and by keyword", () => {
    renderView();

    const search = screen.getByRole("searchbox", {
      name: "Search this event's sections",
    });

    // "budget" is on a card called Planning, in the Overview group -- exactly
    // the lookup the phase tabs could not answer.
    fireEvent.change(search, { target: { value: "budget" } });
    const results = within(
      screen.getByRole("navigation", { name: "Search results" }),
    );
    expect(results.getAllByRole("button")).toHaveLength(1);
    expect(results.getByRole("button", { name: /Planning/ })).toBeVisible();

    // #1778. Registration settings have their own card.
    for (const query of ["registration", "deadline", "capacity", "questions"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(
        within(
          screen.getByRole("navigation", { name: "Search results" }),
        ).getByRole("button", { name: /^Registration/ }),
      ).toBeVisible();
    }
    fireEvent.change(search, { target: { value: "lead" } });
    expect(
      within(
        screen.getByRole("navigation", { name: "Search results" }),
      ).getByRole("button", { name: /Planning/ }),
    ).toBeVisible();

    fireEvent.change(search, { target: { value: "raffle" } });
    expect(
      within(
        screen.getByRole("navigation", { name: "Search results" }),
      ).getByRole("button", { name: /Giveaway/ }),
    ).toBeVisible();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });

  test("opens a section picked out of the search results", () => {
    renderView();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search this event's sections" }),
      { target: { value: "venue" } },
    );
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Search results" }),
      ).getByRole("button", { name: /Logistics/ }),
    );

    expect(cardTitled("Logistics")).not.toBeNull();
  });

  test("edits inline per card, without an edit sheet", () => {
    renderView();

    expect(
      screen.getByRole("button", { name: "Edit event details" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();

    fireEvent.click(railRow("Planning"));
    expect(
      screen.getByRole("button", { name: "Edit planning" }),
    ).toBeInTheDocument();
  });

  test("puts a card's create actions in that card, not a shared strip", () => {
    renderView();

    fireEvent.click(railRow("Volunteers"));

    // The actions used to be merged into one row beside the phase tabs, which
    // left the operator scrolling back up past three cards to reach them.
    const addVolunteer = screen.getByRole("button", {
      name: "+ Add volunteer",
    });
    const card = addVolunteer.closest("[data-slot=card]");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("Volunteers");
    expect(card).not.toHaveTextContent("Sponsors");
  });

  test("hides create actions without manage access", () => {
    renderView({ canDelete: false, groups: VIEW_ONLY_GROUPS });

    fireEvent.click(railRow("Volunteers"));

    expect(
      screen.queryByRole("button", { name: "+ Add volunteer" }),
    ).not.toBeInTheDocument();
  });

  test("hides edit controls without manage access", () => {
    renderView({ canDelete: false, groups: VIEW_ONLY_GROUPS });

    expect(
      screen.queryByRole("button", { name: "Edit event details" }),
    ).not.toBeInTheDocument();
  });

  test("hides edit for report-locked cards after report submission", () => {
    renderView({ event: makeEvent({ report_status: "submitted" }) });

    expect(
      screen.queryByRole("button", { name: "Edit event details" }),
    ).not.toBeInTheDocument();
  });

  test("opens the card the server resolved from the deep link", () => {
    renderView({ initialCard: "registrants" });

    expect(cardTitled("Registrants")).not.toBeNull();
    expect(cardTitled("Attendance")).toBeNull();
    expect(cardTitled("Event details")).toBeNull();
    expect(railRow("Registrants")).toHaveAttribute("aria-current", "page");
  });

  test("counts outstanding work on the section it belongs to, and names it", () => {
    renderView({
      cardTasks: {
        checklist: ["Bring the folding tables", "Confirm the DJ"],
        planning: ["Planning incomplete"],
        results: ["After-report not started"],
      },
    });

    // On the rows, not on a phase tab: a "2" on During told you the phase had
    // work in it but not which of its six cards.
    expect(
      within(railRow("Checklist")).getByLabelText("2 outstanding"),
    ).toHaveAttribute("title", "Bring the folding tables, Confirm the DJ");
    expect(
      within(railRow("Planning")).getByLabelText("1 outstanding"),
    ).toBeInTheDocument();
    expect(
      within(railRow("Results")).getByLabelText("1 outstanding"),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/outstanding/)).toHaveLength(3);
  });

  test("shows no badge on a section with nothing outstanding", () => {
    renderView({ cardTasks: {} });

    expect(screen.queryByLabelText(/outstanding/)).not.toBeInTheDocument();
  });

  describe("shared reads", () => {
    beforeEach(() => {
      listEventPeopleActionMock.mockClear();
      listEventRegistrantsActionMock.mockClear();
      getEventImpactDerivedActionMock.mockClear();
    });

    test("fetches nothing the card on screen doesn't ask for", () => {
      renderView();

      // Event details shares nothing. The phase provider used to fetch a
      // phase's whole union the moment the phase opened.
      expect(listEventPeopleActionMock).not.toHaveBeenCalled();
      expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
      expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();

      fireEvent.click(railRow("Planning"));
      expect(listEventPeopleActionMock).toHaveBeenCalledTimes(1);
      expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
    });

    test("keeps a read it has already made, across cards", () => {
      renderView();

      fireEvent.click(railRow("Planning"));
      expect(listEventPeopleActionMock).toHaveBeenCalledTimes(1);

      // Sponsors wants people too, and it is in the same group.
      fireEvent.click(railRow("Sponsors"));
      expect(listEventPeopleActionMock).toHaveBeenCalledTimes(1);

      // Leaving for a card that wants none of it, then coming back, must not
      // refetch: requested resources accumulate rather than following the
      // card. Giveaway wants people as well, from another group entirely.
      fireEvent.click(railRow("Incidents"));
      fireEvent.click(railRow("Giveaway"));
      expect(listEventPeopleActionMock).toHaveBeenCalledTimes(1);
    });
  });
});
