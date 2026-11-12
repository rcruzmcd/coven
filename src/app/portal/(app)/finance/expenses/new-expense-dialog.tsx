"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExpenseAction } from "./actions";
import {
  ExpenseFormFields,
  emptyExpenseForm,
  packExpenseFormData,
  type ExpenseFormState,
} from "./expense-form-fields";
import type { EventOption } from "./expenses-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { listEventOptionsAction } from "../../events/actions";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import { useEventDateDefaults } from "../../events/event-date-defaults";

export function NewExpenseDialog({
  events,
  defaultEventId,
  lockEventSelection,
  triggerLabel = "New Expense",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
  onSaved,
}: {
  events?: EventOption[];
  defaultEventId?: string;
  lockEventSelection?: boolean;
  triggerLabel?: string;
  onSaved?: () => void;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  // Inside an event, a new expense opens on the event's date rather than on
  // today; elsewhere this is "" and today stands.
  const eventDates = useEventDateDefaults();
  const [form, setForm] = useState<ExpenseFormState>(() =>
    emptyExpenseForm(defaultEventId, eventDates.date),
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  // The finance page passes events down from its own query; the sidebar quick
  // action has no such query, so load them on open instead.
  const [loadedEvents, setLoadedEvents] = useState<EventOption[]>([]);
  const eventOptions = events ?? loadedEvents;
  const [selectedPayer, setSelectedPayer] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  useEffect(() => {
    if (!open || events) return;
    listEventOptionsAction().then((result) => {
      if (!("error" in result)) setLoadedEvents(result.data);
    });
  }, [open, events]);

  function update<K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const baseline = emptyExpenseForm(defaultEventId, eventDates.date);
  const dirty =
    selectedPayer !== null ||
    (Object.keys(baseline) as (keyof ExpenseFormState)[]).some(
      (key) => form[key] !== baseline[key],
    );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setForm(emptyExpenseForm(defaultEventId, eventDates.date));
    setSelectedPayer(null);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!guard.allowOpenChange(nextOpen)) return;
    setOpen(nextOpen);
    if (nextOpen) resetForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createExpenseAction(
        packExpenseFormData(form, selectedPayer?.id ?? null),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Expense added.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this expense"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <PortalFormSurface
        open={open}
        onOpenChange={handleOpenChange}
        withTrigger={withTrigger}
        trigger={
          <Button type="button" className="shrink-0 whitespace-nowrap">
            {triggerLabel}
          </Button>
        }
        title="Add expense"
        description="Record a new expense."
        onSubmit={handleSubmit}
        footer={
          <>
            <PortalFormSurfaceClose
              render={<Button type="button" variant="secondary" />}
            >
              Cancel
            </PortalFormSurfaceClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add expense"
              )}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <RequiredFieldsNote />
          <Field>
            <FieldLabel htmlFor="new-expense-paid-by">Paid by</FieldLabel>
            <PersonPicker
              id="new-expense-paid-by"
              people={people}
              selected={selectedPayer}
              onSelect={setSelectedPayer}
              onPersonCreated={handlePersonCreated}
              placeholder="Search if someone personally fronted this..."
            />
          </Field>

          <ExpenseFormFields
            form={form}
            update={update}
            events={eventOptions}
            lockEventSelection={lockEventSelection}
            idPrefix="new-expense"
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </PortalFormSurface>
    </>
  );
}
