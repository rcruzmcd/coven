"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVolunteerHoursAction,
  listEventOptionsAction,
  type EventOption,
} from "./actions";
import { listRoleTypesAction, type RoleType } from "../roles/actions";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";

const NONE_VALUE = "none";

function getInitialFormState() {
  return {
    eventId: NONE_VALUE,
    volunteerRoleTypeId: NONE_VALUE,
    hours: "",
    loggedDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

export function LogHoursDialog({
  canManage,
  selfPerson,
  triggerLabel = "Log hours",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
}: {
  canManage: boolean;
  selfPerson: PickedPerson | null;
  triggerLabel?: string;
} & ControlledOpenProps) {
  const router = useRouter();
  const lockedToSelf = !canManage && selfPerson !== null;
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    lockedToSelf ? selfPerson : null,
  );
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (!lockedToSelf) {
      listPeopleAction().then((result) => {
        if (!("error" in result)) setPeople(result.data);
      });
    }
    listEventOptionsAction().then((result) => {
      if (!("error" in result)) setEvents(result.data);
    });
    listRoleTypesAction().then((result) => {
      if (!("error" in result)) setRoleTypes(result.data);
    });
  }, [open, lockedToSelf]);

  function update<K extends keyof ReturnType<typeof getInitialFormState>>(
    key: K,
    value: ReturnType<typeof getInitialFormState>[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelectedPerson(lockedToSelf ? selfPerson : null);
      setForm(getInitialFormState());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to log hours for.");
      return;
    }

    const formData = new FormData();
    formData.set("eventId", form.eventId === NONE_VALUE ? "" : form.eventId);
    formData.set(
      "volunteerRoleTypeId",
      form.volunteerRoleTypeId === NONE_VALUE ? "" : form.volunteerRoleTypeId,
    );
    formData.set("hours", form.hours);
    formData.set("loggedDate", form.loggedDate);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await createVolunteerHoursAction(
        selectedPerson.id,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Volunteer hours logged.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          {triggerLabel}
        </Button>
      }
      title="Log volunteer hours"
      description="Record hours contributed, optionally tied to an event."
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
              "Log hours"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          {lockedToSelf && selfPerson ? (
            <ReadOnlyField label="Volunteer" htmlFor="hours-volunteer">
              {selfPerson.name ?? "—"}
            </ReadOnlyField>
          ) : (
            <>
              <FieldLabel htmlFor="log-hours-volunteer" required>
                Volunteer
              </FieldLabel>
              <PersonPicker
                id="log-hours-volunteer"
                required
                people={people}
                selected={selectedPerson}
                onSelect={setSelectedPerson}
                onPersonCreated={(person) =>
                  setPeople((prev) => [...prev, person])
                }
                newPersonRole="is_volunteer"
              />
            </>
          )}
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="hours-hours" required>
              Hours
            </FieldLabel>
            <Input
              id="hours-hours"
              required
              type="number"
              min="0"
              step="0.25"
              value={form.hours}
              onChange={(event) => update("hours", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="hours-loggedDate" required>
              Date
            </FieldLabel>
            <Input
              id="hours-loggedDate"
              required
              type="date"
              value={form.loggedDate}
              onChange={(event) => update("loggedDate", event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="hours-event">Event</FieldLabel>
          <Select
            value={form.eventId}
            onValueChange={(value) => update("eventId", value ?? NONE_VALUE)}
          >
            <SelectTrigger id="hours-event" className="w-full">
              <SelectValue placeholder="No event">
                {(value: string) =>
                  value === NONE_VALUE
                    ? "No event"
                    : (events.find((option) => option.id === value)?.name ??
                      "No event")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No event</SelectItem>
              {events.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="hours-role-type">Role type</FieldLabel>
          <Select
            value={form.volunteerRoleTypeId}
            onValueChange={(value) =>
              update("volunteerRoleTypeId", value ?? NONE_VALUE)
            }
          >
            <SelectTrigger id="hours-role-type" className="w-full">
              <SelectValue placeholder="No role type">
                {(value: string) =>
                  value === NONE_VALUE
                    ? "No role type"
                    : (roleTypes.find((option) => option.id === value)?.name ??
                      "No role type")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No role type</SelectItem>
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
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
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
