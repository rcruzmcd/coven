import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type HideBelow,
} from "@/components/ui/table";
import {
  buildHref,
  PAGE_SIZE,
  pageRange,
  parsePage,
  parsePerPage,
  totalPagesFor,
} from "@/lib/pagination";
import { NewEventDialog } from "./new-event-dialog";
import { IconLink } from "@/components/portal/icon-link";
import { StatusBadge, VisibilityBadge } from "./event-badges";
import { FiltersSheet } from "@/components/filters-sheet";
import { OutstandingTasksSheet } from "./outstanding-tasks-sheet";
import { RiderMountainsSheet } from "./rider-mountains-sheet";
import { RegistrationSettingsSheet } from "./registration-settings-sheet";
import { MediaSettingsSheet } from "./media-settings-sheet";
import { getRiderProfileMountains } from "@/lib/rider-profile-settings";
import {
  getEventMediaRetentionDays,
  getEventMediaUploadsEnabled,
  getEventPublicGalleryEnabled,
  getRegistrationAsksAboutMinors,
  getRegistrationRequiresInstagram,
  getRegistrationServiceArea,
} from "@/lib/registration-settings";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import { listProgramsAction } from "../programs/actions";

import {
  EVENT_OPEN_WORK_KINDS,
  EVENT_OPEN_WORK_PARAM_PREFIX,
  getEventOpenWork,
} from "@/lib/portal/event-open-work";
import { parseTaskFilters } from "@/lib/portal/task-list";
import { ViewerTime } from "@/components/viewer-time";
import { EventTimingBadge } from "./event-timing-badge";
import {
  pastEventsFilter,
  splitPageRange,
  upcomingEventsFilter,
} from "./list-order";

const SORTABLE_COLUMNS = [
  "name",
  "starts_at",
  "status",
  "visibility",
  "location",
] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const STATUS_VALUES = ["draft", "published", "cancelled", "archived"] as const;
const VISIBILITY_VALUES = ["public", "private"] as const;
const WHEN_VALUES = ["upcoming", "past"] as const;

type EventsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const EVENT_COLUMNS =
  "id, name, location, starts_at, ends_at, timezone, visibility, status, attendance_count, attendance_notes, description, capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, budget_amount, event_lead_id, report_status, report_summary, feedback_notes, content_notes, report_submitted_at, report_submitted_by, flier_url";

