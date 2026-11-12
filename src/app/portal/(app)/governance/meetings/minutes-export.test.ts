import { describe, expect, test } from "bun:test";
import {
  formatMinutesMarkdown,
  formatMinutesPlainText,
  type MinutesExportInput,
} from "./minutes-export";
import type { MinutesRow } from "./minutes-core";
import type { ActionItem } from "./action-items-actions";
import type { MeetingTopicContext } from "./meeting-context-catalog";
import type { MeetingDatedContext } from "./meeting-context-shared";
import { eventEntry } from "../../calendar/calendar-entries";

function minutes(overrides: Partial<MinutesRow> = {}): MinutesRow {
  return {
    id: "minutes-1",
    meeting_id: "meeting-1",
    agenda_snapshot: {
      version: 1,
      meeting_date: "2026-09-01",
      template_id: null,
      template_version_id: null,
      external_link: null,
      items: [
        { key: "opening", label: "Opening", kind: "opening" },
        {
          key: "section:finance",
          label: "Finance & Fundraising",
          kind: "section",
        },
      ],
    },
    notes: {},
    body_text: null,
    status: "draft",
    finalized_at: null,
    finalized_by: null,
    approved_at: null,
    approved_by: null,
    approved_at_meeting_id: null,
    updated_at: "2026-09-01T18:00:00.000Z",
    ...overrides,
  };
}

function actionItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "a1",
    meeting_id: "meeting-1",
    description: "Order supplies",
    due_date: null,
    status: "open",
    minutes_item_key: null,
    owner: {
      id: "p1",
      name: "Alex",
      email: null,
      phone: null,
    },
    ...overrides,
  };
}

const emptyInput: MinutesExportInput = {
  meetingDate: "2026-09-01T18:00:00.000Z",
  minutes: minutes(),
  actionItems: [],
};

/**
 * A snapshot on the seeded section keys, so the #1224 mapping resolves. The
 * existing fixtures use `section:finance`, which is deliberately unmapped and
 * therefore keeps asserting the pre-#1224 output.
 */
const supportedInput: MinutesExportInput = {
  meetingDate: "2026-09-01T18:00:00.000Z",
  minutes: minutes({
    agenda_snapshot: {
      version: 2,
      meeting_date: "2026-09-01",
      template_id: null,
      template_version_id: null,
      external_link: null,
      items: [
        {
          key: "section:finance_fundraising",
          label: "Finance & Fundraising",
          kind: "section",
        },
        { key: "section:events", label: "Events", kind: "section" },
      ],
    },
    notes: {
      "section:finance_fundraising": "The treasurer walked through it.",
    },
  }),
  actionItems: [],
  topicContext: {
    timeZone: "America/Denver",
    asOf: "2026-09-01",
    review: { fromDate: "2026-06-01", toDate: "2026-09-01" },
    lookahead: { fromDate: "2026-09-01", toDate: "2026-10-01" },
    finance_activity: {
      window: { fromDate: "2026-06-01", toDate: "2026-09-01" },
      income: 4200,
      cashDonations: 0,
      paidSpend: 2800,
      net: 1400,
      approvedUnpaidSpend: 0,
      pendingSpend: 0,
      outstandingReimbursements: null,
      upcomingEventBudget: null,
    },
    // The board member case: `finance_reports:view` without the governance
    // tables would be the other way round, but either way the block is absent
    // with a reason rather than printed as an empty list.
    grants: { unavailable: "forbidden" },
    nonprofit_compliance: { unavailable: "error" },
    partnerships: { rows: [], total: 0 },
  } satisfies MeetingTopicContext,
  datedContext: {
    timeZone: "America/Denver",
    asOf: "2026-09-01",
    window: { fromDate: "2026-09-01", toDate: "2026-10-01" },
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
    ],
    gaps: [],
  } satisfies MeetingDatedContext,
};

/** A snapshot whose "Upcoming dates" item carries a pinned reference (#1223). */
const pinnedInput: MinutesExportInput = {
  meetingDate: "2026-09-01T18:00:00.000Z",
  minutes: minutes({
    agenda_snapshot: {
      version: 2,
      meeting_date: "2026-09-01",
      template_id: null,
      template_version_id: null,
      external_link: null,
      items: [
        {
          key: "upcoming_dates",
          label: "Upcoming dates",
          kind: "upcoming_dates",
          planned: {
            topics: ["2026-09-15 — Fall picnic — Board"],
            references: [
              {
                kind: "event",
                id: "event-1",
                label: "Fall picnic",
                date: "2026-09-15",
              },
            ],
          },
        },
      ],
    },
  }),
  actionItems: [],
};

