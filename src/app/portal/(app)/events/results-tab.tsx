"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCanReopenEventReportAction,
  reopenEventReportAction,
  submitEventReportAction,
  updateEventReportAction,
} from "./actions";
import {
  getEventImpactAction,
  upsertEventImpactAction,
  type EventImpactNotes,
} from "./impact-actions";
import { ReportStatusBadge, type EventRow } from "./event-badges";
import { EventReportSummary } from "./report-summary";
import { ArchivedImpactFigures, OutcomesSection } from "./outcomes-section";
import { RetroSection } from "./retro-section";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useTabData } from "@/hooks/use-tab-data";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function formStateFor(event: EventRow, impact: EventImpactNotes | undefined) {
  return {
    feedbackNotes: event.feedback_notes ?? "",
    contentNotes: event.content_notes ?? "",
    impactNotes: impact?.note?.notes ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(
  form: FormState,
  event: EventRow,
  impact: EventImpactNotes | undefined,
) {
  const baseline = formStateFor(event, impact);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export type ResultsTabHandle = {
  discard: () => void;
};

/**
 * Text typed into the retired `report_summary` field before #1576. Shown
 * read-only, and only on events that have some, so it is never lost.
 */
function ArchivedSummary({ event }: { event: EventRow }) {
  if (!event.report_summary?.trim()) return null;
  return (
    <ReadOnlyField label="Earlier written summary" htmlFor="report-summary">
      {event.report_summary}
    </ReadOnlyField>
  );
}

/** Every figure on the card, in the issue's order: Outcomes, then the rest. */
function Figures({
  event,
  derived,
  impact,
}: {
  event: EventRow;
  derived: EventImpactDerived | undefined;
  impact: EventImpactNotes | undefined;
}) {
  return (
    <div className="flex flex-col gap-6">
      {derived && <OutcomesSection eventId={event.id} derived={derived} />}
      <ArchivedImpactFigures eventId={event.id} note={impact?.note ?? null} />
      <EventReportSummary
        eventId={event.id}
        reportStatus={event.report_status}
      />
      <ArchivedSummary event={event} />
    </div>
  );
}

/**
 * The event's Results card (#1588): Report and Impact merged. Outcomes, then
 * the Money/Goods/Sponsors/Team/Operations summary, then the free text --
 * every figure derived, and only the text typed. Status, Submit and Reopen
 * apply to all of it, and submitting locks all of it.
 */
export function ResultsTab({
  event,
  derived,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  /** Outcomes' figures, from the shared get_event_impact_derived_data read. */
  derived?: EventImpactDerived;
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ResultsTabHandle>;
}) {
  const router = useRouter();
  const {
    data: impact,
    loadError: impactLoadError,
    refresh: refreshImpact,
  } = useTabData<EventImpactNotes>(
    () => getEventImpactAction(event.id),
    [event.id],
  );
  const [form, setForm] = useState(() => formStateFor(event, impact));
  const [prevImpact, setPrevImpact] = useState(impact);
  if (impact !== prevImpact) {
    setPrevImpact(impact);
    setForm((prev) => ({ ...prev, impactNotes: impact?.note?.notes ?? "" }));
  }
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const locked = event.report_status === "submitted";
  // Only a submitted report can be reopened, so don't probe the permission
  // until it is -- this is a real gate, not a "is my tab on screen" one.
  const { data: reopenContext } = useTabData<{ canReopen: boolean }>(
    () => getCanReopenEventReportAction(),
    [locked],
    locked,
  );
  const canReopen = reopenContext?.canReopen ?? false;
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopening, startReopenTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event, impact));
  }, [form, event, impact, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event, impact));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("feedbackNotes", form.feedbackNotes);
    formData.set("contentNotes", form.contentNotes);
    // Impact notes are their own row and permission (event_impact:manage);
    // only sent when they changed, so a reader who may not write them never
    // trips a refusal by saving the rest.
    const notesChanged =
      impact?.canManage && form.impactNotes !== (impact.note?.notes ?? "");
    const notesData = new FormData();
    notesData.set("notes", form.impactNotes);

    startTransition(async () => {
      await runAction(
        async () => {
          const result = await updateEventReportAction(event.id, formData);
          if ("error" in result || !notesChanged) return result;
          return upsertEventImpactAction(event.id, notesData);
        },
        {
          success: "Event results saved.",
          onError: setError,
          onSuccess: () => {
            refreshImpact();
            router.refresh();
            onSaved();
          },
        },
      );
    });
  }

  function handleSubmitReport() {
    setError(null);
    startSubmitTransition(async () => {
      await runAction(() => submitEventReportAction(event.id), {
        success: "Event report submitted.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleReopen(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    startReopenTransition(async () => {
      await runAction(() => reopenEventReportAction(event.id, reopenReason), {
        success: "Event report reopened.",
        onError: setError,
        onSuccess: () => {
          setReopenDialogOpen(false);
          setReopenReason("");
          router.refresh();
        },
      });
    });
  }

  if (mode === "view" || locked) {
    return (
      <>
        <FieldGroup>
          <Field>
            <FieldLabel>Report status</FieldLabel>
            <div className="flex items-center gap-2">
              <ReportStatusBadge status={event.report_status} />
              {locked && canReopen && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReopenDialogOpen(true)}
                >
                  Reopen report
                </Button>
              )}
            </div>
          </Field>
          <Figures event={event} derived={derived} impact={impact} />
          {impactLoadError && (
            <Alert variant="destructive">
              <AlertDescription>{impactLoadError}</AlertDescription>
            </Alert>
          )}
          <ReadOnlyField
            label="Participant feedback"
            htmlFor="report-feedbackNotes"
          >
            {form.feedbackNotes || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Photos / content" htmlFor="report-contentNotes">
            {form.contentNotes || "—"}
          </ReadOnlyField>
          {impact?.canView && (
            <ReadOnlyField label="Impact notes" htmlFor="report-impactNotes">
              {form.impactNotes || "—"}
            </ReadOnlyField>
          )}
          <RetroSection eventId={event.id} />
          {event.report_status !== "submitted" && (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={handleSubmitReport}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner /> Submitting...
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>

        <PortalFormSurface
          open={reopenDialogOpen}
          onOpenChange={(next) => {
            setReopenDialogOpen(next);
            if (!next) setReopenReason("");
          }}
          title="Reopen report"
          description="Explain why this submitted report is being reopened. Event details, Planning, Registration, and Results will become editable again."
          size="md"
          onSubmit={handleReopen}
          footer={
            <>
              <PortalFormSurfaceClose
                render={<Button type="button" variant="secondary" />}
              >
                Cancel
              </PortalFormSurfaceClose>
              <Button type="submit" disabled={isReopening}>
                {isReopening ? (
                  <>
                    <Spinner /> Reopening...
                  </>
                ) : (
                  "Reopen report"
                )}
              </Button>
            </>
          }
        >
          <FieldGroup>
            <RequiredFieldsNote />
            <Field>
              <FieldLabel htmlFor="reopen-report-reason" required>
                Reason
              </FieldLabel>
              <Textarea
                id="reopen-report-reason"
                required
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
              />
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </PortalFormSurface>
      </>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Report status</FieldLabel>
          <div>
            <ReportStatusBadge status={event.report_status} />
          </div>
        </Field>

        <Figures event={event} derived={derived} impact={impact} />
        {impactLoadError && (
          <Alert variant="destructive">
            <AlertDescription>{impactLoadError}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="report-feedbackNotes">
            Participant feedback
          </FieldLabel>
          <Textarea
            id="report-feedbackNotes"
            value={form.feedbackNotes}
            onChange={(changeEvent) =>
              update("feedbackNotes", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-contentNotes">
            Photos / content
          </FieldLabel>
          <Textarea
            id="report-contentNotes"
            placeholder="Links to shared albums, social posts, etc."
            value={form.contentNotes}
            onChange={(changeEvent) =>
              update("contentNotes", changeEvent.target.value)
            }
          />
        </Field>

        {impact?.canView &&
          (impact.canManage ? (
            <Field>
              <FieldLabel htmlFor="report-impactNotes">Impact notes</FieldLabel>
              <Textarea
                id="report-impactNotes"
                placeholder="Stories and context behind the outcomes."
                value={form.impactNotes}
                onChange={(changeEvent) =>
                  update("impactNotes", changeEvent.target.value)
                }
              />
            </Field>
          ) : (
            <ReadOnlyField label="Impact notes" htmlFor="report-impactNotes">
              {form.impactNotes || "—"}
            </ReadOnlyField>
          ))}

        <RetroSection eventId={event.id} />

        {event.report_status !== "submitted" && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={handleSubmitReport}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner /> Submitting...
              </>
            ) : (
              "Submit report"
            )}
          </Button>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
