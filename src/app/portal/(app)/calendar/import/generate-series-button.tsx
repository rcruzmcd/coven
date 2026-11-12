"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateNextYearInstanceAction } from "../recurrence-actions";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { keepFocusOnRemoval } from "@/lib/focus-on-removal";

export function GenerateSeriesButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      await runAction(() => generateNextYearInstanceAction(itemId), {
        success: "Next year's instance generated.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleGenerate}
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
          "Generate"
        )}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
