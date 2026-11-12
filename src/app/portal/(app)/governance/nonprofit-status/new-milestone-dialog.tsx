"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMilestoneAction } from "./nonprofit-status-actions";
import {
  NonprofitStatusFormFields,
  emptyMilestoneForm,
  packMilestoneFormData,
  type MilestoneFormState,
} from "./nonprofit-status-form-fields";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
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

export function NewMilestoneDialog({
  people,
  existingPhases,
}: {
  people: PersonListItem[];
  existingPhases: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<MilestoneFormState>(() =>
    emptyMilestoneForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof MilestoneFormState>(
    key: K,
    value: MilestoneFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedOwner(null);
      setForm(emptyMilestoneForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createMilestoneAction(
        selectedOwner?.id ?? null,
        packMilestoneFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Milestone added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add milestone
        </Button>
      }
      title="Add milestone"
      description="Track a step toward 501(c)(3) status."
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
              "Add milestone"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="new-milestone-owner">Owner</FieldLabel>
          <PersonPicker
            id="new-milestone-owner"
            people={availablePeople}
            selected={selectedOwner}
            onSelect={setSelectedOwner}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <NonprofitStatusFormFields
          form={form}
          update={update}
          idPrefix="new-milestone"
          existingPhases={existingPhases}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
