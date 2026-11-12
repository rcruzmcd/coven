"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnnualRequirementAction } from "./annual-requirements-actions";
import {
  AnnualRequirementFormFields,
  emptyAnnualRequirementForm,
  packAnnualRequirementFormData,
  type AnnualRequirementFormState,
} from "./annual-requirement-form-fields";
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

export function NewRequirementDialog({ people }: { people: PersonListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedResponsible, setSelectedResponsible] =
    useState<PickedPerson | null>(null);
  const [form, setForm] = useState<AnnualRequirementFormState>(() =>
    emptyAnnualRequirementForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof AnnualRequirementFormState>(
    key: K,
    value: AnnualRequirementFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedResponsible(null);
      setForm(emptyAnnualRequirementForm());
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
      const result = await createAnnualRequirementAction(
        selectedResponsible?.id ?? null,
        packAnnualRequirementFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Requirement added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add requirement
        </Button>
      }
      title="Add annual requirement"
      description="Track a recurring compliance item (e.g. IRS Form 990, state charitable registration renewal)."
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
              "Add requirement"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <AnnualRequirementFormFields
          form={form}
          update={update}
          idPrefix="new-requirement"
        />

        <Field>
          <FieldLabel htmlFor="new-requirement-responsible-person">
            Responsible person
          </FieldLabel>
          <PersonPicker
            id="new-requirement-responsible-person"
            people={availablePeople}
            selected={selectedResponsible}
            onSelect={setSelectedResponsible}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
