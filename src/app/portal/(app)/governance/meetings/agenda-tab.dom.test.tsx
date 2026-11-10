import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  expectToast,
  renderWithToaster,
} from "../../../../../../test/toast-testing";
import * as ActionItemsActions from "./action-items-actions";
import type { ActionItem } from "./action-items-actions";
import * as AgendaActions from "./agenda-actions";
import * as DecisionsActions from "./decisions-actions";
import * as MinutesApprovalActions from "./minutes-approval-actions";
import * as MeetingContextActions from "./meeting-context-actions";
import * as AgendaEventsActions from "./agenda-events-actions";
import type { AgendaEventsFeed } from "./agenda-events-actions";
import * as AgendaCalendarActions from "./agenda-calendar-actions";
import type {
  AgendaCalendarFeed,
  AgendaPartnershipsFeed,
} from "./agenda-calendar-actions";
import type { Agenda } from "./agenda-actions";
import type { AgendaTemplateSection } from "./agenda-template-shared";

const SETTLE = { timeout: 4_000 };

// Version 1's shape: seven sections, none of them sourced. Two are enough to
// show the branch; the keys and labels are the seeded ones.
const MANUAL_SECTIONS: AgendaTemplateSection[] = [
  {
    key: "finance_fundraising",
    label: "Finance & Fundraising",
    topics: ["Current financial position"],
  },
  { key: "events", label: "Events", topics: ["Upcoming events"] },
];

// Version 2's: the Events section names the Events module, Marketing & Social
// names calendar categories -- including one this tenant has deactivated.
const SOURCED_SECTIONS: AgendaTemplateSection[] = [
  MANUAL_SECTIONS[0]!,
  { ...MANUAL_SECTIONS[1]!, source: { kind: "events" } },
  {
    key: "marketing_social",
    label: "Marketing & Social",
    topics: ["Upcoming campaigns"],
    source: {
      kind: "calendar",
      categories: ["campaigns_fundraising", "retired_by_this_tenant"],
      item_types: ["content_campaign"],
    },
  },
];

// Version 2's Community & Partnerships section, beside Marketing & Social:
// both are `{kind: "calendar"}`, and only one of them carries partnerships.
const COMMUNITY_SECTIONS: AgendaTemplateSection[] = [
  SOURCED_SECTIONS[2]!,
  {
    key: "community_partnerships",
    label: "Community & Partnerships",
    topics: ["Partner relationships"],
    source: {
      kind: "calendar",
      categories: ["partner_opportunities"],
      item_types: ["partner_event", "partner_opportunity"],
    },
  },
];

let agendaRow: Agenda | null = null;
const upsertAgendaAction = mock(
  async (_meetingId: string, _formData: FormData) => ({
    success: true as const,
  }),
);

