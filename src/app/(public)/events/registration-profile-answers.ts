import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROFILE_ANSWERS_FIELD,
  personAnswersErrorMessage,
} from "@/lib/person-questions";
import {
  parseAnswersField,
  type RegistrationAnswers,
} from "@/lib/registration-questions";

/**
 * Registration step 2's profile answers (#1744), read off the form. Null
 * where the form asked none -- which `save_registrant_person_answers()` would
 * read as "nothing submitted" anyway.
 */
export function parseProfileAnswers(
  formData: FormData,
): { answers: RegistrationAnswers | null } | { error: string } {
  const parsed = parseAnswersField(formData, PROFILE_ANSWERS_FIELD);
  if ("error" in parsed) {
    return { error: personAnswersErrorMessage("PERSON_ANSWERS_INVALID") };
  }
  return parsed;
}

/**
 * Stores step 2's profile answers on the person the registration resolved
 * to, with the new registration's id as the credential (a day, as the rider
 * profile had it). After the registration rather than inside it: the
 * registration is what the visitor came to do, so a refused answer must not
 * undo it. Returns what to tell them when it is refused, or null.
 *
 * Submitting nothing writes nothing, and an anonymous registrant's answers
 * overwrite the person's stored ones (last write wins, open question 3,
 * decided on #1744).
 */
export async function saveRegistrationProfileAnswers(
  supabase: SupabaseClient,
  {
    registrationId,
    answers,
    ipAddress,
  }: {
    registrationId: string;
    answers: RegistrationAnswers | null;
    ipAddress: string | null;
  },
): Promise<string | null> {
  if (!answers || Object.keys(answers).length === 0) return null;
  const { error } = await supabase.rpc("save_registrant_person_answers", {
    p_registration_id: registrationId,
    p_answers: answers,
    p_ip_address: ipAddress ?? undefined,
  });
  return error ? PROFILE_ANSWERS_NOT_SAVED : null;
}

/**
 * One sentence whatever the refusal: the form checked the answers before
 * sending, so the reasons left (a question changed, the day-old credential,
 * the rate limit) are none of them the registrant's to fix on this screen.
 */
export const PROFILE_ANSWERS_NOT_SAVED =
  "Your answers to the questions about you could not be saved, but your registration is.";
