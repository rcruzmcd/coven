"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateResolutionAction, type Resolution } from "./resolutions-actions";
import {
  ResolutionFormFields,
  packResolutionFormData,
  type ResolutionFormState,
} from "./resolution-form-fields";
import { VoteOutcomeBadge } from "./resolution-badges";
import type { ResolutionMeetingOption } from "./resolutions-shared";
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
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";

function meetingLabel(
  meetingId: string | null,
  meetings: ResolutionMeetingOption[],
) {
  if (!meetingId) return "—";
  const meeting = meetings.find((m) => m.id === meetingId);
  if (!meeting) return "—";
  return `${formatInstantDate(meeting.meeting_date)} — ${meeting.meeting_type}`;
}

function formStateFor(resolution: Resolution): ResolutionFormState {
  return {
    motionText: resolution.motion_text,
    voteOutcome: resolution.vote_outcome,
    effectiveDate: resolution.effective_date ?? "",
    externalLink: resolution.external_link ?? "",
    documentPath: resolution.document_path ?? "",
    bodyText: resolution.body_text ?? "",
  };
}

function isDirty(
  form: ResolutionFormState,
  mover: PickedPerson | null,
  seconder: PickedPerson | null,
  resolution: Resolution,
) {
  const baseline = formStateFor(resolution);
  return (
    form.motionText !== baseline.motionText ||
    form.voteOutcome !== baseline.voteOutcome ||
    form.effectiveDate !== baseline.effectiveDate ||
    form.externalLink !== baseline.externalLink ||
    form.documentPath !== baseline.documentPath ||
    form.bodyText !== baseline.bodyText ||
    mover?.id !== resolution.mover.id ||
    (seconder?.id ?? null) !== (resolution.seconder?.id ?? null)
  );
}

export function EditResolutionModal({
  resolution,
  people,
  meetings,
}: {
  resolution: Resolution;
  people: PersonListItem[];
  meetings: ResolutionMeetingOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(
    resolution.mover,
  );
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    resolution.seconder,
  );
  const [form, setForm] = useState<ResolutionFormState>(() =>
    formStateFor(resolution),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-resolution-form-${resolution.id}`;
  const dirty = isDirty(form, selectedMover, selectedSeconder, resolution);

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function resetToBaseline() {
    setForm(formStateFor(resolution));
    setSelectedMover(resolution.mover);
    setSelectedSeconder(resolution.seconder);
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

    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    startTransition(async () => {
      const result = await updateResolutionAction(
        resolution.id,
        selectedMover.id,
        selectedSeconder?.id ?? null,
        packResolutionFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Resolution saved.");
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
                    aria-label="View resolution"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View resolution</TooltipContent>
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
                {mode === "edit" ? "Edit resolution" : "Resolution"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this resolution's details."
                  : "View this resolution's details."}
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
                      aria-label="Edit resolution"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit resolution</TooltipContent>
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
                  label="Meeting"
                  htmlFor="edit-resolution-meeting"
                >
                  {meetingLabel(resolution.meeting_id, meetings)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Motion text"
                  htmlFor="edit-resolution-motion-text"
                >
                  <span className="whitespace-pre-wrap">
                    {resolution.motion_text}
                  </span>
                </ReadOnlyField>
                <ReadOnlyField label="Mover" htmlFor="edit-resolution-mover">
                  {resolution.mover.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Seconder"
                  htmlFor="edit-resolution-seconder"
                >
                  {personDisplayName(resolution.seconder)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Vote outcome"
                  htmlFor="edit-resolution-vote-outcome"
                >
                  <VoteOutcomeBadge outcome={resolution.vote_outcome} />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Effective date"
                  htmlFor="edit-resolution-effective-date"
                >
                  {formatCalendarDate(resolution.effective_date)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Document"
                  htmlFor="edit-resolution-document"
                >
                  <DocumentPreview
                    link={resolution.external_link}
                    path={resolution.document_path}
                    url={resolution.document_url}
                  />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Resolution text"
                  htmlFor="edit-resolution-body-text"
                >
                  <span className="whitespace-pre-wrap">
                    {resolution.body_text || "—"}
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
                  <RequiredFieldsNote />
                  <ReadOnlyField
                    label="Meeting"
                    htmlFor="edit-resolution-meeting-locked"
                  >
                    {meetingLabel(resolution.meeting_id, meetings)}
                  </ReadOnlyField>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="edit-resolution-mover"
                      className="text-sm font-medium"
                    >
                      Mover
                    </label>
                    <PersonPicker
                      id="edit-resolution-mover"
                      people={availablePeople}
                      selected={selectedMover}
                      onSelect={setSelectedMover}
                      onPersonCreated={handlePersonCreated}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="edit-resolution-seconder"
                      className="text-sm font-medium"
                    >
                      Seconder
                    </label>
                    <PersonPicker
                      id="edit-resolution-seconder"
                      people={availablePeople}
                      selected={selectedSeconder}
                      onSelect={setSelectedSeconder}
                      onPersonCreated={handlePersonCreated}
                    />
                  </div>

                  <ResolutionFormFields
                    documentUrl={resolution.document_url}
                    form={form}
                    update={update}
                    idPrefix="edit-resolution"
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
              You have unsaved changes to this resolution. Leaving now will
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