mock.module("./agenda-actions", () => ({
  ...AgendaActions,
  getAgendaAction: mock(async () => ({ data: agendaRow })),
  listActiveAgendaTemplatesAction: mock(async () => ({ data: [] })),
  upsertAgendaAction,
}));
// What the previous meeting left open, and closing one from here (#1245).
let carriedOver: ActionItem[] = [];
const updateActionItemStatusAction = mock(
  async (_id: string, _status: "open" | "done") => ({
    success: true as const,
  }),
);
mock.module("./action-items-actions", () => ({
  ...ActionItemsActions,
  listActionItemsAction: mock(async () => ({ data: [] })),
  listCarriedOverActionItemsAction: mock(async () => ({ data: carriedOver })),
  updateActionItemStatusAction,
}));
mock.module("./decisions-actions", () => ({
  ...DecisionsActions,
  listDecisionsAction: mock(async () => ({ data: [] })),
}));
mock.module("./minutes-approval-actions", () => ({
  ...MinutesApprovalActions,
  getPreviousMeetingMinutesAction: mock(async () => ({ data: null })),
}));
// Both reference reads are stubbed absent: this file is about how a section
// branches on its source, not about what the module feeds put above the box.
mock.module("./meeting-context-actions", () => ({
  ...MeetingContextActions,
  listMeetingDatedContextAction: mock(async () => ({
    error: { message: "not under test" },
  })),
  getMeetingTopicContextAction: mock(async () => ({
    error: { message: "not under test" },
  })),
}));
// The Events feed (#1241), stubbed down to one row in each group -- enough to
// show that the sourced Events section renders it and the manual one does not.
const listAgendaEventsAction = mock(
  async (
    _meetingId: string,
    _meetingDate: string,
  ): Promise<{ data: AgendaEventsFeed }> => ({
    data: {
      timeZone: "America/Denver",
      since: {
        fromDate: "2026-02-11",
        toDate: "2026-03-18",
        events: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Winter gear swap",
            starts_at: "2026-02-20T18:00:00.000Z",
            ends_at: null,
            timezone: "America/Denver",
            status: "published",
            report_status: "not_started",
            event_lead_id: null,
            event_lead_name: null,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Called-off clinic",
            starts_at: "2026-02-24T18:00:00.000Z",
            ends_at: null,
            timezone: "America/Denver",
            status: "cancelled",
            report_status: "not_started",
            event_lead_id: null,
            event_lead_name: null,
          },
        ],
      },
      upcoming: {
        fromDate: "2026-03-19",
        toDate: "2026-06-17",
        events: [],
      },
      unavailable: null,
    },
  }),
);
mock.module("./agenda-events-actions", () => ({
  ...AgendaEventsActions,
  listAgendaEventsAction,
}));
// The calendar feed (#1242/#1243). One reader answers both sourced sections,
// so the stub answers off the source it was handed -- which is the whole point
// of the parameterized action, and what lets these tests show that the two
// sections render different rows.
const CALENDAR_WINDOW = { fromDate: "2026-09-01", toDate: "2026-11-30" };

const COMMUNITY_FEED: AgendaCalendarFeed = {
  timeZone: "America/Denver",
  window: CALENDAR_WINDOW,
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Pride planning coffee",
      item_type: "partner_event",
      starts_at: "2026-09-12T06:00:00.000Z",
      time_zone: "America/Denver",
      calendar_status: "active",
      priority_tier: 2,
      owner_id: null,
      owner_name: null,
      categories: ["partner_opportunities"],
      // Its section never asks for content work state, so its read never
      // joined the pieces.
      content_pieces: [],
      publish_due_at: null,
      content_overdue: false,
    },
  ],
  categoryOptions: [
    { value: "partner_opportunities", label: "Partners & coalitions" },
  ],
  unavailable: null,
};

// Marketing & Social's rows carry what is written for them (#1243): one
// campaign with two pieces and a publish date already behind us, and one date
// with nothing planned against it at all.
const MARKETING_FEED: AgendaCalendarFeed = {
  timeZone: "America/Denver",
  window: CALENDAR_WINDOW,
  items: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      title: "Pride month campaign",
      item_type: "content_campaign",
      starts_at: "2026-09-15T06:00:00.000Z",
      time_zone: "America/Denver",
      calendar_status: "active",
      priority_tier: 1,
      owner_id: null,
      owner_name: "Sam Comms",
      categories: ["campaigns_fundraising"],
      content_pieces: [{ content_status: "draft" }, { content_status: "idea" }],
      publish_due_at: "2026-09-10T16:00:00.000Z",
      content_overdue: true,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      title: "First snow day",
      item_type: "winter_outdoor_sports_moment",
      starts_at: "2026-10-02T06:00:00.000Z",
      time_zone: "America/Denver",
      calendar_status: "idea",
      priority_tier: 3,
      owner_id: null,
      owner_name: null,
      categories: [],
      content_pieces: [],
      publish_due_at: null,
      content_overdue: false,
    },
  ],
  categoryOptions: [
    { value: "campaigns_fundraising", label: "Campaigns & fundraising" },
  ],
  unavailable: null,
};

const listAgendaCalendarItemsAction = mock(
  async (
    _meetingId: string,
    _meetingDate: string,
    source: unknown,
  ): Promise<{ data: AgendaCalendarFeed }> => ({
    data: (source as { item_types?: string[] })?.item_types?.includes(
      "content_campaign",
    )
      ? MARKETING_FEED
      : COMMUNITY_FEED,
  }),
);
const listOpenPartnershipsAction = mock(
  async (): Promise<{ data: AgendaPartnershipsFeed }> => ({
    data: {
      partnerships: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          organization: "Mountain Pride Collective",
          stage: "negotiating",
          next_step_date: "2026-08-01",
          owner_name: "Dana Lead",
          overdue: true,
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          organization: "Nordic Center",
          stage: "contacted",
          next_step_date: null,
          owner_name: null,
          overdue: false,
        },
      ],
      unavailable: null,
    },
  }),
);
mock.module("./agenda-calendar-actions", () => ({
  ...AgendaCalendarActions,
  listAgendaCalendarItemsAction,
  listOpenPartnershipsAction,
}));

