// What a person may say about themselves (#1164), and the parsing of the form
// that says it.
//
// The authoritative allowlist is `set_my_contact_details()`'s argument list --
// a server action that only sends the allowed fields is not the control, and
// the migration says so at length. This module exists so that the form, the
// action and the tests agree on the same field names and the same messages,
// and so that a person is told what is wrong with a handle before a round trip
// reports it as a failure.
import { parsePronouns } from "@/lib/pronouns";
import {
  INSTAGRAM_HANDLE_ERROR,
  INSTAGRAM_HANDLE_PATTERN,
} from "@/lib/instagram-handle";

/**
 * The shape `my_contact_details()` returns, and what the form renders.
 *
 * `name` and `email` are here to be *shown*, not edited: a person opening this
 * page needs to see the name the organization has them under, even though
 * correcting it is a conversation with a staffer rather than a text field.
 */
export type MyContactDetails = {
  person_id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  email_pending: string | null;
  email_pending_expires_at: string | null;
  phone: string | null;
  pronouns: string | null;
  instagram_handle: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
};

/** The arguments of `set_my_contact_details()`, keyed as the RPC takes them. */
export type ContactDetailsArgs = {
  p_preferred_name: string | null;
  p_phone: string | null;
  p_pronouns: string | null;
  p_instagram_handle: string | null;
  p_address_line1: string | null;
  p_address_line2: string | null;
  p_address_city: string | null;
  p_address_region: string | null;
  p_address_postal_code: string | null;
  p_address_country: string | null;
};

/**
 * The form fields a parse error can be pinned to, named as the form names them
 * rather than as the RPC does (#1181).
 *
 * The two here are the two this module can refuse. Everything else on the
 * allowlist is free text the database takes as given, so there is nothing to
 * say about it before the round trip.
 */
export type ContactFieldName = "pronouns" | "instagramHandle";

export type ContactFieldErrors = Partial<Record<ContactFieldName, string>>;

export type ParsedMyContactForm =
  | { error: string; fieldErrors: ContactFieldErrors }
  | { args: ContactDetailsArgs };

/**
 * The summary when more than one field is wrong. A single problem is its own
 * summary, because repeating one sentence twice on the same screen reads as
 * two problems.
 */
export const MULTIPLE_CONTACT_PROBLEMS_ERROR =
  "Some of what you entered cannot be saved. Check the fields marked below.";

/** Re-exported so this module stays the one place a contact form imports. */
export { INSTAGRAM_HANDLE_ERROR };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Turns the form into the RPC's arguments, or into the problems to put beside
 * the fields that have them.
 *
 * Every field is optional. This is a record somebody else created about a
 * person, and a form that refuses to save until they have filled in a postal
 * address is a form that loses the corrected phone number they came to give.
 * The profile questions are a form of their own (#1744, #1746).
 */
export function parseMyContactForm(formData: FormData): ParsedMyContactForm {
  // Every problem is collected rather than returned at the first one: the form
  // marks the fields it names, and a person who fixes the handle only to be
  // told about the pronouns has been sent round the loop twice for one visit.
  const fieldErrors: ContactFieldErrors = {};

  const pronouns = parsePronouns(formData.get("pronouns"));
  if ("error" in pronouns) fieldErrors.pronouns = pronouns.error;
  const pronounsValue = "error" in pronouns ? null : pronouns.pronouns;

  const instagramHandle = field(formData, "instagramHandle").replace(/^@/, "");
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    fieldErrors.instagramHandle = INSTAGRAM_HANDLE_ERROR;
  }

  const messages = Object.values(fieldErrors);
  if (messages.length > 0) {
    return {
      error:
        messages.length === 1 ? messages[0] : MULTIPLE_CONTACT_PROBLEMS_ERROR,
      fieldErrors,
    };
  }

  return {
    args: {
      p_preferred_name: field(formData, "preferredName") || null,
      p_phone: field(formData, "phone") || null,
      p_pronouns: pronounsValue,
      p_instagram_handle: instagramHandle || null,
      p_address_line1: field(formData, "addressLine1") || null,
      p_address_line2: field(formData, "addressLine2") || null,
      p_address_city: field(formData, "addressCity") || null,
      p_address_region: field(formData, "addressRegion") || null,
      p_address_postal_code: field(formData, "addressPostalCode") || null,
      p_address_country: field(formData, "addressCountry") || null,
    },
  };
}
