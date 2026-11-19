"use client";

import { Eye } from "lucide-react";
import { IconLink } from "@/components/portal/icon-link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryLabelFor } from "@/lib/inventory";
import {
  donorLabel,
  summarizeItems,
  type DonationRow,
} from "./donation-shared";
import { FaceValueTotal } from "./face-value-total";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { SortHeaderLink } from "@/components/portal/sort-header-link";

/**
 * Only the date sorts.
 *
 * Donor, Items and Source event all read through an embed -- `donor:people`,
 * the to-many `inventory_items`, `event:events` -- and PostgREST cannot order
 * parent rows by an embedded resource's column. Sorting them server-side
 * needs a view that flattens the donor onto the row, the way
 * `inventory_items_with_category` was added so Category could sort. Sorting
 * only what is on the page here would reorder a page rather than the list,
 * which reads as a bug.
 */
export function DonationsTable({
  donations,
  hasActiveFilters,
  dir,
  sortHref,
}: {
  donations: DonationRow[];
  hasActiveFilters: boolean;
  /** Direction of the date sort, which is the only sort there is. */
  dir: "asc" | "desc";
  sortHref: string;
}) {
  if (donations.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          {hasActiveFilters ? (
            <EmptyState
              title="No donations match your filters"
              description="Clear or loosen the filters to see more."
            />
          ) : (
            <EmptyState
              title="No donations recorded yet"
              description="Record the first one with Add donation above."
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table stickyHeader="page">
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>Items</TableHead>
              {/* Below `sm` the phone keeps Donor, Items and Date; the
                  detail page has the value broken down anyway. */}
              <TableHead hideBelow="sm">Face value</TableHead>
              <TableHead hideBelow="md">Source event</TableHead>
              <TableHead sortDirection={dir}>
                <SortHeaderLink
                  href={sortHref}
                  label="Date received"
                  dir={dir}
                />
              </TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donations.map((donation) => {
              const items = donation.inventory_items;
              const summary = summarizeItems(items);
              return (
                <TableRow key={donation.id}>
                  <TableCell>{donorLabel(donation)}</TableCell>
                  <TableCell
                    // Narrower on a phone so Date and the view link stay
                    // on screen; the lines truncate and `title` has it all.
                    className="max-w-28 sm:max-w-xs"
                    title={items.map((item) => item.description).join(", ")}
                  >
                    <ItemsSummaryCell
                      items={items}
                      categories={summary.byCategory}
                    />
                  </TableCell>
                  <TableCell hideBelow="sm">
                    <FaceValueTotal {...summary} />
                  </TableCell>
                  <TableCell hideBelow="md">
                    {donation.event?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {formatCalendarDate(donation.donated_at)}
                  </TableCell>
                  <TableCell>
                    <IconLink
                      href={`/portal/inventory/donations/${donation.id}`}
                      label="View donation"
                    >
                      <Eye />
                    </IconLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Categories named in a multi-category donation's second line. */
const CATEGORIES_SHOWN = 3;

/**
 * Two lines at most, however many items a donation holds (#1897): a twelve-
 * item donation used to list every description and take over the grid. The
 * cell's `title` still carries the full list.
 */
function ItemsSummaryCell({
  items,
  categories,
}: {
  items: DonationRow["inventory_items"];
  categories: ReturnType<typeof summarizeItems>["byCategory"];
}) {
  if (items.length === 0) return <>—</>;
  const [first] = items;
  const extra = items.length - 1;

  if (categories.length === 1) {
    return (
      <>
        <span className="block truncate font-medium">
          {first.description}
          {extra > 0 && (
            <span className="app-muted font-normal"> +{extra} more</span>
          )}
        </span>
        <span className="app-muted block truncate text-xs">
          {categoryLabelFor(first)}
        </span>
      </>
    );
  }

  const shown = categories
    .slice(0, CATEGORIES_SHOWN)
    .map((category) => `${category.count} ${category.label}`);
  const hidden = categories.length - CATEGORIES_SHOWN;
  return (
    <>
      <span className="block truncate font-medium">{items.length} items</span>
      <span className="app-muted block truncate text-xs">
        {shown.join(" · ")}
        {hidden > 0 && ` · +${hidden} more`}
      </span>
    </>
  );
}
