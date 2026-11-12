"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAttendanceAction } from "./actions";
import type { EventRow } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { StatTile } from "../home/stat-tile";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";

/**
 * Check-in figures shown beside the typed headcount, as reference.
 *
 * The headcount stays the authoritative participant number — these are here so
 * whoever types it can see what the door already recorded, and so the Impact
 * card's computed participation figures are traceable to something on screen.
 */
function CheckInReference({ derived }: { derived: EventImpactDerived | null }) {
  if (!derived) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">From check-ins</h4>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Checked in" value={derived.checkedIn} />
        <StatTile label="First-time" value={derived.firstTimeParticipants} />
        <StatTile label="Recurring" value={derived.recurringParticipants} />
      </div>
    </div>
  );
}

function AttendanceForm({
  event,
  onSaved,
  onCancel,
}: {
  event: EventRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [count, setCount] = useState(event.attendance_count?.toString() ?? "");
  const [notes, setNotes] = useState(event.attendance_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("attendanceCount", count);
    formData.set("attendanceNotes", notes);

    startTransition(async () => {
      await runAction(() => updateEventAttendanceAction(event.id, formData), {
        success: "Attendance saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
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
          <FieldLabel htmlFor="attendance-count">
            Attendance headcount
          </FieldLabel>
          <Input
            id="attendance-count"
            type="number"
            min={0}
            step={1}
            placeholder="e.g. 120"
            value={count}
            onChange={(changeEvent) => setCount(changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="attendance-notes">Notes</FieldLabel>
          <Textarea
            id="attendance-notes"
            placeholder="How attendance was counted, notable turnout details, etc."
            value={notes}
            onChange={(changeEvent) => setNotes(changeEvent.target.value)}
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
              "Save attendance"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AttendanceTab({
  event,
  mode,
  derived,
  onExitEdit,
}: {
  event: EventRow;
  mode: "view" | "edit";
  derived: EventImpactDerived | undefined;
  onExitEdit: () => void;
}) {
  const hasAttendance =
    event.attendance_count !== null || Boolean(event.attendance_notes);

  if (mode === "edit") {
    return (
      <div className="flex flex-col gap-6">
        <CheckInReference derived={derived ?? null} />
        <AttendanceForm
          event={event}
          onSaved={onExitEdit}
          onCancel={onExitEdit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {hasAttendance ? (
        <FieldGroup>
          <ReadOnlyField
            label="Attendance headcount"
            htmlFor="attendance-count"
          >
            {event.attendance_count ?? "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Notes" htmlFor="attendance-notes">
            {event.attendance_notes || "—"}
          </ReadOnlyField>
        </FieldGroup>
      ) : (
        <EmptyState
          title="No attendance recorded yet"
          description="Use Edit attendance (the pencil above) to record the headcount and notes after the event."
        />
      )}
      <CheckInReference derived={derived ?? null} />
    </div>
  );
}
