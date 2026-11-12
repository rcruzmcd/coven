"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { blankLabelsHref, MAX_LABEL_ITEMS } from "@/lib/inventory-labels";
import { createBlankLabelsAction } from "./actions";

/**
 * Makes a batch of unassigned codes and opens them on the print page. The
 * codes are in that page's URL, so reprinting a jammed sheet is the same link.
 */
export function BlankLabelsForm() {
  const router = useRouter();
  const [count, setCount] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBlankLabelsAction(Number(count));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(blankLabelsHref(result.data));
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="blank-label-count">Number of labels</FieldLabel>
          <Input
            id="blank-label-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LABEL_ITEMS}
            required
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="w-32"
          />
          <FieldDescription>
            Each label gets a new code that is on no item yet. Scan one while
            recording a donation and the item takes that code.
          </FieldDescription>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          className="self-start"
          disabled={isPending}
          focusableWhenDisabled
        >
          {isPending && <Spinner />} Create blank labels
        </Button>
      </FieldGroup>
    </form>
  );
}
