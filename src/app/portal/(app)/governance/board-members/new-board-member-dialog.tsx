"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoardMemberAction } from "./actions";
import {
  BoardMemberFormFields,
  emptyBoardMemberForm,
  packBoardMemberFormData,
  type BoardMemberFormState,
} from "./board-member-form-fields";
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

export function NewBoardMemberDialog({ people }: { people: PersonListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<BoardMemberFormState>(() =>
    emptyBoardMemberForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof BoardMemberFormState>(
    key: K,
    value: BoardMemberFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedPerson(null);
      setForm(emptyBoardMemberForm());
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
      setError("Select or create a person to link.");
      return;
    }

    startTransition(async () => {
      const result = await createBoardMemberAction(
        selectedPerson.id,
        packBoardMemberFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Board member added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add board member
        </Button>
      }
      title="Add board member"
      description="Link a person to a board term."
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
              "Add board member"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="new-board-member-person">Person</FieldLabel>
          <PersonPicker
            id="new-board-member-person"
            people={availablePeople}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <BoardMemberFormFields
          form={form}
          update={update}
          idPrefix="new-board-member"
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
