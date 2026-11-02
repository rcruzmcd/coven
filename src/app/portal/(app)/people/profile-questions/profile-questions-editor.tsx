"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import { QuestionList } from "@/components/portal/question-editor";
import {
  MAX_QUESTIONS,
  QUESTION_OPTION_KEY_MAX_LENGTH,
} from "@/lib/registration-questions";
import { normalizeConditions } from "@/lib/question-drafts";
import {
  PERSON_QUESTION_KINDS,
  type PersonQuestion,
} from "@/lib/person-questions";
import {
  newPersonQuestionDraft,
  personQuestionDrafts,
  personQuestionsDraftError,
  personQuestionsPayload,
  samePersonQuestions,
  type PersonQuestionDraft,
} from "./profile-questions-draft";
import {
  savePersonQuestionsAction,
  type ProfileQuestionsActionResult,
} from "./actions";

export type ProgramOption = { id: string; name: string };

/** How many people answered a question, by its id. */
export type QuestionUsage = Record<string, number>;

/** People lists and exports head a column with it; the prompt is a sentence. */
const COLUMN_LABEL = {
  label: "Column name in lists and exports",
  description:
    "A word or two, like “Level”. Left blank, the start of the prompt is used.",
};

/**
 * The tenant's profile questions (#1743), edited as one ordered list with
 * #1501's question card and saved together. A question removed while people
 * have answered it is archived with their answers and listed below, where it
 * can be restored.
 */
export function ProfileQuestionsEditor({
  questions,
  archived,
  programs,
  usage,
}: {
  questions: PersonQuestion[];
  archived: PersonQuestion[];
  programs: ProgramOption[];
  usage: QuestionUsage;
}) {
  const router = useRouter();
  const [saved] = useState(() => personQuestionDrafts(questions));
  const [drafts, setDrafts] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dirty = !samePersonQuestions(drafts, saved);
  const restorable = personQuestionDrafts(archived).filter(
    (draft) => !drafts.some((other) => other.id === draft.id),
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = personQuestionsDraftError(drafts);
    setError(problem);
    if (problem) return;
    startTransition(async () => {
      await runAction<ProfileQuestionsActionResult>(
        () => savePersonQuestionsAction(personQuestionsPayload(drafts)),
        {
          success: "Profile questions saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Questions</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="app-muted text-sm">
            Each person has one current answer to each question. Staff see every
            question on the person form; the switches on each question say where
            people are asked themselves. Removing a question people have
            answered archives it with their answers.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {drafts.length === 0 ? (
            <p className="app-muted text-sm">
              No questions yet. Until you add one, nobody is asked anything.
            </p>
          ) : null}

          <QuestionList
            value={drafts}
            onChange={setDrafts}
            idPrefix="profile"
            kinds={PERSON_QUESTION_KINDS}
            columnLabel={COLUMN_LABEL}
            disabled={isPending}
            renderExtras={(question, update) => (
              <PersonQuestionFields
                question={question}
                programs={programs}
                answers={usage[question.id] ?? 0}
                disabled={isPending}
                onUpdate={update}
              />
            )}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || drafts.length >= MAX_QUESTIONS}
              onClick={() => setDrafts([...drafts, newPersonQuestionDraft()])}
            >
              <Plus /> Add question
            </Button>
            <Button type="submit" disabled={isPending || !dirty}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save questions"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {restorable.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Archived questions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="app-muted text-sm">
              No longer asked. People&apos;s answers are kept. Restoring one
              adds it to the end of the list above; save to ask it again.
            </p>
            <ul className="flex flex-col gap-2">
              {restorable.map((draft) => (
                <li
                  key={draft.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="min-w-0 text-sm">
                    {draft.prompt}
                    <span className="app-muted">
                      {" "}
                      &middot; {answeredBy(usage[draft.id] ?? 0)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || drafts.length >= MAX_QUESTIONS}
                    onClick={() =>
                      // Its condition may name a question that has gone since.
                      setDrafts(normalizeConditions([...drafts, draft]))
                    }
                  >
                    <ArchiveRestore /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </form>
  );
}

function answeredBy(count: number) {
  return count === 1 ? "answered by 1 person" : `answered by ${count} people`;
}

/** What a person question adds to #1501's card: its code, where and for whom it is asked. */
function PersonQuestionFields({
  question,
  programs,
  answers,
  disabled,
  onUpdate,
}: {
  question: PersonQuestionDraft;
  programs: ProgramOption[];
  answers: number;
  disabled?: boolean;
  onUpdate: (patch: Partial<PersonQuestionDraft>) => void;
}) {
  const id = `profile-question-${question.id}`;

  return (
    <>
      {answers > 0 ? (
        <p className="app-muted text-sm">
          {answeredBy(answers)[0].toUpperCase() + answeredBy(answers).slice(1)}.
          Its answer type can&apos;t change now; archive options people chose
          rather than removing them.
        </p>
      ) : null}

      <Field>
        <FieldLabel htmlFor={`${id}-key`}>Code</FieldLabel>
        <Input
          id={`${id}-key`}
          className="font-mono"
          value={question.key}
          maxLength={QUESTION_OPTION_KEY_MAX_LENGTH}
          placeholder="Optional"
          disabled={disabled}
          aria-describedby={`${id}-key-description`}
          onChange={(event) => onUpdate({ key: event.target.value })}
        />
        <FieldDescription id={`${id}-key-description`}>
          An optional stable name, like ski_level, for anything that must keep
          finding this question whatever its prompt says.
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${id}-after-registration`}>
            Ask after event registration
          </FieldLabel>
          <FieldDescription>
            On the step after someone registers for an event. They can skip it.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${id}-after-registration`}
          checked={question.askAfterRegistration}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onUpdate({ askAfterRegistration: checked })
          }
        />
      </Field>

      {question.askAfterRegistration && programs.length > 0 ? (
        <FieldSet>
          <FieldLegend variant="label">Only for events in</FieldLegend>
          <FieldDescription>
            None ticked asks after every event.
          </FieldDescription>
          {programs.map((program) => {
            const programId = `${id}-program-${program.id}`;
            return (
              <Field key={program.id} orientation="horizontal">
                <Checkbox
                  id={programId}
                  checked={question.programIds.includes(program.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onUpdate({
                      // In the page's order, whatever order they were ticked in.
                      programIds: programs
                        .map((other) => other.id)
                        .filter((other) =>
                          other === program.id
                            ? checked === true
                            : question.programIds.includes(other),
                        ),
                    })
                  }
                />
                <FieldLabel htmlFor={programId}>{program.name}</FieldLabel>
              </Field>
            );
          })}
        </FieldSet>
      ) : null}

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${id}-my-details`}>
            Ask on their details page
          </FieldLabel>
          <FieldDescription>
            Where someone signed in to the website keeps their own record up to
            date.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${id}-my-details`}
          checked={question.askOnMyDetails}
          disabled={disabled}
          onCheckedChange={(checked) => onUpdate({ askOnMyDetails: checked })}
        />
      </Field>
    </>
  );
}
