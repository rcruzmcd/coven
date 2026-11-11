import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarCategory, CalendarItemRow } from "./calendar-shared";
import type { CalendarEventRow } from "./calendar-entries";
import {
  findMissingCoverageSeries,
  type MissingCoverageSeries,
} from "./calendar-recurrence";

export const CALENDAR_ITEM_WITH_CONTENT_PIECES_SELECT = `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, source, region, exceptions, is_sensitive_topic, tone_guidance, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, calendar_item_categories(category), calendar_item_programs(program_id), content_opportunities(id, calendar_item_id, event_id, title, content, post_format, collaborator_handles, content_status, skip_reason, internal_notes, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at)`;

/** Columns needed to compute coverage-reminder/generate-next-year gaps -- no content pieces join, this isn't rendered as a full calendar item. */
const SERIES_CANDIDATE_SELECT =
  "id, title, item_type, starts_at, time_zone, summary, priority_tier, priority_rationale, calendar_status, recurrence_rule, source, region, is_sensitive_topic, tone_guidance, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, calendar_item_categories(category), calendar_item_programs(program_id)";

type RawCalendarItemRow = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  recurrence_rule: string | null;
  summary: string | null;
  priority_tier: number;
  priority_rationale: string | null;
  calendar_status: string;
  visibility: string;
  owner_id: string | null;
  decision: string | null;
  decision_note: string | null;
  source: string | null;
  region: string | null;
  exceptions: unknown[];
  is_sensitive_topic: boolean;
  tone_guidance: string | null;
  series_key: string | null;
  recurrence_start_month: number | null;
  recurrence_start_day: number | null;
  recurrence_end_month: number | null;
  recurrence_end_day: number | null;
  recurrence_end_is_month_end: boolean;
  calendar_item_categories: { category: string }[] | null;
  calendar_item_programs: { program_id: string }[] | null;
  content_opportunities: CalendarItemRow["content_pieces"] | null;
};

export function mapCalendarItemRow(row: unknown): CalendarItemRow {
  const r = row as RawCalendarItemRow;
  return {
    id: r.id,
    title: r.title,
    item_type: r.item_type,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    time_zone: r.time_zone,
    recurrence_rule: r.recurrence_rule,
    summary: r.summary,
    priority_tier: r.priority_tier,
    priority_rationale: r.priority_rationale,
    calendar_status: r.calendar_status,
    visibility: r.visibility,
    owner_id: r.owner_id,
    decision: r.decision,
    decision_note: r.decision_note,
    source: r.source,
    region: r.region,
    exceptions: r.exceptions,
    is_sensitive_topic: r.is_sensitive_topic,
    tone_guidance: r.tone_guidance,
    series_key: r.series_key,
    recurrence_start_month: r.recurrence_start_month,
    recurrence_start_day: r.recurrence_start_day,
    recurrence_end_month: r.recurrence_end_month,
    recurrence_end_day: r.recurrence_end_day,
    recurrence_end_is_month_end: r.recurrence_end_is_month_end,
    categories: (r.calendar_item_categories ?? []).map((c) => c.category),
    program_ids: (r.calendar_item_programs ?? []).map((p) => p.program_id),
    content_pieces: r.content_opportunities ?? [],
  };
}

/** One calendar item with its content pieces, for the detail page. */
export async function getCalendarItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<{ item: CalendarItemRow | null; error: boolean }> {
  const { data, error } = await supabase
    .from("calendar_items")
    .select(CALENDAR_ITEM_WITH_CONTENT_PIECES_SELECT)
    // The pieces are a list now, so they need an order of their own; oldest
    // first keeps a row where the person who added it last saw it. `id` breaks
    // the tie because `created_at` defaults to now(), which is transaction
    // time: several pieces inserted in one statement share it exactly, and
    // without a tie-break they shuffle between renders.
    .order("created_at", {
      referencedTable: "content_opportunities",
      ascending: true,
    })
    .order("id", { referencedTable: "content_opportunities", ascending: true })
    .eq("id", itemId)
    .maybeSingle();

  if (error) return { item: null, error: true };
  return { item: data ? mapCalendarItemRow(data) : null, error: false };
}

/** `public.events` as PostgREST returns it for the calendar, before shaping. */
type RawCalendarEventRow = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  description: string | null;
  location: string | null;
  status: string;
  visibility: string;
  event_programs: { program_id: string }[] | null;
};

/** A calendar_items row shaped for series generation: enough to both detect a coverage gap and act as the copy-from template for the next instance. */
export type SeriesCandidateItem = Pick<
  CalendarItemRow,
  | "id"
  | "title"
  | "item_type"
  | "starts_at"
  | "time_zone"
  | "summary"
  | "priority_tier"
  | "priority_rationale"
  | "calendar_status"
  | "recurrence_rule"
  | "source"
  | "region"
  | "is_sensitive_topic"
  | "tone_guidance"
  | "series_key"
  | "recurrence_start_month"
  | "recurrence_start_day"
  | "recurrence_end_month"
  | "recurrence_end_day"
  | "recurrence_end_is_month_end"
  | "categories"
  | "program_ids"
