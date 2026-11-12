"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Check, Eye, Pencil, X } from "lucide-react";
import {
  approveReimbursementAction,
  markReimbursementPaidAction,
  rejectReimbursementAction,
  updateReimbursementAction,
} from "./actions";
import { ReimbursementStatusBadge } from "./reimbursement-badges";
import {
  ReimbursementFormFields,
  packReimbursementFormData,
  type ReimbursementFormState,
} from "./reimbursement-form-fields";
import {
  formatAmount,
  getReimbursementNextStepMessage,
  isSelfApprovalEligible,
  type EventOption,
  type ReimbursementApprovalContext,
  type ReimbursementRow,
} from "./reimbursements-shared";
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
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { DocumentPreview } from "@/components/portal/document-field";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  formatDateTime,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";

function formStateFor(reimbursement: ReimbursementRow): ReimbursementFormState {
  return {
    eventId: reimbursement.event_id ?? "",
    description: reimbursement.description,
    amount: String(reimbursement.amount),
    currency: reimbursement.currency,
    receiptUrl: reimbursement.receipt_url ?? "",
    receiptPath: reimbursement.receipt_path ?? "",
    notes: reimbursement.notes ?? "",
  };
}

function personFor(reimbursement: ReimbursementRow): PickedPerson {
  return {
    id: reimbursement.person_id,
    name: reimbursement.people?.name ?? null,
    email: reimbursement.people?.email ?? null,
    phone: null,
  };
}

function isDirty(
  form: ReimbursementFormState,
  person: PickedPerson | null,
  reimbursement: ReimbursementRow,
) {
  const baseline = formStateFor(reimbursement);
  const formChanged = (
    Object.keys(baseline) as (keyof ReimbursementFormState)[]
  ).some((key) => form[key] !== baseline[key]);
  return formChanged || person?.id !== reimbursement.person_id;
}

