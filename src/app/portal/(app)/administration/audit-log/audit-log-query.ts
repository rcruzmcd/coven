import { pageRange } from "@/lib/pagination";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuditLogParams } from "./audit-log-params";

export type AuditLogEntry = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  actor_id: string | null;
  occurred_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  /** Set once the retention job cleared the personal values inside the snapshots (#720). */
  redacted_at: string | null;
};

export async function fetchAuditLogEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: AuditLogParams,
) {
  let query = supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, actor_id, occurred_at, old_data, new_data, redacted_at",
      { count: "exact" },
    )
    .order(filters.sort, { ascending: filters.dir === "asc" })
    .order("id", { ascending: true });

  if (filters.table !== "all") query = query.eq("table_name", filters.table);
  if (filters.action !== "all") query = query.eq("action", filters.action);
  // A link counts if either side of the change holds it, so linking and
  // unlinking both show under the event or item. Standalone means neither
  // side does; `->>` on a missing snapshot is null, so inserts and deletes
  // qualify (#1797).
  if (filters.related !== "all") {
    query = query.eq("table_name", "content_opportunities");
    if (filters.related === "none") {
      query = query
        .is("old_data->>event_id", null)
        .is("new_data->>event_id", null)
        .is("old_data->>calendar_item_id", null)
        .is("new_data->>calendar_item_id", null);
    } else {
      const key = filters.related === "event" ? "event_id" : "calendar_item_id";
      query = query.or(
        `old_data->>${key}.not.is.null,new_data->>${key}.not.is.null`,
      );
    }
  }
  if (filters.actor !== "all") query = query.eq("actor_id", filters.actor);
  if (filters.from)
    query = query.gte("occurred_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to)
    query = query.lte("occurred_at", `${filters.to}T23:59:59.999Z`);

  const { offset, to } = pageRange(filters.page, filters.perPage);
  const { data: entries, error, count } = await query.range(offset, to);

  return { entries: entries as AuditLogEntry[] | null, error, count };
}
