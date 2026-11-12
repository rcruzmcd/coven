"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMeetingAttendeeAction,
  deleteMeetingAttendeeAction,
  listMeetingAttendeesAction,
  type MeetingAttendee,
} from "./attendees-actions";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

function AddAttendeeForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    personId: string,
    attended: boolean,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [attended, setAttended] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to add.");
      return;
    }

    const person = selectedPerson;
    startTransition(async () => {
      await runAction(() => onSubmit(person.id, attended), {
        success: `${personDisplayName(person)} added to the attendee list.`,
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
          <FieldLabel htmlFor="attendees-person">Person</FieldLabel>
          <PersonPicker
            id="attendees-person"
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={attended}
              onCheckedChange={(checked) => setAttended(checked === true)}
            />
            Attended
          </label>
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
              "Add attendee"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AttendeesTab({
  meetingId,
  mode,
}: {
  meetingId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: attendees,
    loadError,
    refresh: refreshAttendees,
  } = useTabData<MeetingAttendee[]>(
    () => listMeetingAttendeesAction(meetingId),
    [meetingId],
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowAdd(false));

  useEffect(() => {
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [meetingId]);

  function refresh() {
    refreshAttendees();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteMeetingAttendeeAction(id), {
        success: "Attendee removed.",
        error: "Could not remove the attendee. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  // Built on every render rather than memoized: the row action closes over
  // `handleDelete`, which is redefined each render anyway, so a `useMemo` here
  // would only look stable. The lists in a meeting are a handful of rows.
  const columns: PortalDataTableColumn<MeetingAttendee>[] = [
    {
      key: "person",
      label: "Person",
      sortValue: (attendee) => personDisplayName(attendee.person),
      cellClassName: "max-w-xs truncate font-medium",
      render: (attendee) => (
        <span title={attendee.person?.name ?? undefined}>
          {personDisplayName(attendee.person)}
        </span>
      ),
    },
    {
      key: "attended",
      // Sorted on the Yes/No the cell shows rather than the boolean behind
      // it, so ascending reads the way the column does.
      label: "Attended",
      sortValue: (attendee) => (attendee.attended ? "Yes" : "No"),
      cellClassName: "app-muted",
      render: (attendee) => (attendee.attended ? "Yes" : "No"),
    },
    // Actions only while there is something in them: in view mode the column
    // would be an empty strip with a name only a screen reader hears.
    ...(mode === "edit"
      ? [
          {
            key: "actions",
            label: "Actions",
            srOnlyLabel: true,
            headClassName: "w-px",
            cellClassName: "text-right",
            render: (attendee: MeetingAttendee) => (
              <ConfirmDeleteButton
                label="Remove attendee"
                title={`Remove ${personDisplayName(attendee.person)} from the attendance record?`}
                description="Attendance is what establishes quorum for this meeting's decisions. It can't be undone."
                confirmLabel="Remove"
                pending={isDeleting}
                onConfirm={() => handleDelete(attendee.id)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {attendees === undefined ? (
        <TabLoadingSkeleton />
      ) : attendees.length === 0 && !showAdd ? (
        <EmptyState
          title="No attendees recorded yet"
          description={
            mode === "edit"
              ? "Record who was at this meeting with Add attendee below."
              : "Attendees appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        // `bare`: the section card around this tab is the surface already.
        // No `defaultSort` -- the list arrives in the order the server sent
        // it, and the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={attendees}
          getRowKey={(attendee) => attendee.id}
          emptyMessage="No attendees recorded yet."
          shell="bare"
        />
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddAttendeeForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={async (personId, attended) => {
              const result = await createMeetingAttendeeAction(
                meetingId,
                personId,
                attended,
              );
              if (!("error" in result)) refresh();
              return result;
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add attendee
            </Button>
          </div>
        ))}
    </div>
  );
}
