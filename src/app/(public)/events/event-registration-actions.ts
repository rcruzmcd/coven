"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";
import {
  MINOR_CONTACTS_REQUIRED_CODE,
  MINOR_CONTACTS_REQUIRED_ERROR,
} from "@/lib/minors";
import {
  ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE,
  ADULTS_ONLY_CONFIRMATION_REQUIRED_ERROR,
} from "@/lib/adults-only";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { REGISTRATION_OPTION_ERROR_MESSAGES } from "@/lib/registration-options";
import { REGISTRATION_ANSWER_ERROR_MESSAGES } from "@/lib/registration-questions";
import { REGISTRATION_CONTACT_ERROR_MESSAGES } from "@/lib/registration-contact";
import { parseEventRegistrationForm } from "./event-registration-form";
import {
  parseProfileAnswers,
  saveRegistrationProfileAnswers,
} from "./registration-profile-answers";
import { publicEventAnswersPath, publicEventPath } from "./event-path";
import {
  issueAlreadyRegisteredAnswersLink,
  issueConfirmationAnswersLink,
} from "@/lib/notifications/registration-answer-self-links";
import { ALREADY_REGISTERED_LINK_SENT } from "@/lib/registration-answer-requests";
import {
  registrationErrorCode,
  registrationErrorStep,
  registrationFieldStep,
  type RegistrationStep,
} from "./registration-step";

/**
 * `step` says which step of the form the error belongs to (#1403, #1413), so
 * a reader on the last step can be sent back to the field. `code` is the RPC's
 * refusal, for the funnel (#1480); absent where the form parser refused.
 */
export type RegisterForEventResult =
  | { error: string; step: RegistrationStep; code?: string }
  | {
      success: true;
      registrationId: string;
      /**
       * The registrant's own answers link (#1591), relative and token
       * included, for the success screen. Null where there is nothing on it
       * to change -- no questions, and no Instagram requirement (#1647) --
       * or none could be issued.
       */
      answersPath: string | null;
      /**
       * #1744. Set when the registration was saved but its profile answers
       * were refused, so the success screen can say so; null otherwise.
       */
      profileAnswersError: string | null;
    };

const ERROR_MESSAGES: Record<string, string> = {
  EVENT_NOT_FOUND: "This event could not be found.",
  REGISTRATION_CLOSED: "Registration is not open for this event.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline for this event has passed.",
  EVENT_AT_CAPACITY: "This event has reached capacity.",
  ALREADY_REGISTERED: "This email is already registered for this event.",
  NAME_REQUIRED: "Name is required.",
  INVALID_PARTY_SIZE: "Party size must be at least 1.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  // #685. The form asks for these four the moment somebody answers yes, so
  // reaching this means a client that did not -- the public API, or a browser
  // that let a half-filled form through. Worth a sentence either way.
  [MINOR_CONTACTS_REQUIRED_CODE]: MINOR_CONTACTS_REQUIRED_ERROR,
  // #1417. The box is required on step 2, so reaching this means a client
  // that did not ask.
  [ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE]:
    ADULTS_ONLY_CONFIRMATION_REQUIRED_ERROR,
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
  // #1647. The form checks these before sending, so reaching this means a
  // client that did not.
  ...REGISTRATION_CONTACT_ERROR_MESSAGES,
};

