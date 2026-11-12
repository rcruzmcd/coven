import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { listSocialPieces } from "@/lib/social-content/queries";
import {
  hasMonthParam,
  parseSocialFilters,
} from "@/lib/social-content/social-filters";
import { listSocialContentLinkOptionsAction } from "@/lib/social-content/piece-actions";
import { listCalendarOwnersAction } from "../calendar/actions";
import { listCalendarEvents } from "../calendar/queries";
import {
  calendarItemEntry,
  eventEntry,
  type CalendarEntry,
  type CalendarItemEntryRow,
} from "../calendar/calendar-entries";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { SocialWorkspace } from "./social-workspace";

export const metadata: Metadata = {
  title: "Social content",
};

/**
 * Every social post in one place (#1794): a month grid placed by publish date,
 * a list, and a tray for the posts with no date yet. Posts are the same rows
 * the calendar item card and the event's Social content section show (#1795).
 */
export default async function SocialContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await requirePermission(
    supabase,
    "content_calendar",
    "view",
    "Social content",
  );
  const canManage = hasPermission(permissions, "content_calendar", "manage");
  const canViewEvents = hasPermission(permissions, "events", "view");

  const params = await searchParams;
  const filters = parseSocialFilters(params);
  const monthGiven = hasMonthParam(params);

  const [
    { pieces, error },
    ownersResult,
    linkOptions,
    { data: leadTimeSetting },
    overlay,
  ] = await Promise.all([
    listSocialPieces(supabase, filters),
    listCalendarOwnersAction(),
    listSocialContentLinkOptionsAction(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "content.default_lead_time_days")
      .maybeSingle(),
    filters.overlay && filters.view === "month"
      ? loadOverlay(supabase, canViewEvents, filters.month)
      : Promise.resolve([] as CalendarEntry<CalendarItemEntryRow>[]),
  ]);

  const owners = "data" in ownersResult ? ownersResult.data : [];
  const defaultLeadTimeDays =
    typeof leadTimeSetting?.value === "number" ? leadTimeSetting.value : 21;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Social content
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {error ? (
        <p className="app-muted mt-6 px-4 py-6 text-sm">
          Could not load social posts. Please try again.
        </p>
      ) : (
        <div className="mt-2">
          <SocialWorkspace
            filters={filters}
            monthGiven={monthGiven}
            pieces={pieces}
            overlay={overlay}
            owners={owners}
            events={linkOptions.events}
            programs={linkOptions.programs}
            openNewPost={first(params.new) === "1"}
            canManage={canManage}
            canViewEvents={canViewEvents}
            defaultLeadTimeDays={defaultLeadTimeDays}
          />
        </div>
      )}
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The instants a month grid can show, with room to spare: up to six days of
 * the neighbouring months either side, plus a day each way for whatever zone
 * the viewer is in. Anything starting outside it cannot land in a cell.
 */
function overlayWindow(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const DAY = 24 * 60 * 60 * 1000;
  return {
    fromInstant: new Date(
      Date.UTC(year, monthNum - 1, 1) - 8 * DAY,
    ).toISOString(),
    toInstant: new Date(Date.UTC(year, monthNum, 1) + 8 * DAY).toISOString(),
  };
}

/**
 * Events and community dates drawn read-only behind the posts, through the
 * calendar's own projection so each one links where the calendar links it.
 * Events are gated on `events` view, as on the calendar. Read for the shown
 * month only, and the items in pages, so neither the response cap nor years
 * of history can drop a date from the grid.
 */
async function loadOverlay(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  canViewEvents: boolean,
  month: string,
): Promise<CalendarEntry<CalendarItemEntryRow>[]> {
  const window = overlayWindow(month);
  const [items, { events }] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("calendar_items")
        .select(
          "id, title, item_type, starts_at, ends_at, time_zone, summary, calendar_status",
        )
        .gte("starts_at", window.fromInstant)
        .lt("starts_at", window.toInstant)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    canViewEvents
      ? listCalendarEvents(supabase, { window })
      : Promise.resolve({ events: [], error: false }),
  ]);
  return [
    ...(items as CalendarItemEntryRow[]).map(calendarItemEntry),
    ...events.map(eventEntry),
  ];
}
