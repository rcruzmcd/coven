"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setGearRequestStatusAction,
  type GearRequestActionResult,
} from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import type { GearRequestStatus } from "@/lib/gear-requests";

/**
 * The next thing staff can do with an open request (#1032). For shipping
 * the sequence is quote, then paid, then fulfilled; a meetup skips straight
 * to fulfilled, which records the held items as distributed to the requester.
 * Cancelling is always available and puts the held items back in the
 * catalogue, so it asks twice.
 */
export function GearRequestStatusActions({
  requestId,
  status,
  deliveryMethod,
  heldCount,
}: {
  requestId: string;
  status: string;
  deliveryMethod: string;
  heldCount: number;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shipping = deliveryMethod === "shipping";

  function move(
    next: GearRequestStatus,
    quotedAmount: number | null,
    receipt: string,
  ) {
    setError(null);
    startTransition(async () => {
      await runAction<GearRequestActionResult>(
        () => setGearRequestStatusAction(requestId, next, quotedAmount),
        {
          success: receipt,
          onError: setError,
          onSuccess: () => {
            setConfirmingCancel(false);
            router.refresh();
          },
        },
      );
    });
  }

  function handleQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quote);
    if (!quote.trim() || !Number.isFinite(amount) || amount < 0) {
      setError("Enter the postage amount to record a quote.");
      return;
    }
    move("quoted", amount, `Postage quoted at $${amount.toFixed(2)}.`);
  }

  return (
    <div className="rainbow-surface mt-6 rounded-xl border border-[var(--line)] p-4 shadow-md">
      {error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        {shipping && (status === "new" || status === "quoted") ? (
          <form
            onSubmit={handleQuote}
            className="flex flex-wrap items-end gap-2"
          >
            <Field className="w-36">
              <FieldLabel htmlFor="request-quote-amount" required>
                {status === "quoted" ? "Re-quote postage ($)" : "Postage ($)"}
              </FieldLabel>
              <Input
                id="request-quote-amount"
                required
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={quote}
                onChange={(event) => setQuote(event.target.value)}
                disabled={isPending}
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              disabled={isPending}
              focusableWhenDisabled
            >
              Record quote
            </Button>
          </form>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isPending ? <Spinner className="size-4" /> : null}
          {shipping && status === "quoted" && (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() => move("paid", null, "Postage marked as paid.")}
            >
              Mark paid
            </Button>
          )}
          {(!shipping || status === "paid") && (
            <Button
              type="button"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() =>
                move("fulfilled", null, "Request fulfilled; items distributed.")
              }
            >
              Mark fulfilled
            </Button>
          )}
          {shipping && status !== "paid" && (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() =>
                move(
                  "fulfilled",
                  null,
                  "Request marked as fulfilled without a payment record.",
                )
              }
            >
              Fulfil anyway
            </Button>
          )}
          {confirmingCancel ? (
            <>
              <span className="text-sm">
                Release{" "}
                {heldCount === 1 ? "1 held item" : `${heldCount} held items`}{" "}
                and cancel?
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() =>
                  move("cancelled", null, "Request cancelled; items released.")
                }
              >
                Confirm cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() => setConfirmingCancel(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              focusableWhenDisabled
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel request
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
