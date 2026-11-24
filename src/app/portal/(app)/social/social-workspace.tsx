"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  monthInZone,
  newSocialPostHref,
  socialHref,
  type SocialFilters,
  type SocialView,
} from "@/lib/social-content/social-filters";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import type { SocialContentLinkOption } from "@/lib/social-content/piece-actions";
import type { CalendarOwner } from "../calendar/calendar-shared";
import type {
  CalendarEntry,
  CalendarItemEntryRow,
} from "../calendar/calendar-entries";
import { SocialFiltersSheet } from "./social-filters-sheet";
import { SocialMonthView } from "./social-month-view";
import { SocialListView, UnscheduledTray } from "./social-list-view";
import { placePieces } from "./social-placement";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";

const VIEWS: { value: SocialView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
];

export function SocialWorkspace({
  filters,
  monthGiven,
  pieces,
  overlay,
  owners,
  events,
  programs,
  canManage,
  canViewEvents,
}: {
  filters: SocialFilters;
  /** The URL named the month; otherwise it is the server's, not the viewer's. */
  monthGiven: boolean;
  pieces: SocialPieceRow[];
  overlay: CalendarEntry<CalendarItemEntryRow>[];
  owners: CalendarOwner[];
  events: SocialContentLinkOption[];
  programs: SocialContentLinkOption[];
  canManage: boolean;
  canViewEvents: boolean;
}) {
  const router = useRouter();

  // UTC until the browser reports its zone, so the server render and the
  // first client render place every post in the same cell.
  const viewerTimeZone = useViewerTimeZone();
  const timeZone = viewerTimeZone ?? "UTC";

  // A bare /portal/social opened the server's month; the grid places posts in
  // the viewer's zone, so open the viewer's month instead. A month the URL
  // names is kept as asked.
  useEffect(() => {
    if (monthGiven || !viewerTimeZone) return;
    const month = monthInZone(viewerTimeZone);
    if (month !== filters.month) {
      router.replace(socialHref({ ...filters, month }));
    }
  }, [monthGiven, viewerTimeZone, filters, router]);
  const { byDay, unscheduled } = useMemo(
    () => placePieces(pieces, timeZone),
    [pieces, timeZone],
  );
  const scheduled = useMemo(
    () => pieces.filter((piece) => piece.publish_due_at),
    [pieces],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex gap-1 rounded-lg border border-input p-1">
          {VIEWS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filters.view === option.value ? "default" : "ghost"}
              nativeButton={false}
              render={
                <Link href={socialHref({ ...filters, view: option.value })} />
              }
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {filters.view === "month" && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={filters.overlay}
                onCheckedChange={(on) =>
                  router.push(socialHref({ ...filters, overlay: on }))
                }
              />
              {canViewEvents ? "Show events and dates" : "Show community dates"}
            </label>
          )}
          <SocialFiltersSheet
            filters={filters}
            owners={owners}
            events={events}
            programs={programs}
          />
          {canManage && (
            // Filtered to one program, a new post starts related to it (#1838).
            <Button
              nativeButton={false}
              render={
                <Link
                  href={newSocialPostHref(
                    filters.program !== "all" ? filters.program : undefined,
                  )}
                />
              }
            >
              <Plus /> New social post
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {filters.view === "month" ? (
          <SocialMonthView
            month={filters.month}
            piecesByDay={byDay}
            overlay={overlay}
            timeZone={timeZone}
            monthHref={(month) =>
              socialHref({ ...filters, view: "month", month })
            }
          />
        ) : (
          <SocialListView pieces={scheduled} owners={owners} />
        )}
        <UnscheduledTray pieces={unscheduled} owners={owners} />
      </div>
    </div>
  );
}
