"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  updateVolunteerHoursAction,
  listEventOptionsAction,
  type EventOption,
  type VolunteerHoursEntry,
} from "./actions";
import { listRoleTypesAction, type RoleType } from "../roles/actions";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { formatCalendarDate, personDisplayName } from "@/lib/format";

const NONE_VALUE = "none";
type FormState = {
  eventId: string;
  volunteerRoleTypeId: string;
  hours: string;
  loggedDate: string;
  notes: string;
};

function formStateFor(entry: VolunteerHoursEntry): FormState {
  return {
    eventId: entry.event?.id ?? NONE_VALUE,
    volunteerRoleTypeId: entry.volunteer_role_type?.id ?? NONE_VALUE,
    hours: String(entry.hours),
    loggedDate: entry.logged_date,
    notes: entry.notes ?? "",
  };
}

function isDirty(form: FormState, entry: VolunteerHoursEntry) {
  const baseline = formStateFor(entry);
  return (
    form.eventId !== baseline.eventId ||
    form.volunteerRoleTypeId !== baseline.volunteerRoleTypeId ||
    form.hours !== baseline.hours ||
    form.loggedDate !== baseline.loggedDate ||
    form.notes !== baseline.notes
  );
}

function personFor(entry: VolunteerHoursEntry): PickedPerson {
  return {
    id: entry.person.id,
    name: entry.person.name,
    email: null,
    phone: null,
  };
}

export function VolunteerHoursDetailsSheet({
  entry,
  canManage,
}: {
  entry: VolunteerHoursEntry;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(entry));
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    () => personFor(entry),
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-hours-form-${entry.id}`;
  const dirty = isDirty(form, entry) || selectedPerson?.id !== entry.person.id;

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
    listEventOptionsAction().then((result) => {
      if (!("error" in result)) setEvents(result.data);
    });
    listRoleTypesAction().then((result) => {
      if (!("error" in result)) setRoleTypes(result.data);
    });
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(entry));
      setSelectedPerson(personFor(entry));
      setError(null);
      setMode("view");
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(formStateFor(entry));
    setSelectedPerson(personFor(entry));
    setError(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
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
      const result = await updateVolunteerHoursAction(
        entry.id,
        selectedPerson.id,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Volunteer hours saved.");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View hours for ${entry.person?.name ?? "volunteer"}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View hours for ${entry.person?.name ?? "volunteer"}`}</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit" ? "Edit hours" : "Logged hours"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this logged hours entry."
                  : "View this logged hours entry."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit hours entry"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit hours entry</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={requestExitEditMode}
                >
                  View
                </Button>
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Volunteer" htmlFor="hours-view-volunteer">
                  {personDisplayName(entry.person)}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="hours-view-event">
                  {entry.event?.name ?? "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Role type" htmlFor="hours-view-role-type">
                  {entry.volunteer_role_type?.name ?? "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Hours" htmlFor="hours-view-hours">
                  {entry.hours}
                </ReadOnlyField>
                <ReadOnlyField label="Date" htmlFor="hours-view-date">
                  {formatCalendarDate(entry.logged_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="hours-view-notes">
                  {entry.notes || "—"}
                </ReadOnlyField>
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <RequiredFieldsNote />
                  <Field>
                    <FieldLabel
                      htmlFor="volunteer-hours-details-volunteer"
                      required
                    >
                      Volunteer
                    </FieldLabel>
                    <PersonPicker
                      id="volunteer-hours-details-volunteer"
                      required
                      people={people}
                      selected={selectedPerson}
                      onSelect={setSelectedPerson}
                      onPersonCreated={(person) =>
                        setPeople((prev) => [...prev, person])
                      }
                      newPersonRole="is_volunteer"
                    />
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="hours-edit-hours" required>
                        Hours
                      </FieldLabel>
                      <Input
                        id="hours-edit-hours"
                        required
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.hours}
                        onChange={(event) =>
                          update("hours", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="hours-edit-loggedDate">
                        Date
                      </FieldLabel>
                      <Input
                        id="hours-edit-loggedDate"
                        type="date"
                        value={form.loggedDate}
                        onChange={(event) =>
                          update("loggedDate", event.target.value)
                        }
                      />
                    </Field>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="hours-edit-event">Event</FieldLabel>
                    <Select
                      value={form.eventId}
                      onValueChange={(value) =>
                        update("eventId", value ?? NONE_VALUE)
                      }
                    >
                      <SelectTrigger id="hours-edit-event" className="w-full">
                        <SelectValue placeholder="No event">
                          {(value: string) =>
                            value === NONE_VALUE
                              ? "No event"
                              : (events.find((option) => option.id === value)
                                  ?.name ?? "No event")
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
                    <FieldLabel htmlFor="hours-edit-role-type">
                      Role type
                    </FieldLabel>
                    <Select
                      value={form.volunteerRoleTypeId}
                      onValueChange={(value) =>
                        update("volunteerRoleTypeId", value ?? NONE_VALUE)
                      }
                    >
                      <SelectTrigger
                        id="hours-edit-role-type"
                        className="w-full"
                      >
                        <SelectValue placeholder="No role type">
                          {(value: string) =>
                            value === NONE_VALUE
                              ? "No role type"
                              : (roleTypes.find((option) => option.id === value)
                                  ?.name ?? "No role type")
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
                    <FieldLabel htmlFor="hours-edit-notes">Notes</FieldLabel>
                    <Textarea
                      id="hours-edit-notes"
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
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter>
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this hours entry. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
