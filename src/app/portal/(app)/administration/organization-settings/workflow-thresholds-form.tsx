"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateExpenseApprovalThresholdAction,
  updateReimbursementApprovalThresholdAction,
  updateSalesTaxRateAction,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

/**
 * One numeric setting with its own Save. The field defaults describe a USD
 * threshold; the sales tax card below overrides them for a percent. The
 * description is the one line to know before saving (#1483); the reasoning
 * is in the help sheet.
 */
function ThresholdCard({
  title,
  idPrefix,
  description,
  initialValue,
  action,
  fieldName = "threshold",
  fieldLabel = "Threshold (USD)",
  max,
  step = "0.01",
}: {
  title: string;
  idPrefix: string;
  description: string;
  initialValue: number | null;
  action: (formData: FormData) => Promise<SettingActionResult>;
  fieldName?: string;
  fieldLabel?: string;
  max?: string;
  step?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction(() => action(formData), {
        // `title` is already "<X> approval threshold" -- naming it again
        // here read as "Expense approval threshold threshold updated."
        success: `${title} updated.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* One field, so its Save sits beside it rather than on a row
                of its own, as the other settings cards' buttons do. */}
            <div className="flex items-end gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor={`${idPrefix}-${fieldName}`} required>
                  {fieldLabel}
                </FieldLabel>
                <Input
                  id={`${idPrefix}-${fieldName}`}
                  name={fieldName}
                  type="number"
                  min="0"
                  max={max}
                  step={step}
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={isPending} focusableWhenDisabled>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function WorkflowThresholdsForm({
  expenseApprovalThreshold,
  reimbursementApprovalThreshold,
  salesTaxRate,
}: {
  expenseApprovalThreshold: number | null;
  reimbursementApprovalThreshold: number | null;
  /** Percent. */
  salesTaxRate: number | null;
}) {
  // Two groups by subject (#1483), so the group labels do the explaining a
  // tab intro used to. From `lg` each card takes half the width -- the sales
  // tax card too, alone in its row, rather than stretching one input across
  // the page. Below `lg` it is one column in the order the cards always had.
  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-approvals" className="space-y-3">
        <h2 id="settings-approvals" className="app-eyebrow text-sm">
          Approvals
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ThresholdCard
            title="Expense approval threshold"
            idPrefix="expense"
            description="Below this, finance can self-approve an expense; at or above it, admin or board must approve."
            initialValue={expenseApprovalThreshold}
            action={updateExpenseApprovalThresholdAction}
          />
          <ThresholdCard
            title="Reimbursement approval threshold"
            idPrefix="reimbursement"
            description="Below this, finance can self-approve a reimbursement; at or above it, admin or board must approve."
            initialValue={reimbursementApprovalThreshold}
            action={updateReimbursementApprovalThresholdAction}
          />
        </div>
      </section>
      <section aria-labelledby="settings-register" className="space-y-3">
        <h2 id="settings-register" className="app-eyebrow text-sm">
          Register
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ThresholdCard
            title="Sales tax rate"
            idPrefix="sales-tax"
            fieldName="rate"
            fieldLabel="Rate (%)"
            max="100"
            step="0.001"
            description="Prefilled on every sale at the register; changing it never alters a sale already recorded."
            initialValue={salesTaxRate}
            action={updateSalesTaxRateAction}
          />
        </div>
      </section>
    </div>
  );
}
