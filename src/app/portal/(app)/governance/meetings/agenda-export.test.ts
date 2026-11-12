import { describe, expect, test } from "bun:test";
import {
  formatAgendaMarkdown,
  formatAgendaPlainText,
  type AgendaExportInput,
} from "./agenda-export";
import type { Agenda } from "./agenda-actions";
import { calendarItemEntry, eventEntry } from "../../calendar/calendar-entries";
import type {
  MeetingCalendarItemRow,
  MeetingDatedContext,
} from "./meeting-context-shared";
import type { MeetingTopicContext } from "./meeting-context-catalog";
import type { AgendaTemplateSection } from "./agenda-template-shared";
import type { AgendaEventsFeed } from "./agenda-events-actions";
import type {
  AgendaCalendarFeed,
  AgendaPartnershipsFeed,
} from "./agenda-calendar-actions";

const baseAgenda: Agenda = {
  id: "agenda-1",
  meeting_id: "meeting-1",
  format: "board",
  items: [],
  external_link: null,
  document_path: null,
  document_url: null,
  body_text: null,
  template_id: null,
  template_version_id: null,
  ongoing_items: {},
  new_business: [],
  parking_lot: [],
  upcoming_dates: [],
  next_meeting_date: null,
  next_meeting_topics: null,
  template_sections: [],
};

const emptyInput: AgendaExportInput = {
  meetingDate: "2026-08-31T12:00:00.000Z",
  agenda: baseAgenda,
  sections: [],
  openingChecklist: ["Welcome and call to order"],
  carriedOverItems: [],
  createdItems: [],
  decisions: [],
};

const calendarItem: MeetingCalendarItemRow = {
  id: "item-1",
  title: "Trans Day of Visibility",
  item_type: "community_observance",
  starts_at: "2026-09-20T06:00:00.000Z",
  ends_at: null,
  time_zone: "America/Denver",
  summary: null,
  calendar_status: "active",
  series_key: null,
  recurrence_start_month: null,
  recurrence_start_day: null,
  recurrence_end_month: null,
  recurrence_end_day: null,
  recurrence_end_is_month_end: false,
};

const datedContext: MeetingDatedContext = {
  timeZone: "America/Denver",
  asOf: "2026-08-31",
  window: { fromDate: "2026-08-31", toDate: "2026-09-30" },
  entries: [
    eventEntry({
      id: "event-1",
      title: "Fall picnic",
      starts_at: "2026-09-15T22:00:00.000Z",
      ends_at: null,
      time_zone: "America/Denver",
      summary: null,
      location: null,
      status: "published",
      visibility: "public",
      program_ids: [],
    }),
    calendarItemEntry(calendarItem),
  ],
  gaps: [{ source: "events", reason: "forbidden" }],
};

/** What the four supporting sources answered for one meeting (#1224). */
const topicContext: MeetingTopicContext = {
  timeZone: "America/Denver",
  asOf: "2026-08-31",
  review: { fromDate: "2026-06-01", toDate: "2026-08-31" },
  lookahead: { fromDate: "2026-08-31", toDate: "2026-09-30" },
  finance_activity: {
    window: { fromDate: "2026-06-01", toDate: "2026-08-31" },
    income: 4200,
    cashDonations: 1500,
    paidSpend: 2800,
    net: 2900,
    approvedUnpaidSpend: 300,
    pendingSpend: 125.5,
    outstandingReimbursements: { total: 425.5, count: 2 },
    upcomingEventBudget: { total: 1800, count: 3 },
  },
  grants: {
    rows: [
      {
        id: "g1",
        funderName: "Rocky Mountain Community Foundation",
        amount: 10000,
        deadline: "2026-08-15",
        status: "submitted",
        overdue: true,
      },
    ],
    total: 4,
  },
  nonprofit_compliance: {
    milestones: {
      rows: [
        {
          id: "m1",
          label: "File Form 1023-EZ",
          detail: "Federal exemption",
          dueDate: "2026-09-10",
          overdue: false,
        },
      ],
      total: 1,
    },
    requirements: {
      rows: [
        {
          id: "r1",
          label: "Colorado periodic report",
          detail: "in_progress",
          dueDate: "2026-08-01",
          overdue: true,
        },
      ],
      total: 1,
    },
    disclosures: { year: 2027, missing: 2, boardMembers: 5 },
  },
  partnerships: {
    rows: [
      {
        id: "p1",
        organization: "Loveland Ski Area",
        stage: "negotiating",
        nextStepDate: "2026-09-12",
      },
    ],
    total: 2,
  },
};

