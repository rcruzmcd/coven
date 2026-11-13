"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDecisionAction,
  deleteDecisionAction,
  listDecisionsAction,
  type Decision,
} from "./decisions-actions";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function AddDecisionForm({
  defaultDate,
  onSubmit,
  onCancel,
  onSaved,
}: {
  defaultDate: string;
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [voteResult, setVoteResult] = useState("");
  const [decisionDate, setDecisionDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("topic", topic);
    formData.set("description", description);
    formData.set("voteResult", voteResult);
    formData.set("decisionDate", decisionDate);

    startTransition(async () => {
      await runAction(() => onSubmit(formData), {
        success: "Decision recorded.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
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
          <FieldLabel htmlFor="new-decision-topic">Topic</FieldLabel>
          <Input
            id="new-decision-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-description" required>
            Discussion
          </FieldLabel>
          <MarkdownTextarea
            id="new-decision-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-vote">Vote</FieldLabel>
          <Input
            id="new-decision-vote"
            placeholder="e.g. Passed 5-0"
            value={voteResult}
            onChange={(event) => setVoteResult(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-date" required>
            Date
          </FieldLabel>
          <Input
            id="new-decision-date"
            type="date"
            required
            value={decisionDate}
            onChange={(event) => setDecisionDate(event.target.value)}
          />
        </Field>

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
              "Add decision"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function DecisionsTab({
  meetingId,
  meetingDate,
  mode,
  onDecisionsChange,
}: {
  meetingId: string;
  meetingDate: string;
  mode: "view" | "edit";
  /** Called after a decision is added or removed, for views that list them too. */
  onDecisionsChange?: () => void;
}) {
  const router = useRouter();
  const {
    data: decisions,
    loadError,
    refresh: refreshDecisions,
  } = useTabData<Decision[]>(() => listDecisionsAction(meetingId), [meetingId]);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowAdd(false));

  function refresh() {
    refreshDecisions();
    onDecisionsChange?.();
    router.refresh();
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteDecisionAction(id), {
        success: "Decision deleted.",
        error: "Could not delete the decision. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  // Built on every render rather than memoized: the row action closes over
  // `handleDelete`, which is redefined each render anyway, so a `useMemo`
  // here would only look stable. A meeting has a handful of decisions.
  const columns: PortalDataTableColumn<Decision>[] = [
    {
      key: "topic",
      label: "Topic",
      sortValue: (decision) => decision.topic,
      cellClassName: "app-muted",
      render: (decision) => decision.topic || "—",
    },
    {
      key: "description",
      // The discussion is a paragraph, wrapped rather than truncated: nothing
      // a reader would look for in its alphabetical order.
      label: "Discussion",
      cellClassName: "whitespace-normal font-medium",
      render: (decision) => <MarkdownText>{decision.description}</MarkdownText>,
    },
    {
      key: "vote_result",
      label: "Vote",
      sortValue: (decision) => decision.vote_result,
      cellClassName: "app-muted",
      render: (decision) => decision.vote_result || "—",
    },
    {
      key: "decision_date",
      label: "Date",
      hideBelow: "sm",
      sortValue: (decision) => decision.decision_date,
      cellClassName: "app-muted",
      render: (decision) => formatCalendarDate(decision.decision_date),
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
            cellClassName: "text-right",
            render: (decision: Decision) => (
              <ConfirmDeleteButton
                label="Remove decision"
                title="Remove this decision?"
                description="This deletes the decision and its vote result from the meeting record. It can't be undone."
                confirmLabel="Remove"
                pending={isDeleting}
                onConfirm={() => handleDelete(decision.id)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {decisions === undefined ? (
        <TabLoadingSkeleton />
      ) : decisions.length === 0 && !showAdd ? (
        <EmptyState
          title="No decisions recorded yet"
          description={
            mode === "edit"
              ? "Record the first one with Add decision below."
              : "Decisions appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        // `bare`: the section card around this tab is the surface already.
        // No `defaultSort` -- decisions arrive in the order the server sent
        // them, and the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={decisions}
          getRowKey={(decision) => decision.id}
          emptyMessage="No decisions recorded yet."
          shell="bare"
        />
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddDecisionForm
            defaultDate={meetingDate}
            onSubmit={(formData) => createDecisionAction(meetingId, formData)}
            onCancel={() => setShowAdd(false)}
            onSaved={() => {
              setShowAdd(false);
              refresh();
            }}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add decision
            </Button>
          </div>
        ))}
    </div>
  );
}
