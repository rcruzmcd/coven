/**
 * An event's age requirement (#1417, #1782): none, 18+ or 21+.
 *
 * Set, the public site shows the age as a badge, registration's step 2 asks
 * every registrant to confirm that everyone in their party is that age or
 * over, and the under-18 question (#685, #1416) is never asked. The RPC
 * refuses a registration without the confirmation and records when it was
 * given and for which age, so the form's checkbox is a convenience and never
 * the gate.
 */

/** The ages an event can require (`events.minimum_age`). */
export const MINIMUM_AGES = [18, 21] as const;

export type MinimumAge = (typeof MINIMUM_AGES)[number];

/** A stored or posted age, or null for none or anything unrecognised. */
export function parseMinimumAge(value: unknown): MinimumAge | null {
  const age = Number(value);
  return (MINIMUM_AGES as readonly number[]).includes(age)
    ? (age as MinimumAge)
    : null;
}

/** "18+", the badge's text and the read-only setting's. */
export function minimumAgeLabel(age: MinimumAge): string {
  return `${age}+`;
}

/** What the badge means, for a screen reader and a tooltip. */
export function minimumAgeDescription(age: MinimumAge): string {
  return `Adults only: everyone must be ${age} or over`;
}

/** The checkbox's label, worded once so the two registration forms agree. */
export function minimumAgeConfirmationLabel(age: MinimumAge): string {
  return `Everyone in my party is ${age} or over`;
}

/** The form field the confirmation posts as. */
export const ADULTS_ONLY_CONFIRMED_FIELD = "adultsOnlyConfirmed";

/**
 * What the RPC raises without the confirmation. Its DETAIL is the age
 * (#1782), which {@link minimumAgeConfirmationRequiredError} names.
 */
export const ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE =
  "ADULTS_ONLY_CONFIRMATION_REQUIRED";

/** The refusal's sentence, for the age in the error's DETAIL (18 if absent). */
export function minimumAgeConfirmationRequiredError(detail: unknown): string {
  const age = parseMinimumAge(detail) ?? 18;
  return `This event is for ages ${age}+ only. Please confirm everyone in your party is ${age} or over.`;
}

/** Whether the form's box was ticked. Anything but "on" is not a confirmation. */
export function parseAdultsOnlyConfirmed(formData: FormData): boolean {
  return formData.get(ADULTS_ONLY_CONFIRMED_FIELD) === "on";
}
