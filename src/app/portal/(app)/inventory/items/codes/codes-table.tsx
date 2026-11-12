"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Nfc, Printer } from "lucide-react";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CODES_PATH,
  codeKindLabel,
  codeStateLabel,
  formatCount,
  retireReasonLabel,
  type CodeTarget,
} from "@/lib/inventory-codes";
import { MAX_LABEL_ITEMS } from "@/lib/inventory-labels";
import { itemHref } from "../inventory-shared";
import { setNfcWrittenAction } from "./actions";
import {
  CodeActions,
  RetireCodesDialog,
  isLabelCode,
  isRetirable,
} from "./code-actions";

export type CodeRow = {
  id: string;
  kind: string;
  /** numbered, asset_tag (on an item), blank or nfc. */
  codeKind: string;
  /** free, blank, on_item or retired. */
  state: string;
  value: string;
  number: number | null;
  itemId: string | null;
  itemDescription: string | null;
  itemSize: string | null;
  lastPrintedAt: string | null;
  printCount: number;
  nfcWrittenAt: string | null;
  retiredAt: string | null;
  retiredReason: string | null;
  retiredNote: string | null;
};

const DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

function StateBadge({ row }: { row: CodeRow }) {
  if (row.state === "retired") {
    return (
      <Badge variant="destructive" title={row.retiredNote ?? undefined}>
        Retired · {retireReasonLabel(row.retiredReason)}
      </Badge>
    );
  }
  return (
    <Badge variant={row.state === "on_item" ? "outline" : "secondary"}>
      {codeStateLabel(row.state)}
    </Badge>
  );
}

/**
 * The Codes page's list (#1450), one page of it: the server filters and
 * pages, and this adds the selection. Rows are chosen on this page, or every
 * code the filters match is chosen at once -- "all matching" is sent as the
 * filter, not as ids, and re-read on the server.
 *
 * Kind, item and the two tracking columns drop below `md`/`lg`; a phone keeps
 * the code, its state and the actions. The row's History sheet has the rest.
 */
