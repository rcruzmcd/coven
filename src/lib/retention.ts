/**
 * The published retention periods, in one place.
 *
 * These are a board decision, recorded in the planning repo at
 * `decisions/2026-09-02-personal-data-retention-and-privacy-policy.md`, amended
 * for the constituent area by
 * `decisions/2026-09-19-constituent-accounts-claims-and-self-logged-hours-retention.md`
 * (#1296). Change them there first, then here, then in the `retention_policies`
 * seed (`supabase/migrations/20260905090000_create_retention_policies.sql`, and
 * one migration per amendment since).
 *
 * This module is the single in-repo transcription of that decision. The public
 * privacy page renders `RETENTION` from it, and the purge reads its periods
 * from the `retention_policies` table -- an integration test asserts the two
 * agree, so the page cannot promise one clock while the job enforces another.
 * That test is the whole reason `period` is duplicated here rather than left to
 * the database: prose and enforcement drifting apart is exactly the failure
 * this ticket exists to fix.
 *
 * `period` is a Postgres interval literal so the comparison is string equality
 * against the seeded column, with no parsing on either side.
 */
import type { CollectionSurface } from "@/lib/legal-surface";

export type RetentionPolicy = {
  /** Primary key in `public.retention_policies`. */
  key: string;
  /** The category, as the published page names it. */
  what: string;
  /** The published prose. Written for a visitor, not for an engineer. */
  howLong: string;
  /** Postgres interval literal, matching `retention_policies.period`. */
  period: string;
  /** Matching `retention_policies.secondary_period`; only one policy has one. */
  secondaryPeriod?: string;
  /**
   * The collection surface whose data this clock governs (#1291), or undefined
   * for one that runs on every tenant.
   *
   * The privacy policy prints only the rows whose surface is live, so a tenant
   * with no volunteer form does not publish how long it keeps volunteer
   * applications it cannot receive. The purge is unaffected: every clock below
   * is still enforced, and the integration test pinning these periods against
   * the `retention_policies` table still compares the whole list.
   */
  surface?: keyof CollectionSurface;
};

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    key: "contact_messages",
    what: "Contact form messages",
    howLong: "2 years from the date you sent them.",
    period: "2 years",
    surface: "contact",
  },
  {
    key: "volunteer_applications",
    what: "Volunteer applications",
    // 2 years, not 3: there is little operational reason to hold an
    // application we did not act on for three seasons, and the shorter
    // clock still covers a volunteer's history across two winters.
    //
    // The status check constraint has no 'withdrawn' value -- 'declined' and
    // 'closed' are the states that mean it, and the purge branches on those.
    howLong:
      "2 years after your last activity with us, or 1 year if the application is withdrawn or declined.",
    period: "2 years",
    secondaryPeriod: "1 year",
    surface: "volunteerApplications",
  },
  {
    key: "event_registrations",
    what: "Event registrations",
    // The registration row survives with its personal fields stripped rather
    // than being deleted: attendance counts, first-time-rider counts and
    // discipline splits feed impact and grant reporting, and deleting the rows
    // would restate figures already filed with funders. "Personal fields"
    // includes the accompanying adult and the emergency contact a party with a
    // minor gives (#685) -- the emergency contact especially, since they never
    // visited the site. Whether the party included a minor is kept, like the
    // party size: it describes the party, not the people in it.
    //
    // The photo columns go too (#599, #1376), which is the opposite of what
    // happens to the participant agreement on the same row. An acceptance is a
    // fact about an act and stands without a name; these are a fact about a
    // face. An anonymized objection protects nobody, because there is no
    // longer a name to check a photograph against and nobody at a door can be
    // recognised as its subject -- an instruction about a face nobody can
    // identify is no more useful than a permission was.
    //
    // A staff note on a cancellation goes with `notes` (#1418); the reason
    // and when it was cancelled stay.
    howLong: "3 years after the event.",
    period: "3 years",
    surface: "eventRegistrations",
  },
  {
    key: "person_answers",
    // Split out from event registrations: an answer about a person is
    // standing information, not a record of one event, so tying its clock to
    // an event they happened to attend is the wrong shape. Was
    // `rider_profiles` until #1746 moved the rider profile onto profile
    // questions; the rule, period and order are unchanged.
    what: "Profile answers",
    howLong:
      "Until you ask us to delete your answers, or after 2 years of inactivity.",
    period: "2 years",
    surface: "profileQuestions",
  },
  {
    key: "gear_requests",
    what: "Gear requests",
    // Was "3 years after the gear comes back", which describes a lending
    // program Chatter does not run: donated gear is given away and never
    // returned (inventory_movements has 'distributed' and no 'returned'), so
    // the clock never started. Same 3 years, from an event that happens.
    howLong: "3 years after we hand the gear over.",
    period: "3 years",
    surface: "gearRequests",
  },
  {
    key: "person_claims",
    // Named as the "what we collect" bullet names it, so a reader meets the
    // same phrase twice rather than having to work out that a "record claim"
    // is the thing they filled in.
    what: "Matching your account to our records",
    howLong:
      "2 years after we decide your claim, or 2 years after you sent it if we never got to it.",
    period: "2 years",
    surface: "constituentAccounts",
  },
  {
    key: "volunteer_hour_submissions",
    what: "Hours you log yourself",
    // The confirmed ones deliberately have no clock here: confirming an entry
    // writes a volunteer_hours row, and the submission is the record that the
    // volunteer entered those hours themselves rather than a staffer entering
    // them on their behalf. Deleting it on its own clock would leave the
    // ledger asserting something with nothing behind it.
    howLong:
      "2 years, if we declined the entry or never reviewed it. Hours we confirmed are kept with the volunteering record they became.",
    period: "2 years",
    surface: "volunteerHours",
  },
  {
    key: "person_screenings",
    what: "Volunteer screening outcomes",
    // Measured from the end of the clearance rather than from the decision: a
    // clearance that runs to 2032 is live until 2032, and a clock starting at
    // the decision would delete a current one. Where there is no end date the
    // decision is the only date there is.
    //
    // There is nothing else to promise a period for, because there is nothing
    // else stored: the outcome is a level and two dates, and the check itself
    // never reaches this deployment.
    howLong:
      "3 years after the clearance runs out, or 3 years after the decision where it has no end date.",
    period: "3 years",
    surface: "volunteerScreening",
  },
  {
    key: "constituent_accounts",
    // #1296. Until epic #1160 every account belonged to somebody who ran the
    // organization, so `portal_accounts` below was the only account clock and
    // it starts when a role ends. A member of the public holds no role by
    // design, so read literally that entry promised to keep their account
    // indefinitely -- the reason this one exists rather than the wording of
    // that one simply being widened.
    what: "Website accounts",
    howLong:
      "For as long as you use one. An account that has never been matched to a record and has not been used for 2 years is deleted. If you ask us to close an account that is matched to a record, we permanently disable your sign-in and clear the personal details on that record, and keep the record of what was done with the account.",
    period: "2 years",
    surface: "constituentAccounts",
  },
  {
    key: "portal_accounts",
    // Reworded for #602. This used to say the account "is removed", which the
    // system cannot do and was never going to: audit_log.actor_id and ~120
    // other created_by/updated_by columns reference auth.users with no ON
    // DELETE, so deleting the identity of anyone who has ever written a row
    // fails outright. What actually happens is that access is permanently
    // disabled and the personal details on the portal record are cleared. The
    // sign-in identity itself is retained as part of the audit trail, and the
    // sentence below no longer implies otherwise.
    what: "Portal accounts",
    // Reworded again for #1296, and the change is one clause: "if you hold a
    // role with us" says which population this is about. It described every
    // account until the day a visitor could make one, and a visitor's account
    // is now the entry above.
    howLong:
      "If you hold a role with us, for as long as you hold it. When your role ends we permanently disable your access and clear the personal details we hold about you in the portal. We keep the record of what was done through the portal — including which account did it — for governance, security, audit, insurance, and legal reasons.",
    period: "3 months",
  },
];

/** What the privacy page renders. */
export const RETENTION = RETENTION_POLICIES.map(({ what, howLong }) => ({
  what,
  howLong,
}));
