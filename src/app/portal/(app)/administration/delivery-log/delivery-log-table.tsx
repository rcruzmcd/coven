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
import { formatDateTime, personDisplayName } from "@/lib/format";
import {
  deliveryProviderEventLabel,
  deliverySkipReasonLabel,
  formatDeliveryAge,
  isDeliveryStuck,
} from "@/lib/notifications/delivery-record";
import { DeliveryStatusBadge } from "./delivery-log-badges";
import {
  DeliveryLogDetailSheet,
  type DeliveryLogRow,
} from "./delivery-log-detail-sheet";
import {
  anonymousRecipientLabel,
  deliveryKindLabel,
} from "./delivery-log-labels";
import { entryAddress, type DeliveryLogEntry } from "./delivery-log-query";
import type { SortColumn } from "./delivery-log-params";

const COLUMNS: { key: SortColumn; label: string; hideBelow?: HideBelow }[] = [
  { key: "created_at", label: "When" },
  { key: "kind", label: "Kind", hideBelow: "md" },
  { key: "status", label: "Status" },
];

/**
 * One ledger row as the sheet and the table both need it.
 *
 * Built once, on the server, because the labels come from registries behind
 * `server-only` imports and the stuck-row age must be computed where the
 * markup is rendered rather than where it is hydrated.
 */
function toRow(entry: DeliveryLogEntry, now: Date): DeliveryLogRow {
  const stuck = isDeliveryStuck(entry.status, entry.created_at, now);
  return {
    id: entry.id,
    kindLabel: deliveryKindLabel(entry.kind),
    // A directory name when there is one, the kind's own description of its
    // audience when there is not. Never blank: a blank cell reads as a bug,
    // and the row is not a bug -- the ops report and the two receipts for
    // people outside the directory are all sent with a null person_id by
    // design (20260907120000).
    recipientLabel: entry.person
      ? personDisplayName(entry.person, anonymousRecipientLabel(entry.kind))
      : anonymousRecipientLabel(entry.kind),
    address: entryAddress(entry),
    status: entry.status,
    stuck,
    age: stuck ? formatDeliveryAge(entry.created_at, now) : null,
    skipReasonLabel: deliverySkipReasonLabel(entry.skip_reason),
    createdAtLabel: formatDateTime(entry.created_at),
    sentAtLabel: entry.sent_at ? formatDateTime(entry.sent_at) : null,
    providerMessageId: entry.provider_message_id,
    providerEventLabel: deliveryProviderEventLabel(entry.provider_event),
    providerEventDetail: entry.provider_event_detail,
    providerEventAtLabel: entry.provider_event_at
      ? formatDateTime(entry.provider_event_at)
      : null,
    error: entry.error,
    dedupeKey: entry.dedupe_key,
  };
}

export function DeliveryLogTable({
  entries,
  error,
  sort,
  dir,
  sortHref,
  page,
  totalPages,
  count,
  perPage,
  pageHref,
  perPageHref,
}: {
  entries: DeliveryLogEntry[] | null;
  error: unknown;
  sort: SortColumn;
  dir: "asc" | "desc";
  sortHref: (column: SortColumn) => string;
  page: number;
  totalPages: number;
  perPage: number;
  count: number | null;
  pageHref: (nextPage: number) => string;
  perPageHref: (nextPerPage: number) => string;
}) {
  const now = new Date();

  return (
    <>
      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load the delivery log. Please try again.
            </p>
          ) : !entries || entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">
              No deliveries match these filters.
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
                  <TableHead hideBelow="sm">Recipient</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const row = toRow(entry, now);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{row.createdAtLabel}</TableCell>
                      <TableCell hideBelow="md">{row.kindLabel}</TableCell>
                      <TableCell>
                        <DeliveryStatusBadge
                          status={row.status}
                          stuck={row.stuck}
                        />
                      </TableCell>
                      <TableCell hideBelow="sm">
                        {row.recipientLabel}
                        {row.address ? (
                          <div className="app-muted text-xs">{row.address}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeliveryLogDetailSheet row={row} />
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
