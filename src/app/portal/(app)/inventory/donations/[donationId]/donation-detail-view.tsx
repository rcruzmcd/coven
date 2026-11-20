import type { ReactNode } from "react";
import {
  SOURCE_TYPES,
  donorLabel,
  labelFor,
  type DonationRow,
  type EventOption,
} from "../donation-shared";
import { EditDonationSheet } from "./edit-donation-sheet";
import { DonationItemsSummary } from "./donation-items-summary";
import { DonationItemsTable } from "./donation-items-table";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";

/** One fact in the header's line of donation details. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="app-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

/**
 * A donation and what came in it (#1898). The details are a compact header
 * rather than a card of their own, so the items get the page's full width:
 * a summary strip, then one table row per item.
 */
export function DonationDetailView({
  donation,
  events,
}: {
  donation: DonationRow;
  events: EventOption[];
}) {
  const items = donation.inventory_items;

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {donorLabel(donation)}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <dl
          aria-label="Donation details"
          className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"
        >
          <Detail label="Donor source">
            {labelFor(SOURCE_TYPES, donation.donor?.source_type ?? null) || "—"}
          </Detail>
          <Detail label="Source event">{donation.event?.name ?? "—"}</Detail>
          <Detail label="Received">
            {formatCalendarDate(donation.donated_at)}
          </Detail>
        </dl>
        {donation.notes && (
          <p className="mt-2 max-w-3xl text-sm whitespace-pre-line">
            <span className="app-muted">Notes </span>
            {donation.notes}
          </p>
        )}
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <EditDonationSheet donation={donation} events={events} />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {items.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                className="py-4"
                title="No items recorded for this donation"
                description="Open Edit donation to add the items that came with it."
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <DonationItemsSummary items={items} />
            <DonationItemsTable items={items} />
          </>
        )}
      </div>
    </>
  );
}
