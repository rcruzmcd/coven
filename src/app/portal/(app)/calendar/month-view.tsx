"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { localDayKey, monthGridDays } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { needsDecision } from "./calendar-shared";
import type { CalendarEntry } from "./calendar-entries";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function parseMonthParam(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (monthNum || 1) - 1, 1);
}

export function MonthView({
  month,
  entries,
  monthHref,
}: {
  month: string;
  entries: CalendarEntry[];
  monthHref: (month: string) => string;
}) {
  const monthStart = parseMonthParam(month);
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  // Calendar-day arithmetic, not `addDays`: stepping 24 hours repeats a date
  // across a daylight-saving fall-back and skips one in spring (#1803).
  const days = monthGridDays(year, monthIndex);

  const entriesByDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    // The day in the viewer's own zone, which is what the grid's cells are.
    const key = localDayKey(new Date(entry.starts_at));
    const list = entriesByDay.get(key);
    if (list) list.push(entry);
    else entriesByDay.set(key, [entry]);
  }

  const prevMonth = localDayKey(new Date(year, monthIndex - 1, 1)).slice(0, 7);
  const nextMonth = localDayKey(new Date(year, monthIndex + 1, 1)).slice(0, 7);
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={monthHref(prevMonth)}
                  aria-label="Previous month"
                  // Keeps the mobile shell's icon tap target (globals.css).
                  data-size="icon-sm"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-sm",
                  })}
                />
              }
            >
              <ChevronLeft />
            </TooltipTrigger>
            <TooltipContent>Previous month</TooltipContent>
          </Tooltip>
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={monthHref(nextMonth)}
                  aria-label="Next month"
                  // Keeps the mobile shell's icon tap target (globals.css).
                  data-size="icon-sm"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-sm",
                  })}
                />
              }
            >
              <ChevronRight />
            </TooltipTrigger>
            <TooltipContent>Next month</TooltipContent>
          </Tooltip>
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
            const dayEntries = entriesByDay.get(key) ?? [];
            const inMonth = day.getMonth() === monthIndex;
            return (
              <div
                key={key}
                className={`min-h-24 bg-card p-1 ${inMonth ? "" : "opacity-40"}`}
              >
                <div className="app-muted px-1 text-[0.7rem]">
                  {day.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEntries.slice(0, MAX_CHIPS_PER_DAY).map((entry) => (
                    <Tooltip key={entry.id}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={entry.href}
                            className={cn(
                              "w-full truncate rounded px-1 py-0.5 text-left text-[0.7rem] hover:bg-muted",
                              // Events read as their own kind of chip: they are
                              // managed elsewhere and carry none of the
                              // editorial flags the tint below signals.
                              entry.kind === "event" &&
                                "bg-primary/10 text-primary",
                              entry.kind === "calendar_item" &&
                                needsDecision(entry.item) &&
                                "bg-destructive/10 text-destructive",
                            )}
                          />
                        }
                      >
                        {entry.title}
                      </TooltipTrigger>
                      <TooltipContent>
                        {entry.kind === "event"
                          ? `View event ${entry.title}`
                          : `View ${entry.title}`}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {dayEntries.length > MAX_CHIPS_PER_DAY && (
                    <span className="app-muted px-1 text-[0.7rem]">
                      +{dayEntries.length - MAX_CHIPS_PER_DAY} more
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
