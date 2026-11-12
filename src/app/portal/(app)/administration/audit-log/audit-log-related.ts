import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialPieceRow } from "@/lib/social-content/queries";
import type { AuditLogEntry } from "./audit-log-query";

/** What a social post entry was related to, in `RelatedChips`' shape. */
export type RelatedRecord = Pick<
  SocialPieceRow,
  | "event_id"
  | "event"
  | "calendar_item_id"
  | "calendar_item"
  | "program_id"
  | "program"
>;

function idAt(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * The event, calendar item and program (#1838) a social post entry names
 * (#1797): the row as
 * it stood after the change, or before it for a delete. Null for any other
 * table, whose rows have no such links to show.
 */
export function pieceLinksOf(
  entry: Pick<AuditLogEntry, "table_name" | "old_data" | "new_data">,
): {
  event_id: string | null;
  calendar_item_id: string | null;
  program_id: string | null;
} | null {
  if (entry.table_name !== "content_opportunities") return null;
  const data = entry.new_data ?? entry.old_data;
  return {
    event_id: idAt(data, "event_id"),
    calendar_item_id: idAt(data, "calendar_item_id"),
    program_id: idAt(data, "program_id"),
  };
}

/**
 * Names the events, calendar items and programs this page's social post entries are
 * related to, keyed by audit entry id. A parent since deleted, or one the
 * reader cannot see, keeps its id with no record, which `RelatedChips` names
 * generically.
 */
export async function fetchRelatedRecords(
  supabase: SupabaseClient,
  entries: AuditLogEntry[],
): Promise<Map<string, RelatedRecord>> {
  const links = new Map(
    entries.flatMap((entry) => {
      const link = pieceLinksOf(entry);
      return link ? [[entry.id, link] as const] : [];
    }),
  );
  if (links.size === 0) return new Map();

  const eventIds = [
    ...new Set([...links.values()].flatMap((l) => l.event_id ?? [])),
  ];
  const itemIds = [
    ...new Set([...links.values()].flatMap((l) => l.calendar_item_id ?? [])),
  ];

  const programIds = [
    ...new Set([...links.values()].flatMap((l) => l.program_id ?? [])),
  ];

  const [events, items, programs] = await Promise.all([
    eventIds.length
      ? supabase.from("events").select("id, name, starts_at").in("id", eventIds)
      : null,
    itemIds.length
      ? supabase
          .from("calendar_items")
          .select("id, title, starts_at")
          .in("id", itemIds)
      : null,
    programIds.length
      ? supabase.from("programs").select("id, name").in("id", programIds)
      : null,
  ]);
  const eventById = new Map(
    ((events?.data ?? []) as NonNullable<RelatedRecord["event"]>[]).map((e) => [
      e.id,
      e,
    ]),
  );
  const itemById = new Map(
    ((items?.data ?? []) as NonNullable<RelatedRecord["calendar_item"]>[]).map(
      (i) => [i.id, i],
    ),
  );

  const programById = new Map(
    ((programs?.data ?? []) as NonNullable<RelatedRecord["program"]>[]).map(
      (p) => [p.id, p],
    ),
  );

  return new Map(
    [...links].map(([entryId, link]) => [
      entryId,
      {
        event_id: link.event_id,
        event: link.event_id ? (eventById.get(link.event_id) ?? null) : null,
        calendar_item_id: link.calendar_item_id,
        calendar_item: link.calendar_item_id
          ? (itemById.get(link.calendar_item_id) ?? null)
          : null,
        program_id: link.program_id,
        program: link.program_id
          ? (programById.get(link.program_id) ?? null)
          : null,
      },
    ]),
  );
}
