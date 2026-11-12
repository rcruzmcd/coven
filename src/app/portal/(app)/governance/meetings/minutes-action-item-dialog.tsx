"use client";

import { FormEvent, useState, useTransition } from "react";
import { createActionItemAction } from "./action-items-actions";
import {
  ActionItemFormFields,
  emptyActionItemForm,
  packActionItemFormData,
  type ActionItemFormState,
} from "./action-item-form-fields";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Spinner } from "@/components/ui/spinner";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { runAction } from "@/components/portal/action-toast";

/**
 * An action item raised in the room, recorded without leaving the minutes.
 *
 * This is the single most common thing said out loud while minutes are being
 * taken, and before #1200 it meant navigating to Overview -- the exact
 * navigation the minutes work exists to remove.
 *
 * It lived inside `minutes-editor.tsx` until the quick-reference panel became
 * its second caller (#1201). The two differ in one thing: an item raised under
 * a section carries that section's `minutes_item_key` and renders beneath it,
 * while one raised out of band carries none and belongs to the meeting. That
 * is a null, not a second dialog.
 */
export function MinutesActionItemDialog({
  meetingId,
  item,
  people,
  onPersonCreated,
  onAdded,
  onOpenChange,
}: {
  meetingId: string;
  /** The snapshot item this was raised under, or null for the meeting itself. */
  item: { key: string; label: string } | null;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onAdded: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<ActionItemFormState>(() =>
    emptyActionItemForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedOwner) {
      setError("Select or create an owner for this action item.");
      return;
    }

    const owner = selectedOwner;
    startTransition(async () => {
      await runAction(
        () =>
          createActionItemAction(
            meetingId,
            owner.id,
            packActionItemFormData(form, item?.key),
          ),
        {
          success: "Action item added.",
          onError: setError,
          onSuccess: onAdded,
        },
      );
    });
  }

  return (
    <PortalFormSurface
      open
      onOpenChange={onOpenChange}
      withTrigger={false}
      title="Add action item"
      description={
        item
          ? `Recorded under ${item.label}.`
          : "Recorded against this meeting rather than one section of the minutes."
      }
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
              "Add action item"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="minutes-action-item-owner">Owner</FieldLabel>
          <PersonPicker
            id="minutes-action-item-owner"
            people={people}
            selected={selectedOwner}
            onSelect={setSelectedOwner}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ActionItemFormFields
          form={form}
          update={update}
          idPrefix={`minutes-action-item-${item?.key ?? "meeting"}`}
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
