import type { Agenda } from "./agenda-actions";
import type { AgendaItemSource } from "./agenda-form";
import {
  isSourcedSection,
  sectionShowsContentState,
  type AgendaTemplateSection,
} from "./agenda-template-shared";
import type { ActionItem } from "./action-items-actions";
import type { Decision } from "./decisions-actions";
import type { MeetingDatedContext } from "./meeting-context-shared";
import type { MeetingTopicContext } from "./meeting-context-catalog";
import {
  datedContextLines,
  topicContextLines,
  TOPIC_CONTEXT_MARKDOWN,
  TOPIC_CONTEXT_PLAIN,
  type TopicContextLineStyle,
} from "./meeting-topic-context-text";
import { sectionFeedLines, type AgendaSectionFeeds } from "./agenda-feed-text";
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";
import { withHardLineBreaks } from "@/lib/markdown/hard-line-breaks";
import { documentNameFromPath } from "@/lib/storage/documents";

export type AgendaExportInput = {
  meetingDate: string;
  agenda: Agenda;
  sections: AgendaTemplateSection[];
  openingChecklist: string[];
  carriedOverItems: ActionItem[];
  createdItems: ActionItem[];
  decisions: Decision[];
  /**
   * The live "Next 30 days" block (#1223), or undefined while it is still
   * loading -- in which case the section is left out rather than printed as
   * empty, which would read as "nothing is scheduled".
   */
  datedContext?: MeetingDatedContext;
  /**
   * The records behind each standing section (#1224), or undefined while the
   * read is in flight -- in which case the blocks are left out rather than
   * printed empty, the same rule `datedContext` follows.
   */
  topicContext?: MeetingTopicContext;
  /**
   * The module rows each sourced section had on screen (#1244), keyed by
   * section key. Absent for a manual section, and for a sourced one whose
   * reads are still in flight -- the export prints what the meeting was
   * looking at, and issues no reads of its own, for the same reason
   * `carriedOverItems` and `decisions` are handed in rather than fetched.
   */
  sourcedSections?: Record<string, AgendaSectionFeeds>;
};

function actionItemLine(item: ActionItem): string {
  return `${item.description} — ${personDisplayName(item.owner)}`;
}

function decisionLine(decision: Decision): string {
  const topic = decision.topic ? `${decision.topic}: ` : "";
  const vote = decision.vote_result ? ` (${decision.vote_result})` : "";
  return `${topic}${decision.description}${vote}`;
}

/**
 * The blocks under one section heading.
 *
 * `datedContext` is deliberately not passed: the agenda prints its own
 * "Next 30 days" section, and the Events block would repeat it verbatim a few
 * headings earlier. The minutes, which have no such section, do pass it.
 */
function sectionContextLines(
  input: AgendaExportInput,
  sectionKey: string,
  style: TopicContextLineStyle,
): string[] {
  return topicContextLines({
    itemKey: `section:${sectionKey}`,
    context: input.topicContext,
    style,
  });
}

/**
 * What one standing section prints between its heading and its context block.
 *
 * A manual section is the pair of boxes it has always been, down to the byte.
 * A sourced one prints its module's rows and the single Discussion box that
 * replaced the pair (#1240) -- printing the pair for it would head the three
 * sections with the most on the screen with two empty placeholders. Text left
 * behind by a template that moved from manual to sourced still prints, and
 * only when it holds something: this is the one place it is still readable,
 * exactly as the read view treats it.
 */
function sectionBodyLines(
  input: AgendaExportInput,
  section: AgendaTemplateSection,
  style: TopicContextLineStyle,
  /** One labelled paragraph, in this export's own shape. */
  field: (label: string, text: string) => string,
): string[] {
  const value = input.agenda.ongoing_items[section.key];
  if (!isSourcedSection(section)) {
    return [
      field("Updates", value?.updates || "—"),
      field("Decisions needed", value?.decisions_needed || "—"),
    ];
  }
  const lines = sectionFeedLines(
    input.sourcedSections?.[section.key],
    style,
    sectionShowsContentState(section),
  );
  lines.push(field("Discussion", value?.discussion || "—"));
  if (value?.updates) lines.push(field("Updates", value.updates));
  if (value?.decisions_needed)
    lines.push(field("Decisions needed", value.decisions_needed));
  return lines;
}

/**
 * The link and document lines both shapes open with. Named, never linked: a
 * signed URL in an exported file stops working within the hour, and the file
 * is private to the portal (#1489).
 */
