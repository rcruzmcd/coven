import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { listProgramsAction } from "../programs/actions";
import { listCalendarOwnersAction } from "./actions";
import { CalendarWorkspace } from "./calendar-workspace";
import type { CalendarView } from "./view-toggle";
import type { ListSortColumn } from "./list-view";
import { type CalendarItemRow } from "./calendar-shared";
import {
  calendarItemEntry,
  eventEntry,
  filtersExcludeEvents,
  sortCalendarEntries,
  type CalendarEntry,
} from "./calendar-entries";
import { listCalendarEvents, mapCalendarItemRow } from "./queries";
import { listCalendarCategories } from "./queries";

const VIEW_VALUES: CalendarView[] = ["list", "agenda", "month"];
const SORT_VALUES: ListSortColumn[] = ["title", "starts_at", "calendar_status"];

type CalendarPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const supabase = await createSupabaseServerClient();
  const categoryVocabulary = await listCalendarCategories(supabase);
  const permissions = await requirePermission(
    supabase,
    "content_calendar",
    "view",
    "Calendar",
  );
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const view: CalendarView = VIEW_VALUES.includes(raw("view") as CalendarView)
    ? (raw("view") as CalendarView)
    : "list";
  const month = raw("month") || currentMonthParam();

  const sort: ListSortColumn = SORT_VALUES.includes(
    raw("sort") as ListSortColumn,
  )
    ? (raw("sort") as ListSortColumn)
    : "starts_at";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const typeFilter = raw("type") || "all";
  const categoryFilter = raw("category") || "all";
  const priorityFilter = raw("priority") || "all";
  const programFilter = raw("program") || "all";
  const ownerFilter = raw("owner") || "all";
  const visibilityFilter = raw("visibility") || "all";
  const statusFilter = raw("status") || "all";
  const decisionFilter = raw("decision") || "all";
  const contentStatusFilter = raw("contentStatus") || "all";

  const categorySelect =
    categoryFilter !== "all"
      ? "calendar_item_categories!inner(category)"
      : "calendar_item_categories(category)";
  const programSelect =
    programFilter !== "all"
      ? "calendar_item_programs!inner(program_id)"
      : "calendar_item_programs(program_id)";

  let query = supabase
    .from("calendar_items")
    .select(
      `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, source, region, exceptions, is_sensitive_topic, tone_guidance, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, ${categorySelect}, ${programSelect}, content_opportunities(id, calendar_item_id, title, content, post_format, collaborator_handles, content_status, skip_reason, internal_notes, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at)`,
    )
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true })
    // The pieces are a list now; oldest first with an `id` tie-break, the
    // same order the item's detail page shows them in.
    .order("created_at", {
      referencedTable: "content_opportunities",
      ascending: true,
    })
    .order("id", {
      referencedTable: "content_opportunities",
      ascending: true,
    });

  if (typeFilter !== "all") query = query.eq("item_type", typeFilter);
  if (priorityFilter !== "all")
    query = query.eq("priority_tier", Number(priorityFilter));
  if (ownerFilter !== "all") query = query.eq("owner_id", ownerFilter);
  if (visibilityFilter !== "all")
    query = query.eq("visibility", visibilityFilter);
  if (statusFilter !== "all") query = query.eq("calendar_status", statusFilter);
  if (decisionFilter === "none") query = query.is("decision", null);
  else if (decisionFilter !== "all")
    query = query.eq("decision", decisionFilter);
  if (categoryFilter !== "all")
    query = query.eq("calendar_item_categories.category", categoryFilter);
  if (programFilter !== "all")
    query = query.eq("calendar_item_programs.program_id", programFilter);

  const { data: rows, error } = await query;

  const allItems: CalendarItemRow[] = (rows ?? []).map(mapCalendarItemRow);

  // "Has a piece with this status" (#1231), applied here rather than in the
  // query: an `!inner` embed with an `eq` on the embedded column narrows the
  // embedded array as well as the parent rows, so the badge beside a matching
  // item would then count only its matching pieces and claim the item has
  // fewer than it does.
  const items =
    contentStatusFilter === "all"
      ? allItems
      : allItems.filter((item) =>
          item.content_pieces.some(
            (piece) => piece.content_status === contentStatusFilter,
          ),
        );

  // Portal events, drawn read-only alongside the editorial items (#530). Gated
  // on the `events` resource rather than `content_calendar` -- RLS would return
  // nothing anyway, this just skips the round trip. Filters an event can't
  // answer (priority, owner, decision, calendar status) drop them entirely; see
  // filtersExcludeEvents.
  const filters = {
    type: typeFilter,
    category: categoryFilter,
    priority: priorityFilter,
    program: programFilter,
    owner: ownerFilter,
    visibility: visibilityFilter,
    status: statusFilter,
    decision: decisionFilter,
    contentStatus: contentStatusFilter,
  };
  const eventsHidden = filtersExcludeEvents(filters);
  const canViewEvents = hasPermission(permissions, "events", "view");
  const { events, error: eventsError } =
    canViewEvents && !eventsHidden
      ? await listCalendarEvents(supabase, {
          programId: programFilter !== "all" ? programFilter : undefined,
        })
      : { events: [], error: false };

  const entries: CalendarEntry[] = sortCalendarEntries(
    [...items.map(calendarItemEntry), ...events.map(eventEntry)],
    sort,
    dir,
  );

  const ownersResult = await listCalendarOwnersAction();
  const owners = "data" in ownersResult ? ownersResult.data : [];
  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];

  const filterParams = new URLSearchParams();
  if (typeFilter !== "all") filterParams.set("type", typeFilter);
  if (categoryFilter !== "all") filterParams.set("category", categoryFilter);
  if (priorityFilter !== "all") filterParams.set("priority", priorityFilter);
  if (programFilter !== "all") filterParams.set("program", programFilter);
  if (ownerFilter !== "all") filterParams.set("owner", ownerFilter);
  if (visibilityFilter !== "all")
    filterParams.set("visibility", visibilityFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (decisionFilter !== "all") filterParams.set("decision", decisionFilter);
  if (contentStatusFilter !== "all")
    filterParams.set("contentStatus", contentStatusFilter);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Calendar
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {error ? (
        <p className="app-muted mt-6 px-4 py-6 text-sm">
          Could not load calendar items. Please try again.
        </p>
      ) : (
        <div className="mt-2">
          <CalendarWorkspace
            categoryVocabulary={categoryVocabulary}
            view={view}
            month={month}
            entries={entries}
            eventsHidden={canViewEvents && eventsHidden}
            eventsError={eventsError}
            owners={owners}
            programs={programs}
            canManage={canManage}
            filterQuery={filterParams.toString()}
            sort={sort}
            dir={dir}
            typeFilter={typeFilter}
            categoryFilter={categoryFilter}
            priorityFilter={priorityFilter}
            programFilter={programFilter}
            ownerFilter={ownerFilter}
            visibilityFilter={visibilityFilter}
            statusFilter={statusFilter}
            decisionFilter={decisionFilter}
            contentStatusFilter={contentStatusFilter}
          />
        </div>
      )}
    </>
  );
}
