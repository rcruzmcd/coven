"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type EventShift } from "../shifts-actions";
import { type RoleType } from "../../volunteers/roles/actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatShiftRange, NONE_VALUE } from "./shifts";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";

export function AddVolunteerForm({
  people,
  shifts,
  roleTypes,
  onPersonCreated,
  allowCreatePerson = true,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  shifts: EventShift[];
  roleTypes: RoleType[];
  onPersonCreated: (person: PickedPerson) => void;
  /** False hides "+ Create new person" for a caller who cannot write the directory (#1693). */
  allowCreatePerson?: boolean;
  onSubmit: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [roleTypeId, setRoleTypeId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to link.");
      return;
    }

    const formData = new FormData();
    formData.set("volunteerRoleTypeId", shiftId ? "" : (roleTypeId ?? ""));
    formData.set("notes", notes);
    formData.set("shiftId", shiftId ?? "");

    const person = selectedPerson;
    startTransition(async () => {
      await runAction(() => onSubmit(person.id, formData), {
        success: `${personDisplayName(person)} signed up.`,
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onCancel();
        },
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signups-volunteer">Volunteer</FieldLabel>
          <PersonPicker
            id="signups-volunteer"
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            allowCreate={allowCreatePerson}
            newPersonRole="is_volunteer"
          />
        </Field>

        {shifts.length > 0 && (
          <Field>
            <FieldLabel htmlFor="volunteer-shift">Shift</FieldLabel>
            <Select
              value={shiftId ?? NONE_VALUE}
              onValueChange={(value) =>
                setShiftId(value === NONE_VALUE ? null : value)
              }
            >
              <SelectTrigger id="volunteer-shift" className="w-full">
                <SelectValue placeholder="No shift (whole event)">
                  {(value: string) =>
                    shifts.find((s) => s.id === value)?.label ??
                    "No shift (whole event)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  No shift (whole event)
                </SelectItem>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.label} ({formatShiftRange(shift)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {shiftId ? (
          <Field>
            <FieldLabel>Role</FieldLabel>
            <p className="app-muted rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              {shifts.find((s) => s.id === shiftId)?.role_type?.name ??
                "No role"}
            </p>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="volunteer-role">Role</FieldLabel>
            <Select
              value={roleTypeId ?? NONE_VALUE}
              onValueChange={(value) =>
                setRoleTypeId(value === NONE_VALUE ? null : value)
              }
            >
              <SelectTrigger id="volunteer-role" className="w-full">
                <SelectValue placeholder="No role">
                  {(value: string) =>
                    value === NONE_VALUE
                      ? "No role"
                      : (roleTypes.find((option) => option.id === value)
                          ?.name ?? "No role")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No role</SelectItem>
                {roleTypes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleTypes.length === 0 && (
              <p className="app-muted text-xs">
                No role types defined yet. Add them under Volunteers &gt; Roles.
              </p>
            )}
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="volunteer-notes">Notes</FieldLabel>
          <Textarea
            id="volunteer-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add volunteer"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
