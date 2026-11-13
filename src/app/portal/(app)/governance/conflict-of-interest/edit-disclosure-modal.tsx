"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateDisclosureAction, type Disclosure } from "./disclosures-actions";
import {
  DisclosureFormFields,
  packDisclosureFormData,
  type DisclosureFormState,
} from "./disclosure-form-fields";
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

function formStateFor(disclosure: Disclosure): DisclosureFormState {
  return {
    disclosureYear: String(disclosure.disclosure_year),
    onFileDate: disclosure.on_file_date ?? "",
    notes: disclosure.notes ?? "",
    externalLink: disclosure.external_link ?? "",
    documentPath: disclosure.document_path ?? "",
    bodyText: disclosure.body_text ?? "",
  };
}

function isDirty(
  form: DisclosureFormState,
  person: PickedPerson | null,
  disclosure: Disclosure,
) {
  const baseline = formStateFor(disclosure);
  return (
    form.disclosureYear !== baseline.disclosureYear ||
    form.onFileDate !== baseline.onFileDate ||
    form.notes !== baseline.notes ||
    form.externalLink !== baseline.externalLink ||
    form.documentPath !== baseline.documentPath ||
    form.bodyText !== baseline.bodyText ||
    person?.id !== disclosure.person.id
  );
}

export function EditDisclosureModal({
  disclosure,
  people,
}: {
  disclosure: Disclosure;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    disclosure.person,
  );
  const [form, setForm] = useState<DisclosureFormState>(() =>
    formStateFor(disclosure),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-disclosure-form-${disclosure.id}`;
  const dirty = isDirty(form, selectedPerson, disclosure);

  function update<K extends keyof DisclosureFormState>(
    key: K,
    value: DisclosureFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(disclosure));
    setSelectedPerson(disclosure.person);
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

    if (!selectedPerson) {
      setError("Select or create a person for this disclosure.");
      return;
    }

    startTransition(async () => {
      const result = await updateDisclosureAction(
        disclosure.id,
        selectedPerson.id,
        packDisclosureFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Disclosure saved.");
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
                    aria-label="View disclosure"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View disclosure</TooltipContent>
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
                {mode === "edit" ? "Edit disclosure" : "Disclosure"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this disclosure's details."
                  : "View this disclosure's details."}
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
                      aria-label="Edit disclosure"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit disclosure</TooltipContent>
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
                <ReadOnlyField label="Person" htmlFor="edit-disclosure-person">
                  {disclosure.person.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Disclosure year"
                  htmlFor="edit-disclosure-year"
                >
                  {disclosure.disclosure_year}
                </ReadOnlyField>
                <ReadOnlyField
                  label="On-file date"
                  htmlFor="edit-disclosure-on-file-date"
                >
                  {formatCalendarDate(disclosure.on_file_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-disclosure-notes">
                  <MarkdownText fallback="—">{disclosure.notes}</MarkdownText>
                </ReadOnlyField>
                <ReadOnlyField
                  label="Document"
                  htmlFor="edit-disclosure-document"
                >
                  <DocumentPreview
                    link={disclosure.external_link}
                    path={disclosure.document_path}
                    url={disclosure.document_url}
                  />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Disclosure details"
                  htmlFor="edit-disclosure-body-text"
                >
                  <MarkdownText fallback="—">
                    {disclosure.body_text}
                  </MarkdownText>
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
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="edit-disclosure-person"
                      className="text-sm font-medium"
                    >
                      Person
                    </label>
                    <PersonPicker
                      id="edit-disclosure-person"
                      people={availablePeople}
                      selected={selectedPerson}
                      onSelect={setSelectedPerson}
                      onPersonCreated={handlePersonCreated}
                    />
                  </div>

                  <DisclosureFormFields
                    documentUrl={disclosure.document_url}
                    form={form}
                    update={update}
                    idPrefix="edit-disclosure"
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
              You have unsaved changes to this disclosure. Leaving now will
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
