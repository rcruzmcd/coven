"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPersonAction, type PersonListItem } from "./actions";
import {
  PersonFormFields,
  emptyPersonForm,
  packPersonFormData,
  personFormDirty,
  type PersonFormState,
} from "./person-form-fields";
import { PersonPicker, type PickedPerson } from "./person-picker";
import type { PersonType, RoleKey } from "./people-shared";
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

export function NewPersonDialog({
  people,
  defaultRole,
  defaultPersonType = "individual",
  triggerLabel = "New Person",
}: {
  people: PersonListItem[];
  defaultRole?: RoleKey;
  /** Opens the form with "This is an organization" already ticked. */
  defaultPersonType?: PersonType;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [form, setForm] = useState<PersonFormState>(() =>
    emptyPersonForm(defaultRole, defaultPersonType),
  );
  const [contact, setContact] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the save collided with an existing person on email, so the
  // message can offer their record instead of leaving staff to search.
  const [conflict, setConflict] = useState<{
    id: string;
    name: string | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work. Gated on
  // `open` as well: the guard's beforeunload prompt must never be armed by a
  // dialog nobody has opened, whatever the comparison says.
  const dirty = personFormDirty(
    form,
    emptyPersonForm(defaultRole, defaultPersonType),
  );
  const guard = useUnsavedChangesGuard(open && dirty);

  function resetForm() {
    setForm(emptyPersonForm(defaultRole, defaultPersonType));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!guard.allowOpenChange(nextOpen)) return;
    setOpen(nextOpen);
    if (nextOpen) resetForm();
    if (!nextOpen) setConflict(null);
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConflict(null);

    startTransition(async () => {
      const result = await createPersonAction(
        packPersonFormData(form),
        contact?.id ?? null,
      );
      if ("error" in result) {
        setError(result.error);
        setConflict(result.conflict ?? null);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Person added.");
      router.refresh();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this person"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <PortalFormSurface
        open={open}
        onOpenChange={handleOpenChange}
        trigger={
          <Button type="button" className="shrink-0 whitespace-nowrap">
            {triggerLabel}
          </Button>
        }
        title="Add person"
        description="Add a donor, sponsor, or volunteer to the directory."
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
                "Add person"
              )}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <RequiredFieldsNote />
          <PersonFormFields form={form} update={update} idPrefix="new-person" />

          <Field>
            <FieldLabel htmlFor="new-person-primary-contact">
              Primary contact person (for an organization)
            </FieldLabel>
            <PersonPicker
              id="new-person-primary-contact"
              people={availablePeople}
              selected={contact}
              onSelect={setContact}
              onPersonCreated={handlePersonCreated}
              placeholder="Search by name or email..."
            />
          </Field>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                {conflict && (
                  <>
                    {" "}
                    <Link
                      href={`/portal/people/${conflict.id}`}
                      className="underline underline-offset-4"
                    >
                      Open their record
                    </Link>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </PortalFormSurface>
    </>
  );
}
