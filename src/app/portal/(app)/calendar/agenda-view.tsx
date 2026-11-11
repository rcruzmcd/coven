"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateInZone } from "@/lib/time";
import {
  CalendarStatusBadge,
  EventEntryBadge,
  EventStatusBadge,
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "./calendar-badges";
import {
  isPastUndecided,
  labelFor,
  needsDecision,
  ITEM_TYPES,
} from "./calendar-shared";
import { ContentPiecesBadge } from "@/components/portal/social-content/content-status-badge";
import { EVENT_ITEM_TYPE } from "@/lib/calendar-vocabulary";
import type { CalendarEntry } from "./calendar-entries";

const dayHeadingFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

function groupByDay(
  entries: CalendarEntry[],
): { dayKey: string; entries: CalendarEntry[] }[] {
  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const dayKey = formatDateInZone(
      new Date(entry.starts_at),
      entry.time_zone || "UTC",
    );
    const existing = groups.get(dayKey);
    if (existing) existing.push(entry);
    else groups.set(dayKey, [entry]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayEntries]) => ({ dayKey, entries: dayEntries }));
}

export function AgendaView({ entries }: { entries: CalendarEntry[] }) {
  const groups = groupByDay(entries);

  if (groups.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="px-4 py-6">
          <p className="app-muted text-sm">
            No calendar items match these filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {groups.map(({ dayKey, entries: dayEntries }) => (
        <Card key={dayKey}>
          <CardContent className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              {dayHeadingFormatter.format(new Date(`${dayKey}T00:00:00`))}
            </h2>
            <div className="flex flex-col divide-y divide-border">
              {dayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.title}</span>
                      {entry.kind === "event" ? (
                        <>
                          <EventEntryBadge />
                          <EventStatusBadge status={entry.event.status} />
                        </>
                      ) : (
                        <>
                          <PriorityTierBadge tier={entry.item.priority_tier} />
                          <CalendarStatusBadge
                            status={entry.item.calendar_status}
                          />
                          <ContentPiecesBadge
                            pieces={entry.item.content_pieces}
                          />
                        </>
                      )}
                    </div>
                    <p className="app-muted text-xs">
                      {timeFormatter.format(new Date(entry.starts_at))} ·{" "}
                      {labelFor(
                        ITEM_TYPES,
                        entry.kind === "event"
                          ? EVENT_ITEM_TYPE
                          : entry.item.item_type,
                      )}
                    </p>
                    {entry.kind === "calendar_item" && (
                      <div className="flex flex-wrap gap-1">
                        {needsDecision(entry.item) && <NeedsDecisionFlag />}
                        {isPastUndecided(entry.item) && <PastUndecidedFlag />}
                      </div>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={entry.href}
                          aria-label={`View ${entry.title}`}
                          // Keeps the mobile shell's icon tap target (globals.css).
                          data-size="icon-sm"
                          className={buttonVariants({
                            variant: "ghost",
                            size: "icon-sm",
                          })}
                        />
                      }
                    >
                      <Eye />
                    </TooltipTrigger>
                    <TooltipContent>{`View ${entry.title}`}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
