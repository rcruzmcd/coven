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
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import { ActionBadge, TABLE_LABELS } from "./audit-log-badges";
import {
  AuditLogDetailSheet,
  type AuditLogRow,
} from "./audit-log-detail-sheet";
import type { AuditLogEntry } from "./audit-log-query";
import type { RelatedRecord } from "./audit-log-related";
import { RelatedChips } from "../../social/related-chips";
import type { SortColumn } from "./audit-log-params";
import { formatDateTime } from "@/lib/format";

const COLUMNS: { key: SortColumn; label: string; hideBelow?: HideBelow }[] = [
  { key: "occurred_at", label: "Occurred at" },
  { key: "table_name", label: "Table", hideBelow: "md" },
  { key: "action", label: "Action" },
];

export function AuditLogTable({
  entries,
  error,
  sort,
  dir,
  sortHref,
  actorEmailById,
  relatedByEntryId,
  page,
  totalPages,
  count,
  perPage,
  pageHref,
  perPageHref,
}: {
  entries: AuditLogEntry[] | null;
  error: unknown;
  sort: SortColumn;
  dir: "asc" | "desc";
  sortHref: (column: SortColumn) => string;
  actorEmailById: Map<string, string>;
  /** Social post entries' event and calendar item (#1797). */
  relatedByEntryId: Map<string, RelatedRecord>;
  page: number;
  totalPages: number;
  perPage: number;
  count: number | null;
  pageHref: (nextPage: number) => string;
  perPageHref: (nextPerPage: number) => string;
}) {
  return (
    <>
      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load the audit log. Please try again.
            </p>
          ) : !entries || entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">
              No entries match these filters.
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
                  <TableHead hideBelow="lg">Record</TableHead>
                  <TableHead hideBelow="sm">Actor</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const related = relatedByEntryId.get(entry.id);
                  const relatedChips = related ? (
                    <RelatedChips piece={related} showStandalone />
                  ) : null;
                  const auditRow: AuditLogRow = {
                    id: entry.id,
                    table_name: entry.table_name,
                    record_id: entry.record_id,
                    action: entry.action,
                    occurred_at: entry.occurred_at,
                    actor_label: entry.actor_id
                      ? (actorEmailById.get(entry.actor_id) ?? entry.actor_id)
                      : "System",
                    old_data: entry.old_data,
                    new_data: entry.new_data,
                    redacted_at: entry.redacted_at,
                    related: relatedChips,
                  };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.occurred_at)}</TableCell>
                      <TableCell hideBelow="md">
                        {TABLE_LABELS[entry.table_name] ?? entry.table_name}
                        {relatedChips ? (
                          <div className="mt-1">{relatedChips}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={entry.action} />
                      </TableCell>
                      <TableCell hideBelow="lg" className="font-mono text-xs">
                        {entry.record_id.slice(0, 8)}
                      </TableCell>
                      <TableCell hideBelow="sm" className="app-muted">
                        {auditRow.actor_label}
                      </TableCell>
                      <TableCell className="text-right">
                        <AuditLogDetailSheet row={auditRow} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {entries && entries.length > 0 && (
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