// Version 2's shape: three sections naming a module (#1240-#1243), and the
// feeds they had on screen. The times sit near midday UTC so the two rows
// formatted in the reader's own zone land on the same day wherever CI runs.
const eventsSection: AgendaTemplateSection = {
  key: "events",
  label: "Events",
  topics: [],
  source: { kind: "events" },
};

const marketingSection: AgendaTemplateSection = {
  key: "marketing_social",
  label: "Marketing & Social",
  topics: [],
  source: {
    kind: "calendar",
    categories: ["campaigns_fundraising"],
    item_types: ["content_campaign", "winter_outdoor_sports_moment"],
  },
};

const communitySection: AgendaTemplateSection = {
  key: "community_partnerships",
  label: "Community & Partnerships",
  topics: [],
  source: {
    kind: "calendar",
    categories: ["partner_opportunities"],
    item_types: ["partner_event"],
  },
};

const eventsFeed: AgendaEventsFeed = {
  timeZone: "America/Denver",
  since: {
    fromDate: "2026-02-11",
    toDate: "2026-03-18",
    events: [
      {
        id: "event-1",
        name: "Winter gear swap",
        starts_at: "2026-02-20T12:00:00.000Z",
        ends_at: null,
        timezone: "America/Denver",
        status: "published",
        report_status: "not_started",
        event_lead_id: null,
        event_lead_name: "Dana Lead",
      },
      {
        id: "event-2",
        name: "Called-off clinic",
        starts_at: "2026-02-24T12:00:00.000Z",
        ends_at: null,
        timezone: "America/Denver",
        status: "cancelled",
        report_status: "not_started",
        event_lead_id: null,
        event_lead_name: null,
      },
    ],
  },
  upcoming: { fromDate: "2026-03-19", toDate: "2026-06-17", events: [] },
  unavailable: null,
};

const CALENDAR_WINDOW = { fromDate: "2026-09-01", toDate: "2026-11-30" };

