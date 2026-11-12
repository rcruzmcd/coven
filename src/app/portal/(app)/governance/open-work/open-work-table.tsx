"use client";

import { FormEvent, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPen } from "lucide-react";
import { TaskTable } from "@/components/portal/task-table";
import { runAction, useActionToast } from "@/components/portal/action-toast";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { StatusBadge } from "@/components/portal/status-badge";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  ACTION_ITEM_STATUS_LABELS,
  GOVERNANCE_OPEN_WORK_KIND_LABELS,
  type GovernanceOpenWorkKind,
  type GovernanceOpenWorkRow,
} from "@/lib/portal/governance-open-work";
import type { TaskFilters, TaskOwner } from "@/lib/portal/task-list";
import {
  updateActionItemAction,
  updateActionItemStatusAction,
} from "../meetings/action-items-actions";
import {
  updateMilestoneAction,
  updateMilestoneStatusAction,
} from "../nonprofit-status/nonprofit-status-actions";
import { MILESTONE_STATUS_LABELS } from "../nonprofit-status/nonprofit-status-badges";
import type { MilestoneStatus } from "../nonprofit-status/nonprofit-status-form";
import {
  updateAnnualRequirementAction,
  updateAnnualRequirementStatusAction,
} from "../annual-requirements/annual-requirements-actions";
import { REQUIREMENT_STATUS_LABELS } from "../annual-requirements/annual-requirements-badges";
import type { RequirementStatus } from "../annual-requirements/annual-requirement-form";
import { EditGrantModal } from "../grants/edit-grant-modal";
import { EditPartnershipModal } from "../partnerships/edit-partnership-modal";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import {
  actionItemFormData,
  annualRequirementFormData,
  milestoneFormData,
  type OwnerDueChange,
} from "./open-work-forms";

type EditableRow = Extract<
  GovernanceOpenWorkRow,
  { kind: "action_item" | "milestone" | "annual_requirement" }
>;

/**
 * Governance's Open work list (#1658). Every write goes through the source's
 * own Server Action and form parser -- there is no Open work write path --
 * and a success refreshes this route, while the action itself revalidates
 * the source page.
 */
export function OpenWorkTable({
  rows,
  filters,
  owners,
  today,
  people,
  kindLabels = GOVERNANCE_OPEN_WORK_KIND_LABELS,
  emptyMessage = "No open work matches these filters.",
}: {
  rows: GovernanceOpenWorkRow[];
  filters: TaskFilters;
  owners: TaskOwner[];
  today: string;
  people: PersonListItem[];
  /** The kinds `rows` hold; Meetings' Action items view passes just one. */
  kindLabels?: Partial<Record<GovernanceOpenWorkKind, string>>;
  emptyMessage?: string;
}) {
  const [editing, setEditing] = useState<EditableRow | null>(null);

  const renderStatus = useCallback(
    (row: GovernanceOpenWorkRow) => <StatusControl row={row} />,
    [],
  );
  const renderActions = useCallback(
    (row: GovernanceOpenWorkRow) => {
      switch (row.kind) {
        case "grant":
          return <EditGrantModal grant={row.record} people={people} />;
        case "partnership":
          return (
            <EditPartnershipModal opportunity={row.record} people={people} />
          );
        default:
          return (
            <TooltipIconButton
              label={`Reassign or change due date for ${row.title}`}
              onClick={() => setEditing(row)}
            >
              <UserPen />
            </TooltipIconButton>
          );
      }
    },
    [people],
  );

  return (
    <>
      <TaskTable
        rows={rows}
        filters={filters}
        owners={owners}
        today={today}
        kindLabels={kindLabels as Record<string, string>}
        renderStatus={renderStatus}
        renderActions={renderActions}
        emptyMessage={emptyMessage}
      />
      {editing ? (
        <OwnerDueSurface
          key={editing.key}
          row={editing}
          people={people}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

const STATUS_OPTIONS = {
  action_item: ACTION_ITEM_STATUS_LABELS,
  milestone: MILESTONE_STATUS_LABELS,
  annual_requirement: REQUIREMENT_STATUS_LABELS,
} as const;

/**
 * The status select for the three sources with an inline status action.
 * Grants and partnerships keep a badge: their stage moves in the edit modal.
 */
function StatusControl({ row }: { row: GovernanceOpenWorkRow }) {
  if (row.kind === "grant" || row.kind === "partnership") {
    return (
      <StatusBadge tone={row.isDone ? "success" : "neutral"}>
        {row.statusLabel}
      </StatusBadge>
    );
  }
  return <StatusSelect row={row} />;
}

function updateStatus(row: EditableRow, value: string) {
  switch (row.kind) {
    case "action_item":
      return updateActionItemStatusAction(row.id, value as "open" | "done");
    case "milestone":
      return updateMilestoneStatusAction(row.id, value as MilestoneStatus);
    case "annual_requirement":
      return updateAnnualRequirementStatusAction(
        row.id,
        value as RequirementStatus,
      );
  }
}

function StatusSelect({ row }: { row: EditableRow }) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const options: Record<string, string> = STATUS_OPTIONS[row.kind];

  function handleChange(value: string | null) {
    if (!value || value === row.status) return;
    run(() => updateStatus(row, value), {
      success: `${row.title} — ${options[value]}.`,
      error: "Could not update the status. Please try again.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Select
      value={row.status}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="h-8 w-36"
        aria-label={`Status for ${row.title}`}
      >
        {isPending ? <Spinner /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function updateOwnerAndDue(
  row: EditableRow,
  ownerId: string | null,
  change: OwnerDueChange,
) {
  switch (row.kind) {
    case "action_item":
      return updateActionItemAction(
        row.id,
        ownerId ?? "",
        actionItemFormData(row.record, change),
      );
    case "milestone":
      return updateMilestoneAction(
        row.id,
        ownerId,
        milestoneFormData(row.record, change),
      );
    case "annual_requirement":
      return updateAnnualRequirementAction(
        row.id,
        ownerId,
        annualRequirementFormData(row.record, change),
      );
  }
}

/** Reassign and re-date one row through its source's update action. */
function OwnerDueSurface({
  row,
  people,
  onClose,
}: {
  row: EditableRow;
  people: PersonListItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [availablePeople, setAvailablePeople] = useState(people);
  const [owner, setOwner] = useState<PickedPerson | null>(row.owner);
  const [dueDate, setDueDate] = useState(row.dueDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Action items always have an owner; annual requirements always a date.
  const ownerRequired = row.kind === "action_item";
  const dueRequired = row.kind === "annual_requirement";
  const fieldId = `open-work-${row.key.replace(":", "-")}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const change = { dueDate: dueDate || null };
    startTransition(async () => {
      await runAction(() => updateOwnerAndDue(row, owner?.id ?? null, change), {
        success: `${row.title} saved.`,
        onError: setError,
        onSuccess: () => {
          onClose();
          router.refresh();
        },
      });
    });
  }

  return (
    <PortalFormSurface
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Reassign or change due date"
      description={row.title}
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
          <FieldLabel htmlFor={`${fieldId}-owner`} required={ownerRequired}>
            {row.kind === "annual_requirement" ? "Responsible" : "Owner"}
          </FieldLabel>
          <PersonPicker
            id={`${fieldId}-owner`}
            people={availablePeople}
            selected={owner}
            onSelect={setOwner}
            onPersonCreated={(person) =>
              setAvailablePeople((prev) => [...prev, person])
            }
            required={ownerRequired}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-due`} required={dueRequired}>
            Due date
          </FieldLabel>
          <Input
            id={`${fieldId}-due`}
            type="date"
            value={dueDate}
            required={dueRequired}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
