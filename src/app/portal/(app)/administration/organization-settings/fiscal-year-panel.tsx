"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateFiscalYearStartMonthAction,
  type SettingActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
// Runtime (not type-only) import: the preview below has to re-describe the
// span as the admin changes the dropdown, before anything is saved.
// @/lib/fiscal-year is deliberately free of server-only imports so this works.
import {
  describeFiscalYearSpan,
  fiscalYearForDate,
  FISCAL_YEAR_START_MONTH_OPTIONS,
  formatFiscalYearLabel,
} from "@/lib/fiscal-year";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function FiscalYearPanel({
  fiscalYearStartMonth,
}: {
  fiscalYearStartMonth: number;
}) {
  const router = useRouter();
  const [startMonth, setStartMonth] = useState(fiscalYearStartMonth);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Described from the browser's clock only to give the reader a concrete
  // example of the naming convention; nothing is stored from it.
  const currentFiscalYear = fiscalYearForDate(new Date(), startMonth);
  const label = formatFiscalYearLabel(currentFiscalYear);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateFiscalYearStartMonthAction(formData),
        {
          success: "Fiscal year updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiscal year</CardTitle>
        {/* The Board-resolution rule and the list of figures it drives are in
            the help sheet (#1482); the card keeps what to know before saving. */}
        <CardDescription>
          Set by Board resolution. Every change is recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="fiscal-year-start-month">
                Fiscal year starts in
              </FieldLabel>
              <select
                id="fiscal-year-start-month"
                name="startMonth"
                className={selectClassName}
                value={startMonth}
                onChange={(event) => setStartMonth(Number(event.target.value))}
                disabled={isPending}
              >
                {FISCAL_YEAR_START_MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Runs {describeFiscalYearSpan(startMonth)}, and is named for the
                year it ends in, so we are in {label} now. Every annual figure
                in the portal counts from this month.
              </FieldDescription>
            </Field>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                {isPending ? <Spinner className="size-4" /> : null}
                Save fiscal year
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