const marketingFeed: AgendaCalendarFeed = {
  timeZone: "America/Denver",
  window: CALENDAR_WINDOW,
  items: [
    {
      id: "calendar-1",
      title: "Pride month campaign",
      item_type: "content_campaign",
      starts_at: "2026-09-15T12:00:00.000Z",
      time_zone: "America/Denver",
      calendar_status: "active",
      priority_tier: 1,
      owner_id: null,
      owner_name: "Sam Comms",
      categories: ["campaigns_fundraising"],
      content_pieces: [{ content_status: "draft" }, { content_status: "idea" }],
      publish_due_at: "2026-09-10T12:00:00.000Z",
      content_overdue: true,
    },
    {
      id: "calendar-2",
      title: "First snow day",
      item_type: "winter_outdoor_sports_moment",
      starts_at: "2026-10-02T12:00:00.000Z",
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

const communityFeed: AgendaCalendarFeed = {
  timeZone: "America/Denver",
  window: CALENDAR_WINDOW,
  items: [
    {
      id: "calendar-3",
      title: "Pride planning coffee",
      item_type: "partner_event",
      starts_at: "2026-09-12T12:00:00.000Z",
      time_zone: "America/Denver",
      calendar_status: "active",
      priority_tier: 2,
      owner_id: null,
      owner_name: null,
      categories: ["partner_opportunities"],
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

const partnershipsFeed: AgendaPartnershipsFeed = {
  partnerships: [
    {
      id: "partnership-1",
      organization: "Mountain Pride Collective",
      stage: "negotiating",
      next_step_date: "2026-08-01",
      owner_name: "Dana Lead",
      overdue: true,
    },
    {
      id: "partnership-2",
      organization: "Nordic Center",
      stage: "contacted",
      next_step_date: null,
      owner_name: null,
      overdue: false,
    },
  ],
  unavailable: null,
};

const seededSections = [
  { key: "finance_fundraising", label: "Finance & Fundraising", topics: [] },
  { key: "legal_nonprofit", label: "Legal & Nonprofit", topics: [] },
  { key: "events", label: "Events", topics: [] },
  {
    key: "community_partnerships",
    label: "Community & Partnerships",
    topics: [],
  },
  { key: "marketing_social", label: "Marketing & Social", topics: [] },
];

describe("formatAgendaMarkdown", () => {
  test("names an uploaded document without linking its signed URL", () => {
    const input: AgendaExportInput = {
      ...emptyInput,
      agenda: {
        ...baseAgenda,
        document_path:
          "11111111-2222-4333-8444-555555555555/governance/66666666-7777-4888-8999-aaaaaaaaaaaa/Board-packet.pdf",
        document_url: "https://storage.example/signed?token=secret",
      },
    };
    for (const text of [
      formatAgendaMarkdown(input),
      formatAgendaPlainText(input),
    ]) {
      expect(text).toContain("Document: Board-packet.pdf (in the portal)");
      expect(text).not.toContain("token=secret");
    }
  });

  test("renders empty-state placeholders for an agenda with no content", () => {
    const markdown = formatAgendaMarkdown(emptyInput);
    expect(markdown).toContain("# Agenda — Aug 31, 2026");
    expect(markdown).toContain("- Welcome and call to order");
    expect(markdown).toContain("None carried over.");
    expect(markdown).toContain("No agenda template is configured.");
    expect(markdown).toContain("No decisions recorded yet.");
    expect(markdown).not.toContain("External link:");
    // The live block is omitted rather than printed empty while it is still
    // loading: an empty section reads as "nothing is scheduled".
    expect(markdown).not.toContain("Next 30 days");
  });

  test("prints the live block as dated text, with when it was read", () => {
    const markdown = formatAgendaMarkdown({ ...emptyInput, datedContext });

    expect(markdown).toContain("## Next 30 days");
    expect(markdown).toContain(
      "From the calendar and events, as of Aug 31, 2026.",
    );
    expect(markdown).toContain("- Sep 15, 2026 — Fall picnic (Event)");
    expect(markdown).toContain(
      "- Sep 20, 2026 — Trans Day of Visibility (Calendar item)",
    );
    // A page that silently omits a source gives its reader no way to know it
    // did, so the gap is printed too.
    expect(markdown).toContain(
      "Events are not included — the exporter's role does not cover them.",
    );
  });

  test("includes structured content and formatting", () => {
    const input: AgendaExportInput = {
      ...emptyInput,
      agenda: {
        ...baseAgenda,
        external_link: "https://example.com/notes",
        new_business: ["Budget review"],
        parking_lot: ["Website redesign"],
        upcoming_dates: [
          { date: "2026-09-15", description: "Fall picnic", owner: "Jamie" },
        ],
        next_meeting_date: "2026-09-30",
        next_meeting_topics: "Budget approval",
        body_text: "Discussed fall planning.",
        ongoing_items: {
          finance: { updates: "On budget", decisions_needed: "None" },
        },
      },
      sections: [{ key: "finance", label: "Finance", topics: [] }],
      carriedOverItems: [
        {
          id: "a1",
          meeting_id: "meeting-1",
          description: "Order supplies",
          due_date: null,
          status: "open",
          minutes_item_key: null,
          owner: { id: "p1", name: "Alex", email: null, phone: null },
        },
      ],
      decisions: [
        {
          id: "d1",
          meeting_id: "meeting-1",
          description: "Approve budget",
          decision_date: "2026-08-31",
          topic: "Finance",
          vote_result: "5-0",
        },
      ],
    };

    const markdown = formatAgendaMarkdown(input);
    expect(markdown).toContain("External link: https://example.com/notes");
    expect(markdown).toContain("### Finance");
    expect(markdown).toContain("**Updates:** On budget");
    expect(markdown).toContain("- Order supplies — Alex");
    expect(markdown).toContain("- Finance: Approve budget (5-0)");
    expect(markdown).toContain("- Budget review");
    expect(markdown).toContain("Sep 15, 2026 — Fall picnic (Jamie)");
    expect(markdown).toContain("Sep 30, 2026 — Budget approval");
    expect(markdown).toContain("Discussed fall planning.");
  });

  test("keeps a Markdown discussion on its decision's one line (#1875)", () => {
    const decision = {
      id: "d2",
      meeting_id: "meeting-1",
      description: "Approve **budget**:\n\n- supplies\n- venue",
      decision_date: "2026-08-31",
      topic: "Finance",
      vote_result: "5-0",
    };
    const input = { ...emptyInput, decisions: [decision] };

    expect(formatAgendaMarkdown(input)).toContain(
      "- Finance: Approve budget: - supplies - venue (5-0)",
    );
    expect(formatAgendaPlainText(input)).toContain(
      "Finance: Approve budget: - supplies - venue (5-0)",
    );
  });

  test("prints the records behind each standing section", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });

    expect(markdown).toContain("Supporting records, as of Aug 31, 2026.");
    expect(markdown).toContain(
      "**Finance activity** — Jun 1, 2026 – Aug 31, 2026",
    );
    expect(markdown).toContain("- Income: $4,200.00");
    expect(markdown).toContain("- Net: $2,900.00");
    expect(markdown).toContain(
      "- Outstanding reimbursements: $425.50 across 2",
    );
    expect(markdown).toContain(
      "- Budgeted for upcoming events: $1,800.00 across 3",
    );
    expect(markdown).toContain(
      "- Rocky Mountain Community Foundation — $10,000.00, Submitted, due Aug 15, 2026 (overdue)",
    );
    expect(markdown).toContain("4 open in total.");
    expect(markdown).toContain(
      "- 501(c)(3) milestone: File Form 1023-EZ (Federal exemption) — due Sep 10, 2026",
    );
    expect(markdown).toContain(
      "- Annual requirement: Colorado periodic report (In progress) — due Aug 1, 2026 (overdue)",
    );
    expect(markdown).toContain(
      "- Conflict-of-interest disclosures: 2 of 5 board members have none on file for FY2027",
    );
    expect(markdown).toContain("- Loveland Ski Area — Negotiating");
  });

  test("prints an undated milestone as having no due date", () => {
    const compliance = topicContext.nonprofit_compliance;
    if ("unavailable" in compliance) throw new Error("fixture regressed");

    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext: {
        ...topicContext,
        nonprofit_compliance: {
          ...compliance,
          milestones: {
            rows: [
              {
                id: "m2",
                label: "Draft bylaws",
                detail: "Incorporation",
                dueDate: null,
                overdue: false,
              },
            ],
            total: 8,
          },
        },
      },
    });

    expect(markdown).toContain(
      "- 501(c)(3) milestone: Draft bylaws (Incorporation) — no due date",
    );
  });

  test("leaves an unmapped section untouched", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });
    const marketing = markdown.slice(
      markdown.indexOf("### Marketing & Social"),
    );

    expect(marketing).not.toContain("Supporting records");
  });

  test("does not repeat the calendar under Events", () => {
    // The agenda already prints its own "Next 30 days" section a few headings
    // later; the Events block would be the same list twice on one page.
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
      datedContext,
    });

    expect(markdown.match(/Fall picnic \(Event\)/g)).toHaveLength(1);
  });

  test("omits every block while the read is still in flight", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
    });
    expect(markdown).not.toContain("Supporting records");
  });

  test("calls the agenda's free-text field Agenda notes", () => {
    // Renamed from "Meeting notes" in #1201: since #1200 the minutes are their
    // own record, and this field is the pre-meeting context, not the minutes.
    const markdown = formatAgendaMarkdown(emptyInput);
    expect(markdown).toContain("## Agenda notes");
    expect(markdown).not.toContain("Meeting notes");
  });
});

