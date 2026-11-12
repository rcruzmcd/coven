import { parsePage, parsePerPage } from "@/lib/pagination";

export const TABLE_VALUES = [
  "donations",
  "inventory_items",
  "inventory_movements",
  "events",
  "event_expenses",
  "user_roles",
  "app_settings",
  "calendar_items",
  "content_opportunities",
  "services",
  "assets",
  "access_grants",
  "people",
] as const;

export const ACTION_VALUES = ["insert", "update", "delete"] as const;

/**
 * What a social post entry was related to (#1797). Any value but "all" also
 * narrows the log to social posts, the only table whose rows carry the links.
 */
export const RELATED_VALUES = [
  "event",
  "calendar_item",
  "program",
  "none",
] as const;

export const SORTABLE_COLUMNS = [
  "occurred_at",
  "table_name",
  "action",
] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export type TableFilter = (typeof TABLE_VALUES)[number] | "all";
export type ActionFilter = (typeof ACTION_VALUES)[number] | "all";
export type RelatedFilter = (typeof RELATED_VALUES)[number] | "all";

export type AuditLogParams = {
  sort: SortColumn;
  dir: "asc" | "desc";
  table: TableFilter;
  action: ActionFilter;
  related: RelatedFilter;
  actor: string;
  from: string;
  to: string;
  page: number;
  perPage: number;
};

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

export function parseAuditLogParams(
  searchParams: Record<string, string | string[] | undefined>,
): AuditLogParams {
  const raw = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "occurred_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const tableRaw = raw("table");
  const table: TableFilter = TABLE_VALUES.includes(
    tableRaw as (typeof TABLE_VALUES)[number],
  )
    ? (tableRaw as (typeof TABLE_VALUES)[number])
    : "all";

  const actionRaw = raw("action");
  const action: ActionFilter = ACTION_VALUES.includes(
    actionRaw as (typeof ACTION_VALUES)[number],
  )
    ? (actionRaw as (typeof ACTION_VALUES)[number])
    : "all";

  const relatedRaw = raw("related");
  const related: RelatedFilter = RELATED_VALUES.includes(
    relatedRaw as (typeof RELATED_VALUES)[number],
  )
    ? (relatedRaw as (typeof RELATED_VALUES)[number])
    : "all";

  const actor = raw("actor") || "all";
  const from = raw("from") || "";
  const to = raw("to") || "";
  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  return { sort, dir, table, action, related, actor, from, to, page, perPage };
}