// Pre-filling from the linked event (#1624): the prefill mock writes the row
// the next `getAgendaAction` reads, as the real action would.
let prefillItems: Agenda["items"] = [];
const prefillAgendaFromEventAction = mock(async (_meetingId: string) => {
  if (prefillItems.length === 0) return { added: 0 };
  agendaRow = simpleAgenda(prefillItems);
  return { added: prefillItems.length };
});
const refreshAgendaFromEventAction = mock(async (_meetingId: string) => ({
  added: 0,
}));
mock.module("./agenda-prefill-actions", () => ({
  prefillAgendaFromEventAction,
  refreshAgendaFromEventAction,
}));

const { AgendaTab } = await import("./agenda-tab");

function agenda(
  sections: AgendaTemplateSection[],
  ongoing: Agenda["ongoing_items"] = {},
): Agenda {
  return {
    id: "agenda-1",
    meeting_id: "meeting-1",
    format: "board",
    items: [],
    external_link: null,
    document_path: null,
    document_url: null,
    body_text: null,
    template_id: "template-1",
    template_version_id: "version-1",
    ongoing_items: ongoing,
    new_business: [],
    parking_lot: [],
    upcoming_dates: [],
    next_meeting_date: null,
    next_meeting_topics: null,
    template_sections: sections,
  };
}

// With a toaster throughout: the tab announces a failed action through one,
// and a tab rendered without it would swallow the only evidence a tick failed.
function renderTab(
  mode: "view" | "edit",
  canManage = true,
  meetingType = "board",
  onReadOnlyChange?: (readOnly: boolean) => void,
  eventId: string | null = null,
) {
  return renderWithToaster(
    <AgendaTab
      meetingId="meeting-1"
      meetingDate="2026-09-01"
      meetingType={meetingType}
      eventId={eventId}
      onReadOnlyChange={onReadOnlyChange}
      mode={mode}
      canManage={canManage}
      minutesApprovedAt={null}
      onViewActionItems={() => {}}
      onViewDecisions={() => {}}
      onExitEdit={() => {}}
    />,
  );
}

function carriedOverItem(description: string): ActionItem {
  return {
    id: "action-1",
    meeting_id: "meeting-0",
    description,
    due_date: null,
    status: "open",
    minutes_item_key: null,
    owner: { id: "person-1", name: "Dana Lead", email: null, phone: null },
  };
}

beforeEach(() => {
  upsertAgendaAction.mockClear();
  updateActionItemStatusAction.mockClear();
  updateActionItemStatusAction.mockResolvedValue({ success: true as const });
  agendaRow = null;
  carriedOver = [];
  prefillItems = [];
  prefillAgendaFromEventAction.mockClear();
  refreshAgendaFromEventAction.mockClear();
});

