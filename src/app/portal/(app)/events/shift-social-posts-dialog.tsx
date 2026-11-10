"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { shiftEventPostsAction } from "@/lib/social-content/piece-actions";

/** A save that moved the event's start, with posts that could follow it. */
export type SocialPostShift = { shiftMs: number; count: number };

/** "3 days later", "1 day and 2 hours earlier": how far the start moved. */
export function describeShift(shiftMs: number) {
  const totalMinutes = Math.round(Math.abs(shiftMs) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days && `${days} ${days === 1 ? "day" : "days"}`,
    hours && `${hours} ${hours === 1 ? "hour" : "hours"}`,
    minutes && `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
  ].filter(Boolean);
  return `${parts.join(" and ")} ${shiftMs > 0 ? "later" : "earlier"}`;
}

/**
 * Asked after an event's start date is saved (#1799): move its open, dated
 * social posts by the same amount? Declining leaves them where they are.
 */
export function ShiftSocialPostsDialog({
  eventId,
  shift,
  onClose,
}: {
  eventId: string;
  shift: SocialPostShift | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const count = shift?.count ?? 0;
  const noun = count === 1 ? "social post" : "social posts";

  function handleMove() {
    if (!shift) return;
    setError(null);
    startTransition(async () => {
      await runAction(() => shiftEventPostsAction(eventId, shift.shiftMs), {
        success: ({ moved }) =>
          `${moved} social ${moved === 1 ? "post" : "posts"} moved.`,
        onError: setError,
        onSuccess: () => {
          onClose();
          router.refresh();
        },
      });
    });
  }

  return (
    <AlertDialog
      open={shift !== null}
      onOpenChange={(next) => {
        if (!next && !isPending) {
          setError(null);
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Move {count} {noun} by the same amount?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The event now starts{" "}
            {shift ? describeShift(shift.shiftMs) : "at a new time"}. Their
            publish, review and draft dates move with it. Published and skipped
            posts stay where they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep dates</AlertDialogCancel>
          <AlertDialogAction onClick={handleMove} disabled={isPending}>
            {isPending ? <Spinner /> : null}
            Move {count} {count === 1 ? "post" : "posts"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
