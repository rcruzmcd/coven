import type { ParseResult } from "@/lib/forms";
import { parseAdultsOnlyConfirmed } from "@/lib/adults-only";
import { parseAttendedBefore } from "@/lib/attended-before";
import { parseRegistrationMinors, type MinorContacts } from "@/lib/minors";
import { parsePronouns } from "@/lib/pronouns";
import { eventHasEnded } from "@/lib/time";
import {
  parseOptionCounts,
  type OptionCounts,
} from "@/lib/registration-options";
import {
  parseAnswersField,
  type RegistrationAnswers,
} from "@/lib/registration-questions";
import {
  parseRegistrationContact,
  type RegistrationContact,
} from "@/lib/registration-contact";

export type EventRegistrationFormData = {
  name: string;
  email: string;
  phone: string | null;
  pronouns: string | null;
  party_size: number;
  notes: string | null;
  /**
   * Self-reported, and null when the question went unanswered (#1259). Never
   * validated into a boolean: there is no wrong answer to give, and a value
   * the form did not offer means the question was not answered.
   */
  attended_before: boolean | null;
  /**
   * Whether the participant waiver's box was ticked (#686).
   *
   * Not validated here, and that is deliberate: this parser cannot know
   * whether the tenant has a waiver in force, and a guess would be a second
   * gate able to disagree with the one that actually binds. The RPC decides,
   * because it is the thing that reads the publication state and writes the
   * row.
   */
  waiver_accepted: boolean;
  /**
   * The version the form rendered, for the RPC to compare against the one in
   * force. Null when no waiver was shown. Never stored from this value -- the
   * RPC writes the version it read itself.
   */
  waiver_version: number | null;
  /**
   * Whether the party includes anyone under 18 (#685).
   *
   * Required by this parser wherever the form asked it, unlike
   * `attended_before`: the accompanying-adult block, the organizer's flag and
   * the organization's own rule all hang off it, so an unanswered question
   * here leaves exactly the gap the field exists to close. Null where the
   * form did not ask (#1416) -- the column's "nobody was asked", which is also
   * what a walk-in and a public API caller are.
   */
  party_includes_minor: boolean | null;
  /**
   * Whether "Everyone in my party is 18 or over" was ticked (#1417). Not
   * validated here, for the reason `waiver_accepted` is not: whether the event
   * is adults only is the RPC's to know, and it refuses without it.
   */
  adults_only_confirmed: boolean;
  /**
   * The answer to the event's registration question (#1407), or null where
   * the form showed none. Not checked against the party size here: whether
   * the event asks at all is the RPC's to know.
   */
  option_counts: OptionCounts | null;
  /**
   * The answers to the event's registration questions (#1501), or null where
   * the form showed none. Whether they are complete is the RPC's to say.
   */
  answers: RegistrationAnswers | null;
} & MinorContacts &
  /**
   * The Instagram handle, or the no-Instagram contact where the tenant
   * requires one (#1647). The RPC reads the setting itself either way.
   */
  RegistrationContact;

export function parseEventRegistrationForm(
  formData: FormData,
): ParseResult<EventRegistrationFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const pronouns = parsePronouns(formData.get("pronouns"));
  const notes = String(formData.get("notes") ?? "").trim();
  const partySizeRaw = String(formData.get("partySize") ?? "").trim();
  const attended_before = parseAttendedBefore(formData.get("attendedBefore"));
  const waiver_accepted = formData.get("waiverAccepted") === "on";
  // Digits only, and no leading zero, the same discipline `selectLegalVersion`
  // applies to `?version=`. Anything else is treated as "not sent" rather than
  // rejected: a malformed value cannot match the version in force, and the RPC
  // refuses on the mismatch with a message about the document rather than
  // about a number the reader never saw.
  const waiverVersionRaw = String(formData.get("waiverVersion") ?? "").trim();
  const waiver_version = /^[1-9]\d*$/.test(waiverVersionRaw)
    ? Number(waiverVersionRaw)
    : null;

  // `field` names what was refused, so the form can take the reader back to
  // the step it is on (#1413).
  if (!name) return { error: "Name is required.", field: "name" };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required.", field: "email" };
  if ("error" in pronouns) return { ...pronouns, field: "pronouns" };
  const contact = parseRegistrationContact(formData);
  if ("error" in contact) return contact;

  const party_size = partySizeRaw ? Number(partySizeRaw) : 1;
  if (!Number.isInteger(party_size) || party_size < 1) {
    return { error: "Party size must be at least 1.", field: "partySize" };
  }

  const minors = parseRegistrationMinors(formData);
  if ("error" in minors) return minors;

  const answers = parseAnswersField(formData);
  if ("error" in answers) return { ...answers, field: "answers" };

  return {
    data: {
      ...minors.data,
      ...contact.data,
      name,
      email,
      phone: phone || null,
      pronouns: pronouns.pronouns,
      party_size,
      notes: notes || null,
      attended_before,
      waiver_accepted,
      waiver_version,
      adults_only_confirmed: parseAdultsOnlyConfirmed(formData),
      option_counts: parseOptionCounts(formData),
      answers: answers.answers,
    },
  };
}

export type RegistrationEligibility =
  { open: true } | { open: false; reason: string };

export function checkRegistrationWindow(
  event: {
    registration_enabled: boolean;
    registration_deadline: string | null;
    starts_at: string;
    ends_at: string | null;
  },
  now: Date = new Date(),
): RegistrationEligibility {
  if (!event.registration_enabled) {
    return { open: false, reason: "Registration is not open for this event." };
  }
  if (
    event.registration_deadline &&
    new Date(event.registration_deadline) < now
  ) {
    return {
      open: false,
      reason: "The registration deadline for this event has passed.",
    };
  }
  // A past event stays listed on the public site (#1609), so one with no
  // deadline must still close once it is over. The registration RPCs refuse
  // the same case.
  if (eventHasEnded(event, now)) {
    return { open: false, reason: "This event has already happened." };
  }
  return { open: true };
}
