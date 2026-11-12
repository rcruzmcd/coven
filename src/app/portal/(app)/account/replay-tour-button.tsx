"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resetWelcomeAction } from "../welcome/actions";

/**
 * Clears the welcome flag and refreshes, which makes the portal layout render
 * the tour open again. Dismissing the tour therefore costs nothing.
 */
export function ReplayTourButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resetWelcomeAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        focusableWhenDisabled
      >
        {isPending ? (
          <>
            <Spinner /> Starting...
          </>
        ) : (
          "Show the tour again"
        )}
      </Button>
    </div>
  );
}
