"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createActionItemAction,
  deleteActionItemAction,
  listActionItemsAction,
  updateActionItemAction,
  updateActionItemStatusAction,
  type ActionItem,
} from "./action-items-actions";
import {
  ActionItemFormFields,
  emptyActionItemForm,
  packActionItemFormData,
  type ActionItemFormState,
} from "./action-item-form-fields";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

function ownerFrom(actionItem: ActionItem): PickedPerson {
  return actionItem.owner;
}

function AddActionItemForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    ownerPersonId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<ActionItemFormState>(() =>
    emptyActionItemForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedOwner) {
      setError("Select or create an owner for this action item.");
      return;
    }

    const owner = selectedOwner;
    startTransition(async () => {
      await runAction(() => onSubmit(owner.id, packActionItemFormData(form)), {
        success: "Action item added.",
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
          <FieldLabel htmlFor="add-action-item-owner">Owner</FieldLabel>
          <PersonPicker
            id="add-action-item-owner"
            people={people}
            selected={selectedOwner}
            onSelect={setSelectedOwner}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ActionItemFormFields
          form={form}
          update={update}
          idPrefix="new-action-item"
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
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add action item"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function EditActionItemDialog({
  actionItem,
  people,
  onPersonCreated,
  onSaved,
  onOpenChange,
}: {
  actionItem: ActionItem;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(() =>
    ownerFrom(actionItem),
  );
  const [form, setForm] = useState<ActionItemFormState>(() => ({
    description: actionItem.description,
    dueDate: actionItem.due_date ?? "",
    done: actionItem.status === "done",
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedOwner) {
      setError("Select or create an owner for this action item.");
      return;
    }

    const owner = selectedOwner;
    startTransition(async () => {
      await runAction(
        () =>
          updateActionItemAction(
            actionItem.id,
            owner.id,
            packActionItemFormData(form),
          ),
        {
          success: "Action item saved.",
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
      title="Edit action item"
      description="Update this action item's details."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending} focusableWhenDisabled>
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
          <FieldLabel htmlFor="edit-action-item-owner">Owner</FieldLabel>
          <PersonPicker
            id="edit-action-item-owner"
            people={people}
            selected={selectedOwner}
            onSelect={setSelectedOwner}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ActionItemFormFields
          form={form}
          update={update}
          idPrefix={`edit-action-item-${actionItem.id}`}
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

export function ActionItemsTab({
  meetingId,
  mode,
}: {
  meetingId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: actionItems,
    loadError,
    refresh: refreshActionItems,
  } = useTabData<ActionItem[]>(
    () => listActionItemsAction(meetingId),
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
    refreshActionItems();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleToggleStatus(actionItem: ActionItem) {
    const nextStatus = actionItem.status === "done" ? "open" : "done";
    startMutation(async () => {
      await runAction(
        () => updateActionItemStatusAction(actionItem.id, nextStatus),
        {
          success:
            nextStatus === "done"
              ? "Action item marked done."
              : "Action item reopened.",
          error: "Could not update the action item. Please try again.",
          onSuccess: refresh,
        },
      );
    });
  }

  function handleDelete(id: string) {
    startMutation(async () => {
      await runAction(() => deleteActionItemAction(id), {
        success: "Action item deleted.",
        error: "Could not delete the action item. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  // Built on every render rather than memoized: the row actions close over
  // `handleToggleStatus` and `handleDelete`, which are redefined each render
  // anyway, so a `useMemo` here would only look stable. A meeting has a
  // handful of action items.
  const columns: PortalDataTableColumn<ActionItem>[] = [
    {
      key: "description",
      // The description is a sentence, wrapped rather than truncated: nothing
      // a reader would look for in its alphabetical order.
      label: "Description",
      cellClassName: "whitespace-normal font-medium",
      render: (actionItem) => actionItem.description,
    },
    {
      key: "owner",
      label: "Owner",
      hideBelow: "md",
      sortValue: (actionItem) => personDisplayName(actionItem.owner),
      cellClassName: "app-muted",
      render: (actionItem) => personDisplayName(actionItem.owner),
    },
    {
      key: "due_date",
      label: "Due date",
      sortValue: (actionItem) => actionItem.due_date,
      cellClassName: "app-muted",
      render: (actionItem) => formatCalendarDate(actionItem.due_date),
    },
    {
      key: "status",
      // Open first while ascending: sorting a list of action items on Done is
      // a way of asking what is still outstanding.
      label: "Done",
      sortValue: (actionItem) => (actionItem.status === "done" ? 1 : 0),
      render: (actionItem) => (
        <Checkbox
          checked={actionItem.status === "done"}
          disabled={mode !== "edit" || isMutating}
          onCheckedChange={() => handleToggleStatus(actionItem)}
        />
      ),
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
            render: (actionItem: ActionItem) => (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit action item"
                        onClick={() => setEditingId(actionItem.id)}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit action item</TooltipContent>
                </Tooltip>
                <ConfirmDeleteButton
                  label="Remove action item"
                  title="Remove this action item?"
                  description="This deletes the item, its owner and its due date from the meeting record. It can't be undone."
                  confirmLabel="Remove"
                  pending={isMutating}
                  onConfirm={() => handleDelete(actionItem.id)}
                />
              </>
            ),
          },
        ]
      : []),
  ];

  const editingItem =
    actionItems?.find((item) => item.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {actionItems === undefined ? (
        <TabLoadingSkeleton />
      ) : actionItems.length === 0 && !showAdd ? (
        <EmptyState
          title="No action items recorded yet"
          description={
            mode === "edit"
              ? "Add the first one with Add action item below."
              : "Action items appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        // `bare`: the section card around this tab is the surface already.
        // No `defaultSort` -- action items arrive in the order the server sent
        // them, and the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={actionItems}
          getRowKey={(actionItem) => actionItem.id}
          emptyMessage="No action items recorded yet."
          shell="bare"
        />
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddActionItemForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={async (ownerPersonId, formData) => {
              const result = await createActionItemAction(
                meetingId,
                ownerPersonId,
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
              + Add action item
            </Button>
          </div>
        ))}

      {editingItem && (
        <EditActionItemDialog
          actionItem={editingItem}
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
