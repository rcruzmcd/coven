"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { type EventShift } from "../shifts-actions";
import {
  listRoleTypesAction,
  type RoleType,
} from "../../volunteers/roles/actions";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { useEventDateDefaults } from "../event-date-defaults";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";

export const NONE_VALUE = "none";

export function formatShiftRange(shift: EventShift) {
  return `${formatDateTime(shift.starts_at)} – ${formatDateTime(shift.ends_at)}`;
}

export function ShiftForm({
  initialShift,
  roleTypes,
  onSubmit,
  onCancel,
}: {
  initialShift?: EventShift;
  roleTypes: RoleType[];
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initialShift?.label ?? "");
  // A new shift covers the event, so it opens on the event's own start and end
  // -- the common shift is the whole event, and a shorter one is a trim of
  // that rather than two datetimes typed from scratch.
  const eventDates = useEventDateDefaults();
  const [startsAt, setStartsAt] = useState(
    initialShift
      ? utcIsoToDatetimeLocalInBrowser(initialShift.starts_at)
      : eventDates.startsAt,
  );
  const [endsAt, setEndsAt] = useState(
    initialShift
      ? utcIsoToDatetimeLocalInBrowser(initialShift.ends_at)
      : eventDates.endsAt,
  );
  const [targetHeadcount, setTargetHeadcount] = useState(
    initialShift?.target_headcount != null
      ? String(initialShift.target_headcount)
      : "",
  );
  const [notes, setNotes] = useState(initialShift?.notes ?? "");
  const [volunteerRoleTypeId, setVolunteerRoleTypeId] = useState(
    initialShift?.volunteer_role_type_id ?? NONE_VALUE,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("label", label);
    // Converted here, in the browser, so the shift's instants are fixed
    // using the user's own timezone rather than the server's.
    formData.set("startsAt", startsAt ? new Date(startsAt).toISOString() : "");
    formData.set("endsAt", endsAt ? new Date(endsAt).toISOString() : "");
    formData.set("targetHeadcount", targetHeadcount);
    formData.set("notes", notes);
    formData.set(
      "volunteerRoleTypeId",
      volunteerRoleTypeId === NONE_VALUE ? "" : volunteerRoleTypeId,
    );

    startTransition(async () => {
      await runAction(() => onSubmit(formData), {
        // The same form creates and edits; `initialShift` says which.
        success: initialShift
          ? `Shift "${label}" updated.`
          : `Shift "${label}" added.`,
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
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="shift-label" required>
            Duty / location
          </FieldLabel>
          <Input
            id="shift-label"
            required
            placeholder="e.g. Basecamp AM"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="shift-startsAt" required>
              Starts
            </FieldLabel>
            <Input
              id="shift-startsAt"
              required
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="shift-endsAt" required>
              Ends
            </FieldLabel>
            <Input
              id="shift-endsAt"
              required
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="shift-targetHeadcount">
            Target headcount
          </FieldLabel>
          <Input
            id="shift-targetHeadcount"
            type="number"
            min="1"
            step="1"
            placeholder="Optional"
            value={targetHeadcount}
            onChange={(event) => setTargetHeadcount(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="shift-role">Role</FieldLabel>
          <Select
            value={volunteerRoleTypeId}
            onValueChange={(value) =>
              setVolunteerRoleTypeId(value ?? NONE_VALUE)
            }
          >
            <SelectTrigger id="shift-role" className="w-full">
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
          <FieldLabel htmlFor="shift-notes">Notes</FieldLabel>
          <Textarea
            id="shift-notes"
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
            ) : initialShift ? (
              "Save changes"
            ) : (
              "Add shift"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function ShiftsSection({
  shifts,
  shiftHeadcounts,
  mode,
  isDeleting,
  onUpdateShift,
  onDeleteShift,
  fetchRoleTypes = listRoleTypesAction,
}: {
  shifts: EventShift[];
  shiftHeadcounts: Map<string, number>;
  mode: "view" | "edit";
  isDeleting: boolean;
  onUpdateShift: (
    id: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onDeleteShift: (id: string) => void;
  fetchRoleTypes?: typeof listRoleTypesAction;
}) {
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [roleTypesError, setRoleTypesError] = useState<string | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoleTypes().then((result) => {
      if ("error" in result) {
        setRoleTypesError(result.error);
      } else {
        setRoleTypes(result.data);
      }
    });
  }, [fetchRoleTypes]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Shifts</h3>
      {roleTypesError && (
        <Alert variant="destructive">
          <AlertDescription>{roleTypesError}</AlertDescription>
        </Alert>
      )}
      {shifts.length === 0 ? (
        <p className="app-muted text-sm">
          No shifts defined. Volunteers can still be signed up for the whole
          event.
        </p>
      ) : (
        // Not a PortalDataTable: editing a shift swaps its row for a
        // full-width form, and a flat row list has nowhere to put that. It
        // takes the sticky header and leaves the rest.
        <Table stickyHeader="page">
          <TableHeader>
            <TableRow>
              <TableHead>Duty / location</TableHead>
              <TableHead>Time</TableHead>
              <TableHead hideBelow="md">Role</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.map((shift) => {
              const assigned = shiftHeadcounts.get(shift.id) ?? 0;
              const gap =
                shift.target_headcount !== null &&
                assigned < shift.target_headcount;

              if (editingShiftId === shift.id) {
                return (
                  <TableRow key={shift.id}>
                    <TableCell colSpan={5} className="p-0">
                      <div className="p-3">
                        <ShiftForm
                          initialShift={shift}
                          roleTypes={roleTypes}
                          onSubmit={(formData) =>
                            onUpdateShift(shift.id, formData)
                          }
                          onCancel={() => setEditingShiftId(null)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={shift.id}>
                  <TableCell
                    className="max-w-xs truncate font-medium"
                    title={shift.label}
                  >
                    {shift.label}
                  </TableCell>
                  <TableCell className="app-muted">
                    {formatShiftRange(shift)}
                  </TableCell>
                  <TableCell hideBelow="md" className="app-muted">
                    {shift.role_type?.name ?? "—"}
                  </TableCell>
                  <TableCell
                    className={gap ? "text-[var(--destructive)]" : "app-muted"}
                  >
                    {shift.target_headcount !== null
                      ? `${assigned} / ${shift.target_headcount}`
                      : assigned}
                    {gap ? " — gap" : ""}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {mode === "edit" && (
                      <>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Edit shift"
                                onClick={() => setEditingShiftId(shift.id)}
                              />
                            }
                          >
                            <Pencil />
                          </TooltipTrigger>
                          <TooltipContent>Edit shift</TooltipContent>
                        </Tooltip>
                        <ConfirmDeleteButton
                          label="Remove shift"
                          title={`Remove the "${shift.label}" shift?`}
                          description="This deletes the shift and unassigns every volunteer signed up for it. It can't be undone."
                          confirmLabel="Remove"
                          pending={isDeleting}
                          onConfirm={() => onDeleteShift(shift.id)}
                        />
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
