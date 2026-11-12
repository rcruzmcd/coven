"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import type { ContentPieceRow } from "@/lib/social-content/pieces";
import { skipEventPostsAction } from "@/lib/social-content/piece-actions";

/**
 * A cancelled event's posts still open (#1799), with one click to skip them
 * all ("Event cancelled"). Published posts are never listed or touched.
 */
export function CancelledEventPostsBanner({
  eventId,
  pieces,
  canManage,
}: {
  eventId: string;
  pieces: Pick<ContentPieceRow, "id" | "title">[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const count = pieces.length;

  function handleSkipAll() {
    startTransition(async () => {
      await runAction(() => skipEventPostsAction(eventId), {
        success: ({ skipped }) =>
          `${skipped} social ${skipped === 1 ? "post" : "posts"} skipped.`,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Alert>
      <CircleSlash />
      <AlertTitle>
        This event is cancelled. {count} social{" "}
        {count === 1 ? "post is" : "posts are"} still open.
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <ul className="list-disc pl-5">
          {pieces.map((piece) => (
            <li key={piece.id}>{piece.title}</li>
          ))}
        </ul>
        {canManage && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            focusableWhenDisabled
            onClick={handleSkipAll}
          >
            {isPending ? <Spinner /> : null}
            Skip all
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
