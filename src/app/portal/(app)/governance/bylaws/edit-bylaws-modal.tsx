"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateBylawsAction, type Bylaws } from "./bylaws-actions";
import {
  BylawsFormFields,
  packBylawsFormData,
  type BylawsFormState,
} from "./bylaws-form-fields";
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

function formStateFor(bylaws: Bylaws): BylawsFormState {
  return {
    version: bylaws.version,
    effectiveDate: bylaws.effective_date,
    amendmentSummary: bylaws.amendment_summary ?? "",
    externalLink: bylaws.external_link ?? "",
    documentPath: bylaws.document_path ?? "",
    bodyText: bylaws.body_text ?? "",
  };
}

function isDirty(form: BylawsFormState, bylaws: Bylaws) {
  const baseline = formStateFor(bylaws);
  return (
    form.version !== baseline.version ||
    form.effectiveDate !== baseline.effectiveDate ||
    form.amendmentSummary !== baseline.amendmentSummary ||
    form.externalLink !== baseline.externalLink ||
    form.documentPath !== baseline.documentPath ||
    form.bodyText !== baseline.bodyText
  );
}

export function EditBylawsModal({ bylaws }: { bylaws: Bylaws }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<BylawsFormState>(() => formStateFor(bylaws));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-bylaws-form-${bylaws.id}`;
  const dirty = isDirty(form, bylaws);

  function update<K extends keyof BylawsFormState>(
    key: K,
    value: BylawsFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetToBaseline() {
    setForm(formStateFor(bylaws));
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
      const result = await updateBylawsAction(
        bylaws.id,
        packBylawsFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Bylaws saved.");
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
                    aria-label="View bylaws version"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View bylaws version</TooltipContent>
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
                {mode === "edit" ? "Edit bylaws version" : "Bylaws version"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this bylaws version's details."
                  : "View this bylaws version's details."}
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
                      aria-label="Edit bylaws version"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit bylaws version</TooltipContent>
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
                <ReadOnlyField label="Version" htmlFor="edit-bylaws-version">
                  {bylaws.version}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Effective date"
                  htmlFor="edit-bylaws-effective-date"
                >
                  {formatCalendarDate(bylaws.effective_date)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="What changed"
                  htmlFor="edit-bylaws-amendment-summary"
                >
                  <MarkdownText fallback="—">
                    {bylaws.amendment_summary}
                  </MarkdownText>
                </ReadOnlyField>
                <ReadOnlyField label="Document" htmlFor="edit-bylaws-document">
                  <DocumentPreview
                    link={bylaws.external_link}
                    path={bylaws.document_path}
                    url={bylaws.document_url}
                  />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Bylaws text"
                  htmlFor="edit-bylaws-body-text"
                >
                  <MarkdownText fallback="—">{bylaws.body_text}</MarkdownText>
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
                  <BylawsFormFields
                    documentUrl={bylaws.document_url}
                    form={form}
                    update={update}
                    idPrefix="edit-bylaws"
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
              You have unsaved changes to this bylaws version. Leaving now will
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
