"use client";

import { RepeatMarker } from "@/components/portal/social-content/repeat-marker";
import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Play,
  Square,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  localDayKey,
  monthGridDays,
  todayInZone,
  utcIsoToDateInZone,
} from "@/lib/time";
import { contentStatusTone } from "@/components/portal/social-content/content-status-badge";
import type { StatusTone } from "@/components/portal/status-badge";
import { CONTENT_STATUSES, postFormatLabel } from "@/lib/social-content/pieces";
import { socialPieceHref } from "@/lib/social-content/social-filters";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import type {
  CalendarEntry,
  CalendarItemEntryRow,
} from "../calendar/calendar-entries";

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
 * A post chip takes its status's tone -- the same one its badge carries in the
 * list view and the post sheet -- as a left stripe over a soft tint, so a
 * month reads at a glance. Status never borrows the brand colour: a tenant
 * whose brand is red or green would otherwise blur "Changes requested" or
 * "Published" with everything else.
 */
const TONE_CHIP: Record<StatusTone, { chip: string; icon: string }> = {
  neutral: {
    chip: "border-l-muted-foreground/60 bg-muted hover:bg-muted/70",
    icon: "text-muted-foreground",
  },
  info: {
    chip: "border-l-secondary-foreground/60 bg-secondary hover:bg-secondary/70",
    icon: "text-secondary-foreground",
  },
  progress: {
    chip: "border-l-primary bg-primary/10 hover:bg-primary/20",
    icon: "text-primary",
  },
  success: {
    chip: "border-l-success bg-success/10 hover:bg-success/20 dark:bg-success/20",
    icon: "text-success",
  },
  warning: {
    chip: "border-l-warning bg-warning/10 hover:bg-warning/20 dark:bg-warning/20",
    icon: "text-warning",
  },
  danger: {
    chip: "border-l-destructive bg-destructive/10 hover:bg-destructive/20 dark:bg-destructive/20",
    icon: "text-destructive",
  },
};

/** Published is the one finished state, so it goes solid rather than tinted. */
const PUBLISHED_CHIP = {
  chip: "border-l-success bg-success text-success-foreground hover:bg-success/90 dark:text-background",
  icon: "text-current",
};

function chipStyle(status: string) {
  if (status === "published") return PUBLISHED_CHIP;
  return TONE_CHIP[contentStatusTone(status)];
}

/** Format is an icon rather than a colour, leaving colour to status. */
const FORMAT_ICONS: Record<string, LucideIcon> = {
  instagram_post: Square,
  instagram_reel: Play,
  instagram_story: CircleDashed,
};

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
  // Days whose every entry is shown, past the three-chip limit.
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const monthStart = parseMonth(month);
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const days = monthGridDays(year, monthIndex);
  // Today in the same zone the posts are keyed in, not the grid's local days.
  const todayKey = todayInZone(timeZone);

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
          <h2 className="text-sm font-semibold text-brand-purple">
            {monthLabel}
          </h2>
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
            const expanded = expandedDays.has(key);
            const limit = expanded ? total : MAX_CHIPS_PER_DAY;
            const shownPieces = dayPieces.slice(0, limit);
            const shownOverlay = dayOverlay.slice(
              0,
              limit - shownPieces.length,
            );
            const hidden = total - shownPieces.length - shownOverlay.length;
            const dayLabel = day.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            });
            const inMonth = day.getMonth() === monthIndex;
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                data-day={key}
                className={cn(
                  "min-h-24 bg-card p-1",
                  !inMonth && "opacity-40",
                  // Today is framed in the brand accent, which carries its own
                  // dark-mode form, rather than `primary`, which dark mode
                  // flattens to a neutral near-white.
                  isToday &&
                    "bg-brand-purple/5 ring-2 ring-brand-purple ring-inset",
                )}
              >
                <div className="px-1 text-[0.7rem]">
                  <time
                    dateTime={key}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      isToday
                        ? "-ml-1 inline-flex size-5 items-center justify-center rounded-full bg-brand-purple font-semibold text-white dark:text-background"
                        : "app-muted",
                    )}
                  >
                    {day.getDate()}
                  </time>
                  {isToday && <span className="sr-only"> (today)</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  {shownPieces.map((piece) => {
                    const style = chipStyle(piece.content_status);
                    const FormatIcon = piece.post_format
                      ? FORMAT_ICONS[piece.post_format]
                      : undefined;
                    const format = postFormatLabel(piece.post_format);
                    return (
                      <Tooltip key={piece.id}>
                        <TooltipTrigger
                          render={
                            <Link
                              href={socialPieceHref(piece.id)}
                              data-status={piece.content_status}
                              className={cn(
                                "w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[0.7rem] text-foreground",
                                style.chip,
                                piece.content_status === "skipped" &&
                                  "line-through",
                              )}
                            />
                          }
                        >
                          {FormatIcon && (
                            <FormatIcon
                              aria-hidden
                              className={cn(
                                "mr-1 inline size-2.5 align-[-0.05em]",
                                style.icon,
                              )}
                            />
                          )}
                          <RepeatMarker
                            seriesId={piece.series_id}
                            className="mr-0.5"
                          />
                          {piece.title}
                        </TooltipTrigger>
                        <TooltipContent>
                          {piece.title} · {statusLabel(piece.content_status)}
                          {format ? ` · ${format}` : ""}
                          {piece.series_id ? " · Repeats" : ""}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {shownOverlay.map((entry) => (
                    <Tooltip key={entry.id}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={entry.href}
                            className="w-full truncate rounded border border-dashed border-brand-purple/50 px-1 py-0.5 text-left text-[0.7rem] text-foreground/85 hover:bg-muted"
                          />
                        }
                      >
                        <CalendarDays
                          aria-hidden
                          className="mr-1 inline size-2.5 align-[-0.05em] text-brand-purple"
                        />
                        {entry.title}
                      </TooltipTrigger>
                      <TooltipContent>
                        {entry.kind === "event"
                          ? `Event: ${entry.title}`
                          : `Community date: ${entry.title}`}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {(hidden > 0 || expanded) && total > MAX_CHIPS_PER_DAY && (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? `Show fewer for ${dayLabel}`
                          : `Show ${hidden} more for ${dayLabel}`
                      }
                      onClick={() => toggleDay(key)}
                      className="app-muted w-full rounded px-1 py-0.5 text-left text-[0.7rem] underline-offset-2 hover:bg-muted hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {expanded ? "Show fewer" : `+${hidden} more`}
                    </button>
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
