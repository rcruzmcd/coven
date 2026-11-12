import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentPieceRow } from "./pieces";
import {
  EVENT_PLAN_TEMPLATE_SETTING_KEY,
  parseEventPlanTemplate,
  type EventPlanTemplateEntry,
} from "./event-plan";
import type { SocialFilters } from "./social-filters";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";

/**
 * A social post with the names of what it is related to, for `/portal/social`
 * (#1794). `event`/`calendar_item`/`program` are null when there is no link,
 * and also when there is one this reader cannot see (an event, for someone
 * without events access) -- `event_id` still says a link exists.
 */
export type SocialPieceRow = ContentPieceRow & {
  event: { id: string; name: string; starts_at: string } | null;
  program: { id: string; name: string } | null;
  calendar_item: { id: string; title: string; starts_at: string } | null;
};

export const PIECE_COLUMNS =
  "id, calendar_item_id, event_id, program_id, title, content, post_format, collaborator_handles, content_status, skip_reason, internal_notes, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at";

// Named by constraint: the FKs are composite (tenant_id, ...) and `tenant_id`
// alone also points at `tenants`, so an unnamed embed would be ambiguous.
const SOCIAL_PIECE_SELECT = `${PIECE_COLUMNS}, event:events!content_opportunities_event_id_fkey(id, name, starts_at), calendar_item:calendar_items!content_opportunities_calendar_item_id_fkey(id, title, starts_at), program:programs!content_opportunities_program_id_fkey(id, name)`;

/**
 * Every post the filters match, scheduled ones by publish date and the
 * unscheduled after them. The month is not a filter here: the month view
 * places what falls in its month and the tray takes the undated ones, both
 * from this one read.
 */
export async function listSocialPieces(
  supabase: SupabaseClient,
  filters: SocialFilters,
): Promise<{ pieces: SocialPieceRow[]; error: boolean }> {
  // fetchAllPages ends quietly on an error with the rows so far; a calendar
  // missing posts for no stated reason reads as an empty schedule, so the
  // failure is caught here and said out loud.
  let failed = false;
  const pieces = await fetchAllPages(async (from, to) => {
    let query = supabase
      .from("content_opportunities")
      .select(SOCIAL_PIECE_SELECT)
      .order("publish_due_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (filters.status !== "all")
      query = query.eq("content_status", filters.status);
    if (filters.owner === "none") query = query.is("owner_id", null);
    else if (filters.owner !== "all")
      query = query.eq("owner_id", filters.owner);
    if (filters.reviewer === "none") query = query.is("reviewer_id", null);
    else if (filters.reviewer !== "all")
      query = query.eq("reviewer_id", filters.reviewer);

    if (filters.event !== "all") query = query.eq("event_id", filters.event);
    else if (filters.program !== "all")
      query = query.eq("program_id", filters.program);
    else if (filters.linkedTo === "event")
      query = query.not("event_id", "is", null);
    else if (filters.linkedTo === "community_date")
      query = query.not("calendar_item_id", "is", null);
    else if (filters.linkedTo === "program")
      query = query.not("program_id", "is", null);
    else if (filters.linkedTo === "standalone")
      query = query
        .is("event_id", null)
        .is("calendar_item_id", null)
        .is("program_id", null);

    const result = await query;
    if (result.error) failed = true;
    return result;
  });
  if (failed) return { pieces: [], error: true };
  return { pieces: pieces as unknown as SocialPieceRow[], error: false };
}

/** One post for its detail page; `null` when it does not exist or is not readable. */
export async function getSocialPiece(
  supabase: SupabaseClient,
  id: string,
): Promise<{ piece: SocialPieceRow | null; error: boolean }> {
  const { data, error } = await supabase
    .from("content_opportunities")
    .select(SOCIAL_PIECE_SELECT)
    .eq("id", id)
    .maybeSingle();
  // An id that is not a uuid is a 22P02 cast error, not a failure to load.
  if (error && error.code !== "22P02") return { piece: null, error: true };
  return { piece: (data as unknown as SocialPieceRow) ?? null, error: false };
}

/**
 * The posts related to one event, for its Social content section (#1795):
 * scheduled ones by publish date, then the unscheduled. An error is said out
 * loud for the same reason as `listSocialPieces`.
 */
export async function listEventPieces(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ pieces: ContentPieceRow[]; error: boolean }> {
  // Paged past the response cap, so the undated posts sorted last and any
  // overdue ones still reach the section and its badge.
  let failed = false;
  const pieces = await fetchAllPages(async (from, to) => {
    const result = await supabase
      .from("content_opportunities")
      .select(PIECE_COLUMNS)
      .eq("event_id", eventId)
      .order("publish_due_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (result.error) failed = true;
    return result;
  });
  if (failed) return { pieces: [], error: true };
  return { pieces: pieces as ContentPieceRow[], error: false };
}

/** The tenant's default lead time for a new post, in days. */
export async function getDefaultLeadTimeDays(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "content.default_lead_time_days")
    .maybeSingle();
  return typeof data?.value === "number" ? data.value : 21;
}

/**
 * The tenant's starter post plan for an event (#1798), or the defaults when
 * the setting is missing or unreadable.
 */
export async function getEventPlanTemplate(
  supabase: SupabaseClient,
): Promise<EventPlanTemplateEntry[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", EVENT_PLAN_TEMPLATE_SETTING_KEY)
    .maybeSingle();
  return parseEventPlanTemplate(data?.value);
}
