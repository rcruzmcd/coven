"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateMeetingAction } from "../actions";
import {
  MeetingStatusBadge,
  MeetingTypeBadge,
  type MeetingRow,
} from "../meeting-badges";
import {
  MeetingEventSelect,
  useMeetingEventOptions,
} from "../meeting-event-select";
import { PersonPicker, type PickedPerson } from "../../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatDateTime,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

const MEETING_TYPES = [
  { value: "board", label: "Board" },
  { value: "committee", label: "Committee" },
  { value: "annual", label: "Annual" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function formStateFor(meeting: MeetingRow) {
  return {
    meetingDate: utcIsoToDatetimeLocalInBrowser(meeting.meeting_date),
    meetingType: meeting.meeting_type,
    status: meeting.status,
    location: meeting.location ?? "",
    notes: meeting.notes ?? "",
    facilitator: meeting.facilitator as PickedPerson | null,
    notetaker: meeting.notetaker as PickedPerson | null,
    eventId: meeting.event_id ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

// Every card submits the FULL meeting form (seeded from the current meeting,
// with only that card's fields edited) because updateMeetingAction replaces
// the whole row — there is no per-field patch action.
function buildFormData(form: FormState) {
  const formData = new FormData();
  // Convert here, in the browser, so the meeting's timezone-aware instant
  // is fixed using the user's own timezone rather than the server's.
  formData.set("meetingDate", new Date(form.meetingDate).toISOString());
  formData.set("meetingType", form.meetingType);
  formData.set("status", form.status);
  formData.set("location", form.location);
  formData.set("notes", form.notes);
  formData.set("facilitatorPersonId", form.facilitator?.id ?? "");
  formData.set("notetakerPersonId", form.notetaker?.id ?? "");
  formData.set("eventId", form.eventId);
  return formData;
}

// `subject` names the card in its own receipt -- "Meeting details saved."
// reads as a confirmation where a bare "Saved." reads as noise.
function useMeetingCardForm(meeting: MeetingRow, subject: string) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(meeting));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEditing() {
    // Re-seed from the meeting on every edit: a save + router.refresh() may
    // have replaced the `meeting` prop since this component mounted.
    setForm(formStateFor(meeting));
    setError(null);
    setMode("edit");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      await runAction(
        () => updateMeetingAction(meeting.id, buildFormData(form)),
        {
          success: `${subject} saved.`,
          onError: setError,
          onSuccess: () => {
            setMode("view");
            router.refresh();
          },
        },
      );
    });
  }

  return {
    mode,
    form,
    error,
    isPending,
    update,
    startEditing,
    cancel,
    handleSubmit,
  };
}

function EditableCard({
  title,
  editLabel,
  canEdit,
  editing,
  onEdit,
  error,
  children,
}: {
  title: string;
  editLabel: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        {canEdit && !editing && (
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={editLabel}
                    onClick={onEdit}
                  />
                }
              >
                <Pencil />
              </TooltipTrigger>
              <TooltipContent>{editLabel}</TooltipContent>
            </Tooltip>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function CardFormActions({
  isPending,
  onCancel,
}: {
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isPending} focusableWhenDisabled>
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

function MeetingDetailsCard({
  meeting,
  canManage,
}: {
  meeting: MeetingRow;
  canManage: boolean;
}) {
  const card = useMeetingCardForm(meeting, "Meeting details");
  const { form, update } = card;
  const events = useMeetingEventOptions(card.mode === "edit");

  return (
    <EditableCard
      title="Meeting details"
      editLabel="Edit meeting details"
      canEdit={canManage}
      editing={card.mode === "edit"}
      onEdit={card.startEditing}
      error={card.error}
    >
      {card.mode === "view" ? (
        <FieldGroup>
          <ReadOnlyField label="Date & time" htmlFor="meeting-date-view">
            {formatDateTime(meeting.meeting_date)}
          </ReadOnlyField>
          <ReadOnlyField label="Type" htmlFor="meeting-type-view">
            <MeetingTypeBadge type={meeting.meeting_type} />
          </ReadOnlyField>
          <ReadOnlyField label="Status" htmlFor="meeting-status-view">
            <MeetingStatusBadge status={meeting.status} />
          </ReadOnlyField>
          <ReadOnlyField label="Location" htmlFor="meeting-location-view">
            {meeting.location || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Event" htmlFor="meeting-event-view">
            {meeting.event ? (
              <Link
                href={`/portal/events/${meeting.event.id}`}
                className="underline underline-offset-2"
              >
                {meeting.event.name} ·{" "}
                {formatInstantDate(meeting.event.starts_at)}
              </Link>
            ) : (
              "—"
            )}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            <Field>
              <FieldLabel htmlFor="meeting-date" required>
                Date &amp; time
              </FieldLabel>
              <Input
                id="meeting-date"
                type="datetime-local"
                required
                value={form.meetingDate}
                onChange={(event) => update("meetingDate", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="meeting-type">Type</FieldLabel>
                <Select
                  value={form.meetingType}
                  onValueChange={(value) =>
                    update("meetingType", value ?? "board")
                  }
                >
                  <SelectTrigger id="meeting-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="meeting-status">Status</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    update("status", value ?? "scheduled")
                  }
                >
                  <SelectTrigger id="meeting-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="meeting-location">Location</FieldLabel>
              <Input
                id="meeting-location"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
              />
            </Field>

            <MeetingEventSelect
              id="meeting-event"
              events={events}
              value={form.eventId}
              onChange={(eventId) => update("eventId", eventId)}
            />
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}

function PeopleNotesCard({
  meeting,
  canManage,
}: {
  meeting: MeetingRow;
  canManage: boolean;
}) {
  const card = useMeetingCardForm(meeting, "People & notes");
  const { form, update } = card;
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const editing = card.mode === "edit";

  useEffect(() => {
    if (!editing) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [editing]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  return (
    <EditableCard
      title="People & notes"
      editLabel="Edit people & notes"
      canEdit={canManage}
      editing={editing}
      onEdit={card.startEditing}
      error={card.error}
    >
      {card.mode === "view" ? (
        <FieldGroup>
          <ReadOnlyField label="Facilitator" htmlFor="meeting-facilitator-view">
            {personDisplayName(meeting.facilitator)}
          </ReadOnlyField>
          <ReadOnlyField label="Notes-taker" htmlFor="meeting-notetaker-view">
            {personDisplayName(meeting.notetaker)}
          </ReadOnlyField>
          <ReadOnlyField label="Notes" htmlFor="meeting-notes-view">
            {meeting.notes || "—"}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <form onSubmit={card.handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="meeting-facilitator">Facilitator</FieldLabel>
              <PersonPicker
                id="meeting-facilitator"
                people={people}
                selected={form.facilitator}
                onSelect={(person) => update("facilitator", person)}
                onPersonCreated={handlePersonCreated}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meeting-notes-taker">Notes-taker</FieldLabel>
              <PersonPicker
                id="meeting-notes-taker"
                people={people}
                selected={form.notetaker}
                onSelect={(person) => update("notetaker", person)}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="meeting-notes">Notes</FieldLabel>
              <Textarea
                id="meeting-notes"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </Field>
          </FieldGroup>

          <CardFormActions isPending={card.isPending} onCancel={card.cancel} />
        </form>
      )}
    </EditableCard>
  );
}

export function MeetingDetailsCards({
  meeting,
  canManage,
}: {
  meeting: MeetingRow;
  canManage: boolean;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <MeetingDetailsCard meeting={meeting} canManage={canManage} />
      <PeopleNotesCard meeting={meeting} canManage={canManage} />
    </div>
  );
}
