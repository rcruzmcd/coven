"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  updatePartnershipOpportunityAction,
  type PartnershipOpportunity,
} from "./partnerships-actions";
import {
  PartnershipOpportunityFormFields,
  PARTNERSHIP_STAGE_LABELS,
  packPartnershipOpportunityFormData,
  type PartnershipOpportunityFormState,
} from "./partnership-opportunity-form-fields";
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
import { formatCalendarDate, personDisplayName } from "@/lib/format";

function formStateFor(
  opportunity: PartnershipOpportunity,
): PartnershipOpportunityFormState {
  return {
    stage: opportunity.stage,
    nextStepDate: opportunity.next_step_date ?? "",
    notes: opportunity.notes ?? "",
  };
}

function isDirty(
  form: PartnershipOpportunityFormState,
  organization: PickedPerson | null,
  owner: PickedPerson | null,
  opportunity: PartnershipOpportunity,
) {
  const baseline = formStateFor(opportunity);
  return (
    form.stage !== baseline.stage ||
    form.nextStepDate !== baseline.nextStepDate ||
    form.notes !== baseline.notes ||
    (organization?.id ?? null) !== (opportunity.organization?.id ?? null) ||
    (owner?.id ?? null) !== (opportunity.owner?.id ?? null)
  );
}

export function EditPartnershipModal({
  opportunity,
  people,
}: {
  opportunity: PartnershipOpportunity;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [organization, setOrganization] = useState<PickedPerson | null>(
    opportunity.organization,
  );
  const [owner, setOwner] = useState<PickedPerson | null>(opportunity.owner);
  const [form, setForm] = useState<PartnershipOpportunityFormState>(() =>
    formStateFor(opportunity),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-partnership-form-${opportunity.id}`;
  const dirty = isDirty(form, organization, owner, opportunity);

  function update<K extends keyof PartnershipOpportunityFormState>(
    key: K,
    value: PartnershipOpportunityFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(opportunity));
    setOrganization(opportunity.organization);
    setOwner(opportunity.owner);
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
      const result = await updatePartnershipOpportunityAction(
        opportunity.id,
        organization?.id ?? null,
        owner?.id ?? null,
        packPartnershipOpportunityFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Partnership saved.");
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
                    aria-label="View partnership opportunity"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View opportunity</TooltipContent>
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
                {mode === "edit"
                  ? "Edit partnership opportunity"
                  : "Partnership opportunity"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this opportunity's details."
                  : "View this opportunity's details."}
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
                      aria-label="Edit partnership opportunity"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit opportunity</TooltipContent>
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
                <ReadOnlyField
                  label="Organization"
                  htmlFor="edit-partnership-organization"
                >
                  {opportunity.organization.name || "—"}
                  {opportunity.organization.email
                    ? ` · ${opportunity.organization.email}`
                    : ""}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Internal owner"
                  htmlFor="edit-partnership-owner"
                >
                  {personDisplayName(opportunity.owner)}
                </ReadOnlyField>
                <ReadOnlyField label="Stage" htmlFor="edit-partnership-stage">
                  {PARTNERSHIP_STAGE_LABELS[opportunity.stage]}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Next step date"
                  htmlFor="edit-partnership-next-step-date"
                >
                  {formatCalendarDate(opportunity.next_step_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-partnership-notes">
                  <span className="whitespace-pre-wrap">
                    {opportunity.notes || "—"}
                  </span>
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
                  <Field>
                    <FieldLabel htmlFor="edit-partnership-partner-organization">
                      Partner organization
                    </FieldLabel>
                    <PersonPicker
                      id="edit-partnership-partner-organization"
                      people={availablePeople}
                      selected={organization}
                      onSelect={setOrganization}
                      onPersonCreated={handlePersonCreated}
                      newPersonRole="is_partner"
                    />
                  </Field>

                  <PartnershipOpportunityFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-partnership"
                  />

                  <Field>
                    <FieldLabel htmlFor="edit-partnership-internal-owner">
                      Internal owner
                    </FieldLabel>
                    <PersonPicker
                      id="edit-partnership-internal-owner"
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
              You have unsaved changes to this opportunity. Leaving now will
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