// A template whose sections name their modules (#1240-#1243), and what those
// modules had on the screen when the export was taken (#1244).
describe("formatAgendaMarkdown with sourced sections", () => {
  test("prints the Events feed, its empty group and one Discussion box", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      agenda: {
        ...baseAgenda,
        ongoing_items: { events: { discussion: "Two need volunteers." } },
      },
      sections: [eventsSection],
      sourcedSections: { events: { events: eventsFeed } },
    });

    expect(markdown).toContain("### Events");
    expect(markdown).toContain(
      "**Since the last meeting** (Feb 11, 2026 – Mar 18, 2026)",
    );
    expect(markdown).toContain(
      "- Feb 20, 2026 — Winter gear swap — Published — report outstanding — Dana Lead",
    );
    // Held, behind us, report in: not flagged. The cancelled one owed none.
    expect(markdown).toContain(
      "- Feb 24, 2026 — Called-off clinic — Cancelled — report not started",
    );
    // An empty group says so rather than being skipped: a board needs to read
    // that nothing is scheduled, not to wonder whether the block was dropped.
    expect(markdown).toContain("**Coming up** (Mar 19, 2026 – Jun 17, 2026)");
    expect(markdown).toContain("None scheduled before the next meeting.");
    expect(markdown).toContain("**Discussion:** Two need volunteers.");
    // The pair a sourced section no longer has boxes for.
    expect(markdown).not.toContain("**Updates:**");
    expect(markdown).not.toContain("**Decisions needed:**");
  });

  test("prints a calendar section's rows, its content work state and its partnerships", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: [marketingSection, communitySection],
      sourcedSections: {
        marketing_social: { calendar: marketingFeed },
        community_partnerships: {
          calendar: communityFeed,
          partnerships: partnershipsFeed,
        },
      },
    });

    // Marketing & Social shows how far each item's content has got (#1243).
    expect(markdown).toContain(
      "**On the calendar** (Sep 1, 2026 – Nov 30, 2026)",
    );
    expect(markdown).toContain(
      "- Sep 15, 2026 — Pride month campaign — Content campaign — Idea (2 pieces) — publish due Sep 10, 2026 (overdue) — Sam Comms",
    );
    // Nothing drafted against a date is the row the board most needs to see,
    // so it prints rather than being filtered out.
    expect(markdown).toContain(
      "- Oct 2, 2026 — First snow day — Winter / outdoor sports moment — nothing planned",
    );
    // Community & Partnerships shows the tenant's own category words instead.
    expect(markdown).toContain(
      "- Sep 12, 2026 — Pride planning coffee — Partner / co-hosted event — Partners & coalitions",
    );
    expect(markdown).toContain("**Open partnerships**");
    expect(markdown).toContain(
      "- Mountain Pride Collective — Negotiating — next step Aug 1, 2026 (overdue) — Dana Lead",
    );
    expect(markdown).toContain("- Nordic Center — Contacted — no next step");
    // Only the section the catalog names carries them.
    expect(markdown.match(/\*\*Open partnerships\*\*/g)).toHaveLength(1);
  });

  test("prints a section whose module is off, and one still loading", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: [eventsSection, marketingSection],
      sourcedSections: {
        events: {
          events: { ...eventsFeed, unavailable: "forbidden" },
        },
        // Its read had not come back when the export was taken.
        marketing_social: {},
      },
    });

    expect(markdown).toContain(
      "Events are not shown — your role does not include Events.",
    );
    // Nothing invented for the section still loading: an empty group would
    // read as "the calendar is clear", which is not what was known.
    expect(markdown).toContain("### Marketing & Social");
    expect(markdown).not.toContain("**On the calendar**");
    expect(markdown).toContain("**Discussion:** —");
  });

  test("keeps text a section wrote before its template was sourced", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      agenda: {
        ...baseAgenda,
        ongoing_items: {
          events: { updates: "Written under version 1.", discussion: "" },
        },
      },
      sections: [eventsSection],
      sourcedSections: { events: { events: eventsFeed } },
    });

    expect(markdown).toContain("**Discussion:** —");
    expect(markdown).toContain("**Updates:** Written under version 1.");
    // The half that was empty stays out; only what holds something prints.
    expect(markdown).not.toContain("**Decisions needed:**");
  });
});

