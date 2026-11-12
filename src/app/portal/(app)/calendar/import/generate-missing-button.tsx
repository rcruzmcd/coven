"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateMissingCalendarSeriesInstancesAction } from "../recurrence-actions";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

export function GenerateMissingButton({ targetYear }: { targetYear: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerateAll() {
    setError(null);
    startTransition(async () => {
      await runAction(
        () => generateMissingCalendarSeriesInstancesAction(targetYear),
        {
          success: ({ generatedCount: count }) => {
            if (count === undefined)
              return `Missing ${targetYear} items generated.`;
            return count === 0
              ? `Nothing to generate — ${targetYear} is already complete.`
              : `${count} item${count === 1 ? "" : "s"} generated for ${targetYear}.`;
          },
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        onClick={handleGenerateAll}
        disabled={isPending}
        focusableWhenDisabled
        // Success takes this row (or the whole list) away (#1863).
        ref={keepFocusOnRemoval}
      >
        {isPending ? (
          <>
            <Spinner /> Generating…
          </>
        ) : (
          `Generate all for ${targetYear}`
        )}
      </Button>
      {error && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
