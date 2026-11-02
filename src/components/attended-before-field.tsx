"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTENDED_BEFORE_DESCRIPTION,
  ATTENDED_BEFORE_OPTIONS,
  ATTENDED_BEFORE_PLACEHOLDER,
  ATTENDED_BEFORE_QUESTION,
} from "@/lib/attended-before";

/**
 * The one "have you been before?" control (#1259), shared by the anonymous
 * registration form and the register-as-yourself form so the wording cannot
 * drift between them — and, more to the point, so neither can start asking it
 * differently from the other.
 *
 * A select with a placeholder rather than a required choice, the same shape
 * the profile questions use: leaving it alone is the third state, and it
 * is stored as null rather than as "no". The question is optional and the
 * description says so, because a registration is already saved either way.
 *
 * Nothing about it varies with who is asking. It renders identically for a
 * visitor with no session, an account whose claim has not been approved, and
 * somebody linked to a directory record — a control that behaved differently
 * would tell the reader whether the organization has a record of them.
 */
export function AttendedBeforeField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** `""` for unanswered, otherwise one of the option values. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{ATTENDED_BEFORE_QUESTION}</FieldLabel>
      <Select
        // Base UI shows `placeholder` only while the value is null; `""` is a
        // value as far as it is concerned, and renders an empty trigger. The
        // form's unanswered state is `""`, so it is mapped here rather than
        // leaking a second spelling of "no answer" out to both call sites.
        value={value || null}
        disabled={disabled}
        onValueChange={(next) => onChange(String(next ?? ""))}
      >
        <SelectTrigger id={id} className="w-full">
          {/* No children function: the Select wrapper derives its label map
              from the SelectItems below, so the trigger already renders the
              chosen option's label -- and a function here would be called for
              the null value too and paint over the placeholder. */}
          <SelectValue placeholder={ATTENDED_BEFORE_PLACEHOLDER} />
        </SelectTrigger>
        <SelectContent>
          {ATTENDED_BEFORE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{ATTENDED_BEFORE_DESCRIPTION}</FieldDescription>
    </Field>
  );
}