describe("formatMinutesMarkdown", () => {
  test("walks the frozen snapshot, placeholders and all", () => {
    const markdown = formatMinutesMarkdown(emptyInput);
    expect(markdown).toContain("# Minutes — Sep 1, 2026");
    expect(markdown).toContain("Status: Draft");
    expect(markdown).toContain("## Opening");
    expect(markdown).toContain("## Finance & Fundraising");
    expect(markdown).toContain("No notes recorded.");
    expect(markdown).toContain("## Closing notes");
    expect(markdown).toContain("None.");
  });

  test("includes each item's notes and reports a finalized record as final", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      minutes: minutes({
        notes: { opening: "Called to order at 18:02." },
        body_text: "Adjourned at 19:30.",
        status: "final",
        finalized_at: "2026-09-01T19:35:00.000Z",
      }),
    });

    expect(markdown).toContain("Status: Final");
    expect(markdown).toContain("Called to order at 18:02.");
    expect(markdown).toContain("Adjourned at 19:30.");
  });

  test("makes the line breaks in a note explicit for the clipboard (#1871)", () => {
    const md = formatMinutesMarkdown({
      ...emptyInput,
      minutes: minutes({
        notes: { opening: "Motion passed 4-0\nTreasurer to send report" },
        body_text: "Adjourned\nat 8pm",
      }),
    });

    expect(md).toContain("Motion passed 4-0\\\nTreasurer to send report");
    expect(md).toContain("Adjourned\\\nat 8pm");
  });

  test("groups action items under the item they were raised under", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      actionItems: [
        actionItem({
          id: "a1",
          description: "Chase the grant report",
          minutes_item_key: "section:finance",
          due_date: "2026-09-15",
        }),
      ],
    });

    const finance = markdown.indexOf("## Finance & Fundraising");
    const raised = markdown.indexOf(
      "- Chase the grant report — Alex (due Sep 15, 2026)",
    );
    const closing = markdown.indexOf("## Closing notes");
    expect(finance).toBeGreaterThan(-1);
    expect(raised).toBeGreaterThan(finance);
    expect(raised).toBeLessThan(closing);
    // The end-of-document heading exists but has nothing under it.
    expect(markdown).toContain("None raised outside the sections above.");
  });

  test("puts an item raised out of band under a heading of its own at the end", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      actionItems: [actionItem({ description: "Renew the insurance" })],
    });

    const closing = markdown.indexOf("## Closing notes");
    const heading = markdown.indexOf("## Action items");
    expect(heading).toBeGreaterThan(closing);
    expect(markdown.indexOf("- Renew the insurance — Alex")).toBeGreaterThan(
      heading,
    );
  });

  test("says so rather than rendering an empty document when no agenda was frozen", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      minutes: minutes({ agenda_snapshot: null }),
    });
    expect(markdown).toContain("No agenda was frozen into these minutes.");
  });
});

describe("formatMinutesPlainText", () => {
  test("writes notes as plain text, every line indented (#1873)", () => {
    const text = formatMinutesPlainText({
      ...emptyInput,
      minutes: minutes({
        notes: { opening: "**Motion** passed\n- send report" },
      }),
    });

    expect(text).toContain("OPENING\n  Motion passed\n\n  - send report");
    expect(text).not.toContain("**");
  });

  test("uses plain uppercase headers instead of markdown syntax", () => {
    const text = formatMinutesPlainText({
      ...emptyInput,
      minutes: minutes({ notes: { opening: "Called to order." } }),
      actionItems: [actionItem({ description: "Renew the insurance" })],
    });

    expect(text).toContain("MINUTES — Sep 1, 2026");
    expect(text).toContain("OPENING");
    expect(text).toContain("CLOSING NOTES");
    expect(text).toContain("ACTION ITEMS");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
  });
});

