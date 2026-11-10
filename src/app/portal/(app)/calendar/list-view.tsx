"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkActionsToolbar } from "./bulk-actions-toolbar";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  EventEntryBadge,
  EventStatusBadge,
  NeedsDecisionFlag,
  PastUndecidedFlag,
} from "./calendar-badges";
import {
  isPastUndecided,
  needsDecision,
  ownerName,
  type CalendarOwner,
} from "./calendar-shared";
import { ContentPiecesBadge } from "@/components/portal/social-content/content-status-badge";
import type { CalendarEntry } from "./calendar-entries";
import { formatDateTime } from "@/lib/format";

export type ListSortColumn = "title" | "starts_at" | "calendar_status";

const SORT_COLUMNS: { key: ListSortColumn; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "starts_at", label: "Starts" },
  { key: "calendar_status", label: "Status" },
];

export function ListView({
  entries,
  owners,
  canManage,
  sort,
  dir,
  sortHref,
}: {
  entries: CalendarEntry[];
  owners: CalendarOwner[];
  canManage: boolean;
  sort: ListSortColumn;
  dir: "asc" | "desc";
  sortHref: (column: ListSortColumn) => string;
}) {
  function SortIcon({ column }: { column: ListSortColumn }) {
    if (sort !== column)
      return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    return dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Only calendar items are selectable: every bulk action writes to
  // `calendar_items`, and an event row has no such row to write (#530).
  const selectableIds = entries
    .filter((entry) => entry.kind === "calendar_item")
    .map((entry) => entry.id);

  // Stale ids can linger in `selectedIds` after a filter/sort narrows `entries`
  // (e.g. a selected row scrolls out of the current filters); intersect with
  // the currently visible rows here rather than syncing state in an effect.
  const visibleSelectedIds = selectableIds.filter((id) => selectedIds.has(id));
  const allSelected =
    selectableIds.length > 0 &&
    visibleSelectedIds.length === selectableIds.length;
  const someSelected = visibleSelectedIds.length > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card className="mt-6">
      <CardContent className="px-0">
        {canManage && visibleSelectedIds.length > 0 && (
          <BulkActionsToolbar
            selectedIds={visibleSelectedIds}
            onDone={() => setSelectedIds(new Set())}
          />
        )}
        {entries.length === 0 ? (
          <p className="app-muted px-4 py-6 text-sm">
            No calendar items match these filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-px">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) => toggleAll(checked)}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                {SORT_COLUMNS.map((column) => (
                  <TableHead key={column.key}>
                    <Link
                      href={sortHref(column.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.label}
                      <SortIcon column={column.key} />
                    </Link>
                  </TableHead>
                ))}
                <TableHead hideBelow="md">Visibility</TableHead>
                <TableHead hideBelow="sm">Owner</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  {canManage && (
                    <TableCell className="w-px">
                      {entry.kind === "calendar_item" && (
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={(checked) =>
                            toggleRow(entry.id, checked)
                          }
                          aria-label={`Select ${entry.title}`}
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="max-w-xs font-medium">
                    <div className="flex flex-col gap-1">
                      <span className="block truncate" title={entry.title}>
                        {entry.title}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {entry.kind === "event" ? (
                          <EventEntryBadge />
                        ) : (
                          <>
                            <ContentPiecesBadge
                              pieces={entry.item.content_pieces}
                            />
                            {needsDecision(entry.item) && <NeedsDecisionFlag />}
                            {isPastUndecided(entry.item) && (
                              <PastUndecidedFlag />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(entry.starts_at)}</TableCell>
                  <TableCell>
                    {entry.kind === "event" ? (
                      <EventStatusBadge status={entry.event.status} />
                    ) : (
                      <CalendarStatusBadge
                        status={entry.item.calendar_status}
                      />
                    )}
                  </TableCell>
                  <TableCell hideBelow="md">
                    <CalendarVisibilityBadge
                      visibility={
                        entry.kind === "event"
                          ? entry.event.visibility
                          : entry.item.visibility
                      }
                    />
                  </TableCell>
                  <TableCell hideBelow="sm" className="app-muted">
                    {entry.kind === "event"
                      ? "—"
                      : ownerName(owners, entry.item.owner_id)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link
                            href={entry.href}
                            aria-label={`View ${entry.title}`}
                            // Keeps the mobile shell's icon tap target (globals.css).
                            data-size="icon-sm"
                            className={buttonVariants({
                              variant: "ghost",
                              size: "icon-sm",
                            })}
                          />
                        }
                      >
                        <Eye />
                      </TooltipTrigger>
                      <TooltipContent>{`View ${entry.title}`}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