export function EditReimbursementModal({
  reimbursement,
  people,
  events,
  approvalContext,
}: {
  reimbursement: ReimbursementRow;
  people: PersonListItem[];
  events: EventOption[];
  approvalContext: ReimbursementApprovalContext;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<ReimbursementFormState>(() =>
    formStateFor(reimbursement),
  );
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    () => personFor(reimbursement),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const formId = `edit-reimbursement-form-${reimbursement.id}`;
  const dirty = isDirty(form, selectedPerson, reimbursement);

  const isSubmitter =
    approvalContext.userId !== null &&
    approvalContext.userId === reimbursement.submitted_by;
  const canSelfApproveThis =
    approvalContext.canSelfApprove &&
    isSubmitter &&
    approvalContext.threshold !== null &&
    isSelfApprovalEligible(reimbursement.amount, approvalContext.threshold);
  const canApproveOrRejectThis = approvalContext.canApprove && !isSubmitter;
  const canApprove =
    reimbursement.status === "submitted" &&
    (canApproveOrRejectThis || canSelfApproveThis);
  const canReject =
    reimbursement.status === "submitted" && canApproveOrRejectThis;
  const canMarkPaid =
    reimbursement.status === "approved" && approvalContext.canMarkPaid;
  const canEdit = reimbursement.status === "submitted";

  function update<K extends keyof ReimbursementFormState>(
    key: K,
    value: ReimbursementFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(reimbursement));
    setAvailablePeople(people);
    setSelectedPerson(personFor(reimbursement));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
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

    if (!selectedPerson) {
      setError("Select or create who is requesting reimbursement.");
      return;
    }

    startTransition(async () => {
      const result = await updateReimbursementAction(
        reimbursement.id,
        packReimbursementFormData(form, selectedPerson.id),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Reimbursement marked paid.");
      router.refresh();
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveReimbursementAction(reimbursement.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Reimbursement approved.");
      router.refresh();
    });
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await rejectReimbursementAction(
        reimbursement.id,
        rejectReason,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRejectDialogOpen(false);
      setRejectReason("");
      toast.success("Reimbursement rejected.");
      router.refresh();
    });
  }

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      const result = await markReimbursementPaidAction(reimbursement.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Reimbursement marked paid.");
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
                    aria-label="View reimbursement"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View reimbursement</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false} size="lg">
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
                {mode === "edit" ? "Edit reimbursement" : "Reimbursement"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update the details for this reimbursement."
                  : "View this reimbursement's details."}
              </SheetDescription>
            </div>
            {mode === "view" && canEdit ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit reimbursement"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit reimbursement</TooltipContent>
              </Tooltip>
            ) : mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            ) : null}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <ReimbursementStatusBadge status={reimbursement.status} />
                    <span className="app-muted text-sm">
                      {getReimbursementNextStepMessage(
                        reimbursement,
                        approvalContext,
                      )}
                    </span>
                  </div>
                </Field>
                <ReadOnlyField
                  label="Requester"
                  htmlFor="edit-reimbursement-requester"
                >
                  {personDisplayName(reimbursement.people)}
                  {reimbursement.people?.email
                    ? ` (${reimbursement.people.email})`
                    : ""}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="edit-reimbursement-description"
                >
                  {reimbursement.description}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="edit-reimbursement-event">
                  {reimbursement.events?.name ?? "No event"}
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField
                    label="Submitted"
                    htmlFor="edit-reimbursement-created"
                  >
                    {formatInstantDate(reimbursement.created_at)}
                  </ReadOnlyField>
                  <ReadOnlyField
                    label="Amount"
                    htmlFor="edit-reimbursement-amount"
                  >
                    {formatAmount(reimbursement.amount, reimbursement.currency)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField
                  label="Receipt"
                  htmlFor="edit-reimbursement-receipt"
                >
                  <DocumentPreview
                    link={reimbursement.receipt_url}
                    path={reimbursement.receipt_path}
                    url={reimbursement.receipt_signed_url}
                  />
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-reimbursement-notes">
                  {reimbursement.notes || "—"}
                </ReadOnlyField>
                {reimbursement.source_expense && (
                  <ReadOnlyField
                    label="Source"
                    htmlFor="edit-reimbursement-source"
                  >
                    Created from expense: &quot;
                    {reimbursement.source_expense.description}&quot;
                  </ReadOnlyField>
                )}

                {reimbursement.status === "approved" &&
                  reimbursement.approved_at && (
                    <ReadOnlyField
                      label="Approved"
                      htmlFor="edit-reimbursement-approved"
                    >
                      {formatDateTime(reimbursement.approved_at)}
                    </ReadOnlyField>
                  )}
                {reimbursement.status === "rejected" && (
                  <>
                    {reimbursement.rejected_at && (
                      <ReadOnlyField
                        label="Rejected"
                        htmlFor="edit-reimbursement-rejected"
                      >
                        {formatDateTime(reimbursement.rejected_at)}
                      </ReadOnlyField>
                    )}
                    <ReadOnlyField
                      label="Rejection reason"
                      htmlFor="edit-reimbursement-rejection-reason"
                    >
                      {reimbursement.rejection_reason || "—"}
                    </ReadOnlyField>
                  </>
                )}
                {reimbursement.status === "paid" && reimbursement.paid_at && (
                  <ReadOnlyField label="Paid" htmlFor="edit-reimbursement-paid">
                    {formatDateTime(reimbursement.paid_at)}
                  </ReadOnlyField>
                )}

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
                  <Field>
                    <FieldLabel htmlFor="edit-reimbursement-requester">
                      Requester
                    </FieldLabel>
                    <PersonPicker
                      id="edit-reimbursement-requester"
                      people={availablePeople}
                      selected={selectedPerson}
                      onSelect={setSelectedPerson}
                      onPersonCreated={handlePersonCreated}
                    />
                  </Field>

                  <ReimbursementFormFields
                    receiptSignedUrl={reimbursement.receipt_signed_url}
                    form={form}
                    update={update}
                    events={events}
                    idPrefix="edit-reimbursement"
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

          {mode === "view" && (canApprove || canReject || canMarkPaid) && (
            <SheetFooter>
              {canReject && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X /> Reject
                </Button>
              )}
              {canApprove && (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleApprove}
                >
                  <Check />{" "}
                  {isPending ? (
                    <>
                      <Spinner /> Approving...
                    </>
                  ) : (
                    "Approve"
                  )}
                </Button>
              )}
              {canMarkPaid && (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleMarkPaid}
                >
                  <Banknote />{" "}
                  {isPending ? (
                    <>
                      <Spinner /> Marking paid...
                    </>
                  ) : (
                    "Mark as paid"
                  )}
                </Button>
              )}
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
              You have unsaved changes to this reimbursement. Leaving now will
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

      <PortalFormSurface
        open={rejectDialogOpen}
        onOpenChange={(next) => {
          setRejectDialogOpen(next);
          if (!next) setRejectReason("");
        }}
        title="Reject reimbursement"
        description="Explain why this reimbursement is being rejected."
        size="md"
        onSubmit={handleReject}
        footer={
          <>
            <PortalFormSurfaceClose
              render={<Button type="button" variant="secondary" />}
            >
              Cancel
            </PortalFormSurfaceClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Rejecting...
                </>
              ) : (
                "Reject reimbursement"
              )}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reject-reimbursement-reason" required>
              Reason
            </FieldLabel>
            <Textarea
              id="reject-reimbursement-reason"
              required
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </PortalFormSurface>
    </>
  );
}