const COLUMNS: { key: SortColumn; label: string; hideBelow?: HideBelow }[] = [
  { key: "name", label: "Event" },
  { key: "starts_at", label: "Starts" },
  { key: "location", label: "Location", hideBelow: "md" },
  { key: "status", label: "Status" },
  { key: "visibility", label: "Visibility", hideBelow: "sm" },
];

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "events", "manage");
  // The route layout already requires events:view; asked so the tasks list
  // says who it is for. A view-only role sees it without check-off controls.
  const canViewEvents = hasPermission(permissions, "events", "view");
  const canManageRiderMountains = hasPermission(
    permissions,
    "rider_profiles",
    "manage",
  );
  // Events stays a top-level module rather than nesting under Calendar (#530);
  // this is the cross-link that replaces that nesting.
  const canViewCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // No sort in the URL means the default order -- upcoming soonest first,
  // then past most recent first (#1609) -- not a sort on any one column.
  const sortParam = raw("sort");
  const sort: SortColumn | null = isSortColumn(sortParam) ? sortParam : null;
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";
  const sortParams: Record<string, string> = sort ? { sort, dir } : {};

  const statusRaw = raw("status");
  const statusFilter = STATUS_VALUES.includes(
    statusRaw as (typeof STATUS_VALUES)[number],
  )
    ? (statusRaw as (typeof STATUS_VALUES)[number])
    : "all";

  const visibilityRaw = raw("visibility");
  const visibilityFilter = VISIBILITY_VALUES.includes(
    visibilityRaw as (typeof VISIBILITY_VALUES)[number],
  )
    ? (visibilityRaw as (typeof VISIBILITY_VALUES)[number])
    : "all";

  const whenRaw = raw("when");
  const whenFilter = WHEN_VALUES.includes(
    whenRaw as (typeof WHEN_VALUES)[number],
  )
    ? (whenRaw as (typeof WHEN_VALUES)[number])
    : "all";

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));
  // Deep link from the dashboard's "Outstanding tasks" count. Deliberately not
  // part of `filterParams` below -- it isn't a filter on the table, and sort/
  // page links shouldn't carry it and reopen the sheet on every navigation.
  const tasksOpen = raw("tasks") === "open";
  const taskFilters = parseTaskFilters(
    params,
    EVENT_OPEN_WORK_KINDS,
    EVENT_OPEN_WORK_PARAM_PREFIX,
  );
  const nowIso = new Date().toISOString();

  const filteredEvents = (head = false) => {
    let query = supabase
      .from("events")
      .select(EVENT_COLUMNS, { count: "exact", head });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (visibilityFilter !== "all") {
      query = query.eq("visibility", visibilityFilter);
    }
    return query;
  };
  const upcomingEvents = (head = false) =>
    filteredEvents(head)
      .or(upcomingEventsFilter(nowIso))
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true });
  const pastEvents = (head = false) =>
    filteredEvents(head)
      .or(pastEventsFilter(nowIso))
      .order("starts_at", { ascending: false })
      .order("id", { ascending: true });

  const { offset, to } = pageRange(page, perPage);

  async function loadEvents() {
    if (sort) {
      let query = filteredEvents();
      if (whenFilter === "upcoming") {
        query = query.or(upcomingEventsFilter(nowIso));
      } else if (whenFilter === "past") {
        query = query.or(pastEventsFilter(nowIso));
      }
      return query
        .order(sort, { ascending: dir === "asc" })
        .order("id", { ascending: true })
        .range(offset, to);
    }
    if (whenFilter === "upcoming") return upcomingEvents().range(offset, to);
    if (whenFilter === "past") return pastEvents().range(offset, to);

    // Both halves: count them first, so the page knows where upcoming stops.
    const [upcomingHead, pastHead] = await Promise.all([
      upcomingEvents(true),
      pastEvents(true),
    ]);
    const headError = upcomingHead.error ?? pastHead.error;
    if (headError) return { data: null, error: headError, count: null };
    const upcomingCount = upcomingHead.count ?? 0;
    const split = splitPageRange(offset, to, upcomingCount);
    const [upcoming, past] = await Promise.all([
      split.upcoming &&
        upcomingEvents().range(split.upcoming.from, split.upcoming.to),
      split.past && pastEvents().range(split.past.from, split.past.to),
    ]);
    return {
      data: [...(upcoming?.data ?? []), ...(past?.data ?? [])],
      error: upcoming?.error ?? past?.error ?? null,
      count: upcomingCount + (pastHead.count ?? 0),
    };
  }

  const { data: events, error, count } = await loadEvents();
  const [
    programsResult,
    eventTasks,
    riderMountains,
    asksAboutMinors,
    requiresInstagram,
    serviceArea,
    mediaUploadsEnabled,
    mediaRetention,
    publicGalleryEnabled,
  ] = await Promise.all([
    listProgramsAction(),
    canViewEvents
      ? getEventOpenWork(supabase, taskFilters, {
          canEdit: canManage,
          nowIso,
        })
      : Promise.resolve(null),
    // The rider profile's mountain list (#1408). rider_profiles carries the
    // rider_profile module, so on a tenant without it nobody pays the read.
    canManageRiderMountains
      ? getRiderProfileMountains(supabase)
      : Promise.resolve(null),
    // Registration's under-18 setting (#1416), for whoever can change it.
    canManage
      ? getRegistrationAsksAboutMinors(supabase)
      : Promise.resolve(null),
    // And its Instagram requirement (#1647), likewise.
    canManage
      ? getRegistrationRequiresInstagram(supabase)
      : Promise.resolve(null),
    // And its service area (#1699), likewise.
    canManage ? getRegistrationServiceArea(supabase) : Promise.resolve(null),
    // Event media uploads (#1606), likewise.
    canManage ? getEventMediaUploadsEnabled(supabase) : Promise.resolve(null),
    // And how long that media is kept (#1608).
    canManage ? getEventMediaRetentionDays(supabase) : Promise.resolve(null),
    // And whether it shows on the public site (#1654).
    canManage ? getEventPublicGalleryEnabled(supabase) : Promise.resolve(null),
  ]);
  const programs = "data" in programsResult ? programsResult.data : [];

  const filterParams = new URLSearchParams();
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (visibilityFilter !== "all")
    filterParams.set("visibility", visibilityFilter);
  if (whenFilter !== "all") filterParams.set("when", whenFilter);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref("/portal/events", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/events", filterParams, {
      ...sortParams,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of
    // 9 is nothing in particular once each page holds 25.
    return buildHref("/portal/events", filterParams, {
      ...sortParams,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, perPage);

  const hasActiveFilters =
    statusFilter !== "all" ||
    visibilityFilter !== "all" ||
    whenFilter !== "all";
  const activeFilterCount = [
    statusFilter !== "all",
    visibilityFilter !== "all",
    whenFilter !== "all",
  ].filter(Boolean).length;

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Events
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        {eventTasks && eventTasks.openCount > 0 && (
          <OutstandingTasksSheet
            rows={eventTasks.rows}
            filters={taskFilters}
            owners={eventTasks.owners}
            today={eventTasks.today}
            openCount={eventTasks.openCount}
            defaultOpen={tasksOpen}
          />
        )}

        <FiltersSheet activeCount={activeFilterCount}>
          <form method="get" className="flex flex-col gap-4">
            {sort && (
              <>
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="dir" value={dir} />
              </>
            )}

            <div className="flex flex-col gap-1">
              <label
                htmlFor="when"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                When
              </label>
              <select
                id="when"
                name="when"
                defaultValue={whenFilter}
                className={selectClassName}
              >
                <option value="all">All events</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="status"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={statusFilter}
                className={selectClassName}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="visibility"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                Visibility
              </label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={visibilityFilter}
                className={selectClassName}
              >
                <option value="all">All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSubmitButton />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/portal/events" />}
                >
                  <LinkPendingPulse>Clear</LinkPendingPulse>
                </Button>
              )}
            </div>
          </form>
        </FiltersSheet>

        {canViewCalendar && (
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href="/portal/calendar?view=month" />}
          >
            <CalendarDays className="size-4" />
            <LinkPendingPulse>View on Calendar</LinkPendingPulse>
          </Button>
        )}

        {riderMountains && <RiderMountainsSheet mountains={riderMountains} />}

        {asksAboutMinors !== null && (
          <RegistrationSettingsSheet
            asksAboutMinors={asksAboutMinors}
            requiresInstagram={requiresInstagram ?? false}
            serviceArea={serviceArea ?? []}
          />
        )}

        {mediaUploadsEnabled !== null &&
          mediaRetention !== null &&
          publicGalleryEnabled !== null && (
            <MediaSettingsSheet
              enabled={mediaUploadsEnabled}
              retentionDays={mediaRetention.days}
              publicGalleryEnabled={publicGalleryEnabled}
            />
          )}

        {canManage && <NewEventDialog programs={programs} />}
      </div>

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load events. Please try again.
            </p>
          ) : !events || events.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">
              No events match these filters.
            </p>
          ) : (
            <Table stickyHeader="page">
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column.key}
                      hideBelow={column.hideBelow}
                      sortDirection={sort === column.key ? dir : null}
                    >
                      <SortHeaderLink
                        href={sortHref(column.key)}
                        label={column.label}
                        dir={sort === column.key ? dir : null}
                      />
                    </TableHead>
                  ))}
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={event.name}
                    >
                      {event.name}
                    </TableCell>
                    <TableCell>
                      <ViewerTime
                        iso={event.starts_at}
                        fallbackZone={event.timezone}
                      />
                    </TableCell>
                    <TableCell
                      hideBelow="md"
                      className="app-muted max-w-xs truncate"
                      title={event.location ?? undefined}
                    >
                      {event.location || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={event.status} />
                        <EventTimingBadge event={event} nowIso={nowIso} />
                      </div>
                    </TableCell>
                    <TableCell hideBelow="sm">
                      <VisibilityBadge visibility={event.visibility} />
                    </TableCell>
                    <TableCell className="text-right">
                      <IconLink
                        href={`/portal/events/${event.id}`}
                        label={`View ${event.name}`}
                      >
                        <Eye />
                      </IconLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {events && events.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          count={count}
          pageSize={perPage}
          hrefFor={pageHref}
          perPageHrefFor={perPageHref}
        />
      )}
    </>
  );
}
