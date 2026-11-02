"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Spinner } from "@/components/ui/spinner";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import { runAction, type ActionResult } from "@/components/portal/action-toast";
import {
  answerRowsToAnswers,
  answersError,
  answersToDraft,
  draftToAnswers,
  visibleQuestions,
  type AnswerDraft,
  type RegistrationAnswers,
} from "@/lib/registration-questions";
import type { PersonAnswerRow, PersonQuestion } from "@/lib/person-questions";

/**
 * A person's answers to the organization's profile questions (#1744), on the
 * person's profile card and in the registrant sheet (and so at the door).
 *
 * Every current question reads against the answer stored for it, in the
 * tenant's order, leaving out a conditional one whose condition the answers
 * do not meet. Answers to questions archived since follow in their own words,
 * read-only: there is no question left to edit them against. An answer to an
 * archived option needs nothing special -- it is shown by its stored words,
 * and stays selectable while editing because the field offers an archived
 * option to the answer that already chose it.
 *
 * Staff are not held to `required` (#1409 section 3), so nothing here is.
 * `onSave` is the surface's own write path: `set_person_answers` from the
 * person record, `set_registrant_person_answers` from the registrant sheet.
 */
export function ProfileAnswers({
  idPrefix,
  questions,
  answers,
  canManage,
  onSave,
  onSaved,
}: {
  idPrefix: string;
  questions: readonly PersonQuestion[];
  answers: readonly PersonAnswerRow[];
  canManage: boolean;
  onSave: (answers: RegistrationAnswers) => Promise<ActionResult>;
  onSaved?: () => void;
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
  const archived = answers.filter(
    (row) => !row.question_id || !current.has(row.question_id),
  );
  const shown = visibleQuestions(questions, stored);

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
      const outcome = await runAction(() => onSave(next), {
        success: "Profile answers saved.",
        onError: setError,
      });
      if (outcome.ok) {
        setEditing(false);
        onSaved?.();
      }
    });
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id={`${idPrefix}-heading`}
          className="app-muted text-sm font-semibold"
        >
          Profile answers
        </h3>
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

      {editing ? (
        <FieldGroup>
          <RegistrationQuestionsFields
            idPrefix={idPrefix}
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
          {shown.map((question) => {
            const row = byQuestion.get(question.id);
            return (
              <ReadOnlyField
                key={question.id}
                label={row?.prompt_as_shown ?? question.prompt}
                htmlFor={`${idPrefix}-answer-${question.id}`}
              >
                {row?.answer_text ?? "Not answered"}
              </ReadOnlyField>
            );
          })}
        </FieldGroup>
      )}

      {archived.length > 0 && (
        <FieldGroup>
          {archived.map((row, index) => (
            <ReadOnlyField
              key={row.question_id ?? `archived-${index}`}
              label={`${row.prompt_as_shown} (question removed)`}
              htmlFor={`${idPrefix}-answer-archived-${index}`}
            >
              {row.answer_text}
            </ReadOnlyField>
          ))}
        </FieldGroup>
      )}
    </section>
  );
}
