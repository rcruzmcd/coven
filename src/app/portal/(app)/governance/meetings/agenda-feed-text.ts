// What a sourced section's module feeds (#1241, #1242, #1243) say on a printed
// page, and the one rule the printed page and the screen have to agree on.
//
// A sibling of `meeting-topic-context-text.ts`, and for the same reason: the
// export cannot import the feed components -- they are `"use client"` tables
// that reach for `next/link` -- but printing a second, hand-written reading of
// the same rows is how a board ends up with an agenda on screen that disagrees
// with the agenda in their hands. So the row text lives here, beside the
// predicate that decides which rows are flagged, and both sides import it.
//
// The blocks print rather than being summarised away: a board member reading
// the export is the reader least able to click through to the module, and a
// list of dates with nothing said about their state is the list they cannot
// act on. An empty group prints its "None" line for the same reason -- "no
// events since the last meeting" is an answer, and a skipped heading is not.
import { humanizeStatus } from "@/components/portal/status-badge";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import {
  CONTENT_STATUSES,
  summaryContentStatus,
} from "@/lib/social-content/pieces";
import { ITEM_TYPES, labelFor } from "../../calendar/calendar-shared";
import { PARTNERSHIP_STAGE_LABELS } from "../partnerships/partnership-opportunity-form-fields";
import type {
  AgendaEvent,
  AgendaEventsFeed,
  AgendaEventsGroup,
} from "./agenda-events-actions";
import type {
  AgendaCalendarFeed,
  AgendaCalendarItem,
  AgendaPartnershipsFeed,
} from "./agenda-calendar-actions";
import type { TopicContextLineStyle } from "./meeting-topic-context-text";

/**
 * The rows one sourced section had on screen when the export was taken.
 *
 * Handed to the formatter rather than read by it, the same rule the rest of
 * `AgendaExportInput` follows: the tab has already paid for these reads, and
 * an export that fetched again could print something the meeting never saw.
 * Each field is absent while its read is in flight, which prints nothing at
 * all -- printing "None" for a group that simply had not arrived would be a
 * lie about the module rather than about the section.
 */
export type AgendaSectionFeeds = {
  events?: AgendaEventsFeed;
  calendar?: AgendaCalendarFeed;
  partnerships?: AgendaPartnershipsFeed;
};

const EVENTS_UNAVAILABLE = {
  forbidden: "Events are not shown — your role does not include Events.",
  error: "Events could not be loaded.",
} as const;

const CALENDAR_UNAVAILABLE = {
  forbidden:
    "Calendar items are not shown — your role does not include the Content Calendar.",
  error: "Calendar items could not be loaded.",
} as const;

/**
 * An event that went ahead: a published one (that it is past is the caller's
 * `past`). A cancelled or still-draft event owes no report,
 * so flagging one as outstanding sends a board after paperwork that was never
 * due. Shared with `agenda-events-feed.tsx`: the printed agenda flags exactly
 * the rows the screen flags, or the board is reading two different meetings.
 */
const HELD_STATUSES = new Set(["published"]);

export function eventReportOutstanding(
  event: Pick<AgendaEvent, "status" | "report_status">,
  past: boolean | undefined,
): boolean {
  return (
    past === true &&
    HELD_STATUSES.has(event.status) &&
    event.report_status !== "submitted"
  );
}

/** The parts of one row, joined once the empty ones have dropped out. */
function row(style: TopicContextLineStyle, parts: (string | null)[]): string {
  return `${style.bullet}${parts.filter(Boolean).join(" — ")}`;
}

/** "Feb 11, 2026 – Mar 18, 2026", the window line each block carries. */
function windowLine(
  style: TopicContextLineStyle,
  title: string,
  from: string,
  to: string,
): string {
  return `${style.indent}${style.strong(title)} (${formatCalendarDate(from)} – ${formatCalendarDate(to)})`;
}

function eventsGroupLines(
  group: AgendaEventsGroup,
  style: TopicContextLineStyle,
  { title, past, empty }: { title: string; past?: boolean; empty: string },
): string[] {
  const lines = [windowLine(style, title, group.fromDate, group.toDate)];
  if (group.events.length === 0) {
    lines.push(`${style.indent}${empty}`);
    return lines;
  }
  for (const event of group.events) {
    lines.push(
      row(style, [
        // The reader's own zone, which is what `ViewerTime` settles on in the
        // table this line prints: an export is read by the person who took it.
        formatInstantDate(event.starts_at),
        event.name,
        humanizeStatus(event.status),
        eventReportOutstanding(event, past)
          ? "report outstanding"
          : `report ${humanizeStatus(event.report_status).toLowerCase()}`,
        event.event_lead_name,
      ]),
    );
  }
  return lines;
}

