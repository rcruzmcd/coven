"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NOT_LISTED, PlaceCombobox } from "@/components/place-combobox";
import {
  PLACE_OTHER_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  isPlaceAnswer,
  visibleQuestions,
  type AnswerDraft,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * An event's registration questions (#1501), in the event's order, with each
 * conditional one shown only while its condition holds. Shared by both public
 * registration forms, the registrant's own answers card and the portal's
 * dialogs and detail sheet, so a question reads the same wherever it is asked.
 *
 * `required = false` is the staff paths: the asterisks go, because nothing is
 * refused there.
 */
export function RegistrationQuestionsFields({
  idPrefix,
  questions,
  draft,
  onChange,
  required = true,
  disabled,
}: {
  idPrefix: string;
  questions: readonly RegistrationQuestion[];
  draft: AnswerDraft;
  onChange: (draft: AnswerDraft) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      {visibleQuestions(questions, draft).map((question) => (
        <QuestionField
          key={question.id}
          id={`${idPrefix}-question-${question.id}`}
          question={question}
          value={draft[question.id]}
          onChange={(value) => onChange({ ...draft, [question.id]: value })}
          required={required && question.required}
          disabled={disabled}
        />
      ))}
    </>
  );
}

function QuestionField({
  id,
  question,
  value,
  onChange,
  required,
  disabled,
}: {
  id: string;
  question: RegistrationQuestion;
  value: AnswerDraft[string] | undefined;
  onChange: (value: AnswerDraft[string]) => void;
  required: boolean;
  disabled?: boolean;
}) {
  const help = question.help ? (
    <FieldDescription>{question.help}</FieldDescription>
  ) : null;

  switch (question.kind) {
    case "single_choice":
      return (
        <Field>
          <FieldLabel htmlFor={id} required={required}>
            {question.prompt}
          </FieldLabel>
          <Select
            // `""` is a value to Base UI and would paint an empty trigger
            // over the placeholder; see AttendedBeforeField.
            value={typeof value === "string" && value ? value : null}
            disabled={disabled}
            required={required}
            onValueChange={(next) => onChange(String(next ?? ""))}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Select one" />
            </SelectTrigger>
            <SelectContent>
              {question.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </Field>
      );

    case "multi_choice": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <FieldSet>
          <FieldLegend variant="label">
            {question.prompt}
            {required && (
              <span
                data-slot="field-required"
                aria-hidden="true"
                className="ml-1 text-destructive"
              >
                *
              </span>
            )}
          </FieldLegend>
          {help}
          {question.options.map((option) => {
            const optionId = `${id}-${option.id}`;
            return (
              <Field key={option.id} orientation="horizontal">
                <Checkbox
                  id={optionId}
                  checked={chosen.includes(option.id)}
                  disabled={disabled}
                  onCheckedChange={(next) =>
                    onChange(
                      // In the question's order, whatever order they were
                      // ticked in.
                      question.options
                        .map((candidate) => candidate.id)
                        .filter((candidateId) =>
                          candidateId === option.id
                            ? next === true
                            : chosen.includes(candidateId),
                        ),
                    )
                  }
                />
                <FieldLabel htmlFor={optionId} className="font-normal">
                  {option.label}
                </FieldLabel>
              </Field>
            );
          })}
        </FieldSet>
      );
    }

    case "consent":
      return (
        <Field orientation="horizontal">
          <Checkbox
            id={id}
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(next) => onChange(next === true)}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={id}>{question.prompt}</FieldLabel>
            {help}
          </div>
        </Field>
      );

    case "number":
      return (
        <Field>
          <FieldLabel htmlFor={id} required={required}>
            {question.prompt}
          </FieldLabel>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            step={1}
            min={question.min_value ?? undefined}
            max={question.max_value ?? undefined}
            required={required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
        </Field>
      );

    case "place": {
      // #1699. A place from the list, or "Not listed" and a few words.
      const answer = isPlaceAnswer(value) ? value : null;
      const notListed = answer !== null && "other" in answer;
      const allowNotListed = question.place?.allow_other !== false;
      return (
        <Field>
          <FieldLabel htmlFor={id} required={required}>
            {question.prompt}
          </FieldLabel>
          <PlaceCombobox
            id={id}
            granularity={question.place?.granularity ?? "locality"}
            value={
              answer === null
                ? null
                : "place_id" in answer
                  ? { id: answer.place_id, kind: "place", label: answer.label }
                  : NOT_LISTED
            }
            onChange={(next) =>
              onChange(
                next === null
                  ? ""
                  : next.id === NOT_LISTED.id
                    ? { other: notListed && answer ? answer.other : "" }
                    : { place_id: next.id, label: next.label },
              )
            }
            allowNotListed={allowNotListed}
            required={required}
            disabled={disabled}
            placeholder={
              question.place?.granularity === "neighborhood"
                ? "Start typing a neighborhood, city, town or ZIP"
                : "Start typing a city, town or ZIP"
            }
          />
          {notListed && answer && "other" in answer && (
            <Input
              id={`${id}-other`}
              aria-label={`${question.prompt}: where you are from`}
              placeholder="Where are you from?"
              maxLength={PLACE_OTHER_MAX_LENGTH}
              required={required}
              disabled={disabled}
              value={answer.other}
              onChange={(event) => onChange({ other: event.target.value })}
            />
          )}
          {help}
        </Field>
      );
    }

    default:
      return (
        <Field>
          <FieldLabel htmlFor={id} required={required}>
            {question.prompt}
          </FieldLabel>
          <Input
            id={id}
            maxLength={SHORT_TEXT_MAX_LENGTH}
            required={required}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
        </Field>
      );
  }
}