describe("pinned references (#1223)", () => {
  test("prints a pinned reference as its label and date", () => {
    // A printed page cannot be clicked, so what survives is what the link said.
    const markdown = formatMinutesMarkdown(pinnedInput);
    expect(markdown).toContain("**Linked records**");
    expect(markdown).toContain("- Fall picnic — Sep 15, 2026");

    const text = formatMinutesPlainText(pinnedInput);
    expect(text).toContain("  Linked: Fall picnic — Sep 15, 2026");
  });

  test("says nothing about links for a snapshot that has none", () => {
    expect(formatMinutesMarkdown(emptyInput)).not.toContain("Linked records");
    expect(formatMinutesPlainText(emptyInput)).not.toContain("Linked:");
  });
});

describe("supporting records (#1224)", () => {
  test("prints the finance block under the section it supports", () => {
    const markdown = formatMinutesMarkdown(supportedInput);
    const finance = markdown.slice(
      markdown.indexOf("## Finance & Fundraising"),
      markdown.indexOf("## Events"),
    );

    expect(finance).toContain("The treasurer walked through it.");
    expect(finance).toContain("Supporting records, as of Sep 1, 2026.");
    expect(finance).toContain("- Income: $4,200.00");
    expect(finance).toContain("- Net: $1,400.00");
    // Nullable halves are figures the caller's role does not cover, not zeros.
    expect(finance).not.toContain("Outstanding reimbursements");
    expect(finance).not.toContain("Budgeted for upcoming events");
  });

  test("prints the calendar under Events, which the agenda does not", () => {
    // The minutes have no standalone "Next 30 days" section to duplicate.
    const markdown = formatMinutesMarkdown(supportedInput);
    const events = markdown.slice(markdown.indexOf("## Events"));

    expect(events).toContain("**Next 30 days**");
    expect(events).toContain("- Sep 15, 2026 — Fall picnic (Event)");
  });

  test("prints nothing for a source that is unreadable or empty", () => {
    const markdown = formatMinutesMarkdown(supportedInput);

    expect(markdown).not.toContain("Grant deadlines");
    expect(markdown).not.toContain("Nonprofit compliance");
    expect(markdown).not.toContain("Partnership opportunities");
  });

  test("indents the blocks in plain text without emphasis", () => {
    const text = formatMinutesPlainText(supportedInput);

    expect(text).toContain("  Supporting records, as of Sep 1, 2026.");
    expect(text).toContain("  Finance activity — Jun 1, 2026 – Sep 1, 2026");
    expect(text).toContain("  - Income: $4,200.00");
    expect(text).not.toContain("**");
  });

  test("adds nothing to a snapshot on unmapped section keys", () => {
    expect(formatMinutesMarkdown(emptyInput)).not.toContain(
      "Supporting records",
    );
  });
});

describe("minutes of a simple agenda (#1623)", () => {
  const LONG_TITLE =
    "Review the volunteer coordination plan for the winter gear swap, including shift coverage at both drop-off sites and the backup plan for snow days";
  const input: MinutesExportInput = {
    meetingDate: "2026-09-01",
    minutes: minutes({
      agenda_snapshot: {
        version: 3,
        meeting_date: "2026-09-01",
        template_id: null,
        template_version_id: null,
        external_link: null,
        items: [
          { key: "opening", label: "Opening", kind: "opening" },
          {
            key: "item:3f1c9a2e-7b4d-4e8a-9c61-0d2b5e8f4a17",
            label: LONG_TITLE,
            kind: "item",
            planned: { text: "Bring last year's sign-up sheet." },
          },
          { key: "decisions", label: "Decisions & votes", kind: "decisions" },
        ],
      },
      notes: {
        "item:3f1c9a2e-7b4d-4e8a-9c61-0d2b5e8f4a17":
          "Agreed two leads per site.",
      },
    }),
    actionItems: [
      actionItem({
        description: "Recruit Saturday volunteers",
        minutes_item_key: "item:3f1c9a2e-7b4d-4e8a-9c61-0d2b5e8f4a17",
      }),
    ],
  };

  test("heads each item with its title, with its note and actions beneath", () => {
    const markdown = formatMinutesMarkdown(input);
    const item = markdown.indexOf(
      `## ${LONG_TITLE}\nAgreed two leads per site.`,
    );
    const action = markdown.indexOf("- Recruit Saturday volunteers — Alex");
    expect(item).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(item);
    expect(action).toBeLessThan(markdown.indexOf("## Decisions & votes"));
  });

  test("prints the same shape as plain text", () => {
    const text = formatMinutesPlainText(input);
    expect(text).toContain(
      `${LONG_TITLE.toUpperCase()}\n  Agreed two leads per site.`,
    );
  });
});
