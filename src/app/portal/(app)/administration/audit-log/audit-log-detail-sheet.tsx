"use client";

import type { ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { ActionBadge, TABLE_LABELS } from "./audit-log-badges";
import { computeDiff } from "./diff";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export type AuditLogRow = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  occurred_at: string;
  actor_label: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  redacted_at: string | null;
  /** For a social post, what it was related to (#1797). */
  related?: ReactNode;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditLogDetailSheet({ row }: { row: AuditLogRow }) {
  const diff = computeDiff(row.old_data, row.new_data);
  const showOnlyChanged = row.action === "update";
  const entries = showOnlyChanged
    ? diff.filter((entry) => entry.changed)
    : diff;

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
                  aria-label="View entry details"
                />
              }
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <TooltipContent>View entry details</TooltipContent>
      </Tooltip>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {TABLE_LABELS[row.table_name] ?? row.table_name} ·{" "}
            <ActionBadge action={row.action} />
          </SheetTitle>
          <SheetDescription>
            {formatDateTime(row.occurred_at)} by {row.actor_label} · record{" "}
            <span className="font-mono">{row.record_id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {row.related ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="app-muted">Related to</span>
              {row.related}
            </div>
          ) : null}
          {/* #720. Without this, a scrubbed field and a field that was empty at
              the time read identically, and a reader would draw the wrong
              conclusion from the same em dash. */}
          {row.redacted_at ? (
            <p className="app-muted mb-3 text-sm leading-relaxed">
              Personal details in this entry were cleared on{" "}
              {formatDateTime(row.redacted_at)} under the data retention policy.
              Everything else is as it was recorded.
            </p>
          ) : null}
          {entries.length === 0 ? (
            <EmptyState
              className="py-4"
              title="No field changes recorded"
              description="This entry did not change any tracked fields."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.key}
                  className={cn(
                    "rounded-lg border border-[var(--line)] p-3 text-sm",
                    entry.changed &&
                      "border-[var(--purple-deep)] bg-[var(--purple-soft)]/40",
                  )}
                >
                  <div className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                    {entry.key}
                  </div>
                  {row.action === "insert" ? (
                    <div className="mt-1 break-words">
                      {formatValue(entry.after)}
                    </div>
                  ) : row.action === "delete" ? (
                    <div className="mt-1 break-words">
                      {formatValue(entry.before)}
                    </div>
                  ) : (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div className="break-words text-muted-foreground line-through">
                        {formatValue(entry.before)}
                      </div>
                      <div className="break-words">
                        {formatValue(entry.after)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
