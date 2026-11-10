import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { listSocialPieces } from "@/lib/social-content/queries";
import { parseSocialFilters } from "@/lib/social-content/social-filters";
import { listSocialContentLinkOptionsAction } from "@/lib/social-content/piece-actions";
import { listCalendarOwnersAction } from "../calendar/actions";
import { listCalendarEvents } from "../calendar/queries";
import {
  calendarItemEntry,
  eventEntry,
  type CalendarEntry,
  type CalendarItemEntryRow,
} from "../calendar/calendar-entries";
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

  const filters = parseSocialFilters(await searchParams);

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
      ? loadOverlay(supabase, canViewEvents)
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
            pieces={pieces}
            overlay={overlay}
            owners={owners}
            events={linkOptions.events}
            canManage={canManage}
            canViewEvents={canViewEvents}
            defaultLeadTimeDays={defaultLeadTimeDays}
          />
        </div>
      )}
    </>
  );
}

/**
 * Events and community dates drawn read-only behind the posts, through the
 * calendar's own projection so each one links where the calendar links it.
 * Events are gated on `events` view, as on the calendar.
 */
async function loadOverlay(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  canViewEvents: boolean,
): Promise<CalendarEntry<CalendarItemEntryRow>[]> {
  const [{ data: items }, { events }] = await Promise.all([
    supabase
      .from("calendar_items")
      .select(
        "id, title, item_type, starts_at, ends_at, time_zone, summary, calendar_status",
      )
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true }),
    canViewEvents
      ? listCalendarEvents(supabase)
      : Promise.resolve({ events: [], error: false }),
  ]);
  return [
    ...((items ?? []) as CalendarItemEntryRow[]).map(calendarItemEntry),
    ...events.map(eventEntry),
  ];
}
