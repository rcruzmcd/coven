"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { demoSignInAction } from "./demo-actions";

/**
 * Rendered only when the server has both demo credentials (#604). The
 * credentials themselves stay on the server: this component knows the demo
 * exists and nothing else, which is the whole reason the sign-in is a Server
 * Action rather than the browser client the form beneath it uses.
 */
export function DemoButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects and never returns.
      const result = await demoSignInAction();
      setError(result.error);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleClick}
          disabled={isPending}
          focusableWhenDisabled
          className="w-full"
        >
          {isPending ? (
            <>
              <Spinner /> Opening the demo...
            </>
          ) : (
            "Explore the demo"
          )}
        </Button>
        <p className="app-muted text-center text-xs">
          A sample organization with invented data. Nothing you do in it touches
          anything real, and it is rebuilt from scratch every night.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="app-muted text-xs font-semibold uppercase tracking-[0.16em]">
          or sign in
        </span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
