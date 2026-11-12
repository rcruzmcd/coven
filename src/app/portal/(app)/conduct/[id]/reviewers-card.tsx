"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/portal/status-badge";
import { toast } from "@/components/ui/toast";
import {
  appealReviewerOverlap,
  reviewerShortfall,
  type ConductProcess,
  type ConductReviewStage,
} from "@/lib/conduct";
import {
  assignConductReviewerAction,
  listConductReviewerCandidatesAction,
  recuseFromConductReportAction,
  unassignConductReviewerAction,
  type ConductReviewerCandidate,
} from "../actions";
import type { ConductReviewerRow } from "../conduct-shared";

/**
 * A native `<select>`, not the shadcn one, and the reason is worth keeping:
 * Base UI's Select portals its popup and traps focus with `aria-hidden`
 * sentinel spans that carry `tabindex="0"`, which axe reports as
 * `aria-hidden-focus`. Inside a dialog nothing opens that popup during the
 * accessibility scan; on a page, the scan's `select-open` surface does, and
 * this was the first portal page to render one outside a dialog. The portal's
 * other in-page selects are native for the same class of reason, and this is
 * the string they all use.
 */
const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Who is on the case, at each stage, and who stepped back.
 *
 * Three things here are the ticket rather than presentation:
 *
 *   * a recusal keeps its row and its reason, so "two unconflicted reviewers"
 *     is evidence rather than an assumption;
 *   * the shortfall against the organization's own minimum is REPORTED, never
 *     enforced -- a three-person board handling a report that names one of them
 *     may have nobody left to ask, and a portal that refused to let the review
 *     proceed would simply be a portal nobody used for it;
 *   * stepping back is the reviewer's own button. A conflict is something only
 *     they know about, and a process that makes them ask an administrator to
 *     record it at eleven at night records nothing.
 */
export function ReviewersCard({
  reportId,
  reviewers,
  actorNames,
  currentUserId,
  process,
  canManage,
  hasAppeal,
}: {
  reportId: string;
  reviewers: ConductReviewerRow[];
  actorNames: Record<string, string>;
  currentUserId: string | null;
  process: ConductProcess;
  canManage: boolean;
  hasAppeal: boolean;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<ConductReviewerCandidate[]>([]);
  const [userId, setUserId] = useState("");
  const [stage, setStage] = useState<ConductReviewStage>("review");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void (async () => {
      const result = await listConductReviewerCandidatesAction();
      if (!cancelled && "data" in result) setCandidates(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  const overlap = appealReviewerOverlap(reviewers, process);
  const mine = reviewers.find(
    (reviewer) =>
      reviewer.user_id === currentUserId && reviewer.recused_on === null,
  );

  function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("stage", stage);
    startTransition(async () => {
      const result = await assignConductReviewerAction(reportId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setUserId("");
      toast.success("Reviewer assigned.");
      router.refresh();
    });
  }

  function handleRecuse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("reason", reason);
    startTransition(async () => {
      const result = await recuseFromConductReportAction(reportId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Recorded. This case is no longer yours to read.");
      router.push("/portal/conduct");
    });
  }

  function handleUnassign(reviewerId: string) {
    setError(null);
    startTransition(async () => {
      const result = await unassignConductReviewerAction(reportId, reviewerId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Reviewer removed.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviewers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {(["review", "appeal"] as const).map((groupStage) => {
          const rows = reviewers.filter(
            (reviewer) => reviewer.stage === groupStage,
          );
          if (groupStage === "appeal" && !hasAppeal && rows.length === 0) {
            return null;
          }
          const shortfall = reviewerShortfall(reviewers, groupStage, process);

          return (
            <div key={groupStage} className="space-y-2">
              <p className="app-eyebrow">
                {groupStage === "review" ? "The review" : "The appeal"}
              </p>
              {rows.length === 0 ? (
                <p className="app-muted">Nobody assigned yet.</p>
              ) : (
                <ul className="space-y-1">
                  {rows.map((reviewer) => (
                    <li
                      key={reviewer.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span
                        className={
                          reviewer.recused_on ? "app-muted line-through" : ""
                        }
                      >
                        {actorNames[reviewer.user_id] ?? "Someone"}
                      </span>
                      {reviewer.recused_on && (
                        <StatusBadge tone="neutral">
                          Recused {reviewer.recused_on}
                        </StatusBadge>
                      )}
                      {reviewer.recusal_reason && (
                        <span className="app-muted">
                          — {reviewer.recusal_reason}
                        </span>
                      )}
                      {canManage && !reviewer.recused_on && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          focusableWhenDisabled
                          onClick={() => handleUnassign(reviewer.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {shortfall !== null && shortfall > 0 && (
                <p className="app-muted">
                  {shortfall} short of the {process.reviewerMinimum} your code
                  of conduct commits to. Recorded either way — this is a note,
                  not a block.
                </p>
              )}
            </div>
          );
        })}

        {overlap.length > 0 && (
          <Alert>
            <AlertDescription>
              {overlap.map((id) => actorNames[id] ?? "Someone").join(", ")} was
              part of the original decision, and your code of conduct says an
              appeal is heard by people who were not. Recorded as it stands.
            </AlertDescription>
          </Alert>
        )}

        {canManage && (
          <form
            onSubmit={handleAssign}
            className="space-y-3 border-t border-[var(--line)] pt-3"
          >
            <Field>
              <FieldLabel htmlFor="conduct-assign-user">
                Assign somebody
              </FieldLabel>
              <select
                id="conduct-assign-user"
                className={selectClassName}
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              >
                <option value="">Choose a reviewer</option>
                {candidates.map((candidate) => (
                  <option key={candidate.user_id} value={candidate.user_id}>
                    {candidate.full_name || candidate.email || "Someone"}
                  </option>
                ))}
              </select>
              <p className="app-muted text-xs">
                Only people whose role carries Conduct reports appear here,
                because assignment is what lets somebody read the case. Grant it
                in Administration › Roles to add somebody.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="conduct-assign-stage">For</FieldLabel>
              <select
                id="conduct-assign-stage"
                className={selectClassName}
                value={stage}
                onChange={(event) =>
                  setStage(
                    event.target.value === "appeal" ? "appeal" : "review",
                  )
                }
              >
                <option value="review">The review</option>
                <option value="appeal">The appeal</option>
              </select>
            </Field>
            <Button type="submit" disabled={isPending || !userId}>
              {isPending ? (
                <>
                  <Spinner /> Assigning...
                </>
              ) : (
                "Assign"
              )}
            </Button>
          </form>
        )}

        {mine && (
          <form
            onSubmit={handleRecuse}
            className="space-y-3 border-t border-[var(--line)] pt-3"
          >
            <Field>
              <FieldLabel htmlFor="conduct-recuse-reason" required>
                Step back from this case
              </FieldLabel>
              <Input
                id="conduct-recuse-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why you are conflicted"
              />
              <p className="app-muted text-xs">
                Your reason is kept beside your name. The case leaves your view
                entirely once you do this — not just your vote.
              </p>
            </Field>
            <Button
              type="submit"
              variant="secondary"
              disabled={isPending}
              focusableWhenDisabled
            >
              {isPending ? (
                <>
                  <Spinner /> Recording...
                </>
              ) : (
                "Recuse myself"
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