function eventsLines(
  feed: AgendaEventsFeed,
  style: TopicContextLineStyle,
): string[] {
  if (feed.unavailable) {
    return [`${style.indent}${EVENTS_UNAVAILABLE[feed.unavailable]}`];
  }
  const lines = feed.since
    ? eventsGroupLines(feed.since, style, {
        title: "Since the last meeting",
        past: true,
        empty: "None since the last meeting.",
      })
    : [
        `${style.indent}${style.strong("Since the last meeting")}`,
        `${style.indent}First recorded meeting — no period to review.`,
      ];
  lines.push(
    ...eventsGroupLines(feed.upcoming, style, {
      title: "Coming up",
      empty: "None scheduled before the next meeting.",
    }),
  );
  return lines;
}

/**
 * The day an item falls on, in the item's **own** zone -- the reading the
 * screen groups by. Read in the reader's zone instead, an item dated at
 * midnight prints on the previous day for anyone west of it.
 */
function itemDay(item: AgendaCalendarItem): string {
  return formatCalendarDate(
    formatDateInZone(new Date(item.starts_at), item.time_zone || "UTC"),
  );
}

/** "Draft (2 pieces)" / "nothing planned", the Content column as words. */
function contentState(item: AgendaCalendarItem): string {
  const status = summaryContentStatus(item.content_pieces);
  if (!status) return "nothing planned";
  const label = labelFor(CONTENT_STATUSES, status);
  return item.content_pieces.length > 1
    ? `${label} (${item.content_pieces.length} pieces)`
    : label;
}

function publishDue(item: AgendaCalendarItem): string | null {
  if (!item.publish_due_at) return null;
  const due = `publish due ${formatInstantDate(item.publish_due_at)}`;
  return item.content_overdue ? `${due} (overdue)` : due;
}

function calendarLines(
  feed: AgendaCalendarFeed,
  style: TopicContextLineStyle,
  showContentState: boolean,
): string[] {
  if (feed.unavailable) {
    return [`${style.indent}${CALENDAR_UNAVAILABLE[feed.unavailable]}`];
  }
  const lines = [
    windowLine(
      style,
      "On the calendar",
      feed.window.fromDate,
      feed.window.toDate,
    ),
  ];
  if (feed.items.length === 0) {
    lines.push(`${style.indent}None on the calendar before the next meeting.`);
    return lines;
  }
  for (const item of feed.items) {
    // The tenant's own words for its categories, and a key it has since
    // deactivated still labels the items already tagged with it.
    const categories = item.categories
      .map((key) => labelFor(feed.categoryOptions, key))
      .join(", ");
    lines.push(
      row(style, [
        itemDay(item),
        item.title,
        labelFor(ITEM_TYPES, item.item_type),
        ...(showContentState
          ? [contentState(item), publishDue(item)]
          : [categories || null]),
        item.owner_name,
      ]),
    );
  }
  return lines;
}

function partnershipsLines(
  feed: AgendaPartnershipsFeed,
  style: TopicContextLineStyle,
): string[] {
  const lines = [`${style.indent}${style.strong("Open partnerships")}`];
  if (feed.unavailable) {
    lines.push(`${style.indent}Partnerships could not be loaded.`);
    return lines;
  }
  if (feed.partnerships.length === 0) {
    lines.push(`${style.indent}None open.`);
    return lines;
  }
  for (const partnership of feed.partnerships) {
    const nextStep = partnership.next_step_date
      ? `next step ${formatCalendarDate(partnership.next_step_date)}${
          partnership.overdue ? " (overdue)" : ""
        }`
      : "no next step";
    lines.push(
      row(style, [
        partnership.organization,
        PARTNERSHIP_STAGE_LABELS[partnership.stage] ?? partnership.stage,
        nextStep,
        partnership.owner_name,
      ]),
    );
  }
  return lines;
}

/**
 * Every block one sourced section puts above its Discussion box, in the order
 * the screen puts them in. `showContentState` is the section's own answer
 * (#1243), passed in for the same reason the feed component takes it: which
 * columns a calendar section shows is a property of the section, not of the
 * rows it got back.
 */
export function sectionFeedLines(
  feeds: AgendaSectionFeeds | undefined,
  style: TopicContextLineStyle,
  showContentState: boolean,
): string[] {
  if (!feeds) return [];
  const lines: string[] = [];
  if (feeds.events) lines.push(...eventsLines(feeds.events, style));
  if (feeds.calendar)
    lines.push(...calendarLines(feeds.calendar, style, showContentState));
  if (feeds.partnerships)
    lines.push(...partnershipsLines(feeds.partnerships, style));
  return lines;
}
