"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createResolutionAction } from "./resolutions-actions";
import {
  ResolutionFormFields,
  emptyResolutionForm,
  packResolutionFormData,
  type ResolutionFormState,
} from "./resolution-form-fields";
import type { ResolutionMeetingOption } from "./resolutions-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { formatInstantDate } from "@/lib/format";

const NO_MEETING = "none";

function meetingLabel(meeting: ResolutionMeetingOption) {
  return `${formatInstantDate(meeting.meeting_date)} — ${meeting.meeting_type}`;
}

export function NewResolutionDialog({
  people,
  meetings,
}: {
  people: PersonListItem[];
  meetings: ResolutionMeetingOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(null);
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    null,
  );
  const [meetingId, setMeetingId] = useState<string>(NO_MEETING);
  const [form, setForm] = useState<ResolutionFormState>(() =>
    emptyResolutionForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedMover(null);
      setSelectedSeconder(null);
      setMeetingId(NO_MEETING);
      setForm(emptyResolutionForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    startTransition(async () => {
      const result = await createResolutionAction(
        meetingId === NO_MEETING ? null : meetingId,
        selectedMover.id,
        selectedSeconder?.id ?? null,
        packResolutionFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Resolution added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add resolution
        </Button>
      }
      title="Add resolution"
      description="Record a formal board motion."
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
              "Add resolution"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="resolution-meeting">Meeting</FieldLabel>
          <Select
            value={meetingId}
            onValueChange={(value) => setMeetingId(value ?? NO_MEETING)}
          >
            <SelectTrigger id="resolution-meeting">
              <SelectValue placeholder="No meeting" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MEETING}>No meeting</SelectItem>
              {meetings.map((meeting) => (
                <SelectItem key={meeting.id} value={meeting.id}>
                  {meetingLabel(meeting)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="new-resolution-mover">Mover</FieldLabel>
          <PersonPicker
            id="new-resolution-mover"
            people={availablePeople}
            selected={selectedMover}
            onSelect={setSelectedMover}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-resolution-seconder">Seconder</FieldLabel>
          <PersonPicker
            id="new-resolution-seconder"
            people={availablePeople}
            selected={selectedSeconder}
            onSelect={setSelectedSeconder}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <ResolutionFormFields
          form={form}
          update={update}
          idPrefix="new-resolution"
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