// Public, unauthenticated action: anyone can register for a published event
// with registration enabled. All validation (event must be public/
// published/registration_enabled, deadline, capacity) is re-checked
// authoritatively inside the register_for_event() RPC (spec §9 step 3),
// since the client's view of it can be stale and anon has no direct select
// access to event_registrations to check capacity itself.
export async function registerForEventAction(
  eventId: string,
  formData: FormData,
): Promise<RegisterForEventResult> {
  const parsed = parseEventRegistrationForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error, step: registrationFieldStep(parsed.field) };
  }
  const profile = parseProfileAnswers(formData);
  if ("error" in profile) return { error: profile.error, step: "event" };

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_party_size: parsed.data.party_size,
    p_notes: parsed.data.notes,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_instagram_handle: parsed.data.instagram_handle,
    // #1647. `undefined` unless the box was ticked; the RPC ignores all three
    // on a tenant that does not require a handle.
    p_has_no_instagram: parsed.data.has_no_instagram ?? undefined,
    p_preferred_contact_method:
      parsed.data.preferred_contact_method ?? undefined,
    p_preferred_contact_detail:
      parsed.data.preferred_contact_detail ?? undefined,
    p_pronouns: parsed.data.pronouns,
    // #1259. Sent for every registrant, whatever the email matches -- see the
    // RPC's comment for why asking selectively would be an enumeration oracle.
    // `undefined` for an unanswered question, so the RPC's own `default null`
    // is what lands rather than an explicit null; the row is the same either
    // way, and PostgREST prefers the argument omitted.
    p_attended_before: parsed.data.attended_before ?? undefined,
    // #686. Sent unconditionally, like the question above: the form does not
    // know whether this tenant has a waiver in force, and the RPC refuses or
    // records accordingly. `undefined` rather than null for the version, so an
    // unshown waiver leaves the RPC's own default in place.
    p_waiver_accepted: parsed.data.waiver_accepted,
    p_waiver_version: parsed.data.waiver_version ?? undefined,
    // #685. Sent as answered, and `undefined` where the form did not ask
    // (#1416). The RPC ignores it either way on a tenant that has the
    // question off.
    p_party_includes_minor: parsed.data.party_includes_minor ?? undefined,
    p_accompanying_adult_name: parsed.data.accompanying_adult_name ?? undefined,
    p_accompanying_adult_phone:
      parsed.data.accompanying_adult_phone ?? undefined,
    p_emergency_contact_name: parsed.data.emergency_contact_name ?? undefined,
    p_emergency_contact_phone: parsed.data.emergency_contact_phone ?? undefined,
    // #1407. `undefined` when the form showed no question, so the RPC's own
    // default stands; an event with options then refuses it.
    p_option_counts: parsed.data.option_counts ?? undefined,
    // #1501. `undefined` when the form showed no questions; an event with a
    // required one then refuses it.
    p_answers: parsed.data.answers ?? undefined,
    // #1417. Sent as ticked; the RPC ignores it on an event that is not 18+.
    p_adults_only_confirmed: parsed.data.adults_only_confirmed,
    // No `p_photo_consent` (#1376). The parameter is still there, declared
    // `default null`, and the RPC is unchanged -- but the form has no box, so
    // there is nothing to send and `null` is the correct resting state: no
    // objection on record, agreement implied by registering. Writing `true`
    // would record an affirmative consent produced by a form with no
    // affirmative control. An API caller that genuinely asked can still send
    // one.
  });

  if (error) {
    return {
      error:
        (error.message === "ALREADY_REGISTERED"
          ? await alreadyRegisteredMessage(supabase, eventId, parsed.data.email)
          : null) ??
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
      step: registrationErrorStep(error.message),
      code: registrationErrorCode(error.message),
    };
  }

  revalidatePath(publicEventPath(eventId));
  revalidatePath("/portal/events");

  // The new registration id is handed back for the account offer (#1258),
  // which carries it through sign-up; it's an unguessable uuid and reveals
  // nothing about the event or other registrants.
  const registrationId = String(data);

  // After the response, never before it (#742): the registration is already
  // committed, and the registrant's confirmation must not hold up "you're
  // registered" or turn a committed registration into an error on screen.
  // Read the origin first -- after() runs once the response is on its way and
  // may no longer have the request's headers. It is only the fallback: a tenant
  // with a domain of its own is linked to that instead (#860).
  //
  // The only input reaching the service-role client is the id the RPC just
  // minted; for a filled honeypot that is a uuid with no row behind it, which
  // the sender treats as nothing to do.
  const siteUrl = await getRequestOrigin();
  const admin = createSupabaseAdminClient();

  // #1591. Before the response, because the success screen shows the same
  // link the email carries. Null for an event with no questions and for a
  // honeypot's id alike.
  const answersLink = await issueConfirmationAnswersLink(admin, registrationId);

  // #1744. Not for a filled honeypot, whose id has no row behind it.
  const profileAnswersError = honeypot
    ? null
    : await saveRegistrationProfileAnswers(supabase, {
        registrationId,
        answers: profile.answers,
        ipAddress,
      });

  after(async () => {
    await sendEventRegistrationConfirmation(admin, {
      registrationId,
      siteUrl,
      answersLink,
    });
  });

  return {
    success: true,
    registrationId,
    answersPath: answersLink
      ? publicEventAnswersPath(eventId, answersLink.token)
      : null,
    profileAnswersError,
  };
}

/**
 * "Already registered" as a way forward (#1591): mail the registration's own
 * address a link to change its answers, and say so -- never showing the link,
 * so typing somebody else's address reveals nothing the refusal did not
 * already. Null leaves the plain refusal: an event with no questions, one
 * that has ended, or a failure to issue.
 */
async function alreadyRegisteredMessage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string,
  email: string,
): Promise<string | null> {
  // The public site's tenant, off this request's host: the service-role
  // client below carries no host to resolve it from.
  const { data: tenantId } = await supabase.rpc("public_tenant_id");
  if (!tenantId) return null;

  const outcome = await issueAlreadyRegisteredAnswersLink(
    createSupabaseAdminClient(),
    {
      tenantId,
      eventId,
      email,
      ipAddress: await getClientIp(),
      fallbackOrigin: await getRequestOrigin(),
    },
    after,
  );
  if (outcome === "rate_limited") return ERROR_MESSAGES.RATE_LIMITED;
  return outcome === "issued" ? ALREADY_REGISTERED_LINK_SENT : null;
}
