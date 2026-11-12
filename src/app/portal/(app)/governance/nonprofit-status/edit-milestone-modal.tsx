"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react";
import {
  deleteMilestoneAction,
  updateMilestoneAction,
  type Milestone,
} from "./nonprofit-status-actions";
import {
  NonprofitStatusFormFields,
  packMilestoneFormData,
  type MilestoneFormState,
} from "./nonprofit-status-form-fields";
import { MilestoneStatusBadge } from "./nonprofit-status-badges";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
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
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
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

function formStateFor(milestone: Milestone): MilestoneFormState {
  return {
    description: milestone.description,
    phase: milestone.phase,
    status: milestone.status,
    dueDate: milestone.due_date ?? "",
    notes: milestone.notes ?? "",
  };
}

function isDirty(
  form: MilestoneFormState,
  owner: PickedPerson | null,
  milestone: Milestone,
) {
  const baseline = formStateFor(milestone);
  return (
    form.description !== baseline.description ||
    form.phase !== baseline.phase ||
    form.status !== baseline.status ||
    form.dueDate !== baseline.dueDate ||
    form.notes !== baseline.notes ||
    (owner?.id ?? null) !== (milestone.owner?.id ?? null)
  );
}

export function EditMilestoneModal({
  milestone,
  people,
  existingPhases,
}: {
  milestone: Milestone;
  people: PersonListItem[];
  existingPhases: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(
    milestone.owner,
  );
  const [form, setForm] = useState<MilestoneFormState>(() =>
    formStateFor(milestone),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const formId = `edit-milestone-form-${milestone.id}`;
  const dirty = isDirty(form, selectedOwner, milestone);

  function update<K extends keyof MilestoneFormState>(
    key: K,
    value: MilestoneFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(milestone));
    setSelectedOwner(milestone.owner);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      resetToBaseline();
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
    resetToBaseline();
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateMilestoneAction(
        milestone.id,
        selectedOwner?.id ?? null,
        packMilestoneFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Milestone deleted.");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMilestoneAction(milestone.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDeleteDialogOpen(false);
      setOpen(false);
      toast.success("Milestone deleted.");
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
                    aria-label="View milestone"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View milestone</TooltipContent>
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
                {mode === "edit" ? "Edit milestone" : "Milestone"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this milestone's details."
                  : "View this milestone's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit milestone"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit milestone</TooltipContent>
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
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Phase" htmlFor="edit-milestone-phase">
                  {milestone.phase}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="edit-milestone-description"
                >
                  <span className="whitespace-pre-wrap">
                    {milestone.description}
                  </span>
                </ReadOnlyField>
                <ReadOnlyField label="Owner" htmlFor="edit-milestone-owner">
                  {personDisplayName(milestone.owner)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Due date"
                  htmlFor="edit-milestone-due-date"
                >
                  {formatCalendarDate(milestone.due_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Status" htmlFor="edit-milestone-status">
                  <MilestoneStatusBadge status={milestone.status} />
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-milestone-notes">
                  <span className="whitespace-pre-wrap">
                    {milestone.notes || "—"}
                  </span>
                </ReadOnlyField>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
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
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="edit-milestone-owner"
                      className="text-sm font-medium"
                    >
                      Owner
                    </label>
                    <PersonPicker
                      id="edit-milestone-owner"
                      people={availablePeople}
                      selected={selectedOwner}
                      onSelect={setSelectedOwner}
                      onPersonCreated={handlePersonCreated}
                    />
                  </div>

                  <NonprofitStatusFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-milestone"
                    existingPhases={existingPhases}
                  />

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

          {mode === "view" && (
            <SheetFooter>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 /> Delete
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
              You have unsaved changes to this milestone. Leaving now will
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
