"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateGrantAction, type Grant } from "./grants-actions";
import {
  GrantFormFields,
  GRANT_STATUS_LABELS,
  packGrantFormData,
  type GrantFormState,
} from "./grant-form-fields";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  formatCalendarDate,
  formatCurrency,
  personDisplayName,
} from "@/lib/format";

function formStateFor(grant: Grant): GrantFormState {
  return {
    funderName: grant.funder_name,
    amount: grant.amount === null ? "" : String(grant.amount),
    applicationDeadline: grant.application_deadline,
    status: grant.status,
    notes: grant.notes ?? "",
  };
}

function isDirty(
  form: GrantFormState,
  owner: PickedPerson | null,
  grant: Grant,
) {
  const baseline = formStateFor(grant);
  return (
    form.funderName !== baseline.funderName ||
    form.amount !== baseline.amount ||
    form.applicationDeadline !== baseline.applicationDeadline ||
    form.status !== baseline.status ||
    form.notes !== baseline.notes ||
    (owner?.id ?? null) !== (grant.owner?.id ?? null)
  );
}

export function EditGrantModal({
  grant,
  people,
}: {
  grant: Grant;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [owner, setOwner] = useState<PickedPerson | null>(grant.owner);
  const [form, setForm] = useState<GrantFormState>(() => formStateFor(grant));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-grant-form-${grant.id}`;
  const dirty = isDirty(form, owner, grant);

  function update<K extends keyof GrantFormState>(
    key: K,
    value: GrantFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(grant));
    setOwner(grant.owner);
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
      const result = await updateGrantAction(
        grant.id,
        owner?.id ?? null,
        packGrantFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Grant saved.");
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
                    aria-label="View grant"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View grant</TooltipContent>
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
                {mode === "edit" ? "Edit grant" : "Grant"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this grant's details."
                  : "View this grant's details."}
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
                      aria-label="Edit grant"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit grant</TooltipContent>
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
                <ReadOnlyField label="Funder" htmlFor="edit-grant-funder-name">
                  {grant.funder_name}
                </ReadOnlyField>
                <ReadOnlyField label="Amount" htmlFor="edit-grant-amount">
                  {formatCurrency(grant.amount)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Application deadline"
                  htmlFor="edit-grant-application-deadline"
                >
                  {formatCalendarDate(grant.application_deadline)}
                </ReadOnlyField>
                <ReadOnlyField label="Status" htmlFor="edit-grant-status">
                  {GRANT_STATUS_LABELS[grant.status]}
                </ReadOnlyField>
                <ReadOnlyField label="Owner" htmlFor="edit-grant-owner">
                  {personDisplayName(grant.owner)}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-grant-notes">
                  <MarkdownText fallback="—">{grant.notes}</MarkdownText>
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
                  <GrantFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-grant"
                  />

                  <Field>
                    <FieldLabel htmlFor="edit-grant-owner">Owner</FieldLabel>
                    <PersonPicker
                      id="edit-grant-owner"
                      people={availablePeople}
                      selected={owner}
                      onSelect={setOwner}
                      onPersonCreated={handlePersonCreated}
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
              You have unsaved changes to this grant. Leaving now will discard
              them.
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