function documentLines(agenda: Agenda): string[] {
  const lines: string[] = [];
  if (agenda.external_link) {
    lines.push(`External link: ${agenda.external_link}`, "");
  }
  if (agenda.document_path) {
    lines.push(
      `Document: ${documentNameFromPath(agenda.document_path)} (in the portal)`,
      "",
    );
  }
  return lines;
}

/** The event a pre-filled item came from (#1624), as frozen on the item. */
function itemSourceLine(source: AgendaItemSource): string {
  return source.date
    ? `${source.label} — ${formatCalendarDate(source.date)}`
    : source.label;
}

/**
 * A simple agenda (#1623): the opening, its items in order, and what the
 * meeting has recorded so far. None of the board agenda's standing sections,
 * which a committee or annual meeting does not have -- printing them empty
 * would read as a board agenda nobody filled in.
 */
function formatSimpleAgendaMarkdown(input: AgendaExportInput): string {
  const { agenda } = input;
  const lines: string[] = [
    `# Agenda — ${formatInstantDate(input.meetingDate)}`,
    "",
    ...documentLines(agenda),
  ];

  lines.push("## Opening");
  for (const step of input.openingChecklist) lines.push(`- ${step}`);
  lines.push("");

  lines.push("## Agenda items");
  if (agenda.items.length === 0) {
    lines.push("No items yet.", "");
  } else {
    agenda.items.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title}`);
      if (item.source) lines.push(`_From ${itemSourceLine(item.source)}_`);
      if (item.notes) lines.push(withHardLineBreaks(item.notes));
      lines.push("");
    });
  }

  lines.push("## Decisions & votes");
  if (input.decisions.length === 0) {
    lines.push("No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`- ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("## Action items created today");
  if (input.createdItems.length === 0) {
    lines.push("None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`- ${actionItemLine(item)}`);
  }

  return lines.join("\n");
}

function formatSimpleAgendaPlainText(input: AgendaExportInput): string {
  const { agenda } = input;
  const lines: string[] = [
    `AGENDA — ${formatInstantDate(input.meetingDate)}`,
    "",
    ...documentLines(agenda),
  ];

  lines.push("OPENING");
  for (const step of input.openingChecklist) lines.push(`  - ${step}`);
  lines.push("");

  lines.push("AGENDA ITEMS");
  if (agenda.items.length === 0) {
    lines.push("  No items yet.");
  } else {
    agenda.items.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item.title}`);
      if (item.source) lines.push(`     From ${itemSourceLine(item.source)}`);
      if (item.notes) lines.push(`     ${item.notes}`);
    });
  }
  lines.push("");

  lines.push("DECISIONS & VOTES");
  if (input.decisions.length === 0) {
    lines.push("  No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`  - ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("ACTION ITEMS CREATED TODAY");
  if (input.createdItems.length === 0) {
    lines.push("  None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`  - ${actionItemLine(item)}`);
  }

  return lines.join("\n");
}

export function formatAgendaMarkdown(input: AgendaExportInput): string {
  if (input.agenda.format === "simple")
    return formatSimpleAgendaMarkdown(input);
  const { agenda, sections, openingChecklist } = input;
  const lines: string[] = [];

  lines.push(`# Agenda — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");
  lines.push(...documentLines(agenda));

  lines.push("## Opening");
  for (const step of openingChecklist) lines.push(`- ${step}`);
  lines.push("");

  lines.push("## Action items from previous meeting");
  if (input.carriedOverItems.length === 0) {
    lines.push("None carried over.");
  } else {
    for (const item of input.carriedOverItems)
      lines.push(`- ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("## Ongoing board items");
  if (sections.length === 0) {
    lines.push("No agenda template is configured.");
  } else {
    for (const section of sections) {
      lines.push(`### ${section.label}`);
      lines.push(
        ...sectionBodyLines(
          input,
          section,
          TOPIC_CONTEXT_MARKDOWN,
          (label, text) => `**${label}:** ${text}`,
        ),
      );
      lines.push(
        ...sectionContextLines(input, section.key, TOPIC_CONTEXT_MARKDOWN),
      );
      lines.push("");
    }
  }

  lines.push("## Decisions & votes");
  if (input.decisions.length === 0) {
    lines.push("No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`- ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("## New business");
  if (agenda.new_business.length === 0) {
    lines.push("None.");
  } else {
    for (const item of agenda.new_business) lines.push(`- ${item}`);
  }
  lines.push("");

  if (input.datedContext) {
    lines.push("## Next 30 days");
    lines.push(
      ...datedContextLines(input.datedContext, TOPIC_CONTEXT_MARKDOWN),
    );
    lines.push("");
  }

  lines.push("## Upcoming dates");
  if (agenda.upcoming_dates.length === 0) {
    lines.push("None scheduled.");
  } else {
    for (const item of agenda.upcoming_dates) {
      const date = formatCalendarDate(item.date);
      lines.push(
        `- ${date} — ${item.description || "—"} (${item.owner || "—"})`,
      );
    }
  }
  lines.push("");

  lines.push("## Action items created today");
  if (input.createdItems.length === 0) {
    lines.push("None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`- ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("## Parking lot");
  if (agenda.parking_lot.length === 0) {
    lines.push("None.");
  } else {
    for (const item of agenda.parking_lot) lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Next meeting");
  const nextMeeting = formatCalendarDate(agenda.next_meeting_date);
  lines.push(
    agenda.next_meeting_topics
      ? `${nextMeeting} — ${agenda.next_meeting_topics}`
      : nextMeeting,
  );
  lines.push("");

  lines.push("## Agenda notes");
  lines.push(withHardLineBreaks(agenda.body_text || "—"));

  return lines.join("\n");
}

export function formatAgendaPlainText(input: AgendaExportInput): string {
  if (input.agenda.format === "simple")
    return formatSimpleAgendaPlainText(input);
  const { agenda, sections, openingChecklist } = input;
  const lines: string[] = [];

  lines.push(`AGENDA — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");
  lines.push(...documentLines(agenda));

  lines.push("OPENING");
  for (const step of openingChecklist) lines.push(`  - ${step}`);
  lines.push("");

  lines.push("ACTION ITEMS FROM PREVIOUS MEETING");
  if (input.carriedOverItems.length === 0) {
    lines.push("  None carried over.");
  } else {
    for (const item of input.carriedOverItems)
      lines.push(`  - ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("ONGOING BOARD ITEMS");
  if (sections.length === 0) {
    lines.push("  No agenda template is configured.");
  } else {
    for (const section of sections) {
      lines.push(`  ${section.label}`);
      lines.push(
        ...sectionBodyLines(
          input,
          section,
          TOPIC_CONTEXT_PLAIN,
          (label, text) => `    ${label}: ${text}`,
        ),
      );
      lines.push(
        ...sectionContextLines(input, section.key, TOPIC_CONTEXT_PLAIN),
      );
    }
  }
  lines.push("");

  lines.push("DECISIONS & VOTES");
  if (input.decisions.length === 0) {
    lines.push("  No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`  - ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("NEW BUSINESS");
  if (agenda.new_business.length === 0) {
    lines.push("  None.");
  } else {
    for (const item of agenda.new_business) lines.push(`  - ${item}`);
  }
  lines.push("");

  if (input.datedContext) {
    lines.push("NEXT 30 DAYS");
    lines.push(...datedContextLines(input.datedContext, TOPIC_CONTEXT_PLAIN));
    lines.push("");
  }

  lines.push("UPCOMING DATES");
  if (agenda.upcoming_dates.length === 0) {
    lines.push("  None scheduled.");
  } else {
    for (const item of agenda.upcoming_dates) {
      const date = formatCalendarDate(item.date);
      lines.push(
        `  - ${date} — ${item.description || "—"} (${item.owner || "—"})`,
      );
    }
  }
  lines.push("");

  lines.push("ACTION ITEMS CREATED TODAY");
  if (input.createdItems.length === 0) {
    lines.push("  None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`  - ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("PARKING LOT");
  if (agenda.parking_lot.length === 0) {
    lines.push("  None.");
  } else {
    for (const item of agenda.parking_lot) lines.push(`  - ${item}`);
  }
  lines.push("");

  lines.push("NEXT MEETING");
  const nextMeeting = formatCalendarDate(agenda.next_meeting_date);
  lines.push(
    `  ${
      agenda.next_meeting_topics
        ? `${nextMeeting} — ${agenda.next_meeting_topics}`
        : nextMeeting
    }`,
  );
  lines.push("");

  lines.push("AGENDA NOTES");
  lines.push(`  ${agenda.body_text || "—"}`);

  return lines.join("\n");
}
