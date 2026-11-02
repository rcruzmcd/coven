"use client";

import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import type {
  AnswerDraft,
  RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * The organization's profile questions (#1744) as a group of their own, on
 * registration step 2 and on /my/details. Grouped under a legend because they
 * are about the person rather than about this event or this contact record,
 * and nothing at all for a tenant asking none.
 *
 * `skippable` is registration step 2 (#1409 section 3): the group may be left
 * blank, so no field carries the browser's `required` -- that would hold the
 * step -- and the form checks `required` itself once anything is answered.
 */
export function ProfileQuestionsFieldset({
  idPrefix,
  questions,
  draft,
  onChange,
  disabled,
  skippable = false,
  legend = "A few questions about you",
  className,
  legendClassName,
}: {
  idPrefix: string;
  questions: readonly RegistrationQuestion[];
  draft: AnswerDraft;
  onChange: (draft: AnswerDraft) => void;
  disabled?: boolean;
  skippable?: boolean;
  legend?: string;
  className?: string;
  legendClassName?: string;
}) {
  if (questions.length === 0) return null;
  return (
    <FieldSet className={className}>
      <FieldLegend className={legendClassName}>{legend}</FieldLegend>
      {skippable && (
        <FieldDescription>
          Optional. Your answers are kept with your record, not only with this
          registration.
        </FieldDescription>
      )}
      <FieldGroup>
        <RegistrationQuestionsFields
          idPrefix={`${idPrefix}-profile`}
          questions={questions}
          draft={draft}
          onChange={onChange}
          required={!skippable}
          disabled={disabled}
        />
      </FieldGroup>
    </FieldSet>
  );
}
