"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type EventVolunteer,
  type EventVolunteerPerson,
} from "../volunteers-actions";
import { type EventShift } from "../shifts-actions";
import { type RoleType } from "../../volunteers/roles/actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { NONE_VALUE } from "./shifts";
import { useEventDateDefaults } from "../event-date-defaults";

function shiftHoursAndDate(shift: EventShift) {
  const durationHours =
    (new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) /
    3_600_000;
  const roundedHours = Math.round(durationHours * 4) / 4;
  return {
    hours: String(roundedHours),
    loggedDate: shift.starts_at.slice(0, 10),
  };
}

/**
 * The hours, date and role a volunteer's own signup implies, so the common
 * case -- "they worked the shift they signed up for" -- is one confirm rather
 * than three lookups. Falls back to a blank entry dated `fallbackDate`, which
 * is the event's own date inside an event and today outside one.
 */
function defaultsForPerson(
  person: PickedPerson | null,
  volunteers: EventVolunteer[],
  shifts: EventShift[],
  fallbackDate: string,
) {
  const volunteer = person
    ? volunteers.find((v) => v.person_id === person.id)
    : undefined;
  const shift = volunteer?.shift_id
    ? shifts.find((s) => s.id === volunteer.shift_id)
    : undefined;
  const roleTypeId =
    shift?.volunteer_role_type_id ?? volunteer?.volunteer_role_type_id ?? null;
  return {
    ...(shift
      ? shiftHoursAndDate(shift)
      : { hours: "", loggedDate: fallbackDate }),
    roleTypeId,
  };
}

export function AddHoursForm({
  volunteers,
  shifts,
  roleTypes,
  lockedPerson,
  onSubmit,
  onCancel,
}: {
  volunteers: EventVolunteer[];
  shifts: EventShift[];
  roleTypes: RoleType[];
  /**
   * Set when the form is opened from a specific roster row. The volunteer is
   * then fixed and shown read-only instead of offering a picker that could
   * only ever be re-set to the person it already names.
   */
  lockedPerson?: EventVolunteerPerson;
  onSubmit: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const people: PersonListItem[] = volunteers.map((volunteer) => ({
    ...volunteer.person,
  }));
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    lockedPerson ?? null,
  );
  // Hours are worked on the day of the event, so a volunteer with no shift to
  // imply a date falls back to the event's date rather than to today.
  const eventDates = useEventDateDefaults();
  const fallbackDate = eventDates.date || new Date().toISOString().slice(0, 10);
  // Seeded lazily rather than in an effect: the compiler lint that ships with
  // eslint-config-next fails on setting state from an effect body, and the
  // dialog only mounts this form once its volunteers have loaded, so the
  // locked person's shift is already known on the first render.
  const [hours, setHours] = useState(
    () =>
      defaultsForPerson(lockedPerson ?? null, volunteers, shifts, fallbackDate)
        .hours,
  );
  const [loggedDate, setLoggedDate] = useState(
    () =>
      defaultsForPerson(lockedPerson ?? null, volunteers, shifts, fallbackDate)
        .loggedDate,
  );
  const [roleTypeId, setRoleTypeId] = useState<string | null>(
    () =>
      defaultsForPerson(lockedPerson ?? null, volunteers, shifts, fallbackDate)
        .roleTypeId,
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelectPerson(person: PickedPerson | null) {
    setSelectedPerson(person);
    const defaults = defaultsForPerson(
      person,
      volunteers,
      shifts,
      fallbackDate,
    );
    // The role comes from the signup itself, so it is known even for a
    // volunteer with no shift to imply hours and a date.
    setRoleTypeId(defaults.roleTypeId);
    if (!defaults.hours) return;
    setHours(defaults.hours);
    setLoggedDate(defaults.loggedDate);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select a signed-up volunteer to log hours for.");
      return;
    }

    const formData = new FormData();
    formData.set("volunteerRoleTypeId", roleTypeId ?? "");
    formData.set("hours", hours);
    formData.set("loggedDate", loggedDate);
    formData.set("notes", notes);

    const person = selectedPerson;
    startTransition(async () => {
      await runAction(() => onSubmit(person.id, formData), {
        success: `${hours} hours logged for ${personDisplayName(person)}.`,
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
          <FieldLabel htmlFor="hours-volunteer">Volunteer</FieldLabel>
          {lockedPerson ? (
            <p className="app-muted rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              {personDisplayName(lockedPerson)}
            </p>
          ) : (
            <PersonPicker
              id="hours-volunteer"
              people={people}
              selected={selectedPerson}
              onSelect={handleSelectPerson}
              onPersonCreated={() => {}}
              allowCreate={false}
              placeholder="Search signed-up volunteers..."
            />
          )}
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="hours-hours">Hours</FieldLabel>
            <Input
              id="hours-hours"
              type="number"
              min="0"
              step="0.25"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="hours-loggedDate">Date</FieldLabel>
            <Input
              id="hours-loggedDate"
              type="date"
              value={loggedDate}
              onChange={(event) => setLoggedDate(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="hours-role-type">Role</FieldLabel>
          <Select
            value={roleTypeId ?? NONE_VALUE}
            onValueChange={(value) =>
              setRoleTypeId(value === NONE_VALUE ? null : value)
            }
          >
            <SelectTrigger id="hours-role-type" className="w-full">
              <SelectValue placeholder="No role">
                {(value: string) =>
                  value === NONE_VALUE
                    ? "No role"
                    : (roleTypes.find((option) => option.id === value)?.name ??
                      "No role")
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
        </Field>

        <Field>
          <FieldLabel htmlFor="hours-notes">Notes</FieldLabel>
          <Textarea
            id="hours-notes"
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
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Log hours"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
