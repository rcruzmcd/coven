"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createResolutionAction,
  deleteResolutionAction,
  listResolutionsAction,
  updateResolutionAction,
  type Resolution,
} from "../resolutions/resolutions-actions";
import {
  ResolutionFormFields,
  emptyResolutionForm,
  packResolutionFormData,
  type ResolutionFormState,
} from "../resolutions/resolution-form-fields";
import { VoteOutcomeBadge } from "../resolutions/resolution-badges";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function AddResolutionForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    moverPersonId: string,
    seconderPersonId: string | null,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(null);
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<ResolutionFormState>(() =>
    emptyResolutionForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    const mover = selectedMover;
    startTransition(async () => {
      await runAction(
        () =>
          onSubmit(
            mover.id,
            selectedSeconder?.id ?? null,
            packResolutionFormData(form),
          ),
        {
          success: "Resolution added.",
          onError: setError,
          onSuccess: () => {
            router.refresh();
            onCancel();
          },
        },
      );
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
          <FieldLabel htmlFor="add-meeting-resolution-mover">Mover</FieldLabel>
          <PersonPicker
            id="add-meeting-resolution-mover"
            people={people}
            selected={selectedMover}
            onSelect={setSelectedMover}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="add-meeting-resolution-seconder">
            Seconder
          </FieldLabel>
          <PersonPicker
            id="add-meeting-resolution-seconder"
            people={people}
            selected={selectedSeconder}
            onSelect={setSelectedSeconder}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ResolutionFormFields
          form={form}
          update={update}
          idPrefix="new-resolution-tab"
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add resolution"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function EditResolutionDialog({
  resolution,
  people,
  onPersonCreated,
  onSaved,
  onOpenChange,
}: {
  resolution: Resolution;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(
    resolution.mover,
  );
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    resolution.seconder,
  );
  const [form, setForm] = useState<ResolutionFormState>(() => ({
    motionText: resolution.motion_text,
    voteOutcome: resolution.vote_outcome,
    effectiveDate: resolution.effective_date ?? "",
    externalLink: resolution.external_link ?? "",
    documentPath: resolution.document_path ?? "",
    bodyText: resolution.body_text ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    const mover = selectedMover;
    startTransition(async () => {
      await runAction(
        () =>
          updateResolutionAction(
            resolution.id,
            mover.id,
            selectedSeconder?.id ?? null,
            packResolutionFormData(form),
          ),
        {
          success: "Resolution saved.",
          onError: setError,
          onSuccess: onSaved,
        },
      );
    });
  }

  return (
    <PortalFormSurface
      open
      onOpenChange={onOpenChange}
      title="Edit resolution"
      description="Update this resolution's details."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="edit-meeting-resolution-mover">Mover</FieldLabel>
          <PersonPicker
            id="edit-meeting-resolution-mover"
            people={people}
            selected={selectedMover}
            onSelect={setSelectedMover}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-meeting-resolution-seconder">
            Seconder
          </FieldLabel>
          <PersonPicker
            id="edit-meeting-resolution-seconder"
            people={people}
            selected={selectedSeconder}
            onSelect={setSelectedSeconder}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ResolutionFormFields
          documentUrl={resolution.document_url}
          form={form}
          update={update}
          idPrefix={`edit-resolution-tab-${resolution.id}`}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}

export function ResolutionsTab({
  meetingId,
  mode,
}: {
  meetingId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: resolutions,
    loadError,
    refresh: refreshResolutions,
  } = useTabData<Resolution[]>(
    () => listResolutionsAction(meetingId),
    [meetingId],
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isMutating, startMutation] = useTransition();

  useResetOnModeChange(mode, () => {
    setShowAdd(false);
    setEditingId(null);
  });

  useEffect(() => {
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [meetingId]);

  function refresh() {
    refreshResolutions();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleDelete(id: string) {
    startMutation(async () => {
      await runAction(() => deleteResolutionAction(id), {
        success: "Resolution deleted.",
        error: "Could not delete the resolution. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  // Built on every render rather than memoized: the row actions close over
  // `handleDelete` and `setEditingId`, so a `useMemo` here would only look
  // stable. A meeting has a handful of resolutions.
  const columns: PortalDataTableColumn<Resolution>[] = [
    {
      key: "motion_text",
      // The motion is a sentence, wrapped rather than truncated: nothing a
      // reader would look for in its alphabetical order.
      label: "Motion",
      cellClassName: "whitespace-normal font-medium",
      render: (resolution) => resolution.motion_text,
    },
    {
      key: "mover",
      label: "Mover",
      hideBelow: "md",
      sortValue: (resolution) => personDisplayName(resolution.mover),
      cellClassName: "app-muted",
      render: (resolution) => personDisplayName(resolution.mover),
    },
    {
      key: "vote_outcome",
      label: "Vote outcome",
      sortValue: (resolution) => resolution.vote_outcome,
      render: (resolution) => (
        <VoteOutcomeBadge outcome={resolution.vote_outcome} />
      ),
    },
    {
      key: "effective_date",
      label: "Effective date",
      sortValue: (resolution) => resolution.effective_date,
      cellClassName: "app-muted",
      render: (resolution) => formatCalendarDate(resolution.effective_date),
    },
    // Actions only while there is something in them: in view mode the column
    // would be an empty strip with a name only a screen reader hears.
    ...(mode === "edit"
      ? [
          {
            key: "actions",
            label: "Actions",
            srOnlyLabel: true,
            headClassName: "w-px",
            cellClassName: "text-right whitespace-nowrap",
            render: (resolution: Resolution) => (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit resolution"
                        onClick={() => setEditingId(resolution.id)}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit resolution</TooltipContent>
                </Tooltip>
                <ConfirmDeleteButton
                  label="Remove resolution"
                  title="Remove this resolution?"
                  description="This deletes the motion, its mover and its vote outcome from the meeting record. It can't be undone."
                  confirmLabel="Remove"
                  pending={isMutating}
                  onConfirm={() => handleDelete(resolution.id)}
                />
              </>
            ),
          },
        ]
      : []),
  ];

  const editingResolution =
    resolutions?.find((resolution) => resolution.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {resolutions === undefined ? (
        <TabLoadingSkeleton />
      ) : resolutions.length === 0 && !showAdd ? (
        <EmptyState
          title="No resolutions recorded yet"
          description={
            mode === "edit"
              ? "Record the first one with Add resolution below."
              : "Resolutions appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        // `bare`: the section card around this tab is the surface already.
        // No `defaultSort` -- resolutions arrive in the order the server sent
        // them, and the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={resolutions}
          getRowKey={(resolution) => resolution.id}
          emptyMessage="No resolutions recorded yet."
          shell="bare"
        />
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddResolutionForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={async (moverPersonId, seconderPersonId, formData) => {
              const result = await createResolutionAction(
                meetingId,
                moverPersonId,
                seconderPersonId,
                formData,
              );
              if (!("error" in result)) refresh();
              return result;
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add resolution
            </Button>
          </div>
        ))}

      {editingResolution && (
        <EditResolutionDialog
          resolution={editingResolution}
          people={people}
          onPersonCreated={handlePersonCreated}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
