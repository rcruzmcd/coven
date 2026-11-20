"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { categoryLabelFor } from "@/lib/inventory";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { StatusBadge, itemHref } from "../../items/inventory-shared";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  faceValueOf,
  formatFaceValue,
  labelFor,
  summarizeItems,
  type DonationItemRow,
} from "../donation-shared";
import { FaceValueTotal } from "../face-value-total";

/** Past this many items a donation's table gets a search box. */
const SEARCH_THRESHOLD = 5;

/**
 * Item, Size and Face value are what a phone keeps; the rest are one tap
 * away in the row's disclosure, and the whole item on its own page.
 */
const COLUMNS: PortalDataTableColumn<DonationItemRow>[] = [
  {
    key: "description",
    label: "Item",
    sortValue: (item) => item.description,
    // Narrower on a phone, so Size and Face value fit beside it.
    cellClassName: "max-w-32 font-medium sm:max-w-xs",
    render: (item) => (
      <>
        <span className="flex min-w-0 items-center gap-1">
          <Link
            href={itemHref(item.id)}
            className="truncate underline-offset-4 hover:underline"
            title={item.description}
          >
            {item.description}
          </Link>
          {item.notes && <NoteHint notes={item.notes} />}
        </span>
        <span className="app-muted block truncate text-xs font-normal">
          {categoryLabelFor(item)}
        </span>
      </>
    ),
  },
  {
    key: "size",
    label: "Size",
    sortValue: (item) => item.size || null,
    render: (item) => item.size || "—",
  },
  {
    key: "gender",
    label: "Gender",
    hideBelow: "md",
    sortValue: (item) => labelFor(GENDERS, item.gender) || null,
    render: (item) => labelFor(GENDERS, item.gender) || "—",
  },
  {
    key: "condition",
    label: "Condition",
    hideBelow: "sm",
    sortValue: (item) => labelFor(CONDITIONS, item.condition) || null,
    render: (item) => labelFor(CONDITIONS, item.condition) || "—",
  },
  {
    key: "intended_use",
    label: "Intended use",
    hideBelow: "md",
    sortValue: (item) => labelFor(INTENDED_USES, item.intended_use) || null,
    render: (item) => labelFor(INTENDED_USES, item.intended_use) || "—",
  },
  {
    key: "face_value",
    label: "Face value",
    // Numeric: face values arrive from Postgres as strings.
    sortValue: faceValueOf,
    cellClassName: "tabular-nums",
    render: (item) => formatFaceValue(item.face_value),
  },
  {
    key: "status",
    label: "Status",
    hideBelow: "md",
    sortValue: (item) => item.status,
    render: (item) => <StatusBadge status={item.status} />,
  },
];

/** An item's notes, behind an icon rather than in a column of their own. */
function NoteHint({ notes }: { notes: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Notes: ${notes}`}
          />
        }
      >
        <StickyNote className="text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>{notes}</TooltipContent>
    </Tooltip>
  );
}

const GROUPINGS = ["none", "category"] as const;
type Grouping = (typeof GROUPINGS)[number];

function isGrouping(value: string): value is Grouping {
  return (GROUPINGS as readonly string[]).includes(value);
}

/**
 * A donation's items at full width (#1898): one row each, linking to the
 * item's own page, with the face value totalled underneath. Grouped by
 * category (#1899), each category gets a heading row and a subtotal row in
 * the same table, and the choice lives in the URL (`?group=category`) so it survives a reload
 * and a shared link.
 */
export function DonationItemsTable({ items }: { items: DonationItemRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The larger page by default, so a typical donation is one page.
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS.at(-1)!);
  const [grouping, setGrouping] = useUrlTabState<Grouping>({
    param: "group",
    fallback: "none",
    isValid: isGrouping,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.description, categoryLabelFor(item), item.size, item.notes].some(
        (field) => field?.toLowerCase().includes(needle),
      ),
    );
  }, [items, query]);

  const searching = query.trim() !== "";
  const total = summarizeItems(filtered);
  const totalLabel = searching ? "Total (matching items)" : "Total";

  const groups = grouping === "category" ? total.byCategory : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {items.length > SEARCH_THRESHOLD ? (
          <Input
            type="search"
            aria-label="Search items"
            placeholder="Search item, category, size or notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sm:max-w-xs"
          />
        ) : (
          <span />
        )}
        {/* Beside the switch rather than wrapping it: a wrapping label
            re-fires the click on the switch and toggles it straight back. */}
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id="group-by-category"
            checked={grouping === "category"}
            onCheckedChange={(checked) =>
              setGrouping(checked ? "category" : "none")
            }
          />
          <label htmlFor="group-by-category">Group by category</label>
        </div>
      </div>

      <PortalDataTable
        columns={COLUMNS}
        rows={filtered}
        getRowKey={(item) => item.id}
        // The server returns items by id, which is no order a reader knows.
        defaultSort={{ key: "description", dir: "asc" }}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        emptyMessage="No items match your search. Clear or loosen it to see more."
        onRowClick={(item) => router.push(itemHref(item.id))}
        // One table rather than one per category, so the columns line up.
        groupBy={
          groups
            ? {
                groupOf: categoryLabelFor,
                order: groups.map((group) => group.label),
                heading: (label) => {
                  const count = groups.find((g) => g.label === label)!.count;
                  return (
                    <>
                      {label}
                      <span className="app-muted ml-2 font-normal">
                        {count} item{count === 1 ? "" : "s"}
                      </span>
                    </>
                  );
                },
                subtotal: (label) => {
                  const group = groups.find((g) => g.label === label)!;
                  return {
                    description: `${label} subtotal`,
                    face_value: (
                      <FaceValueTotal
                        count={group.count}
                        totalValue={group.value}
                        unvaluedCount={group.unvaluedCount}
                      />
                    ),
                  };
                },
              }
            : undefined
        }
        footer={{
          description: totalLabel,
          face_value: <FaceValueTotal {...total} />,
        }}
      />
    </div>
  );
}