describe("AgendaTab ongoing board items", () => {
  test("a manual section keeps both boxes in the form", async () => {
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("edit");

    await waitFor(
      () => expect(screen.getAllByLabelText("Updates")).toHaveLength(2),
      SETTLE,
    );
    expect(screen.getAllByLabelText("Decisions needed")).toHaveLength(2);
    expect(screen.queryByLabelText("Discussion")).toBeNull();
  });

  test("a sourced section shows one Discussion box instead", async () => {
    agendaRow = agenda(SOURCED_SECTIONS);
    renderTab("edit");

    await waitFor(
      () => expect(screen.getAllByLabelText("Discussion")).toHaveLength(2),
      SETTLE,
    );
    // Only the one manual section left in version 2's shape.
    expect(screen.getAllByLabelText("Updates")).toHaveLength(1);
    expect(screen.getAllByLabelText("Decisions needed")).toHaveLength(1);
  });

  test("typing in a Discussion box saves it under the section key", async () => {
    agendaRow = agenda(SOURCED_SECTIONS);
    renderTab("edit");

    // Two sections are sourced; the first is Events.
    const box = await waitFor(
      () => screen.getAllByLabelText<HTMLTextAreaElement>("Discussion")[0]!,
      SETTLE,
    );
    fireEvent.change(box, { target: { value: "Two events need volunteers." } });
    fireEvent.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const form = upsertAgendaAction.mock.calls[0]![1];
    expect(JSON.parse(String(form.get("ongoingItems")))).toEqual({
      events: { discussion: "Two events need volunteers." },
    });
  });

  test("editing a sourced section keeps the text its old shape held", async () => {
    // The agenda was written against version 1 and the template moved on.
    agendaRow = agenda(SOURCED_SECTIONS, {
      events: { updates: "Swap logistics confirmed.", decisions_needed: "" },
    });
    renderTab("edit");

    // Two sections are sourced; the first is Events.
    const box = await waitFor(
      () => screen.getAllByLabelText<HTMLTextAreaElement>("Discussion")[0]!,
      SETTLE,
    );
    fireEvent.change(box, { target: { value: "Venue still open." } });
    fireEvent.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const form = upsertAgendaAction.mock.calls[0]![1];
    expect(JSON.parse(String(form.get("ongoingItems")))).toEqual({
      events: {
        updates: "Swap logistics confirmed.",
        decisions_needed: "",
        discussion: "Venue still open.",
      },
    });
  });

  test("an agenda pinned to version 1 still reads as Updates / Decisions needed", async () => {
    agendaRow = agenda(MANUAL_SECTIONS, {
      events: { updates: "Swap logistics confirmed.", decisions_needed: "" },
    });
    renderTab("view");

    await waitFor(
      () => expect(screen.getAllByText("Updates")).toHaveLength(2),
      SETTLE,
    );
    expect(screen.getAllByText("Decisions needed")).toHaveLength(2);
    expect(screen.queryByText("Discussion")).toBeNull();
    expect(screen.getByText("Swap logistics confirmed.")).toBeDefined();
  });

  test("the read view shows every field the row holds, whatever the shape", async () => {
    agendaRow = agenda(SOURCED_SECTIONS, {
      events: {
        updates: "Written under version 1.",
        decisions_needed: "Approve the venue.",
        discussion: "Written under version 2.",
      },
    });
    renderTab("view");

    await waitFor(
      () => expect(screen.getByText("Written under version 2.")).toBeDefined(),
      SETTLE,
    );
    expect(screen.getByText("Written under version 1.")).toBeDefined();
    expect(screen.getByText("Approve the venue.")).toBeDefined();
  });
});

// The Events feed in the slot #1240 left for it (#1241). What the rows say is
// the action's business and the integration test's; what matters here is that
// the section sourced to Events renders them, that the manual one never asks
// for them, and that a section the caller cannot see keeps its Discussion box.
describe("AgendaTab events feed", () => {
  test("renders the feed above the Events section's Discussion box", async () => {
    agendaRow = agenda(SOURCED_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getByText("Winter gear swap")).toBeDefined(),
      SETTLE,
    );
    expect(
      screen
        .getByRole("link", { name: "Winter gear swap" })
        .getAttribute("href"),
    ).toBe("/portal/events/11111111-1111-4111-8111-111111111111");
    // Behind the meeting, held, and no report in: the one row the board acts
    // on. The cancelled event beside it owed no report and is not flagged.
    expect(screen.getAllByText("Outstanding")).toHaveLength(1);
    expect(screen.getAllByText("Not started")).toHaveLength(1);
    // Named for a screen reader, which cannot see the heading above it.
    expect(
      screen.getByRole("table", { name: "Events since the last meeting" }),
    ).toBeDefined();
    expect(
      screen.getByText("No events scheduled before the next meeting"),
    ).toBeDefined();
  });

  test("does not read the feed for a template with no sourced Events section", async () => {
    listAgendaEventsAction.mockClear();
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getAllByText("Updates").length).toBeGreaterThan(0),
      SETTLE,
    );
    expect(listAgendaEventsAction).not.toHaveBeenCalled();
  });

  test("keeps the Discussion box when the caller cannot see Events", async () => {
    listAgendaEventsAction.mockResolvedValueOnce({
      data: {
        timeZone: "America/Denver",
        since: { fromDate: "2026-02-11", toDate: "2026-03-18", events: [] },
        upcoming: { fromDate: "2026-03-19", toDate: "2026-06-17", events: [] },
        unavailable: "forbidden",
      },
    });
    agendaRow = agenda(SOURCED_SECTIONS, {
      events: { discussion: "Said so." },
    });
    renderTab("view");

    await waitFor(
      () =>
        expect(
          screen.getByText(
            "Events are not shown — your role does not include Events.",
          ),
        ).toBeDefined(),
      SETTLE,
    );
    // A quiet line, not an alert, and the section still carries what was said.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Said so.")).toBeDefined();
  });
});

