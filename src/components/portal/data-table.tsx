"use client";

import {
  Fragment,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { SortHeaderButton } from "@/components/portal/sort-header-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav, RowsPerPageSelect } from "@/components/ui/pagination";
import {
  showBelow,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  widestBreakpoint,
  type HideBelow,
  type StickyHeader,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export type SortValue = string | number | null | undefined;

export type PortalDataTableColumn<T, K extends string = string> = {
  key: K;
  /**
   * Stays a string rather than a ReactNode: it doubles as the sort button's
   * accessible name, and as the whole name of an actions column.
   */
  label: string;
  render: (row: T) => ReactNode;
  /**
   * Present means sortable. One field rather than the `sortable` /
   * `sortValue` pair the ticket sketched, because both of that pair's mixed
   * states are meaningless -- sortable with nothing to sort by, or a
   * comparator that never runs.
   */
  sortValue?: (row: T) => SortValue;
  headClassName?: string;
  /**
   * The header's tooltip, for a label shortened from something longer -- a
   * tenant's question prompt cut to fit (#1512).
   */
  headTitle?: string;
  cellClassName?: string;
  /**
   * Dropping the column below a breakpoint. `Table` supports this on the
   * header and the body cell separately, with a "must match" comment; here
   * they come from one field, so they cannot fall out of step.
   */
  hideBelow?: HideBelow;
  /** Actions columns: named for a screen reader, blank on screen. */
  srOnlyLabel?: boolean;
};

/**
 * The ops portal's table.
 *
 * An audit for #506 found sixty table components, of which eight sorted, a
 * handful paginated and none kept their header on screen. Every page had
 * hand-rolled whichever of those it happened to need. This owns all three,
 * plus the Card/Table shell, so a reader gets the same table everywhere and a
 * page only has to say what its columns are.
 *
 * Filtering deliberately stays upstream: pages filter with their own toolbar
 * state and hand over the rows that survived. That also means this cannot
 * tell "nothing exists yet" from "the filters excluded everything" -- it only
 * renders the second, as `emptyMessage`. The first is a different sentence,
 * usually with a "create one" action attached, and belongs to the page.
 */
export function PortalDataTable<T, K extends string = string>({
  columns,
  rows,
  getRowKey,
  defaultSort,
  emptyMessage,
  stickyHeader = "page",
  stickyFirstColumn,
  shell = "card",
  rowDetail = "auto",
  sort: controlledSort,
  onSortChange,
  page: controlledPage,
  onPageChange,
  pageSize: controlledPageSize,
  onPageSizeChange,
  onRowClick,
  footer,
}: {
  columns: readonly PortalDataTableColumn<T, K>[];
  /** Already filtered. */
  rows: readonly T[];
  getRowKey: (row: T) => string;
  defaultSort?: { key: K; dir: SortDirection };
  emptyMessage: string;
  stickyHeader?: StickyHeader | "none";
  stickyFirstColumn?: boolean;
  /** `bare` for a table inside a sheet, which brings its own surface. */
  shell?: "card" | "bare";
  /**
   * Whether a row carries a disclosure for the columns `hideBelow` drops
   * (#1090). `auto` means every table that hides anything gets one, which is
   * the only reason hiding a column is honest: the value is one tap away at
   * the width that dropped it, and gone from the markup at the width that
   * shows the column itself.
   *
   * `none` is for a table whose row already opens the whole record -- a
   * detail route, a details sheet -- where a second disclosure would be a
   * worse copy of the one the row already has. The column-budget test
   * (`table-column-budget.test.ts`) makes a table that opts out prove it has
   * that surface.
   */
  rowDetail?: "auto" | "none";
  /**
   * Sort, page and page size held by the caller rather than here -- for a
   * page that keeps them in its URL (#1511). Each is controlled only when its
   * `on...Change` is passed; the rest of the portal's tables leave them out
   * and keep the internal state they always had. A controlled page is the
   * caller's to reset when its filters move.
   */
  sort?: { key: K; dir: SortDirection } | null;
  onSortChange?: (next: { key: K; dir: SortDirection }) => void;
  page?: number;
  onPageChange?: (next: number) => void;
  pageSize?: number;
  onPageSizeChange?: (next: number) => void;
  /**
   * Opens the record from anywhere on its row, for a mouse. Not a substitute
   * for a real control: the row still needs a button or link of its own for
   * the keyboard, and a click that lands on any interactive element inside
   * the row is left to that element.
   */
  onRowClick?: (row: T) => void;
  /**
   * A totals row under the body, keyed by column (#1898). Each cell follows
   * its column's `hideBelow`, so a total never sits under the wrong header
   * at a width that dropped a column. The caller computes it over every row,
   * not the page on screen.
   */
  footer?: Partial<Record<K, ReactNode>>;
}) {
  const [internalSort, setInternalSort] = useState<{
    key: K;
    dir: SortDirection;
  } | null>(defaultSort ?? null);
  const sort = onSortChange ? (controlledSort ?? null) : internalSort;
  const [internalPageSize, setInternalPageSize] = useState<number>(
    PAGE_SIZE_OPTIONS[0],
  );
  const pageSize =
    onPageSizeChange && controlledPageSize !== undefined
      ? controlledPageSize
      : internalPageSize;
  const setPageSize = onPageSizeChange ?? setInternalPageSize;

  const sorted = useMemo(() => {
    const sortValue = columns.find(
      (column) => column.key === sort?.key,
    )?.sortValue;
    if (!sort || !sortValue) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    // Copied, never sorted in place: the caller's array is usually its own
    // memoized filter result. Sort has been stable since ES2019, so ties keep
    // the order the server returned them in, which is the meaningful
    // secondary sort -- and they keep it in both directions, because the
    // direction sign is applied to the comparison rather than the result.
    return [...rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      // Blanks last whichever way the column is pointing, matching the
      // `nullsFirst: false` the server-side lists order by. A column that
      // wants them first can return "" instead.
      if (left == null || right == null) {
        return left == null ? (right == null ? 0 : 1) : -1;
      }
      return sign * compareValues(left, right);
    });
  }, [rows, columns, sort]);

  // The page is derived rather than synchronised. A page number only means
  // anything against the row count, sort and page size it was chosen under,
  // so it is stored next to them and falls back to the first page the moment
  // any of those move -- no effect, and no state adjustment during render
  // either.
  //
  // Keyed on the row count and not on the array's identity: pages build their
  // filtered list inline, so a fresh array on every render is the normal
  // case, and keying on identity would snap the reader back to page one on
  // every unrelated keystroke.
  const signature = `${rows.length}|${sort?.key ?? ""}|${sort?.dir ?? ""}|${pageSize}`;
  const [pageState, setPageState] = useState({ page: 1, signature });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(
    onPageChange
      ? Math.max(1, controlledPage ?? 1)
      : pageState.signature === signature
        ? pageState.page
        : 1,
    totalPages,
  );
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Against the smallest option, not the current one: twenty rows fit a
  // twenty-five-row page, and hiding the footer for them would take away the
  // only control that could put the reader back on ten.
  const showFooter = rows.length > PAGE_SIZE_OPTIONS[0];

  // The columns `hideBelow` drops, and the width at which the last of them
  // comes back. Both are derived from the column list rather than passed in:
  // a table that hides a column and forgets to say so is exactly the failure
  // this exists to prevent.
  const hiddenColumns = useMemo(
    () =>
      columns.filter(
        (
          column,
        ): column is PortalDataTableColumn<T, K> & { hideBelow: HideBelow } =>
          column.hideBelow !== undefined,
      ),
    [columns],
  );
  const detailBreakpoint = widestBreakpoint(
    hiddenColumns.map((column) => column.hideBelow),
  );
  const showsDetail = rowDetail === "auto" && detailBreakpoint !== undefined;
  const detailColumnCount = columns.length + (showsDetail ? 1 : 0);

  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  function toggleRow(key: string) {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function handleSort(key: K) {
    const next: { key: K; dir: SortDirection } =
      sort?.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" };
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  }

  function handleRowClick(row: T, event: MouseEvent<HTMLElement>) {
    if (!onRowClick) return;
    const target = event.target as HTMLElement;
    // The row's own controls -- check-in, the row menu, a link -- do their
    // own thing; only a click on the row's plain text opens the record.
    if (
      target.closest(
        "button, a, input, select, textarea, label, [role='menuitem']",
      )
    ) {
      return;
    }
    onRowClick(row);
  }

  const body = (
    <>
      <Table
        stickyHeader={stickyHeader === "none" ? undefined : stickyHeader}
        stickyFirstColumn={stickyFirstColumn}
      >
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                hideBelow={column.hideBelow}
                className={column.headClassName}
                title={column.headTitle}
                // Undefined, not null, for a column that cannot be sorted:
                // that is what keeps `aria-sort` off it entirely.
                sortDirection={
                  column.sortValue
                    ? sort?.key === column.key
                      ? sort.dir
                      : null
                    : undefined
                }
              >
                {column.srOnlyLabel ? (
                  <span className="sr-only">{column.label}</span>
                ) : column.sortValue ? (
                  <SortHeaderButton
                    label={column.label}
                    dir={sort?.key === column.key ? sort.dir : null}
                    onSort={() => handleSort(column.key)}
                  />
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
            {showsDetail && (
              <TableHead
                className={cn("w-0", showBelow(detailBreakpoint))}
                scope="col"
              >
                <span className="sr-only">More columns</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={detailColumnCount}
                className="app-muted text-center"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => {
              const key = getRowKey(row);
              const open = expandedRows.has(key);
              return (
                <Fragment key={key}>
                  <TableRow
                    onClick={
                      onRowClick
                        ? (event) => handleRowClick(row, event)
                        : undefined
                    }
                    className={onRowClick ? "cursor-pointer" : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        hideBelow={column.hideBelow}
                        className={column.cellClassName}
                      >
                        {column.render(row)}
                      </TableCell>
                    ))}
                    {showsDetail && (
                      <TableCell
                        // As narrow as a cell gets: this column is pure
                        // overhead against the three the reader came for,
                        // and every pixel it takes is one the identity
                        // column gives up.
                        className={cn("w-0 px-1", showBelow(detailBreakpoint))}
                      >
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-expanded={open}
                                aria-label={
                                  open
                                    ? "Hide more columns"
                                    : "Show more columns"
                                }
                                onClick={() => toggleRow(key)}
                              />
                            }
                          >
                            <ChevronDown
                              className={cn(
                                "transition-transform motion-reduce:transition-none",
                                open && "rotate-180",
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {open ? "Hide more columns" : "Show more columns"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                  {showsDetail && open && (
                    // `data-row-detail` keeps `stickyFirstColumn` off this
                    // row: its one cell spans the whole row, and pinning it
                    // would park the disclosure at the left edge under a
                    // half-viewport cap.
                    <TableRow
                      data-row-detail=""
                      className={cn("bg-muted/40", showBelow(detailBreakpoint))}
                    >
                      <TableCell
                        colSpan={detailColumnCount}
                        className="px-2 py-3 whitespace-normal"
                      >
                        <dl className="grid gap-2">
                          {hiddenColumns.map((column) => (
                            <div
                              key={column.key}
                              // Each pair leaves with the column it stands
                              // in for, not with the disclosure as a whole:
                              // between `sm` and `lg` some of these columns
                              // are on screen already, and repeating them
                              // below the row would be noise.
                              className={cn(
                                "flex gap-3",
                                showBelow(column.hideBelow),
                              )}
                            >
                              <dt className="app-muted w-28 shrink-0">
                                {column.label}
                              </dt>
                              <dd className="min-w-0 flex-1 break-words">
                                {column.render(row)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
        {footer && rows.length > 0 && (
          <TableFooter>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  hideBelow={column.hideBelow}
                  className={column.cellClassName}
                >
                  {footer[column.key]}
                </TableCell>
              ))}
              {showsDetail && (
                <TableCell className={showBelow(detailBreakpoint)} />
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {showFooter && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <RowsPerPageSelect value={pageSize} onChange={setPageSize} />
          <PaginationNav
            page={page}
            totalPages={totalPages}
            count={rows.length}
            pageSize={pageSize}
            onPageChange={(next) =>
              onPageChange
                ? onPageChange(next)
                : setPageState({ page: next, signature })
            }
          />
        </div>
      )}
    </>
  );

  if (shell === "bare") return body;

  return (
    // Card clips rather than hiding, which is what lets the sticky header
    // below follow the page -- see the note on `Card` itself.
    <Card>
      <CardContent className="px-0">{body}</CardContent>
    </Card>
  );
}

/**
 * The same columns with sorting turned off.
 *
 * For the capped preview an event card shows above its "View all" sheet:
 * there the rows are the first five the server returned, so a sort button
 * would only reorder the handful that happen to be visible and quietly claim
 * to have ordered the list. The sheet gets the sortable copy.
 */
export function withoutSorting<T, K extends string>(
  columns: readonly PortalDataTableColumn<T, K>[],
): PortalDataTableColumn<T, K>[] {
  return columns.map((column) => ({ ...column, sortValue: undefined }));
}

type SortDirection = "asc" | "desc";

/**
 * `numeric` so "Item 2" comes before "Item 10", which the default collation
 * does not do, and `base` so case and accents don't split values that read as
 * equal.
 */
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareValues(a: NonNullable<SortValue>, b: NonNullable<SortValue>) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}
