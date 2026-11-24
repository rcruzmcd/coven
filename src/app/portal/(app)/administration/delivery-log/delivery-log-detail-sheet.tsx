"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DeliveryStatusBadge } from "./delivery-log-badges";

/**
 * One delivery, in full (#1310).
 *
 * Every field is handed down already resolved -- labels, formatted times, the
 * stuck age -- rather than computed here. Two reasons: the kind labels are
 * assembled from registries that live behind `server-only` imports, and the
 * age of a stuck row derived from `Date.now()` in the browser would not match
 * the markup this component hydrates.
 */
export type DeliveryLogRow = {
  id: string;
  kindLabel: string;
  recipientLabel: string;
  /** Null when the ledger has no directory record to read an address from. */
  address: string | null;
  status: string;
  stuck: boolean;
  /** "3 hours", for a row that is stuck. */
  age: string | null;
  skipReasonLabel: string | null;
  createdAtLabel: string;
  sentAtLabel: string | null;
  providerMessageId: string | null;
  /** A bounce or spam complaint the provider reported afterwards (#1921). */
  providerEventLabel: string | null;
  providerEventDetail: string | null;
  providerEventAtLabel: string | null;
  error: string | null;
  dedupeKey: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
      <div className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
        {label}
      </div>
      <div className="mt-1 break-words">{children}</div>
    </div>
  );
}

/**
 * What an empty provider id means, which depends entirely on the status
 * beside it.
 *
 * The case worth spelling out is a row that says Sent and carries no id.
 * sendEmail() returns `{ ok: true, id: null }` when RESEND_API_KEY is unset --
 * the no-op path every preview deploy and every developer machine runs on, and
 * the one case where a successful send does not mean a provider accepted
 * anything. An administrator looking for a message that never arrived needs to
 * be told that, not reassured by the word "Sent".
 */
function missingIdExplanation(row: DeliveryLogRow): string {
  if (row.status === "failed") {
    return "None — the provider refused this message.";
  }
  if (row.status === "skipped") return "None — nothing was sent.";
  if (row.status === "sent") {
    return "None recorded. Usually this means no email provider is configured, in which case nothing actually left the building.";
  }
  return "None yet — this send has not finished.";
}

export function DeliveryLogDetailSheet({ row }: { row: DeliveryLogRow }) {
  return (
    <Sheet>
      <Tooltip>
        <SheetTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="View delivery details"
                />
              }
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <TooltipContent>View delivery details</TooltipContent>
      </Tooltip>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {row.kindLabel} ·{" "}
            <DeliveryStatusBadge status={row.status} stuck={row.stuck} />
          </SheetTitle>
          <SheetDescription>
            Claimed {row.createdAtLabel} · to {row.recipientLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {row.status === "failed" && row.error ? (
            <Field label="What the provider said">
              <span className="text-destructive">{row.error}</span>
            </Field>
          ) : null}

          {row.providerEventLabel ? (
            <Field label="After sending">
              <span className="text-destructive">{row.providerEventLabel}</span>
              {row.providerEventAtLabel
                ? ` · ${row.providerEventAtLabel}`
                : null}
              {row.providerEventDetail ? (
                <div className="app-muted mt-0.5 text-xs">
                  {row.providerEventDetail}
                </div>
              ) : null}
            </Field>
          ) : null}

          {row.status === "skipped" ? (
            <Field label="Why nothing was sent">
              {row.skipReasonLabel ??
                "The ledger does not record a reason for this one."}
            </Field>
          ) : null}

          {row.stuck ? (
            <Field label="Stuck">
              This send was claimed {row.age} ago and never finished. A delivery
              is claimed, sent and recorded inside one request, so a row this
              old means the recording failed — the message itself may well have
              gone out.
            </Field>
          ) : null}

          <Field label="Recipient">
            {row.recipientLabel}
            {row.address ? (
              <div className="app-muted mt-0.5 text-xs">{row.address}</div>
            ) : (
              <div className="app-muted mt-0.5 text-xs">
                The delivery ledger keeps no address of its own, so none is
                shown for a send that is not tied to a directory record.
              </div>
            )}
          </Field>

          <Field label="Sent at">{row.sentAtLabel ?? "Never sent"}</Field>

          <Field label="Provider message id">
            {row.providerMessageId ? (
              <span className="font-mono text-xs">{row.providerMessageId}</span>
            ) : (
              <span className="app-muted">{missingIdExplanation(row)}</span>
            )}
          </Field>

          {/* The only link between a delivery and the record it is about: the
              ledger holds no foreign key to a submission or a registration,
              and every event-triggered sender keys on `<kind>:<record id>`.
              Pasting it into the Record filter finds the rest of that
              record's mail. */}
          <Field label="Dedupe key">
            <span className="font-mono text-xs">{row.dedupeKey}</span>
          </Field>
        </div>
      </SheetContent>
    </Sheet>
  );
}