// The calendar half of a sourced section, and the partnerships block beside it
// (#1242). What the rows say is the action's business and the integration
// test's; what matters here is which sections ask for which feed.
describe("AgendaTab calendar and partnerships feeds", () => {
  test("renders both blocks above the Community & Partnerships box", async () => {
    agendaRow = agenda(COMMUNITY_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getByText("Pride planning coffee")).toBeDefined(),
      SETTLE,
    );
    expect(
      screen
        .getByRole("link", { name: "Pride planning coffee" })
        .getAttribute("href"),
    ).toBe("/portal/calendar/33333333-3333-4333-8333-333333333333");
    // The item type through ITEM_TYPES, the category through the tenant's own
    // label rather than the seeded `partner_opportunities` key.
    expect(screen.getByText("Partner / co-hosted event")).toBeDefined();
    expect(screen.getByText("Partners & coalitions")).toBeDefined();
    // The relationships, with the one whose next step has passed flagged.
    expect(screen.getByText("Mountain Pride Collective")).toBeDefined();
    expect(
      screen.getAllByText(/^Overdue/).some((node) => node.textContent?.trim()),
    ).toBe(true);
    expect(screen.getByText("Nordic Center")).toBeDefined();
  });

  // The two sourced sections read one action with two sources, and what comes
  // back is not the same table (#1243). Marketing & Social is reporting on
  // posts being written; Community & Partnerships is reporting on dates.
  test("shows content work state in Marketing & Social and not beside it", async () => {
    agendaRow = agenda(COMMUNITY_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getByText("Pride month campaign")).toBeDefined(),
      SETTLE,
    );
    const marketingTable = screen.getByRole("table", {
      name: "Marketing & Social items on the calendar",
    });
    const communityTable = screen.getByRole("table", {
      name: "Community & Partnerships items on the calendar",
    });

    // The columns each section carries.
    expect(within(marketingTable).getByText("Content")).toBeDefined();
    expect(within(marketingTable).getByText("Publish due")).toBeDefined();
    expect(within(marketingTable).queryByText("Categories")).toBeNull();
    expect(within(communityTable).getByText("Categories")).toBeDefined();
    expect(within(communityTable).queryByText("Content")).toBeNull();

    // Two pieces, summarised by the least-advanced one still needing work.
    expect(within(marketingTable).getByText("Idea")).toBeDefined();
    expect(within(marketingTable).getByText("2 posts")).toBeDefined();
    // Past its publish date with nothing published: the row the board acts on.
    expect(within(marketingTable).getByText(/^Overdue/)).toBeDefined();
    // Owner and tier share the line under the title rather than taking two
    // more columns.
    expect(
      within(marketingTable).getByText("Sam Comms · Tier 1"),
    ).toBeDefined();
  });

  test("keeps a date with nothing planned against it", async () => {
    agendaRow = agenda(COMMUNITY_SECTIONS);
    renderTab("view");

    // Not filtered out for having no content piece -- an undrafted date is the
    // one the board most needs to see.
    await waitFor(
      () => expect(screen.getByText("First snow day")).toBeDefined(),
      SETTLE,
    );
    const row = screen.getByText("First snow day").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(within(row).queryByText(/^Overdue/)).toBeNull();
  });

  test("reads the calendar once per calendar-sourced section", async () => {
    listAgendaCalendarItemsAction.mockClear();
    listOpenPartnershipsAction.mockClear();
    agendaRow = agenda(COMMUNITY_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getAllByText("On the calendar")).toHaveLength(2),
      SETTLE,
    );
    expect(listAgendaCalendarItemsAction).toHaveBeenCalledTimes(2);
    // Each section filters on its own source, which is what the one reader is
    // parameterized by.
    expect(listAgendaCalendarItemsAction.mock.calls[0]![2]).toEqual(
      COMMUNITY_SECTIONS[0]!.source,
    );
    expect(listAgendaCalendarItemsAction.mock.calls[1]![2]).toEqual(
      COMMUNITY_SECTIONS[1]!.source,
    );
    // Only Community & Partnerships carries the relationships, and it is read
    // once for the tab rather than once per section.
    expect(listOpenPartnershipsAction).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Open partnerships")).toHaveLength(1);
  });

  test("reads neither feed for a template with no calendar section", async () => {
    listAgendaCalendarItemsAction.mockClear();
    listOpenPartnershipsAction.mockClear();
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("view");

    await waitFor(
      () => expect(screen.getAllByText("Updates").length).toBeGreaterThan(0),
      SETTLE,
    );
    expect(listAgendaCalendarItemsAction).not.toHaveBeenCalled();
    expect(listOpenPartnershipsAction).not.toHaveBeenCalled();
  });

  test("keeps the Discussion box when the caller cannot see the calendar", async () => {
    listAgendaCalendarItemsAction.mockResolvedValue({
      data: {
        timeZone: "America/Denver",
        window: { fromDate: "2026-09-01", toDate: "2026-11-30" },
        items: [],
        categoryOptions: [],
        unavailable: "forbidden",
      },
    });
    agendaRow = agenda(COMMUNITY_SECTIONS, {
      community_partnerships: { discussion: "Said so." },
    });
    renderTab("view");

    await waitFor(
      () =>
        expect(
          screen.getAllByText(
            "Calendar items are not shown — your role does not include the Content Calendar.",
          ),
        ).toHaveLength(2),
      SETTLE,
    );
    // A quiet line, not an alert, and the section still carries what was said.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Said so.")).toBeDefined();
    listAgendaCalendarItemsAction.mockClear();
  });
});

