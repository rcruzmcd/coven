/**
 * What this queue calls the person, the record and the refusals when a
 * staffer writes to a registrant (#1317).
 *
 * A file of its own rather than constants in `registrants-actions.ts`, because
 * that module is `"use server"` and may export nothing but async functions --
 * and the sheet, which is a client component, needs the same sentences the
 * actions answer with. Everything that is not this queue's own wording is
 * shared in `@/lib/notifications/record-message`, which this file deliberately
 * does not import: that module is `server-only`, and reaching for its generic
 * `FAILED` here would drag it across the client boundary. The actions, which
 * are already on the server, use it directly.
 */

/** The has_permission() resource key a registrant's messages are read against. */
export const EVENTS_MODULE = "events";

export const REGISTRANT_MESSAGE_ERRORS = {
  SIGNED_OUT: "You must be signed in to message a registrant.",
  EVENT_NOT_FOUND: "This event could not be found.",
  NOT_FOUND: "This registration could not be found.",
  /**
   * Both shapes a registration with nobody to write to can take, in one
   * sentence: retention anonymizes a registration in place -- `email = ''`,
   * `person_id = null` -- and a staff-added walk-in may never have had an
   * address. The control is disabled and says this, rather than being absent,
   * because the difference between "nothing to send to" and "email is off for
   * the organization" is what decides whether there is anything to be done.
   */
  NO_EMAIL: "This registration has no email address to write to.",
  CANCELLED: "This registration was cancelled.",
  /** #1764. Its address is whatever the tester typed, so nothing is sent. */
  TEST: "This is a test registration, so nothing is sent to it.",
  NO_PERSON:
    "This registration isn't linked to a person, so the confirmation can't be resent.",
  RESENT_RECENTLY:
    "The confirmation has already been resent in the last minute.",
  RESEND_FAILED: "The confirmation could not be resent. Please try again.",
} as const;

/**
 * What names this registration in the registrant's own inbox.
 *
 * The event, not "your registration": somebody may be signed up for several,
 * and a subject that does not say which leaves them guessing. The organization
 * comes after it, the way every other queue's default subject reads, and each
 * part drops out cleanly when it is missing rather than leaving a dangling
 * dash.
 */
export function registrantMessageSubject(
  eventName: string,
  orgName: string,
): string {
  const what = eventName.trim()
    ? `About ${eventName.trim()}`
    : "About your registration";
  return orgName.trim() ? `${what} — ${orgName.trim()}` : what;
}

/**
 * What an announcement's subject starts as: the event's own name, because that
 * is what the notice is about and what a registrant scanning an inbox will
 * recognise. The staffer overwrites it as often as not, which is why it is a
 * default rather than a prefix.
 */
export function announcementSubject(eventName: string): string {
  return eventName.trim() || "An update about your registration";
}
