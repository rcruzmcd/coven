"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { utcIsoToDateInZone } from "@/lib/time";
import { CONTENT_STATUSES } from "@/lib/social-content/pieces";
import { socialPieceHref } from "@/lib/social-content/social-filters";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import type {
  CalendarEntry,
  CalendarItemEntryRow,
} from "../calendar/calendar-entries";
import { localDayKey, monthGridDays } from "./social-placement";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function parseMonth(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year, monthNum - 1, 1);
}

function statusLabel(status: string) {
  return CONTENT_STATUSES.find((option) => option.value === status)?.label;
}

/**
 * Posts placed on the day of their publish date (#1794), with events and
 * community dates behind them when the overlay is on. The overlay is context
 * only: its chips are dashed, read-only, and open the record they came from.
 */
export function SocialMonthView({
  month,
  piecesByDay,
  overlay,
  timeZone,
  monthHref,
}: {
  month: string;
  piecesByDay: Map<string, SocialPieceRow[]>;
  overlay: CalendarEntry<CalendarItemEntryRow>[];
  /** The zone `piecesByDay` was keyed in; the overlay is placed in it too. */
  timeZone: string;
  monthHref: (month: string) => string;
}) {
  const monthStart = parseMonth(month);
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const days = monthGridDays(year, monthIndex);

  const overlayByDay = new Map<string, typeof overlay>();
  for (const entry of overlay) {
    const key = utcIsoToDateInZone(entry.starts_at, timeZone);
    const list = overlayByDay.get(key);
    if (list) list.push(entry);
    else overlayByDay.set(key, [entry]);
  }

  const prevMonth = localDayKey(new Date(year, monthIndex - 1, 1)).slice(0, 7);
  const nextMonth = localDayKey(new Date(year, monthIndex + 1, 1)).slice(0, 7);
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <MonthLink href={monthHref(prevMonth)} label="Previous month">
            <ChevronLeft />
          </MonthLink>
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <MonthLink href={monthHref(nextMonth)} label="Next month">
            <ChevronRight />
          </MonthLink>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="bg-muted px-2 py-1 text-center font-semibold"
            >
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = localDayKey(day);
            const dayPieces = piecesByDay.get(key) ?? [];
            const dayOverlay = overlayByDay.get(key) ?? [];
            const total = dayPieces.length + dayOverlay.length;
            const shownPieces = dayPieces.slice(0, MAX_CHIPS_PER_DAY);
            const shownOverlay = dayOverlay.slice(
              0,
              MAX_CHIPS_PER_DAY - shownPieces.length,
            );
            const inMonth = day.getMonth() === monthIndex;
            return (
              <div
                key={key}
                data-day={key}
                className={cn("min-h-24 bg-card p-1", !inMonth && "opacity-40")}
              >
                <div className="app-muted px-1 text-[0.7rem]">
                  {day.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {shownPieces.map((piece) => (
                    <Tooltip key={piece.id}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={socialPieceHref(piece.id)}
                            className="w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[0.7rem] text-primary hover:bg-primary/20"
                          />
                        }
                      >
                        {piece.title}
                      </TooltipTrigger>
                      <TooltipContent>
                        {piece.title} · {statusLabel(piece.content_status)}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {shownOverlay.map((entry) => (
                    <Tooltip key={entry.id}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={entry.href}
                            className="app-muted w-full truncate rounded border border-dashed border-border px-1 py-0.5 text-left text-[0.7rem] hover:bg-muted"
                          />
                        }
                      >
                        {entry.title}
                      </TooltipTrigger>
                      <TooltipContent>
                        {entry.kind === "event"
                          ? `Event: ${entry.title}`
                          : `Community date: ${entry.title}`}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {total > shownPieces.length + shownOverlay.length && (
                    <span className="app-muted px-1 text-[0.7rem]">
                      +{total - shownPieces.length - shownOverlay.length} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            // Keeps the mobile shell's icon tap target (globals.css).
            data-size="icon-sm"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