describe("formatAgendaPlainText", () => {
  test("indents a sourced section's module rows without markdown emphasis", () => {
    const text = formatAgendaPlainText({
      ...emptyInput,
      sections: [eventsSection],
      sourcedSections: { events: { events: eventsFeed } },
    });

    expect(text).toContain(
      "  Since the last meeting (Feb 11, 2026 – Mar 18, 2026)",
    );
    expect(text).toContain(
      "  - Feb 20, 2026 — Winter gear swap — Published — report outstanding — Dana Lead",
    );
    expect(text).toContain("    Discussion: —");
    expect(text).not.toContain("**");
  });

  test("uses plain uppercase headers instead of markdown syntax", () => {
    const text = formatAgendaPlainText(emptyInput);
    expect(text).toContain("AGENDA — Aug 31, 2026");
    expect(text).toContain("OPENING");
    expect(text).toContain("AGENDA NOTES");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
  });

  test("indents the supporting blocks without markdown emphasis", () => {
    const text = formatAgendaPlainText({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });

    expect(text).toContain("  Supporting records, as of Aug 31, 2026.");
    expect(text).toContain("  Finance activity — Jun 1, 2026 – Aug 31, 2026");
    expect(text).toContain("  - Income: $4,200.00");
    expect(text).not.toContain("**");
  });

  test("indents the live block under its own uppercase header", () => {
    const text = formatAgendaPlainText({ ...emptyInput, datedContext });

    expect(text).toContain("NEXT 30 DAYS");
    expect(text).toContain(
      "  From the calendar and events, as of Aug 31, 2026.",
    );
    expect(text).toContain("  - Sep 15, 2026 — Fall picnic (Event)");
    expect(text).not.toContain("#");
  });
});

