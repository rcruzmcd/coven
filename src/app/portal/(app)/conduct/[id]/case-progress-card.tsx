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
import { toast } from "@/components/ui/toast";
import type { ConductStatus } from "@/lib/conduct";
import { advanceConductCaseAction } from "../actions";

/**
 * The case's own progress, one step at a time.
 *
 * Each step writes its date and its status in the same save, which is what
 * keeps the database's own pairing constraints from ever being the thing that
 * refuses one. There is no status dropdown, deliberately: "closed" without a
 * closing date and "decided" without a decision are states this product should
 * not be able to produce, and the surest way to guarantee that is to offer no
 * control that could.
 */
export function CaseProgressCard({
  reportId,
  status,
  acknowledgedOn,
  decidedOn,
  closedOn,
  today,
  canManage,
}: {
  reportId: string;
  status: ConductStatus;
  acknowledgedOn: string | null;
  decidedOn: string | null;
  closedOn: string | null;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [acknowledgeDate, setAcknowledgeDate] = useState(today);
  const [decisionDate, setDecisionDate] = useState(today);
  const [outcome, setOutcome] = useState("");
  const [closeDate, setCloseDate] = useState(today);

  function submit(values: Record<string, string>, success: string) {
    setError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);
    startTransition(async () => {
      const result = await advanceConductCaseAction(reportId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the case is</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="app-muted space-y-1">
          <li>
            Acknowledged:{" "}
            {acknowledgedOn ?? <span className="italic">not yet</span>}
          </li>
          <li>
            Decided: {decidedOn ?? <span className="italic">not yet</span>}
          </li>
          <li>Closed: {closedOn ?? <span className="italic">not yet</span>}</li>
        </ul>

        {!canManage && (
          <p className="app-muted">
            You are reviewing this case. Recording the acknowledgement, the
            decision and the close is the intake holder&rsquo;s.
          </p>
        )}

        {canManage && (
          <div className="space-y-4">
            {!acknowledgedOn && (
              <StepForm
                label="Tell the reporter you have it"
                isPending={isPending}
                submitLabel="Record acknowledgement"
                onSubmit={() =>
                  submit(
                    { step: "acknowledge", acknowledgedOn: acknowledgeDate },
                    "Acknowledgement recorded.",
                  )
                }
              >
                <Field>
                  <FieldLabel htmlFor="conduct-acknowledged-on">
                    Date you acknowledged it
                  </FieldLabel>
                  <Input
                    id="conduct-acknowledged-on"
                    type="date"
                    value={acknowledgeDate}
                    onChange={(event) => setAcknowledgeDate(event.target.value)}
                  />
                </Field>
              </StepForm>
            )}

            {status !== "reviewing" && !decidedOn && status !== "closed" && (
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() =>
                  submit({ step: "review" }, "Case marked under review.")
                }
              >
                Start the review
              </Button>
            )}

            {!decidedOn && status !== "closed" && (
              <StepForm
                label="Record the decision"
                isPending={isPending}
                submitLabel="Record decision"
                onSubmit={() =>
                  submit(
                    { step: "decide", decidedOn: decisionDate, outcome },
                    "Decision recorded.",
                  )
                }
              >
                <Field>
                  <FieldLabel htmlFor="conduct-decided-on">
                    Date of the decision
                  </FieldLabel>
                  <Input
                    id="conduct-decided-on"
                    type="date"
                    value={decisionDate}
                    onChange={(event) => setDecisionDate(event.target.value)}
                  />
                  <p className="app-muted text-xs">
                    Any appeal window your organization publishes runs from
                    here.
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="conduct-outcome">
                    What was decided
                  </FieldLabel>
                  <Textarea
                    id="conduct-outcome"
                    rows={3}
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                  />
                </Field>
              </StepForm>
            )}

            {status !== "closed" ? (
              <StepForm
                label="Close the case"
                isPending={isPending}
                submitLabel="Close case"
                onSubmit={() =>
                  submit({ step: "close", closedOn: closeDate }, "Case closed.")
                }
              >
                <Field>
                  <FieldLabel htmlFor="conduct-closed-on">
                    Date it was closed
                  </FieldLabel>
                  <Input
                    id="conduct-closed-on"
                    type="date"
                    value={closeDate}
                    onChange={(event) => setCloseDate(event.target.value)}
                  />
                  <p className="app-muted text-xs">
                    Closing changes nothing about an action still in force. An
                    interim measure is lifted where it is recorded, on its own
                    date.
                  </p>
                </Field>
              </StepForm>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                focusableWhenDisabled
                onClick={() => submit({ step: "reopen" }, "Case reopened.")}
              >
                Reopen the case
              </Button>
            )}
          </div>
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

function StepForm({
  label,
  children,
  submitLabel,
  isPending,
  onSubmit,
}: {
  label: string;
  children: React.ReactNode;
  submitLabel: string;
  isPending: boolean;
  onSubmit: () => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-[var(--line)] p-3"
    >
      <p className="font-semibold">{label}</p>
      {children}
      <Button type="submit" disabled={isPending} focusableWhenDisabled>
        {isPending ? (
          <>
            <Spinner /> Saving...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
