"use client";

import { useState, useTransition } from "react";
import {
  setRegistrationAnswersAction,
  type RegistrantAnswerRow,
} from "./registrants-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Spinner } from "@/components/ui/spinner";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import { runAction } from "@/components/portal/action-toast";
import {
  answerRowsToAnswers,
  answersError,
  answersToDraft,
  draftToAnswers,
  sortAnswerRows,
  visibleQuestions,
  type AnswerDraft,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { answerColumns } from "@/lib/registration-answer-columns";
import { formatDateTime } from "@/lib/format";

/**
 * A registration's answers to its event's registration questions (#1501), in
 * the registrant detail sheet.
 *
 * Current questions read in the event's order, each against the answer stored
 * for it; a conditional one whose condition this registration does not meet
 * is left out, as the form left it out. Answers to questions archived since
 * follow, in their own words and read-only -- the question they answered no
 * longer exists to edit them against.
 *
 * Staff with `events: manage` edit the current answers in place. Nothing is
 * required there, as nothing is in the add-registrant and walk-in dialogs.
 */
export function RegistrantAnswers({
  registrationId,
  questions,
  answers,
  canManage,
  onSaved,
  changedAt = null,
}: {
  registrationId: string;
  questions: readonly RegistrationQuestion[];
  answers: readonly RegistrantAnswerRow[];
  canManage: boolean;
  onSaved?: () => void;
  /**
   * When the registrant last changed these themselves after registering
   * (#1591), so whoever planned off the first answers knows they moved.
   */
  changedAt?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnswerDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = new Set(questions.map((question) => question.id));
  const stored = answerRowsToAnswers(answers);
  const byQuestion = new Map(
    answers.flatMap((row) =>
      row.question_id ? [[row.question_id, row] as const] : [],
    ),
  );
  const archived = sortAnswerRows(
    answers.filter((row) => !row.question_id || !current.has(row.question_id)),
  );
  // #1512. The same grouping as the list's columns: a follow-up reads
  // indented under the answer it depends on.
  const visible = new Set(
    visibleQuestions(questions, stored).map((question) => question.id),
  );
  const shown = answerColumns(questions).flatMap(({ question, followUps }) =>
    visible.has(question.id)
      ? [
          {
            question,
            followUps: followUps.filter((followUp) => visible.has(followUp.id)),
          },
        ]
      : [],
  );

  if (questions.length === 0 && archived.length === 0) return null;

  function startEditing() {
    setDraft(answersToDraft(questions, stored));
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    const next = draftToAnswers(questions, draft);
    const invalid = answersError(questions, next, { required: false });
    if (invalid) {
      setError(invalid.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => setRegistrationAnswersAction(registrationId, next),
        { success: "Answers saved.", onError: setError },
      );
      if (outcome.ok) {
        setEditing(false);
        onSaved?.();
      }
    });
  }

  return (
    <section className="mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="app-muted text-sm font-semibold">Answers</h3>
        {canManage && questions.length > 0 && !editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startEditing}
          >
            Edit answers
          </Button>
        )}
      </div>

      {changedAt && (
        <p className="app-muted text-sm">
          Changed by the registrant on {formatDateTime(changedAt)}.
        </p>
      )}

      {editing ? (
        <FieldGroup>
          <RegistrationQuestionsFields
            idPrefix="registrant-answers"
            questions={questions}
            draft={draft}
            onChange={setDraft}
            required={false}
            disabled={isPending}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save answers"
              )}
            </Button>
          </div>
        </FieldGroup>
      ) : (
        <FieldGroup>
          {shown.map(({ question, followUps }) => (
            <div key={question.id} className="flex flex-col gap-3">
              <ReadOnlyField
                label={question.prompt}
                htmlFor={`registrant-answer-${question.id}`}
              >
                {byQuestion.get(question.id)?.answer_text ?? "Not answered"}
              </ReadOnlyField>
              {followUps.length > 0 && (
                <div className="ml-4 flex flex-col gap-3 border-l pl-3">
                  {followUps.map((followUp) => (
                    <ReadOnlyField
                      key={followUp.id}
                      label={followUp.prompt}
                      htmlFor={`registrant-answer-${followUp.id}`}
                    >
                      {byQuestion.get(followUp.id)?.answer_text ??
                        "Not answered"}
                    </ReadOnlyField>
                  ))}
                </div>
              )}
            </div>
          ))}
        </FieldGroup>
      )}

      {/* Read-only even while editing: their question is gone, and the RPC
          leaves them as they are. */}
      {archived.length > 0 && (
        <FieldGroup>
          {archived.map((row, index) => (
            <ReadOnlyField
              key={row.question_id ?? `archived-${index}`}
              label={`${row.prompt_as_shown} (question removed)`}
              htmlFor={`registrant-answer-archived-${index}`}
            >
              {row.answer_text}
            </ReadOnlyField>
          ))}
        </FieldGroup>
      )}
    </section>
  );
}
