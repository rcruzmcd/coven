"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";
import { issueConfirmationAnswersLink } from "@/lib/notifications/registration-answer-self-links";
import {
  ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE,
  minimumAgeConfirmationRequiredError,
  parseAdultsOnlyConfirmed,
} from "@/lib/adults-only";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import {
  parseOptionCounts,
  REGISTRATION_OPTION_ERROR_MESSAGES,
} from "@/lib/registration-options";
import {
  parseAnswersField,
  REGISTRATION_ANSWER_ERROR_MESSAGES,
} from "@/lib/registration-questions";
import { parseAttendedBefore } from "@/lib/attended-before";
import {
  parseRegistrationContact,
  REGISTRATION_CONTACT_ERROR_MESSAGES,
} from "@/lib/registration-contact";
import {
  MINOR_CONTACTS_REQUIRED_CODE,
  MINOR_CONTACTS_REQUIRED_ERROR,
  parseRegistrationMinors,
} from "@/lib/minors";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { publicEventPath } from "./event-path";
import {
  parseProfileAnswers,
  saveRegistrationProfileAnswers,
} from "./registration-profile-answers";
import {
  registrationErrorCode,
  registrationErrorStep,
  type RegistrationStep,
} from "./registration-step";

/** `step` and `code` as on `RegisterForEventResult` (#1403, #1480). */
export type RegisterMyselfResult =
  | { error: string; step: RegistrationStep; code?: string }
  | {
      success: true;
      registrationId: string;
      /** #1744, as on `RegisterForEventResult`. */
      profileAnswersError: string | null;
    };

const ERROR_MESSAGES: Record<string, string> = {
  EVENT_NOT_FOUND: "This event could not be found.",
  REGISTRATION_CLOSED: "Registration is not open for this event.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline for this event has passed.",
  EVENT_AT_CAPACITY: "This event has reached capacity.",
  ALREADY_REGISTERED: "You are already registered for this event.",
  INVALID_PARTY_SIZE: "Party size must be at least 1.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  NO_RECORD: "We could not find your record. Please sign in again.",
  // #685. The form asks for the four the moment somebody answers yes, so this
  // is the belt to that braces.
  [MINOR_CONTACTS_REQUIRED_CODE]: MINOR_CONTACTS_REQUIRED_ERROR,
  // #686. Three ways a waiver can stop a registration, and they are three
  // different things to say. The first is the reader's to fix; the second is
  // nobody's fault and asks them to read again; the third is the
  // organization's and is a state its own portal refuses to create.
  WAIVER_REQUIRED: "Please read the agreement and tick the box to register.",
  WAIVER_CHANGED:
    "The agreement was updated while you were filling this in. Reload the page, read it again, and register.",
  WAIVER_UNAVAILABLE:
    "This organization's participant agreement could not be loaded, so we can't take your registration right now. Please try again shortly.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  // #1407
  ...REGISTRATION_OPTION_ERROR_MESSAGES,
  // #1501
  ...REGISTRATION_ANSWER_ERROR_MESSAGES,
  // #1647, as on the anonymous path.
  ...REGISTRATION_CONTACT_ERROR_MESSAGES,
};

/**
 * Registers the signed-in caller for an event as themselves (#1165).
 *
 * The difference from `registerForEventAction` is one the person never sees
 * and the directory always does: this one sends no name and no email, because
 * `register_myself_for_event()` reads the person from the session and the
 * request host. There is nothing to match on, so there is no duplicate
 * `people` row to create -- which is the single largest source of them.
 *
 * No honeypot field either. The anonymous form carries one because anyone can
 * post to it; this path costs an account and a staff-approved claim, and a
 * hidden input would be a control that only catches somebody who has already
 * been let in.
 */
