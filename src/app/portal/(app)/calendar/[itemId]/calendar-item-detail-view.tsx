"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  Copy,
  Trash2,
} from "lucide-react";
import {
  archiveCalendarItemAction,
  deleteCalendarItemAction,
  duplicateCalendarItemAction,
  restoreCalendarItemAction,
} from "../actions";
import { generateNextYearInstanceAction } from "../recurrence-actions";
import { hasStructuredRecurrence } from "../calendar-recurrence";
import {
  isPastUndecided,
  needsDecision,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "../calendar-shared";
import type { CalendarCategory } from "../calendar-shared";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "../calendar-badges";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContentPiecesCard } from "../content-pieces-card";
import {
  PlanningDecisionCard,
  ScheduleDetailsCard,
  SensitiveTopicCard,
} from "./calendar-item-detail-cards";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

export function CalendarItemDetailView({
  item,
  owners,
  programs,
  defaultLeadTimeDays,
  canManage,
  categoryVocabulary,
}: {
  item: CalendarItemRow;
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  /** The tenant's category vocabulary (#834). */
  categoryVocabulary: CalendarCategory[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDuplicate() {
    startTransition(async () => {
      await runAction(() => duplicateCalendarItemAction(item.id), {
        success: `Duplicated as "${item.title} (copy)".`,
        onError: setError,
        onSuccess: () => {
          // The copy lands on the calendar list (titled "<title> (copy)").
          router.push("/portal/calendar");
          router.refresh();
        },
      });
    });
  }

  function handleGenerateNextYear() {
    startTransition(async () => {
      await runAction(() => generateNextYearInstanceAction(item.id), {
        success: "Next year's instance generated.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleArchive() {
    startTransition(async () => {
      await runAction(() => archiveCalendarItemAction(item.id), {
        success: "Calendar item archived.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await runAction(() => restoreCalendarItemAction(item.id), {
        success: "Calendar item restored.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await runAction(() => deleteCalendarItemAction(item.id), {
        success: "Calendar item deleted.",
        onError: (message) => {
          setConfirmDelete(false);
          setError(message);
        },
        onSuccess: () => {
          setConfirmDelete(false);
          router.push("/portal/calendar");
          router.refresh();
        },
      });
    });
  }

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {item.title}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PriorityTierBadge tier={item.priority_tier} />
          <CalendarStatusBadge status={item.calendar_status} />
          <CalendarVisibilityBadge visibility={item.visibility} />
          {needsDecision(item) && <NeedsDecisionFlag />}
          {isPastUndecided(item) && <PastUndecidedFlag />}
        </div>
      </div>

      {canManage && (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
          {hasStructuredRecurrence(item) && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Generate next year"
                    disabled={isPending}
                    onClick={handleGenerateNextYear}
                  />
                }
              >
                {isPending ? <Spinner /> : <CalendarPlus />}
              </TooltipTrigger>
              <TooltipContent>Generate next year</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Duplicate"
                  disabled={isPending}
                  onClick={handleDuplicate}
                />
              }
            >
              {isPending ? <Spinner /> : <Copy />}
            </TooltipTrigger>
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
          {item.calendar_status === "archived" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Restore"
                    disabled={isPending}
                    onClick={handleRestore}
                  />
                }
              >
                {isPending ? <Spinner /> : <ArchiveRestore />}
              </TooltipTrigger>
              <TooltipContent>Restore</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Archive"
                    disabled={isPending}
                    onClick={handleArchive}
                  />
                }
              >
                {isPending ? <Spinner /> : <Archive />}
              </TooltipTrigger>
              <TooltipContent>Archive</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Delete calendar item"
                  disabled={isPending}
                  onClick={() => setConfirmDelete(true)}
                />
              }
            >
              {isPending ? <Spinner /> : <Trash2 />}
            </TooltipTrigger>
            <TooltipContent>Delete calendar item</TooltipContent>
          </Tooltip>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <ScheduleDetailsCard item={item} canManage={canManage} />

        <PlanningDecisionCard
          item={item}
          owners={owners}
          programs={programs}
          canManage={canManage}
          categoryVocabulary={categoryVocabulary}
        />

        <SensitiveTopicCard item={item} canManage={canManage} />

        <ContentPiecesCard
          className="lg:col-span-2"
          calendarItemId={item.id}
          itemStartsAt={item.starts_at}
          pieces={item.content_pieces}
          owners={owners}
          defaultLeadTimeDays={defaultLeadTimeDays}
          canManage={canManage}
          isSensitiveTopic={item.is_sensitive_topic}
          toneGuidance={item.tone_guidance}
        />
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(next) => !next && setConfirmDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calendar item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{item.title}&rdquo;. Its social
              posts are kept, no longer related to it. This can&apos;t be undone
              — to keep it out of active views without losing it, archive it
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
