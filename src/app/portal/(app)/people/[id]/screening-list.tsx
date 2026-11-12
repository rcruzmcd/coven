"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActionToast } from "@/components/portal/action-toast";
import { formatCalendarDate } from "@/lib/format";
import {
  isExpired,
  type PersonScreeningRow,
} from "@/lib/portal/person-screenings";
import { removePersonScreeningAction } from "./screening-actions";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

/**
 * One line per outcome, newest first — which is the order the query returns
 * and the order that puts the current clearance at the top.
 *
 * There is nothing to expand and no detail sheet, because there is no detail:
 * a level, a date, and a date it runs to is the whole record.
 */
export function ScreeningList({
  personId,
  screenings,
  today,
  canManage,
}: {
  personId: string;
  screenings: PersonScreeningRow[];
  /** The tenant's own day, so an expiry is not judged in the viewer's zone. */
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [pendingRemoval, setPendingRemoval] =
    useState<PersonScreeningRow | null>(null);

  function confirmRemove() {
    const target = pendingRemoval;
    if (!target) return;
    setPendingRemoval(null);
    run(() => removePersonScreeningAction(target.id, personId), {
      success: "Screening outcome removed.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <>
      <ul className="flex flex-col gap-3 text-sm">
        {screenings.map((screening) => {
          const expired = isExpired(screening, today);
          const level = screening.tier?.name ?? "—";
          return (
            <li
              key={screening.id}
              className="flex items-start justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium">
                  Cleared for {level}
                  {expired && (
                    <>
                      {" "}
                      <Badge variant="destructive">Expired</Badge>
                    </>
                  )}
                </p>
                <p className="app-muted">
                  {formatCalendarDate(screening.cleared_on)}
                  {screening.expires_on
                    ? ` · ${expired ? "ran to" : "runs to"} ${formatCalendarDate(
                        screening.expires_on,
                      )}`
                    : ""}
                </p>
              </div>
              {canManage && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={isPending}
                        focusableWhenDisabled
                        aria-label={`Remove the ${level} outcome`}
                        ref={keepFocusOnRemoval}
                        onClick={() => setPendingRemoval(screening)}
                      />
                    }
                  >
                    <Trash2 />
                  </TooltipTrigger>
                  <TooltipContent>{`Remove the ${level} outcome`}</TooltipContent>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(next) => !next && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this outcome?</AlertDialogTitle>
            <AlertDialogDescription>
              The record that this person was cleared for{" "}
              {pendingRemoval?.tier?.name ?? "this level"} on{" "}
              {pendingRemoval
                ? formatCalendarDate(pendingRemoval.cleared_on)
                : ""}{" "}
              will be removed from their profile. That it was recorded, and that
              you removed it, stays in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRemoval(null)}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>
              Remove outcome
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
