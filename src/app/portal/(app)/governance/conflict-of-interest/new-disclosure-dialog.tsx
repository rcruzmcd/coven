"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDisclosureAction } from "./disclosures-actions";
import {
  DisclosureFormFields,
  emptyDisclosureForm,
  packDisclosureFormData,
  type DisclosureFormState,
} from "./disclosure-form-fields";
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

export function NewDisclosureDialog({
  people,
  currentFiscalYear,
}: {
  people: PersonListItem[];
  currentFiscalYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<DisclosureFormState>(() =>
    emptyDisclosureForm(currentFiscalYear),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof DisclosureFormState>(
    key: K,
    value: DisclosureFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedPerson(null);
      setForm(emptyDisclosureForm(currentFiscalYear));
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedPerson) {
      setError("Select or create a person for this disclosure.");
      return;
    }

    startTransition(async () => {
      const result = await createDisclosureAction(
        selectedPerson.id,
        packDisclosureFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Disclosure recorded.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add disclosure
        </Button>
      }
      title="Add disclosure"
      description="Record a per-person annual conflict of interest disclosure."
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
              "Add disclosure"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="new-disclosure-person">Person</FieldLabel>
          <PersonPicker
            id="new-disclosure-person"
            people={availablePeople}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <DisclosureFormFields
          form={form}
          update={update}
          idPrefix="new-disclosure"
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
