"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updatePolicyAction, type Policy } from "./policies-actions";
import {
  PolicyFormFields,
  packPolicyFormData,
  type PolicyFormState,
} from "./policy-form-fields";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { formatCalendarDate } from "@/lib/format";

function formStateFor(policy: Policy): PolicyFormState {
  return {
    name: policy.name,
    category: policy.category ?? "",
    effectiveDate: policy.effective_date,
    version: policy.version,
    externalLink: policy.external_link ?? "",
    documentPath: policy.document_path ?? "",
    bodyText: policy.body_text ?? "",
  };
}

function isDirty(form: PolicyFormState, policy: Policy) {
  const baseline = formStateFor(policy);
  return (
    form.name !== baseline.name ||
    form.category !== baseline.category ||
    form.effectiveDate !== baseline.effectiveDate ||
    form.version !== baseline.version ||
    form.externalLink !== baseline.externalLink ||
    form.documentPath !== baseline.documentPath ||
    form.bodyText !== baseline.bodyText
  );
}

export function EditPolicyModal({ policy }: { policy: Policy }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<PolicyFormState>(() => formStateFor(policy));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-policy-form-${policy.id}`;
  const dirty = isDirty(form, policy);

  function update<K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetToBaseline() {
    setForm(formStateFor(policy));
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

    startTransition(async () => {
      const result = await updatePolicyAction(
        policy.id,
        packPolicyFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Policy saved.");
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
                    aria-label="View policy"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View policy</TooltipContent>
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
                {mode === "edit" ? "Edit policy" : "Policy"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this policy's details."
                  : "View this policy's details."}
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
                      aria-label="Edit policy"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit policy</TooltipContent>
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
                <ReadOnlyField label="Policy name" htmlFor="edit-policy-name">
                  {policy.name}
                </ReadOnlyField>
                <ReadOnlyField label="Category" htmlFor="edit-policy-category">
                  {policy.category || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Version" htmlFor="edit-policy-version">
                  {policy.version}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Effective date"
                  htmlFor="edit-policy-effective-date"
                >
                  {formatCalendarDate(policy.effective_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Document" htmlFor="edit-policy-document">
                  <DocumentPreview
                    link={policy.external_link}
                    path={policy.document_path}
                    url={policy.document_url}
                  />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Policy text"
                  htmlFor="edit-policy-body-text"
                >
                  <MarkdownText fallback="—">{policy.body_text}</MarkdownText>
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
                  <PolicyFormFields
                    documentUrl={policy.document_url}
                    form={form}
                    update={update}
                    idPrefix="edit-policy"
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
              You have unsaved changes to this policy. Leaving now will discard
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