describe("a simple agenda (#1623)", () => {
  const LONG_TITLE =
    "Review the volunteer coordination plan for the winter gear swap, including shift coverage at both drop-off sites and the backup plan for snow days";
  const simpleInput: AgendaExportInput = {
    ...emptyInput,
    agenda: {
      ...baseAgenda,
      format: "simple",
      external_link: "https://docs.example.com/committee",
      items: [
        {
          id: "a1",
          title: LONG_TITLE,
          notes: "Bring last year's sign-up sheet.",
        },
        { id: "b2", title: "Budget for the spring swap" },
      ],
    },
  };

  test("prints its items in order and none of the board sections", () => {
    const markdown = formatAgendaMarkdown(simpleInput);
    expect(markdown).toContain(
      "External link: https://docs.example.com/committee",
    );
    expect(markdown).toContain("## Agenda items");
    expect(markdown).toContain(
      `### 1. ${LONG_TITLE}\nBring last year's sign-up sheet.`,
    );
    expect(markdown).toContain("### 2. Budget for the spring swap");
    expect(markdown).toContain("## Decisions & votes");
    for (const board of [
      "Ongoing board items",
      "New business",
      "Parking lot",
      "Upcoming dates",
      "Next meeting",
      "Agenda notes",
    ]) {
      expect(markdown).not.toContain(board);
    }
  });

  test("prints the same shape as plain text", () => {
    const text = formatAgendaPlainText(simpleInput);
    expect(text).toContain("AGENDA ITEMS");
    expect(text).toContain(`  1. ${LONG_TITLE}`);
    expect(text).toContain("     Bring last year's sign-up sheet.");
    expect(text).not.toContain("ONGOING BOARD ITEMS");
  });

  test("names the event a pre-filled item came from (#1624)", () => {
    const sourced: AgendaExportInput = {
      ...simpleInput,
      agenda: {
        ...simpleInput.agenda,
        items: [
          {
            id: "a1",
            title: "Book the hall",
            source: {
              key: "event_checklist_c1",
              kind: "event",
              id: "event-1",
              label: "Spring Gear Swap",
              date: "2026-10-03",
            },
          },
        ],
      },
    };
    expect(formatAgendaMarkdown(sourced)).toContain(
      "### 1. Book the hall\n_From Spring Gear Swap — ",
    );
    expect(formatAgendaPlainText(sourced)).toContain(
      "  1. Book the hall\n     From Spring Gear Swap — ",
    );
  });

  test("says so when there are no items yet", () => {
    const empty = {
      ...simpleInput,
      agenda: { ...simpleInput.agenda, items: [] },
    };
    expect(formatAgendaMarkdown(empty)).toContain("No items yet.");
    expect(formatAgendaPlainText(empty)).toContain("  No items yet.");
  });
});