export function CodesTable({
  rows,
  total,
  filterQuery,
  filtered,
  canManage,
  numberedOnly = false,
}: {
  rows: CodeRow[];
  total: number;
  /** The list's filters as a query string, for "all matching". */
  filterQuery: string;
  filtered: boolean;
  canManage: boolean;
  /** Numbered codes only (#1543): no blank labels to point at. */
  numberedOnly?: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Ids from another page or filter can linger in the set; only the rows on
  // screen count, intersected here rather than synced in an effect.
  const visibleSelected = rows.filter((row) => selectedIds.has(row.id));
  const allVisible = rows.length > 0 && visibleSelected.length === rows.length;
  const selectedCount = allMatching ? total : visibleSelected.length;
  const target: CodeTarget = allMatching
    ? { filter: filterQuery }
    : { ids: visibleSelected.map((row) => row.id) };

  function clear() {
    setSelectedIds(new Set());
    setAllMatching(false);
  }

  function toggleAll(checked: boolean) {
    setAllMatching(false);
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setAllMatching(false);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function markWritten() {
    startTransition(async () => {
      await runAction(() => setNfcWrittenAction(target), {
        success: (result) =>
          `${formatCount(result.updated, "code")} marked as written to NFC.`,
        onSuccess: () => {
          clear();
          router.refresh();
        },
      });
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          {filtered ? (
            <EmptyState
              title="No codes match your filters"
              description="Clear or loosen the filters to see more."
            />
          ) : (
            <EmptyState
              title="No codes yet"
              description={
                numberedOnly
                  ? "Create numbered codes above, then assign them to items from each item's page."
                  : "Create numbered codes above, give items their codes from the items list, or print blank labels from Donations."
              }
            />
          )}
        </CardContent>
      </Card>
    );
  }

  const printHref = allMatching
    ? `${CODES_PATH}?${filterQuery ? `${filterQuery}&` : ""}print=filter`
    : `${CODES_PATH}?print=${visibleSelected
        .filter(isLabelCode)
        .map((row) => row.id)
        .join(",")}`;
  const printable = allMatching || visibleSelected.some(isLabelCode);
  const retirable = allMatching || visibleSelected.some(isRetirable);

  return (
    <Card>
      <CardContent className="px-0">
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium" role="status">
              {allMatching
                ? `All ${formatCount(total, "matching code")} selected`
                : `${visibleSelected.length} selected`}
            </span>
            {!allMatching && allVisible && total > rows.length && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setAllMatching(true)}
              >
                Select all {formatCount(total, "matching code")}
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {printable && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href={printHref} />}
                >
                  <Printer /> Print labels
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={markWritten}
              >
                {isPending ? <Spinner /> : <Nfc />} Mark written to NFC
              </Button>
              {canManage && retirable && (
                <RetireCodesDialog
                  target={target}
                  count={selectedCount}
                  onDone={clear}
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      <Ban /> Retire
                    </Button>
                  }
                />
              )}
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                Clear selection
              </Button>
            </div>
            {allMatching && total > MAX_LABEL_ITEMS && (
              <p className="app-muted basis-full text-xs">
                Actions on all matching codes take up to {MAX_LABEL_ITEMS} at a
                time. Narrow the filters for the rest.
              </p>
            )}
          </div>
        )}
        <Table stickyHeader="page">
          <TableHeader>
            <TableRow>
              <TableHead className="w-px">
                <Checkbox
                  checked={allVisible}
                  indeterminate={visibleSelected.length > 0 && !allVisible}
                  onCheckedChange={(checked) => toggleAll(checked)}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead>Code</TableHead>
              <TableHead hideBelow="md">Kind</TableHead>
              <TableHead>State</TableHead>
              <TableHead hideBelow="lg">On</TableHead>
              <TableHead hideBelow="lg">Last printed</TableHead>
              <TableHead hideBelow="lg">NFC written</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="w-px">
                  <Checkbox
                    checked={allMatching || selectedIds.has(row.id)}
                    onCheckedChange={(checked) => toggleRow(row.id, checked)}
                    aria-label={`Select ${row.value}`}
                  />
                </TableCell>
                <TableCell className="font-mono font-semibold tracking-wider whitespace-nowrap">
                  {row.value}
                </TableCell>
                <TableCell hideBelow="md">
                  {codeKindLabel(row.codeKind)}
                </TableCell>
                <TableCell>
                  <StateBadge row={row} />
                </TableCell>
                <TableCell
                  hideBelow="lg"
                  className="max-w-xs whitespace-normal"
                >
                  {row.itemId ? (
                    <Link
                      href={itemHref(row.itemId)}
                      className="line-clamp-2 underline-offset-2 hover:underline"
                      title={row.itemDescription ?? undefined}
                    >
                      {row.itemSize
                        ? `${row.itemDescription} (${row.itemSize})`
                        : row.itemDescription}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell hideBelow="lg">
                  {row.lastPrintedAt ? (
                    <span
                      title={`Printed ${formatCount(row.printCount, "time")}`}
                    >
                      <ViewerTime
                        iso={row.lastPrintedAt}
                        fallbackZone="UTC"
                        options={DATE}
                      />
                    </span>
                  ) : row.kind === "nfc" ? (
                    "—"
                  ) : (
                    <span className="app-muted">Never</span>
                  )}
                </TableCell>
                <TableCell hideBelow="lg">
                  {row.nfcWrittenAt ? (
                    <ViewerTime
                      iso={row.nfcWrittenAt}
                      fallbackZone="UTC"
                      options={DATE}
                    />
                  ) : row.kind === "nfc" ? (
                    "—"
                  ) : (
                    <span className="app-muted">No</span>
                  )}
                </TableCell>
                <TableCell className="w-0">
                  <CodeActions row={row} canManage={canManage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
