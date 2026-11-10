"use client";

// A calendar-sourced section's rows, in the module-feed slot #1240 left for
// them (#1242). Shared with Marketing & Social (#1243): which items are in it
// is the section's source, which this component never reads.
//
// It does read one thing off the section: whether to show the content work
// state (#1243). Marketing & Social is reporting on posts being written, so
// its rows say how far each one is and when it is due out, in place of the
// categories every row in that section shares anyway.
//
// Read live on render, the same stance the "Next 30 days" block takes: a
// rescheduled item is right the next time anybody opens the agenda, and
// nothing here is copied into the agenda row. What the board *says* about
// these items is the Discussion box underneath, and that is the only part that
// saves.
//
// Ordered by date and not sortable. This is a period being planned in the
// order it will happen, so a click that reorders it is a click that loses the
// reader's place for no gain.
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusBadge } from "@/components/portal/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import { calendarItemHref } from "../../calendar/calendar-entries";
import {
  ITEM_TYPES,
  PRIORITY_TIERS,
  labelFor,
} from "../../calendar/calendar-shared";
import { ContentPiecesBadge } from "@/components/portal/social-content/content-status-badge";
import type {
  AgendaCalendarFeed as AgendaCalendarFeedData,
  AgendaCalendarItem,
} from "./agenda-calendar-actions";

const UNAVAILABLE_MESSAGES = {
  forbidden:
    "Calendar items are not shown — your role does not include the Content Calendar.",
  error: "Calendar items could not be loaded.",
} as const;

/**
 * The day an item falls on, in the item's **own** zone -- the same reading
 * `agenda-view.tsx` groups the calendar by and the "Next 30 days" block
 * labels its rows with. Read in the viewer's zone instead, an item dated at
 * midnight lands on the previous day for anyone west of it.
 */
function itemDay(item: AgendaCalendarItem): string {
  return formatDateInZone(new Date(item.starts_at), item.time_zone || "UTC");
}

/**
 * The line under the title: who owns the item, and -- where content state is
 * shown -- how the calendar ranks it.
 *
 * The tier goes here rather than in a column of its own. `PRIORITY_TIERS`
 * already ranks these items and a marketing section is where the ranking
 * matters, but this is a table a board reads together on one screen, and a
 * sixth column of "Tier 2" costs more width than it returns.
 */
function secondaryLine(
  item: AgendaCalendarItem,
  showContentState: boolean,
): string | null {
  const parts = [item.owner_name];
  if (showContentState) {
    parts.push(labelFor(PRIORITY_TIERS, String(item.priority_tier)));
  }
  const line = parts.filter(Boolean).join(" · ");
  return line || null;
}

export function AgendaCalendarFeed({
  feed,
  loadError,
  title,
  label,
  emptyTitle,
  showContentState = false,
}: {
  /** `undefined` while the read is in flight. */
  feed: AgendaCalendarFeedData | undefined;
  loadError: string | null;
  title: string;
  /** Names the table for a screen reader, which cannot see the heading above it. */
  label: string;
  emptyTitle: string;
  /**
   * Show what is written for these items instead of what they are categorised
   * as (#1243). A section that plans content -- Marketing & Social -- is
   * reporting on work in progress, and the categories it filtered on are the
   * one thing every row in it already shares. A section that only needs the
   * dates keeps the narrower table.
   */
  showContentState?: boolean;
}) {
  if (loadError) return <p className="app-muted text-sm">{loadError}</p>;
  if (feed === undefined) return <Skeleton className="h-16 w-full" />;

  // A quiet line, not an `Alert`: the calendar being off or unreachable must
  // not make the section look broken in the middle of a meeting. The
  // Discussion box below it still works, which is the part that has to.
  if (feed.unavailable) {
    return (
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="app-muted mt-1 text-sm">
          {UNAVAILABLE_MESSAGES[feed.unavailable]}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="app-muted text-xs">
        {formatCalendarDate(feed.window.fromDate)} –{" "}
        {formatCalendarDate(feed.window.toDate)}
      </p>
      {feed.items.length === 0 ? (
        <EmptyState className="py-4" title={emptyTitle} />
      ) : (
        <div className="mt-2">
          <Table stickyHeader="page" aria-label={label}>
            <TableHeader>
              <TableRow>
                {/* Three columns is what a 390px phone reads without
                    scrolling sideways (#1090), so what survives that width is
                    when it happens, what it is, and how far its content has
                    got. The rest is a tap away on the item's own page, which
                    every title here links to. */}
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead hideBelow="sm">Type</TableHead>
                {showContentState ? (
                  <>
                    <TableHead>Content</TableHead>
                    <TableHead hideBelow="sm">Publish due</TableHead>
                  </>
                ) : (
                  <TableHead hideBelow="sm">Categories</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.items.map((item) => {
                const secondary = secondaryLine(item, showContentState);
                return (
                  // Keyed on the id and the occurrence: a series projected into
                  // the window and the same row read on its own date are two
                  // rows whenever a window spans two of its anniversaries.
                  <TableRow key={`${item.id}:${item.starts_at}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatCalendarDate(itemDay(item))}
                    </TableCell>
                    <TableCell className="max-w-xs font-medium">
                      <Link
                        href={calendarItemHref(item.id)}
                        className="text-[var(--purple-deep)] underline"
                      >
                        {item.title}
                      </Link>
                      {secondary && (
                        <span className="app-muted block text-xs font-normal">
                          {secondary}
                        </span>
                      )}
                    </TableCell>
                    <TableCell hideBelow="sm">
                      {labelFor(ITEM_TYPES, item.item_type)}
                    </TableCell>
                    {showContentState ? (
                      <>
                        <TableCell>
                          {/* Nothing planned yet is a real answer, and the row
                            stays: an undrafted date is the one the board most
                            needs to see. */}
                          {item.content_pieces.length === 0 ? (
                            <span className="app-muted text-xs">—</span>
                          ) : (
                            <ContentPiecesBadge pieces={item.content_pieces} />
                          )}
                        </TableCell>
                        <TableCell hideBelow="sm" className="whitespace-nowrap">
                          {item.publish_due_at === null ? (
                            <span className="app-muted text-xs">—</span>
                          ) : item.content_overdue ? (
                            <StatusBadge tone="warning">
                              Overdue {formatInstantDate(item.publish_due_at)}
                            </StatusBadge>
                          ) : (
                            formatInstantDate(item.publish_due_at)
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell hideBelow="sm" className="app-muted text-xs">
                        {/* The tenant's own words, not the seeded keys -- and a
                          key it has since deactivated still labels the items
                          already tagged with it, through `labelFor`'s fallback. */}
                        {item.categories.length === 0
                          ? "—"
                          : item.categories
                              .map((key) => labelFor(feed.categoryOptions, key))
                              .join(", ")}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
