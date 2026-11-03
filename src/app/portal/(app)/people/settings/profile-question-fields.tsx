"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import {
  QUESTION_OPTION_KEY_MAX_LENGTH,
  toRegistrationQuestion,
  type AnswerDraft,
} from "@/lib/registration-questions";
import {
  personQuestionsPayload,
  type PersonQuestionDraft,
} from "./profile-questions-draft";

export type ProgramOption = { id: string; name: string };

type FieldsProps = {
  question: PersonQuestionDraft;
  disabled?: boolean;
  onUpdate: (patch: Partial<PersonQuestionDraft>) => void;
};

function controlId(question: PersonQuestionDraft) {
  return `profile-question-${question.id}`;
}

/** The card's "Who's asked" group: where a person is asked, and for which events. */
export function WhoIsAskedFields({
  question,
  programs,
  disabled,
  onUpdate,
}: FieldsProps & { programs: ProgramOption[] }) {
  const id = controlId(question);
  return (
    <>
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

/** The card's "Data" group, after the shared column name: the code and the check-in copy. */
export function DataFields({ question, disabled, onUpdate }: FieldsProps) {
  const id = controlId(question);
  return (
    <>
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
          <FieldLabel htmlFor={`${id}-snapshot`}>
            Copy the answer at check-in
          </FieldLabel>
          <FieldDescription>
            Keeps the answer as it was on the day, so a past event&apos;s
            figures and breakdown never change when someone updates it.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${id}-snapshot`}
          checked={question.snapshotAtCheckin}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onUpdate({ snapshotAtCheckin: checked })
          }
        />
      </Field>
    </>
  );
}

/**
 * The selected question as the person answering sees it, through the same
 * fields registration and /my/details render. Its condition is left out: the
 * preview is of the question, not of the answers that would reveal it.
 */
export function QuestionPreview({
  question,
}: {
  question: PersonQuestionDraft;
}) {
  const preview = toRegistrationQuestion({
    ...personQuestionsPayload([question])[0],
    show_if: null,
  });

  return (
    <section
      aria-labelledby={`${controlId(question)}-preview`}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-[var(--line)] p-4"
    >
      <h3 id={`${controlId(question)}-preview`} className="app-eyebrow text-xs">
        Preview
      </h3>
      {preview ? (
        // Keyed on the kind, so an answer typed under one kind never reaches
        // another kind's control.
        <PreviewFields key={preview.kind} question={preview} />
      ) : (
        <p className="app-muted text-sm">
          Write a prompt to see the question as people will.
        </p>
      )}
    </section>
  );
}

function PreviewFields({
  question,
}: {
  question: NonNullable<ReturnType<typeof toRegistrationQuestion>>;
}) {
  const [draft, setDraft] = useState<AnswerDraft>({});
  return (
    <RegistrationQuestionsFields
      idPrefix="profile-preview"
      questions={[question]}
      draft={draft}
      onChange={setDraft}
    />
  );
}
