"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { updateEventPlanningAction } from "./actions";
import type { EventRow } from "./event-badges";
import { PersonPicker } from "../people/person-picker";
import type { PersonListItem } from "../people/actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";

function formStateFor(event: EventRow) {
  return {
    eventLead: event.event_lead,
    budgetAmount:
      event.budget_amount === null ? "" : String(event.budget_amount),
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (
    (form.eventLead?.id ?? null) !== (baseline.eventLead?.id ?? null) ||
    form.budgetAmount !== baseline.budgetAmount
  );
}

export type PlanningTabHandle = {
  discard: () => void;
};

/**
 * Who leads the event and what it may spend. Registration settings have their
 * own card since #1778.
 */
export function PlanningTab({
  event,
  formId,
  people,
  onPersonCreated,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  formId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PersonListItem) => void;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<PlanningTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event));
  }, [form, event, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event));
    },
  }));

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("eventLeadId", form.eventLead?.id ?? "");
    formData.set("budgetAmount", form.budgetAmount);

    startTransition(async () => {
      await runAction(() => updateEventPlanningAction(event.id, formData), {
        success: "Planning details saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
        },
      });
    });
  }

  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <FieldGroup>
        <ReadOnlyField label="Event lead" htmlFor="planning-eventLeadId">
          {form.eventLead?.name ?? form.eventLead?.email ?? "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Budget" htmlFor="planning-budgetAmount">
          {formatCurrency(event.budget_amount)}
        </ReadOnlyField>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="planning-eventLeadId">Event lead</FieldLabel>
          <PersonPicker
            id="planning-eventLeadId"
            people={people}
            selected={form.eventLead}
            onSelect={(person) =>
              setForm((prev) => ({ ...prev, eventLead: person }))
            }
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="planning-budgetAmount">Budget ($)</FieldLabel>
          <Input
            id="planning-budgetAmount"
            type="number"
            min="0"
            step="0.01"
            value={form.budgetAmount}
            onChange={(changeEvent) =>
              setForm((prev) => ({
                ...prev,
                budgetAmount: changeEvent.target.value,
              }))
            }
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
