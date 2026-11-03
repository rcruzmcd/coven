"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  type MinimumAge,
  minimumAgeConfirmationLabel,
} from "@/lib/adults-only";

/**
 * "Everyone in my party is 18 or over" (#1417; the event's age since #1782),
 * on step 2 of both registration forms for an event with an age requirement. Unticked, and `required` so the
 * step cannot be left without it; the RPC refuses a registration without it
 * independently.
 */
export function AdultsOnlyConfirmationField({
  minimumAge,
  id,
  checked,
  onChange,
  disabled,
}: {
  minimumAge: MinimumAge;
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled}
        required
      />
      <FieldLabel htmlFor={id} required>
        {minimumAgeConfirmationLabel(minimumAge)}
      </FieldLabel>
    </Field>
  );
}