>;

type RawSeriesCandidateRow = Omit<
  SeriesCandidateItem,
  "categories" | "program_ids"
> & {
  calendar_item_categories: { category: string }[] | null;
  calendar_item_programs: { program_id: string }[] | null;
};

/**
 * Every Tier 1/2, non-archived, structured-recurrence calendar item, for
 * the coverage reminder and the "generate missing instances" action.
 */
export async function listSeriesCandidates(
  supabase: SupabaseClient,
): Promise<SeriesCandidateItem[]> {
  const { data: rows } = await supabase
    .from("calendar_items")
    .select(SERIES_CANDIDATE_SELECT)
    .not("series_key", "is", null)
    .in("priority_tier", [1, 2])
    .neq("calendar_status", "archived");

  return ((rows ?? []) as unknown as RawSeriesCandidateRow[]).map((r) => ({
    ...r,
    categories: (r.calendar_item_categories ?? []).map((c) => c.category),
    program_ids: (r.calendar_item_programs ?? []).map((p) => p.program_id),
  }));
}

/** Series with no instance dated in `targetYear`, each with its most-recent instance as the generation template. */
export async function getMissingCoverageSeriesForYear(
  supabase: SupabaseClient,
  targetYear: number,
): Promise<MissingCoverageSeries<SeriesCandidateItem>[]> {
  const candidates = await listSeriesCandidates(supabase);
  return findMissingCoverageSeries(candidates, targetYear);
}

/**
 * Portal events for the calendar views (#530).
 *
 * Read-only, and deliberately wider than the public Community Calendar's union
 * (which shows published/public events only): this is an internal planning
 * surface, so drafts and private events count -- they are exactly what staff
 * need to see alongside content moments. Archived events are left out the same
 * way archived calendar items are.
 *
 * Authorization is the `events` resource, not `content_calendar`: the select
 * runs under the caller's own RLS (`events select` -> `has_permission('events',
 * 'view')`), so a content-calendar-only account gets zero rows here rather than
 * a view onto event titles and dates it can't otherwise reach.
 */
export async function listCalendarEvents(
  supabase: SupabaseClient,
  options: {
    programId?: string;
    /**
     * Only events touching this span of instants. Added for the agenda's
     * "Next 30 days" block (#1223), which wants thirty days rather than the
     * whole calendar; the workspace passes nothing and still reads every row.
     */
    window?: { fromInstant: string; toInstant: string };
  } = {},
): Promise<{ events: CalendarEventRow[]; error: boolean }> {
  const programSelect = options.programId
    ? "event_programs!inner(program_id)"
    : "event_programs(program_id)";

  let query = supabase
    .from("events")
    .select(
      `id, name, starts_at, ends_at, timezone, description, location, status, visibility, ${programSelect}`,
    )
    .neq("status", "archived")
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true });

  if (options.programId)
    query = query.eq("event_programs.program_id", options.programId);

  if (options.window) {
    const { fromInstant, toInstant } = options.window;
    // Two cases, not one range on `starts_at`: a multi-day event that began
    // before the window and is still running inside it is upcoming as far as a
    // board reading an agenda is concerned, and filtering on its start alone
    // would drop it.
    query = query.or(
      `and(starts_at.gte.${fromInstant},starts_at.lte.${toInstant}),` +
        `and(starts_at.lt.${fromInstant},ends_at.gte.${fromInstant})`,
    );
  }

  const { data, error } = await query;
  if (error) return { events: [], error: true };

  const rows = (data ?? []) as unknown as RawCalendarEventRow[];
  return {
    events: rows.map((row) => ({
      id: row.id,
      title: row.name,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      time_zone: row.timezone,
      summary: row.description,
      location: row.location,
      status: row.status,
      visibility: row.visibility,
      program_ids: (row.event_programs ?? []).map((p) => p.program_id),
    })),
    error: false,
  };
}

/**
 * The current tenant's active calendar categories, in their order (#834).
 *
 * RLS scopes this to the caller's tenant, so there is no tenant filter here --
 * the same shape every other portal query has. Inactive rows are left out:
 * a deactivated category must stop being offered as a choice, while items
 * already tagged with it keep rendering through `labelFor()`.
 */
export async function listCalendarCategories(
  supabase: SupabaseClient,
): Promise<CalendarCategory[]> {
  const { data, error } = await supabase
    .from("calendar_categories")
    .select("key, label")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[calendar] could not read calendar_categories", error);
    return [];
  }
  return (data ?? []).map((row) => ({ value: row.key, label: row.label }));
}
