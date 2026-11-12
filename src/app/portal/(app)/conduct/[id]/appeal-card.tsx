"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/portal/status-badge";
import { toast } from "@/components/ui/toast";
import type { AppealWindowState } from "@/lib/conduct";
import { decideConductAppealAction, fileConductAppealAction } from "../actions";
import type { ConductAppealRow } from "../conduct-shared";

/**
 * The appeal, which exists or does not.
 *
 * A late appeal is recorded and shown as late, never refused: the published
 * window is a commitment to hear one filed inside it, not a rule against
 * hearing one that arrives after. Whoever is deciding needs to know it was
 * late; the software has no business deciding for them.
 */
export function AppealCard({
  reportId,
  appeal,
  decidedOn,
  appealWindow,
  today,
  canManage,
}: {
  reportId: string;
  appeal: ConductAppealRow | null;
  decidedOn: string | null;
  appealWindow: AppealWindowState;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [filedOn, setFiledOn] = useState(today);
  const [grounds, setGrounds] = useState("");
  const [decisionDate, setDecisionDate] = useState(today);
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("filedOn", filedOn);
    formData.set("grounds", grounds);
    startTransition(async () => {
      const result = await fileConductAppealAction(reportId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Appeal recorded.");
      router.refresh();
    });
  }

  function handleDecide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appeal) return;
    setError(null);
    const formData = new FormData();
    formData.set("decidedOn", decisionDate);
    formData.set("outcome", outcome);
    startTransition(async () => {
      const result = await decideConductAppealAction(
        reportId,
        appeal.id,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Appeal decision recorded.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appeal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!decidedOn && (
          <p className="app-muted">
            There is nothing to appeal until the case is decided.
          </p>
        )}

        {appealWindow.state === "open" && (
          <p className="app-muted">
            The window is open until {appealWindow.closesOn} —{" "}
            {appealWindow.daysLeft}{" "}
            {appealWindow.daysLeft === 1 ? "day" : "days"} left.
          </p>
        )}
        {appealWindow.state === "closed" && (
          <p className="app-muted">
            The window closed on {appealWindow.closesOn}. An appeal filed now is
            recorded and marked late rather than refused.
          </p>
        )}

        {appeal ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="progress">Filed {appeal.filed_on}</StatusBadge>
              {appealWindow.state === "filed" && appealWindow.late && (
                <StatusBadge tone="warning">
                  After the {appealWindow.closesOn} deadline
                </StatusBadge>
              )}
              {appeal.decided_on && (
                <StatusBadge tone="success">
                  Decided {appeal.decided_on}
                </StatusBadge>
              )}
            </div>
            {appeal.grounds && (
              <div>
                <p className="app-eyebrow">Grounds</p>
                <p className="mt-0.5 whitespace-pre-wrap">{appeal.grounds}</p>
              </div>
            )}
            {appeal.outcome && (
              <div>
                <p className="app-eyebrow">Outcome</p>
                <p className="mt-0.5 whitespace-pre-wrap">{appeal.outcome}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="app-muted">No appeal has been filed.</p>
        )}

        {canManage && decidedOn && !appeal && (
          <form
            onSubmit={handleFile}
            className="space-y-3 border-t border-[var(--line)] pt-3"
          >
            <Field>
              <FieldLabel htmlFor="conduct-appeal-filed">
                Date it was filed
              </FieldLabel>
              <Input
                id="conduct-appeal-filed"
                type="date"
                value={filedOn}
                onChange={(event) => setFiledOn(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="conduct-appeal-grounds">Grounds</FieldLabel>
              <Textarea
                id="conduct-appeal-grounds"
                rows={3}
                value={grounds}
                onChange={(event) => setGrounds(event.target.value)}
              />
              <p className="app-muted text-xs">
                The subject&rsquo;s own account, kept apart from the
                reporter&rsquo;s.
              </p>
            </Field>
            <Button type="submit" disabled={isPending} focusableWhenDisabled>
              {isPending ? (
                <>
                  <Spinner /> Recording...
                </>
              ) : (
                "Record appeal"
              )}
            </Button>
          </form>
        )}

        {canManage && appeal && !appeal.decided_on && (
          <form
            onSubmit={handleDecide}
            className="space-y-3 border-t border-[var(--line)] pt-3"
          >
            <Field>
              <FieldLabel htmlFor="conduct-appeal-decided">
                Date of the decision
              </FieldLabel>
              <Input
                id="conduct-appeal-decided"
                type="date"
                value={decisionDate}
                onChange={(event) => setDecisionDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="conduct-appeal-outcome" required>
                What was decided
              </FieldLabel>
              <Textarea
                id="conduct-appeal-outcome"
                required
                rows={3}
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={isPending} focusableWhenDisabled>
              {isPending ? (
                <>
                  <Spinner /> Recording...
                </>
              ) : (
                "Record appeal decision"
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
