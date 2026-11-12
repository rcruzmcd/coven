"use client";

import {
  FormEvent,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventStaffAction,
  listEventStaffAction,
  type EventStaffMember,
} from "./staff-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import { personDisplayName } from "@/lib/format";
import type { TabValue } from "./event-tabs-config";

export function AddStaffForm({
  people,
  onPersonCreated,
  allowCreatePerson = true,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
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
  const [role, setRole] = useState("");
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
    formData.set("role", role);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await onSubmit(selectedPerson.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="staff-member">Staff member</FieldLabel>
          <PersonPicker
            id="staff-member"
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            allowCreate={allowCreatePerson}
            newPersonRole="is_staff"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-role">Role</FieldLabel>
          <Input
            id="staff-role"
            placeholder="e.g. Basecamp Lead, Guide, Photographer"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-notes">Notes</FieldLabel>
          <Textarea
            id="staff-notes"
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
              "Add staff"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function StaffTab({
  eventId,
  mode,
}: {
  eventId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: staff,
    loadError,
    refresh: refreshTabData,
  } = useTabData<EventStaffMember[]>(
    () => listEventStaffAction(eventId),
    [eventId],
  );
  const [isDeleting, startDeleteTransition] = useTransition();

  const refresh = useCallback(() => {
    refreshTabData();
    router.refresh();
  }, [refreshTabData, router]);

  useRegisterTabRefresh<TabValue>("staff", refresh);

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const handleDelete = useCallback(
    (id: string) => {
      startDeleteTransition(async () => {
        await deleteEventStaffAction(id);
        refresh();
      });
    },
    [refresh],
  );

  const columns = useMemo<PortalDataTableColumn<EventStaffMember>[]>(
    () => [
      {
        key: "person",
        label: "Staff member",
        // Sorts on the name the cell shows, placeholder included, rather than
        // on a null the reader never sees.
        sortValue: (member) => personDisplayName(member.person),
        cellClassName: "max-w-xs font-medium",
        render: (member) => (
          <span
            className="block truncate"
            title={member.person?.name ?? undefined}
          >
            {personDisplayName(member.person)}
          </span>
        ),
      },
      {
        key: "role",
        label: "Role",
        sortValue: (member) => member.role,
        cellClassName: "app-muted",
        render: (member) => member.role || "—",
      },
      {
        key: "notes",
        label: "Notes",
        sortValue: (member) => member.notes,
        cellClassName: "app-muted max-w-xs",
        render: (member) => (
          <span className="block truncate" title={member.notes ?? undefined}>
            {member.notes || "—"}
          </span>
        ),
      },
      ...(mode === "edit"
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right",
              render: (member: EventStaffMember) => (
                <ConfirmDeleteButton
                  label="Remove staff member"
                  title={`Remove ${personDisplayName(member.person)} from this event?`}
                  description="This deletes their staff assignment. It can't be undone."
                  confirmLabel="Remove"
                  pending={isDeleting}
                  onConfirm={() => handleDelete(member.id)}
                />
              ),
            } satisfies PortalDataTableColumn<EventStaffMember>,
          ]
        : []),
    ],
    [mode, isDeleting, handleDelete],
  );

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {staff === undefined ? (
        <TabLoadingSkeleton />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff assigned yet"
          description="Assign the first one with + Add staff above."
        />
      ) : (
        <PortalDataTable
          columns={columns}
          rows={staff}
          getRowKey={(member) => member.id}
          // listEventStaffAction returns them by name.
          defaultSort={{ key: "person", dir: "asc" }}
          emptyMessage="No staff to show."
          // The tab is already inside its own card on the phase grid.
          shell="bare"
        />
      )}
    </div>
  );
}
