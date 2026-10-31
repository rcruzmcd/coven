import { ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE } from "@/lib/adults-only";
import { MINOR_CONTACTS_REQUIRED_CODE } from "@/lib/minors";
import { REGISTRATION_OPTION_ERROR_CODES } from "@/lib/registration-options";
import { REGISTRATION_ANSWER_ERROR_CODES } from "@/lib/registration-questions";
import { REGISTRATION_CONTACT_ERROR_CODES } from "@/lib/registration-contact";

/**
 * The three steps of a registration form (#1413), at every width: the
 * questions about the registrant, the questions about this attendance, then a
 * summary of both beside the notices, the agreement and the button.
 *
 * A plain module rather than part of `registration-steps.tsx`, because the
 * server actions need the codes below and a `"use client"` module would hand
 * them a client reference instead of the value.
 */
export type RegistrationStep = "about" | "event" | "review";

export const REGISTRATION_STEPS: readonly RegistrationStep[] = [
  "about",
  "event",
  "review",
];

/** RPC error codes about something typed on "About you". */
const ABOUT_ERROR_CODES = new Set([
  "ALREADY_REGISTERED",
  "NAME_REQUIRED",
  "PRONOUNS_TOO_LONG",
  // #1647. The handle, or the contact in its place, is asked here.
  ...REGISTRATION_CONTACT_ERROR_CODES,
]);

/** RPC error codes about something typed on "This event" ("Your riding"). */
const EVENT_ERROR_CODES = new Set([
  "INVALID_PARTY_SIZE",
  MINOR_CONTACTS_REQUIRED_CODE,
  // #1417. The confirmation is asked on this step.
  ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE,
  // #1407. The question sits beside the party size, and a full option is
  // corrected there too.
  ...REGISTRATION_OPTION_ERROR_CODES,
  // #1501. The event's questions are asked on this step too.
  ...REGISTRATION_ANSWER_ERROR_CODES,
  // #1415. The riding questions are asked on this step.
  "INVALID_RIDER_PROFILE",
]);

/**
 * The step that owns an RPC error. Anything not about a typed field --
 * capacity, a closed window, the agreement -- is shown on the step the button
 * is on, since there is nothing further back to correct.
 */
export function registrationErrorStep(code: string): RegistrationStep {
  if (ABOUT_ERROR_CODES.has(code)) return "about";
  if (EVENT_ERROR_CODES.has(code)) return "event";
  return "review";
}

/**
 * The form fields `parseEventRegistrationForm` can refuse that belong to
 * "This event". Every other field it checks is on "About you".
 */
const EVENT_FIELDS = new Set([
  "partySize",
  "partyIncludesMinor",
  "minorContacts",
  "riding",
  "answers",
]);

/** The step that owns a field the form parser refused. */
export function registrationFieldStep(field?: string): RegistrationStep {
  return field && EVENT_FIELDS.has(field) ? "event" : "about";
}

/**
 * What the funnel's `form_failed` event may say about a refusal
 * (#1480): the RPC's error code, which is an upper-case token, and never its
 * message. Anything else -- a Postgres message, which can quote what was typed
 * -- is reported as `UNKNOWN`.
 */
export function registrationErrorCode(message: string): string {
  return /^[A-Z][A-Z0-9_]*$/.test(message) ? message : "UNKNOWN";
}