// Closing a carried-over item without leaving the agenda (#1245). Going
// through these is the first real thing a board does, and the round trip to
// the Action Items tab is what stopped anyone doing it mid-meeting.
describe("AgendaTab carried-over action items", () => {
  test("ticking one closes it and keeps the row on screen", async () => {
    const user = userEvent.setup();
    carriedOver = [carriedOverItem("Book the venue")];
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("view");

    const box = await waitFor(
      () => screen.getByRole("checkbox", { name: "Book the venue" }),
      SETTLE,
    );
    await user.click(box);

    await waitFor(
      () =>
        expect(updateActionItemStatusAction).toHaveBeenCalledWith(
          "action-1",
          "done",
        ),
      SETTLE,
    );
    // The row stays, visibly done: the read filters on `status = 'open'`, so
    // dropping it here would make it vanish mid-meeting.
    expect(screen.getByText(/Book the venue/)).toBeDefined();
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  test("a failed update reverts the tick and says so", async () => {
    const user = userEvent.setup();
    updateActionItemStatusAction.mockResolvedValue({
      error: "Could not update this action item. Please try again.",
    } as never);
    carriedOver = [carriedOverItem("Send the thank-you notes")];
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("view");

    const box = await waitFor(
      () => screen.getByRole("checkbox", { name: "Send the thank-you notes" }),
      SETTLE,
    );
    await user.click(box);

    await expectToast("Could not update this action item. Please try again.");
    // Reverted: a tick that quietly did nothing would leave the meeting
    // believing the item closed.
    await waitFor(
      () => expect(box.getAttribute("aria-checked")).toBe("false"),
      SETTLE,
    );
  });

  test("a read-only viewer sees the list with no checkbox", async () => {
    carriedOver = [carriedOverItem("Book the venue")];
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("view", false);

    await waitFor(
      () => expect(screen.getByText(/Book the venue/)).toBeDefined(),
      SETTLE,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(updateActionItemStatusAction).not.toHaveBeenCalled();
  });
});

// Realistic lengths (#1623): a committee's item titles are sentences, and its
// notes run to a paragraph or two.
const LONG_TITLE =
  "Review the volunteer coordination plan for the winter gear swap, including shift coverage at both drop-off sites and the backup plan for snow days";
const LONG_NOTES =
  "Last year we were short four volunteers on the Saturday morning shift and the drop-off line backed up into the parking lot for most of an hour. ".repeat(
    8,
  );

function simpleAgenda(items: Agenda["items"]): Agenda {
  return {
    ...agenda([]),
    format: "simple",
    items,
    template_id: null,
    template_version_id: null,
  };
}

describe("AgendaTab simple agenda (#1623)", () => {
  for (const meetingType of ["committee", "annual", "other"]) {
    test(`a ${meetingType} meeting gets the item editor, not the board agenda`, async () => {
      renderTab("edit", true, meetingType);

      await waitFor(
        () => expect(screen.getByLabelText("Item 1")).toBeDefined(),
        SETTLE,
      );
      expect(screen.getByRole("button", { name: /Add item/ })).toBeDefined();
      expect(screen.queryByText("Ongoing board items")).toBeNull();
      expect(screen.queryByText("Parking lot")).toBeNull();
      expect(screen.queryByLabelText("Next meeting date")).toBeNull();
    });
  }

  test("a board meeting still gets the board agenda", async () => {
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("edit", true, "board");

    await waitFor(
      () => expect(screen.getByText("Ongoing board items")).toBeDefined(),
      SETTLE,
    );
    expect(screen.queryByLabelText("Item 1")).toBeNull();
  });

  test("reads back items in order with their notes", async () => {
    agendaRow = simpleAgenda([
      { id: "a1", title: LONG_TITLE, notes: LONG_NOTES.trim() },
      { id: "b2", title: "Budget for the spring swap" },
    ]);
    renderTab("view", true, "committee");

    const list = await waitFor(
      () => screen.getByText("Agenda items").nextElementSibling as HTMLElement,
      SETTLE,
    );
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain(LONG_TITLE);
    expect(rows[0]!.textContent).toContain("Saturday morning shift");
    expect(rows[1]!.textContent).toBe("Budget for the spring swap");
    expect(screen.queryByText("Ongoing board items")).toBeNull();
  });

  test("adds, renames, reorders and removes items, and saves them in order", async () => {
    agendaRow = simpleAgenda([
      { id: "a1", title: "Volunteer plan" },
      { id: "b2", title: "Budget" },
    ]);
    const user = userEvent.setup();
    renderTab("edit", true, "committee");

    const second = await waitFor(() => screen.getByLabelText("Item 2"), SETTLE);
    fireEvent.change(second, { target: { value: LONG_TITLE } });
    await user.click(screen.getByRole("button", { name: "Move item 2 up" }));
    await user.click(screen.getByRole("button", { name: /Add item/ }));
    fireEvent.change(screen.getByLabelText("Item 3"), {
      target: { value: "Throwaway" },
    });
    await user.click(screen.getByRole("button", { name: "Remove item 3" }));
    fireEvent.change(screen.getAllByLabelText("Notes")[0]!, {
      target: { value: LONG_NOTES },
    });
    await user.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const form = upsertAgendaAction.mock.calls[0]![1];
    const saved = JSON.parse(String(form.get("items")));
    expect(saved.map((item: { id: string }) => item.id)).toEqual(["b2", "a1"]);
    expect(saved[0].title).toBe(LONG_TITLE);
    expect(saved[0].notes).toBe(LONG_NOTES);
    expect(form.get("ongoingItems")).toBeNull();
  });

  test("a board agenda on a committee meeting stays readable and read-only", async () => {
    agendaRow = agenda(MANUAL_SECTIONS, {
      finance_fundraising: { updates: "Winter drive on track." },
    });
    const onReadOnlyChange = mock(() => {});
    renderTab("edit", true, "committee", onReadOnlyChange);

    await waitFor(
      () => expect(screen.getByText("Winter drive on track.")).toBeDefined(),
      SETTLE,
    );
    expect(screen.getByText(/written in the board format/)).toBeDefined();
    // Rendered as the read view even though the card asked for edit.
    expect(screen.queryByRole("button", { name: "Save agenda" })).toBeNull();
    expect(onReadOnlyChange).toHaveBeenLastCalledWith(true);
  });

  test("a simple agenda on a board meeting stays readable and read-only", async () => {
    agendaRow = simpleAgenda([{ id: "a1", title: "Volunteer plan" }]);
    renderTab("view", true, "board");

    await waitFor(
      () => expect(screen.getByText("Volunteer plan")).toBeDefined(),
      SETTLE,
    );
    expect(
      screen.getByText(/before this became a board meeting/),
    ).toBeDefined();
    expect(screen.queryByText("Ongoing board items")).toBeNull();
  });
});

const EVENT_SOURCE = {
  key: "event_planning_event-1",
  kind: "event" as const,
  id: "event-1",
  label: "Spring Gear Swap",
  date: "2026-10-03",
};

describe("AgendaTab pre-filled from the linked event (#1624)", () => {
  test("a committee meeting with an event opens on the event's open work", async () => {
    prefillItems = [
      { id: "p1", title: "Planning incomplete", source: EVENT_SOURCE },
    ];
    renderTab("view", true, "committee", undefined, "event-1");

    await waitFor(
      () => expect(screen.getByText("Planning incomplete")).toBeDefined(),
      SETTLE,
    );
    expect(prefillAgendaFromEventAction).toHaveBeenCalledTimes(1);
    const link = screen.getByRole("link", { name: "Spring Gear Swap" });
    expect(link.getAttribute("href")).toContain("event-1");
  });

  test("an event with no open work leaves the agenda empty with a note", async () => {
    renderTab("view", true, "committee", undefined, "event-1");

    await waitFor(
      () =>
        expect(
          screen.getByText(/linked event has no open work to add/),
        ).toBeDefined(),
      SETTLE,
    );
    expect(prefillAgendaFromEventAction).toHaveBeenCalledTimes(1);
  });

  test("an agenda that already exists is not pre-filled", async () => {
    agendaRow = simpleAgenda([{ id: "a1", title: "Volunteer plan" }]);
    renderTab("view", true, "committee", undefined, "event-1");

    await waitFor(
      () => expect(screen.getByText("Volunteer plan")).toBeDefined(),
      SETTLE,
    );
    expect(prefillAgendaFromEventAction).not.toHaveBeenCalled();
  });

  for (const [label, meetingType, eventId, canManage] of [
    ["a board meeting", "board", "event-1", true],
    ["an annual meeting", "annual", "event-1", true],
    ["a committee meeting with no event", "committee", null, true],
    ["a viewer who cannot manage", "committee", "event-1", false],
  ] as const) {
    test(`${label} is neither pre-filled nor offered a refresh`, async () => {
      renderTab("view", canManage, meetingType, undefined, eventId);

      await waitFor(
        () => expect(screen.getByText("No agenda added yet")).toBeDefined(),
        SETTLE,
      );
      expect(prefillAgendaFromEventAction).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: /Refresh from event/ }),
      ).toBeNull();
    });
  }

  test("Refresh from event says when nothing was new", async () => {
    agendaRow = simpleAgenda([
      { id: "p1", title: "Planning incomplete", source: EVENT_SOURCE },
    ]);
    const user = userEvent.setup();
    renderTab("view", true, "committee", undefined, "event-1");

    await user.click(
      await waitFor(
        () => screen.getByRole("button", { name: /Refresh from event/ }),
        SETTLE,
      ),
    );

    await waitFor(
      () => expect(screen.getByText(/already on the agenda/)).toBeDefined(),
      SETTLE,
    );
    expect(refreshAgendaFromEventAction).toHaveBeenCalledWith("meeting-1");
  });

  test("editing keeps a pre-filled item's source", async () => {
    agendaRow = simpleAgenda([
      { id: "p1", title: "Planning incomplete", source: EVENT_SOURCE },
    ]);
    const user = userEvent.setup();
    renderTab("edit", true, "committee", undefined, "event-1");

    const title = await waitFor(() => screen.getByLabelText("Item 1"), SETTLE);
    fireEvent.change(title, { target: { value: "Who leads planning?" } });
    await user.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const saved = JSON.parse(
      String(upsertAgendaAction.mock.calls[0]![1].get("items")),
    );
    expect(saved[0].title).toBe("Who leads planning?");
    expect(saved[0].source).toEqual(EVENT_SOURCE);
  });
});
