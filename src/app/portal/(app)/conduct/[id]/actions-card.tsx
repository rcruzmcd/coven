"use client";

import { MarkdownText } from "@/components/portal/markdown-text";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/portal/status-badge";
import { toast } from "@/components/ui/toast";
import { CONDUCT_ACTION_KINDS, conductLabel } from "@/lib/conduct";
import { liftConductActionAction, recordConductActionAction } from "../actions";
import type { ConductActionRow } from "../conduct-shared";

/** Native, for the reason `reviewers-card.tsx` gives at length. */
const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * What was done about the report, held apart from how it ended.
 *
 * `lifted_on is null` is the only definition of "in force" anywhere in this
 * feature, which is what makes an interim safety measure survive an appeal
 * being filed and a case being closed. Lifting one is its own act on its own
 * date, never a side effect of the case moving on.
 */
export function CaseActionsCard({
  reportId,
  actions,
  today,
  canManage,
}: {
  reportId: string;
  actions: ConductActionRow[];
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState("interim");
  const [description, setDescription] = useState("");
  const [takenOn, setTakenOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("description", description);
    formData.set("takenOn", takenOn);
    startTransition(async () => {
      const result = await recordConductActionAction(reportId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDescription("");
      toast.success("Action recorded.");
      router.refresh();
    });
  }

  function handleLift(actionId: string) {
    setError(null);
    const formData = new FormData();
    formData.set("liftedOn", today);
    startTransition(async () => {
      const result = await liftConductActionAction(
        reportId,
        actionId,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Action lifted.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions taken</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {actions.length === 0 ? (
          <p className="app-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {actions.map((action) => (
              <li key={action.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={action.kind === "interim" ? "progress" : "success"}
                  >
                    {conductLabel(CONDUCT_ACTION_KINDS, action.kind)}
                  </StatusBadge>
                  <span className="app-muted">{action.taken_on}</span>
                  {action.lifted_on ? (
                    <StatusBadge tone="neutral">
                      Lifted {action.lifted_on}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">In force</StatusBadge>
                  )}
                  {canManage && !action.lifted_on && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      focusableWhenDisabled
                      onClick={() => handleLift(action.id)}
                    >
                      Lift today
                    </Button>
                  )}
                </div>
                <MarkdownText>{action.description}</MarkdownText>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            onSubmit={handleRecord}
            className="space-y-3 border-t border-[var(--line)] pt-3"
          >
            <Field>
              <FieldLabel htmlFor="conduct-action-kind">Kind</FieldLabel>
              <select
                id="conduct-action-kind"
                className={selectClassName}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {CONDUCT_ACTION_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="app-muted text-xs">
                Interim is something in place while you look into it, and it
                stands until you lift it — including while an appeal is open.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="conduct-action-description" required>
                What was done
              </FieldLabel>
              <MarkdownTextarea
                id="conduct-action-description"
                required
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="conduct-action-taken">
                Date it was taken
              </FieldLabel>
              <Input
                id="conduct-action-taken"
                type="date"
                value={takenOn}
                onChange={(event) => setTakenOn(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={isPending} focusableWhenDisabled>
              {isPending ? (
                <>
                  <Spinner /> Recording...
                </>
              ) : (
                "Record action"
              )}
            </Button>
          </form>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