export async function registerMyselfForEventAction(
  eventId: string,
  formData: FormData,
): Promise<RegisterMyselfResult> {
  const partySize = Number(String(formData.get("partySize") ?? "1"));
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { error: ERROR_MESSAGES.INVALID_PARTY_SIZE, step: "event" };
  }

  // #685. Required on this form as on the anonymous one wherever it was
  // asked (#1416), and validated here rather than left to the RPC: the RPC
  // has to keep accepting an unanswered question, because the public API's
  // published contract predates it, so "the question was asked and skipped"
  // is a distinction only the two forms can draw.
  const minors = parseRegistrationMinors(formData);
  if ("error" in minors) return { error: minors.error, step: "event" };
  const minorContacts = minors.data;

  // #1501, as on the anonymous path.
  const answers = parseAnswersField(formData);
  if ("error" in answers) return { error: answers.error, step: "event" };

  // #1744, as on the anonymous path.
  const profile = parseProfileAnswers(formData);
  if ("error" in profile) return { error: profile.error, step: "event" };

  // #1647, as on the anonymous path.
  const contact = parseRegistrationContact(formData);
  if ("error" in contact) return { error: contact.error, step: "about" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_myself_for_event", {
    p_event_id: eventId,
    p_party_size: partySize,
    p_notes: String(formData.get("notes") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
    p_pronouns: String(formData.get("pronouns") ?? ""),
    p_instagram_handle: contact.data.instagram_handle ?? "",
    p_has_no_instagram: contact.data.has_no_instagram ?? undefined,
    p_preferred_contact_method:
      contact.data.preferred_contact_method ?? undefined,
    p_preferred_contact_detail:
      contact.data.preferred_contact_detail ?? undefined,
    // #1259, and worth being explicit about why it is asked of somebody the
    // organization already has a full record for: the check-in ledger only
    // knows the events this tenant ran on this platform, so "have you been
    // before?" is still a fact only they hold. It stays self-reported -- it is
    // never derived from `my_event_history()`, which would quietly turn the
    // one column that is a person's own answer into a second copy of the
    // derived figure.
    p_attended_before:
      parseAttendedBefore(formData.get("attendedBefore")) ?? undefined,
    // #686, and the same on this path as on the anonymous one. Holding an
    // account is not agreement to anything: a signed-in route that skipped the
    // waiver would be the shortest way to a registration with no acceptance
    // behind it. Read straight off the FormData, since this action has no
    // parser of its own -- the RPC is what validates either way.
    p_waiver_accepted: formData.get("waiverAccepted") === "on",
    p_waiver_version: /^[1-9]\d*$/.test(
      String(formData.get("waiverVersion") ?? "").trim(),
    )
      ? Number(formData.get("waiverVersion"))
      : undefined,
    p_party_includes_minor: minorContacts.party_includes_minor ?? undefined,
    p_accompanying_adult_name:
      minorContacts.accompanying_adult_name ?? undefined,
    p_accompanying_adult_phone:
      minorContacts.accompanying_adult_phone ?? undefined,
    p_emergency_contact_name: minorContacts.emergency_contact_name ?? undefined,
    p_emergency_contact_phone:
      minorContacts.emergency_contact_phone ?? undefined,
    // #1407, as on the anonymous path.
    p_option_counts: parseOptionCounts(formData) ?? undefined,
    // #1501, as on the anonymous path.
    p_answers: answers.answers ?? undefined,
    // #1417. The RPC ignores it on an event that is not 18+.
    p_adults_only_confirmed: parseAdultsOnlyConfirmed(formData),
    // No `p_photo_consent` (#1376). The parameter is still there, declared
    // `default null`, and the RPC is unchanged -- but this form has no box, so
    // there is no answer to send and `null` is the correct resting state: no
    // objection on record, agreement implied by registering. Writing `true`
    // here would record an affirmative consent produced by a form with no
    // affirmative control. An API caller that genuinely asked can still send
    // one.
    p_ip_address: await getClientIp(),
  });

  if (error) {
    return {
      error:
        // #1417. The box is required on step 2, so reaching this means a
        // client that did not ask; the age is the error's DETAIL (#1782).
        (error.message === ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE
          ? minimumAgeConfirmationRequiredError(error.details)
          : null) ??
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
      step: registrationErrorStep(error.message),
      code: registrationErrorCode(error.message),
    };
  }

  revalidatePath(publicEventPath(eventId));
  revalidatePath(MY_PATH_PREFIX);
  revalidatePath("/portal/events");

  const registrationId = String(data);

  // #1744. Through the same day-old credential as the anonymous path: the
  // registration just made is this person's own.
  const profileAnswersError = await saveRegistrationProfileAnswers(supabase, {
    registrationId,
    answers: profile.answers,
    ipAddress: await getClientIp(),
  });

  // After the response, never before it (#742), and through the same sender
  // the anonymous path uses -- a registration is a registration, and the
  // receipt should not depend on how it was made. It honours an opt-out now
  // (#1165): a person who has turned event confirmations off on `/my` gets
  // none, which is a switch only somebody with an account could have thrown.
  const siteUrl = await getRequestOrigin();

  after(async () => {
    const admin = createSupabaseAdminClient();
    // #1591. The same link the anonymous confirmation carries, with no special
    // case: it works for somebody with an account too, and `/my` remains the
    // other way in. Issued here rather than before the response because this
    // success screen links to `/my` instead.
    const answersLink = await issueConfirmationAnswersLink(
      admin,
      registrationId,
    );
    await sendEventRegistrationConfirmation(admin, {
      registrationId,
      siteUrl,
      answersLink,
    });
  });

  return { success: true, registrationId, profileAnswersError };
}
