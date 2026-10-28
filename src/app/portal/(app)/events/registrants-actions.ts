"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkEventAccess } from "@/lib/auth/event-access";
import { checkUser } from "@/lib/auth/current-user";
import {
  checkInRegistrant,
  undoCheckIn,
  type RegistrantActionResult,
} from "./registrant-core";
import { parseRiderProfileForm } from "@/lib/rider-profile-form";
import { getRiderProfileMountains } from "@/lib/rider-profile-settings";
import {
  actionError,
  fromGuard,
  fromParseError,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  hasOptionAnswer,
  optionCountsError,
  type OptionCountRow,
  type OptionCounts,
} from "@/lib/registration-options";
import {
  contactError,
  REGISTRATION_CONTACT_ERROR_MESSAGES,
  type ContactValues,
} from "@/lib/registration-contact";
import {
  answersError,
  REGISTRATION_ANSWER_ERROR_MESSAGES,
  toRegistrationQuestion,
  type AnswerRow,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { getTenantContext } from "@/lib/portal/tenants";
import { getTenantLegalPublication } from "@/lib/legal-publication";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { loadRecordMessages } from "@/lib/portal/record-messages";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { sendEventAnnouncement } from "@/lib/notifications/event-announcement";
import {
  sendRegistrationAnswersRequests,
  type AnswersRequestRecipientWithToken,
  type RegistrationAnswersRequestBatch,
} from "@/lib/notifications/registration-answers-request";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { issueConfirmationAnswersLink } from "@/lib/notifications/registration-answer-self-links";
import {
  ANSWER_REQUEST_ERRORS,
  answersRequestSubject,
  defaultAnswersRequestIntro,
  MAX_ANSWERS_REQUEST_INTRO_LENGTH,
  resolveAnswerRequests,
  type AnswerRequestRecipient,
  type AnswerRequestStatus,
} from "@/lib/registration-answer-requests";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import {
  eventRegistrationConfirmationDedupeKey,
  sendEventRegistrationConfirmation,
} from "@/lib/notifications/submission-notifications";
import { EVENT_REGISTRATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  EVENT_REGISTRATION_RECORD_TYPE,
  NO_RECORD_MESSAGES,
  resendDedupeSuffix,
  type RecordMessages,
} from "@/lib/outbound-messages";
import {
  ANNOUNCEMENT_ERRORS,
  announcementRefusal,
  isAnnouncementAudience,
  resolveAnnouncementAudience,
  type AnnouncementAudience,
  type AudienceRegistration,
} from "@/lib/event-announcements";
import {
  EVENTS_MODULE,
  REGISTRANT_MESSAGE_ERRORS,
} from "./registrant-messaging";
import {
  CANCELLATION_ERRORS,
  isCancellationReason,
  type CancellationReason,
} from "@/lib/registration-cancellation";
import { sendRegistrationCancellationNotice } from "@/lib/notifications/registration-cancellation";
import {
  eventGroupChat,
  GROUP_CHAT_ERROR_MESSAGES,
  type EventGroupChat,
} from "@/lib/registration-group-chat";
import type { EventCarpools } from "@/lib/event-carpools";
import { loadEventCarpools } from "@/lib/portal/event-carpools";
import { withPlaceRegions, type PlaceRegion } from "@/lib/places/place-regions";

/**
 * The rider level recorded when this registrant was checked in, alongside the
 * person's current profile (issue #653).
 *
 * `EventRegistrant.rider` is null when the caller may not see rider data, the
 * same "not authorised to see this" shape the nullable fields in
 * `EventImpactDerived` use: get_event_impact_derived_data deliberately gates
 * rider-profile figures, so a read-only events:view holder must not pick them
 * up through the registrants list instead.
 */
export type RegistrantRiderProfile = {
  riding_discipline_at_event: string | null;
  ski_experience_level_at_event: string | null;
  snowboard_experience_level_at_event: string | null;
  riding_discipline: string | null;
  ski_experience_level: string | null;
  snowboard_experience_level: string | null;
  preferred_mountain: string | null;
};

/**
 * Who is bringing the minors in this party, and who to call in an emergency
 * (#685).
 *
 * Gated harder than `rider`, and by a different mechanism. A rider's preferred
 * discipline is chosen in TypeScript — `listEventRegistrantsAction` selects the
 * columns or does not — which any `events: view` holder could go round with a
 * direct PostgREST call. These four are *revoked* from `authenticated` on
 * `event_registrations` itself and served only by the security-definer view
 * `event_registration_minor_contacts`, which does its own `events: manage`
 * check. A guardian's mobile number earns the privilege rather than the
 * convention; see `20260922040000_event_registration_minors.sql`.
 *
 * Null therefore means "not yours to see", and null is also what a party with
 * no minors has — the view returns no row for one. The flag on the registrant
 * is what distinguishes them, and it is readable by everybody who can read the
 * list.
 */
export type RegistrantMinorContacts = {
  accompanying_adult_name: string | null;
  accompanying_adult_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

/** A stored answer, with the raw value an editor needs to seed itself. */
export type RegistrantAnswerRow = AnswerRow & {
  value: unknown;
  /**
   * For a place answer, the county, borough or state its place lies in
   * (#1701, `place_regions()`), which the place filter and sort read. Absent
   * otherwise, and for "Not listed" or a place the dataset no longer has.
   */
  place_region?: PlaceRegion;
};

export type EventRegistrant = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone: string | null;
  /**
   * The Instagram handle typed on the registration, bare: the column's check
   * refuses an `@` or a URL. It lives on the registration, not on `people`.
   */
  instagram_handle: string | null;
  /**
   * The no-Instagram answer (#1647): null where nobody was asked, false where
   * they gave a handle under the setting, true with the method and detail
   * where they gave a contact instead. Read like `phone`.
   */
  has_no_instagram: boolean | null;
  preferred_contact_method: string | null;
  preferred_contact_detail: string | null;
  pronouns: string | null;
  party_size: number;
  notes: string | null;
  created_at: string;
  person_id: string | null;
  checked_in_at: string | null;
  /**
   * What this registrant said about having been before (#1259), null when
   * they were not asked or did not answer. Self-reported, and never the source
   * of a first-time figure that leaves this screen -- `EventImpactDerived`
   * stays the only one of those.
   *
   * Not gated on `events: manage` the way `rider` is: it is an answer the
   * person volunteered about their own relationship to the organization, the
   * same class of thing as the name and party size beside it, and the door
   * staff who work an `events: view` shift are exactly who it is for.
   */
  attended_before: boolean | null;
  /**
   * When this person accepted the organization's participant waiver, and which
   * version (#686). Both null means nothing was asked -- no waiver was in
   * force at the time -- and never that they declined: declining is not
   * submitting, so a refusal produces no registrant row to read this off.
   *
   * Like `attended_before`, not gated on `events: manage`. Whether somebody
   * signed the agreement is exactly what the person on the door needs to know
   * before letting them on the hill.
   */
  waiver_accepted_at: string | null;
  waiver_version: number | null;
  /**
   * Whether this party includes anyone under 18 (#685). Null means nobody was
   * asked — a registration taken before the question existed, a walk-in added
   * by staff, a caller of the public API — and must never be read as "no".
   *
   * Not gated on `events: manage`, and that split is the point of the ticket.
   * An organizer working an `events: view` door shift is exactly who has to
   * know before the day; the contacts below are a different matter.
   */
  party_includes_minor: boolean | null;
  /**
   * When the registrant confirmed everyone in their party is 18 or over, on
   * an adults-only event (#1417). Null everywhere else. Not gated on
   * `events: manage`, for the reason `party_includes_minor` is not.
   */
  adults_only_confirmed_at: string | null;
  /**
   * What this person said about being photographed or recorded (#599), and the
   * only three-state field here where every state has to be legible.
   *
   * Null means nobody was asked — this organization had written no
   * `events.photo_consent` scope at the time, or the row came from a walk-in,
   * a staff-added registrant or the public API. **False means they declined**,
   * which is the answer with a job: it is what somebody checks before pointing
   * a camera. `photo_consent_text` is the scope they answered against, kept so
   * a question about it months later can be answered from the row itself.
   *
   * Not gated on `events: manage`, for the same reason as the two fields above
   * and more urgently: the door shift is precisely who needs it, and needs it
   * before the camera comes out. A consent record nobody can see when it
   * matters is the same failure as no record at all.
   */
  photo_consent: boolean | null;
  photo_consent_at: string | null;
  photo_consent_text: string | null;
  /**
   * The answer to the event's registration question (#1407), one row per
   * option chosen. Empty where the event asks none or nobody was asked -- a
   * walk-in staff left unanswered. Not gated on `events: manage`: how many
   * tickets a party needs is what the door hands out.
   */
  option_counts: OptionCountRow[];
  /**
   * This registration's answers to the event's registration questions (#1501),
   * including answers to questions since archived -- those keep their own
   * words in `prompt_as_shown` and `answer_text`. Not gated on
   * `events: manage`, for the reason `option_counts` is not: the table reads
   * at `events: view`.
   */
  answers: RegistrantAnswerRow[];
  /**
   * When this registration was last emailed a link to complete its answers,
   * and when answers were last saved through one (#1502). Null where nobody
   * has been asked. Read at `events: view`, like the answers themselves.
   */
  answer_request: AnswerRequestStatus | null;
  /**
   * When the registrant last changed their own answers after registering --
   * through their link or `/my` (#1591). Null where they never have. Staff
   * edits do not set it, so it is the "these moved since you planned" flag.
   */
  answers_changed_at: string | null;
  /**
   * When staff marked this registrant added to the event's group chat, and
   * who (#1648). Null is not added. Staff only: no registrant-facing surface
   * reads it. Read at `events: view`, like the rest of the row; written at
   * `events: manage`. Cancelled rows keep it, so staff see who to remove.
   */
  group_chat_added_at: string | null;
  group_chat_added_by_name: string | null;
  /**
   * When this registration was sent the event reminder (#1652), by the hourly
   * job or "Send reminder now". Absent on rows built elsewhere, such as the
   * door's.
   */
  reminder_sent_at?: string | null;
  /**
   * The single-use codes this registration holds, each with the partner's
   * PIN (#1589). Read at `events: view`, like the codes table. Absent on
   * rows built elsewhere, such as the door's.
   */
  discount_codes?: HeldDiscountCode[];
  /**
   * When and why this registration was cancelled (#1418). Null on every row
   * of `registrants`; only `cancelled` carries them.
   */
  cancelled_at: string | null;
  cancellation_reason: CancellationReason | null;
  cancellation_note: string | null;
  rider: RegistrantRiderProfile | null;
  /** See `RegistrantMinorContacts`. Null unless `events: manage`. */
  minorContacts: RegistrantMinorContacts | null;
};

/**
 * What the composer in the registrant sheet needs in order to explain itself
 * (#1317): whose name goes in the default subject, where a reply will land,
 * and whether outbound email is on at all.
 *
 * Null for a reader who does not hold `events: manage` -- door staff working an
 * `events: view` shift see the sheet and none of its messaging half -- which is
 * also what stops the Reply-To and the org name being loaded for somebody who
 * will never see them.
 */
export type RegistrantMessagingContext = {
  orgName: string;
  replyTo: string | null;
  orgEmailEnabled: boolean;
};

/**
 * One read for the whole registrants tab: the rows, what has been said to the
 * people in them, and the context the composer needs.
 *
 * The messages come back with the list rather than through a second action per
 * sheet, for the reason #1204's queues load theirs a page at a time -- a tab
 * renders a sheet per row and somebody opens one of them. RLS answers with
 * nothing at all for a reader without `events: manage`, so the check here only
 * saves the round trip.
 */
export type EventRegistrantsData = {
  /** Active registrations: what capacity, check-in and announcements see. */
  registrants: EventRegistrant[];
  /**
   * Cancelled ones (#1418), kept apart so nothing that reads `registrants`
   * has to remember to leave them out. Shown behind "Show cancelled".
   */
  cancelled: EventRegistrant[];
  messages: RecordMessages;
  messaging: RegistrantMessagingContext | null;
  /**
   * Whether this organization currently takes a participant waiver (#686).
   *
   * What it buys is the difference between "we never asked" and "we ask, and
   * this row has no answer" -- the second being an older registration taken
   * before the waiver was adopted. Without it every empty cell reads the same,
   * and the same distinction `submission-review-sheet.tsx` makes for artwork
   * consent would be unavailable here.
   */
  waiverInForce: boolean;
  /**
   * Whether this organization currently asks about photos at registration
   * (#599) — that is, whether `events.photo_consent` holds any text.
   *
   * The same thing `waiverInForce` buys above, reinterpreted by #1376: it
   * separates "this organization says nothing about photos" from "there is
   * something to object to here, and this person has not". Read through
   * `tenant_asks_photo_consent()` rather than off `site_content`, because that
   * table needs `site_content: view` and the reader here is a door shift.
   */
  photoConsentInForce: boolean;
  /** The event's registration question (#1407), or null where it asks none. */
  registrationOptions: PortalRegistrationOptions | null;
  /**
   * The event's current registration questions in order (#1501), archived ones
   * left out. Empty for an event that asks none, which leaves the tab as it
   * was.
   */
  registrationQuestions: RegistrationQuestion[];
  /**
   * This organization's preferred-mountain list, for the door-side rider
   * dialog (#1408). Null wherever `rider` is null on every registrant.
   */
  riderMountains: string[] | null;
  /**
   * The event's group chat switch and label (#1648), null when it is off --
   * which leaves every surface as it was.
   */
  groupChat: EventGroupChat;
  /**
   * The event's carpool plan (#1649), null when its switch is off -- which
   * leaves every surface as it was. Absent on data built elsewhere.
   */
  carpools?: EventCarpools;
};

/**
 * An event's registration question as the portal shows it (#1407): each
 * option with its cap and how many registrants have taken it, so the tab can
 * say "7 of 10" before the organizer orders tickets.
 */
export type HeldDiscountCode = { code: string; pin: string | null };

export type PortalRegistrationOptions = {
  prompt: string;
  options: {
    id: string;
    label: string;
    cap: number | null;
    /** What the option costs (#1589); null where it has no price. */
    price: number | null;
    taken: number;
  }[];
};

/**
 * The event's registration question on its own, for the add-registrant and
 * walk-in dialogs. `taken` is filled in by the tab, which has the counts; the
 * dialogs only need the choices.
 */
export async function listEventRegistrationOptionsAction(
  eventId: string,
): Promise<{ data: PortalRegistrationOptions | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registration_options",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;
  return { data: await loadRegistrationOptions(supabase, eventId, []) };
}

async function loadRegistrationOptions(
  supabase: SupabaseClient,
  eventId: string,
  registrants: EventRegistrant[],
): Promise<PortalRegistrationOptions | null> {
  const [{ data: event }, { data: options }] = await Promise.all([
    supabase
      .from("events")
      .select("registration_options_prompt")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_registration_options")
      .select("id, label, cap, price")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
  ]);
  const prompt = event?.registration_options_prompt;
  if (!prompt || !options || options.length === 0) return null;

  const taken = new Map<string, number>();
  for (const registrant of registrants) {
    for (const row of registrant.option_counts) {
      if (!row.option_id) continue;
      taken.set(row.option_id, (taken.get(row.option_id) ?? 0) + row.quantity);
    }
  }

  return {
    prompt,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      cap: option.cap,
      price: option.price === null ? null : Number(option.price),
      taken: taken.get(option.id) ?? 0,
    })),
  };
}

/**
 * The event's current registration questions (#1501), for the add-registrant
 * and walk-in dialogs. Empty for an event that asks none.
 */
export async function listEventRegistrationQuestionsAction(
  eventId: string,
): Promise<{ data: RegistrationQuestion[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registration_questions",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;
  return { data: await loadRegistrationQuestions(supabase, eventId) };
}

async function loadRegistrationQuestions(
  supabase: SupabaseClient,
  eventId: string,
): Promise<RegistrationQuestion[]> {
  const { data } = await supabase
    .from("event_registration_questions")
    .select(
      "id, kind, prompt, help, column_label, required, options, min_value, max_value, show_if, place_granularity, place_allow_other",
    )
    .eq("event_id", eventId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  return (data ?? []).flatMap((row) => {
    const question = toRegistrationQuestion(row);
    return question ? [question] : [];
  });
}

export async function listEventRegistrantsAction(
  eventId: string,
): Promise<{ data: EventRegistrantsData } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;

  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "events", "manage");
  // Rider answers need the rider_profiles permission as well, which carries
  // the rider_profile module (#1408) -- so on a tenant without it there is no
  // Rides column, no rider dialog and no rider block in the sheet, for anyone.
  const canSeeRider =
    canManage && hasPermission(permissions, "rider_profiles", "view");

  const [{ data, error }, adders] = await Promise.all([
    supabase
      .from("event_registrations")
      .select(
        canSeeRider
          ? `${REGISTRANT_COLUMNS}, ${RIDER_COLUMNS}`
          : REGISTRANT_COLUMNS,
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    // #1648. Who marked each registrant added to the group chat, by name. A
    // failure only loses the "by" in "Added {date} by {name}".
    supabase.rpc("event_group_chat_adders", { p_event_id: eventId }),
  ]);

  if (error) {
    return { error: "Could not load registrants. Please try again." };
  }

  const adderNames = new Map(
    (adders.data ?? []).map((row) => [row.user_id, row.name]),
  );
  const rows = await withPlaceRegions(
    supabase,
    (data ?? []).map((row) => toRegistrant(row, canSeeRider, adderNames)),
  );
  const registrants = rows.filter((row) => row.cancelled_at === null);
  const cancelled = rows.filter((row) => row.cancelled_at !== null);
  // Read for both readers, including the `events: view` door shift: whether
  // the organization takes a waiver at all is what turns an empty cell from
  // ambiguous into "nobody was asked" (#686).
  const waiverInForce = (await getTenantLegalPublication(supabase)).waiver;
  // Read for both readers too, and for the same reason (#599). A failure lands
  // on "no notice published", which makes the sheet hide the row for
  // registrants with nothing on theirs rather than assert something about a
  // record it could not check -- the quiet direction, and the honest one when
  // the flag itself could not be read. A row carrying an objection still
  // shows, because that condition does not depend on this flag.
  const photoConsentInForce =
    (await supabase.rpc("tenant_asks_photo_consent")).data === true;
  const [registrationOptions, registrationQuestions, groupChat, carpools] =
    await Promise.all([
      loadRegistrationOptions(supabase, eventId, registrants),
      loadRegistrationQuestions(supabase, eventId),
      loadGroupChat(supabase, eventId),
      loadEventCarpools(
        supabase,
        eventId,
        registrants.map((row) => ({
          registrationId: row.id,
          name: row.name,
          partySize: row.party_size,
          answersChangedAt: row.answers_changed_at,
        })),
      ),
    ]);

  if (!canManage) {
    return {
      data: {
        registrants,
        cancelled,
        messages: NO_RECORD_MESSAGES,
        messaging: null,
        waiverInForce,
        photoConsentInForce,
        registrationOptions,
        registrationQuestions,
        riderMountains: null,
        groupChat,
        carpools,
      },
    };
  }

  const [
    messages,
    orgEmailEnabled,
    tenantContext,
    orgMail,
    minorContacts,
    riderMountains,
  ] = await Promise.all([
    loadRecordMessages(
      supabase,
      EVENT_REGISTRATION_RECORD_TYPE,
      registrants.map((registrant) => registrant.id),
    ),
    getOrgEmailEnabled(supabase),
    // Only for what the composer calls the organization in its default
    // subject. Memoized per request, so the shell has already paid for it.
    getTenantContext(supabase),
    // The Reply-To the composer quotes, through the view that exists because
    // app_settings itself is closed to an events manager.
    supabase.from("org_notification_settings").select("reply_to").maybeSingle(),
    // The four contacts, through the definer view that is the only way to
    // them: they are revoked from `authenticated` on the table (#685). One
    // read for the event, not one per row, and it returns nothing at all for
    // a reader without `events: manage` — this branch already is one, and
    // the view checks again anyway.
    supabase
      .from("event_registration_minor_contacts")
      .select(
        "registration_id, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone",
      )
      .eq("event_id", eventId),
    // The door dialog's picker (#1408). Only for a reader who sees rider
    // answers, which is the only reader the dialog opens for.
    canSeeRider ? getRiderProfileMountains(supabase) : Promise.resolve(null),
  ]);

  const contactsById = new Map(
    (minorContacts.data ?? []).map((row) => [
      row.registration_id as string,
      {
        accompanying_adult_name: row.accompanying_adult_name ?? null,
        accompanying_adult_phone: row.accompanying_adult_phone ?? null,
        emergency_contact_name: row.emergency_contact_name ?? null,
        emergency_contact_phone: row.emergency_contact_phone ?? null,
      },
    ]),
  );

  return {
    data: {
      registrants: registrants.map((registrant) => ({
        ...registrant,
        minorContacts: contactsById.get(registrant.id) ?? null,
      })),
      cancelled,
      messages,
      messaging: {
        orgName:
          tenantContext.tenants.find(
            (tenant) => tenant.id === tenantContext.currentTenantId,
          )?.name ?? "",
        replyTo: (orgMail.data?.reply_to as string | null) ?? null,
        orgEmailEnabled,
      },
      waiverInForce,
      photoConsentInForce,
      registrationOptions,
      registrationQuestions,
      riderMountains,
      groupChat,
      carpools,
    },
  };
}

/** #1648. A failed read lands on "off", which hides the column. */
async function loadGroupChat(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventGroupChat> {
  const { data } = await supabase
    .from("events")
    .select("group_chat_enabled, group_chat_label")
    .eq("id", eventId)
    .maybeSingle();
  return data ? eventGroupChat(data) : null;
}

// Every column here also has to appear in a `grant select (...)` list --
// 20260922070000's, or the migration that added it: that one replaced this
// table's table-level SELECT with a column allow-list so the minor contacts
// could be carved out of it, and a column missing from the list simply
// disappears from the portal.
//
// `option_counts`, `answers` and `discount_codes` are embeds, not columns of
// this table (#1407, #1501, #1589).
const REGISTRANT_COLUMNS =
  "id, event_id, name, email, phone, instagram_handle, has_no_instagram, preferred_contact_method, preferred_contact_detail, pronouns, party_size, notes, created_at, person_id, checked_in_at, attended_before, waiver_accepted_at, waiver_version, party_includes_minor, adults_only_confirmed_at, answers_changed_at, group_chat_added_at, group_chat_added_by, reminder_sent_at, cancelled_at, cancellation_reason, cancellation_note, photo_consent, photo_consent_at, photo_consent_text, option_counts:event_registration_option_counts(option_id, label, quantity, sort_order), answers:event_registration_answers(question_id, prompt_as_shown, answer_text, sort_order, value), answer_request:event_registration_answer_requests(requested_at, answered_at, source), discount_codes(code, pin)";

const RIDER_COLUMNS =
  "riding_discipline_at_event, ski_experience_level_at_event, snowboard_experience_level_at_event, person:people(riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain)";

type RegistrantRow = Omit<
  EventRegistrant,
  | "rider"
  | "minorContacts"
  | "answer_request"
  | "discount_codes"
  | "group_chat_added_by_name"
> & {
  group_chat_added_by: string | null;
  // A registration holds at most one code (discount_codes_unique_registration),
  // so PostgREST embeds an object; read either shape as a list.
  discount_codes?: HeldDiscountCode | HeldDiscountCode[] | null;
  // One-to-one, so PostgREST embeds an object; an array is tolerated in case
  // it ever reads the relationship as one-to-many.
  answer_request?: AnswerRequestStatus | AnswerRequestStatus[] | null;
  riding_discipline_at_event?: string | null;
  ski_experience_level_at_event?: string | null;
  snowboard_experience_level_at_event?: string | null;
  person?: {
    riding_discipline: string | null;
    ski_experience_level: string | null;
    snowboard_experience_level: string | null;
    preferred_mountain: string | null;
  } | null;
};

function toRegistrant(
  row: unknown,
  canSeeRider: boolean,
  /** #1648. Who marked each row added to the group chat; see the list. */
  adderNames: ReadonlyMap<string | null, string | null> = new Map(),
): EventRegistrant {
  const {
    group_chat_added_by,
    person,
    riding_discipline_at_event,
    ski_experience_level_at_event,
    snowboard_experience_level_at_event,
    option_counts,
    answers,
    answer_request,
    discount_codes,
    ...fields
  } = row as RegistrantRow;
  const rest = {
    ...fields,
    group_chat_added_by_name: adderNames.get(group_chat_added_by) ?? null,
    option_counts: option_counts ?? [],
    answers: answers ?? [],
    discount_codes: Array.isArray(discount_codes)
      ? discount_codes
      : discount_codes
        ? [discount_codes]
        : [],
    answer_request:
      (Array.isArray(answer_request) ? answer_request[0] : answer_request) ??
      null,
  };

  if (!canSeeRider) return { ...rest, rider: null, minorContacts: null };

  return {
    ...rest,
    // Filled in by the caller from the definer view, which is the only place
    // these four are readable at all.
    minorContacts: null,
    rider: {
      riding_discipline_at_event: riding_discipline_at_event ?? null,
      ski_experience_level_at_event: ski_experience_level_at_event ?? null,
      snowboard_experience_level_at_event:
        snowboard_experience_level_at_event ?? null,
      riding_discipline: person?.riding_discipline ?? null,
      ski_experience_level: person?.ski_experience_level ?? null,
      snowboard_experience_level: person?.snowboard_experience_level ?? null,
      preferred_mountain: person?.preferred_mountain ?? null,
    },
  };
}

export type { RegistrantActionResult } from "./registrant-core";

/**
 * Web transport for `checkInRegistrant` (#1082 Phase 1). The decision lives in
 * registrant-core.ts, which has no Next imports.
 */
export async function checkInRegistrantAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const result = await checkInRegistrant(supabase, id);
  if ("error" in result) return result;

  revalidatePath("/portal/events");
  return result;
}

export async function undoCheckInAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const result = await undoCheckIn(supabase, id);
  if ("error" in result) return result;

  revalidatePath("/portal/events");
  return result;
}

// Door-side rider capture (issue #653). The public prompt only reaches people
// who registered after it shipped, and there is no transactional email to chase
// the rest, so check-in is the last moment somebody is actually in front of us.
//
// It goes through set_registrant_rider_profile rather than a direct update
// because the "people update" RLS policy requires people:manage, which an
// event_coordinator - the role that works the door - does not hold.
export async function setRegistrantRiderProfileAction(
  registrationId: string,
  formData: FormData,
): Promise<RegistrantActionResult> {
  const parsed = parseRiderProfileForm(formData);
  if ("error" in parsed) return fromParseError(parsed);

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a rider profile.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "manage",
  });
  if (permissionError) return fromGuard("forbidden", permissionError);
  // Carries the rider_profile module (#1408); the RPC checks both again.
  const riderError = await checkPermission(
    supabase,
    "rider_profiles",
    "manage",
  );
  if (riderError) return fromGuard("forbidden", riderError);

  const { error } = await supabase.rpc("set_registrant_rider_profile", {
    p_registration_id: registrationId,
    p_riding_discipline: parsed.data.riding_discipline,
    p_ski_experience_level: parsed.data.ski_experience_level,
    p_snowboard_experience_level: parsed.data.snowboard_experience_level,
    p_preferred_mountain: parsed.data.preferred_mountain,
  });

  if (error) {
    return error.message === "REGISTRANT_NOT_FOUND"
      ? actionError("conflict", "That registration no longer exists.")
      : actionError(
          "server_error",
          "Could not save this rider profile. Please try again.",
        );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

// Registers someone without checking them in - e.g. backfilling a past
// event's RSVP list, or a staff-entered pre-registration - so they show up
// as "registered" but not "attended" until checked in separately. This is
// the same table/RLS path as createWalkInCheckInAction, just without
// setting checked_in_at.
export async function addRegistrantAction(
  eventId: string,
  person: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  },
  partySize: number,
  optionCounts: OptionCounts | null = null,
  answers: RegistrationAnswers | null = null,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a registrant.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "manage",
    eventId,
  });
  if (permissionError) return fromGuard("forbidden", permissionError);

  if (!Number.isInteger(partySize) || partySize < 1) {
    return actionError("invalid_input", "Party size must be at least 1.", {
      partySize: "Party size must be at least 1.",
    });
  }
  // #1407. Optional here, but an answer given has to add up.
  const optionsError = hasOptionAnswer(optionCounts)
    ? optionCountsError(optionCounts!, partySize)
    : null;
  if (optionsError) return actionError("invalid_input", optionsError);
  // #1501. The same reasoning: optional, but what is given has to be valid.
  const answersInputError = await staffAnswersError(supabase, eventId, answers);
  if (answersInputError) return answersInputError;

  const { data: created, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: person.id,
      name: person.name ?? "Registrant",
      email: person.email ?? "",
      phone: person.phone,
      party_size: partySize,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return actionError(
        "conflict",
        "This person already has a registration for this event.",
      );
    }
    return actionError(
      "server_error",
      "Could not add this registrant. Please try again.",
    );
  }

  const optionsSaveError = await saveStaffOptionCounts(
    supabase,
    created.id,
    optionCounts,
  );
  if (optionsSaveError) return optionsSaveError;
  const answersSaveError = await saveStaffAnswers(
    supabase,
    created.id,
    answers,
  );
  if (answersSaveError) return answersSaveError;

  revalidatePath("/portal/events");
  return { success: true };
}

export async function createWalkInCheckInAction(
  eventId: string,
  person: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  },
  partySize: number,
  optionCounts: OptionCounts | null = null,
  answers: RegistrationAnswers | null = null,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to check in a walk-in.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "manage",
    eventId,
  });
  if (permissionError) return fromGuard("forbidden", permissionError);

  if (!Number.isInteger(partySize) || partySize < 1) {
    return actionError("invalid_input", "Party size must be at least 1.", {
      partySize: "Party size must be at least 1.",
    });
  }
  // #1407. Optional here, but an answer given has to add up.
  const optionsError = hasOptionAnswer(optionCounts)
    ? optionCountsError(optionCounts!, partySize)
    : null;
  if (optionsError) return actionError("invalid_input", optionsError);
  // #1501. The same reasoning: optional, but what is given has to be valid.
  const answersInputError = await staffAnswersError(supabase, eventId, answers);
  if (answersInputError) return answersInputError;

  const { data: created, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: person.id,
      name: person.name ?? "Walk-in",
      email: person.email ?? "",
      phone: person.phone,
      party_size: partySize,
      checked_in_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return actionError(
        "conflict",
        "This person already has a registration for this event. Check them in from the existing row instead.",
      );
    }
    return actionError(
      "server_error",
      "Could not check in this walk-in. Please try again.",
    );
  }

  const optionsSaveError = await saveStaffOptionCounts(
    supabase,
    created.id,
    optionCounts,
  );
  if (optionsSaveError) return optionsSaveError;
  const answersSaveError = await saveStaffAnswers(
    supabase,
    created.id,
    answers,
  );
  if (answersSaveError) return answersSaveError;

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * The second write of the two staff paths above (#1407). The registration row
 * is a plain RLS insert and the counts go through a definer function, so the
 * pair is not atomic -- which is why the sum is checked before the insert,
 * leaving only a server fault to land here.
 */
async function saveStaffOptionCounts(
  supabase: SupabaseClient,
  registrationId: string,
  optionCounts: OptionCounts | null,
): Promise<ActionFailure | null> {
  if (!hasOptionAnswer(optionCounts)) return null;
  const { error } = await supabase.rpc("set_registrant_option_counts", {
    p_registration_id: registrationId,
    p_counts: optionCounts!,
  });
  if (!error) return null;
  revalidatePath("/portal/events");
  return actionError(
    "server_error",
    "The registrant was saved, but their options could not be recorded.",
  );
}

function hasAnswers(
  answers: RegistrationAnswers | null,
): answers is RegistrationAnswers {
  return answers !== null && Object.keys(answers).length > 0;
}

/**
 * Checks staff answers against the event's current questions before the
 * registration is inserted (#1501), for the reason the counts are checked
 * first above: the two writes are not atomic. Never requires anything.
 */
async function staffAnswersError(
  supabase: SupabaseClient,
  eventId: string,
  answers: RegistrationAnswers | null,
): Promise<ActionFailure | null> {
  if (!hasAnswers(answers)) return null;
  const questions = await loadRegistrationQuestions(supabase, eventId);
  const known = new Set(questions.map((question) => question.id));
  if (Object.keys(answers).some((id) => !known.has(id))) {
    return actionError(
      "conflict",
      REGISTRATION_ANSWER_ERROR_MESSAGES.EVENT_ANSWERS_INVALID,
    );
  }
  const invalid = answersError(questions, answers, { required: false });
  return invalid ? actionError("invalid_input", invalid.message) : null;
}

/** The answers half of the two staff paths above (#1501). */
async function saveStaffAnswers(
  supabase: SupabaseClient,
  registrationId: string,
  answers: RegistrationAnswers | null,
): Promise<ActionFailure | null> {
  if (!hasAnswers(answers)) return null;
  const { error } = await supabase.rpc("set_registration_answers", {
    p_registration_id: registrationId,
    p_answers: answers,
  });
  if (!error) return null;
  revalidatePath("/portal/events");
  return actionError(
    "server_error",
    "The registrant was saved, but their answers could not be recorded.",
  );
}

/**
 * Staff editing a registration's answers from the detail sheet (#1501).
 * Replaces the answers to the event's current questions; answers to archived
 * ones are left as they are. Nothing is required here -- the RPC holds staff
 * to the kinds and conditions, not to `required`.
 */
export async function setRegistrationAnswersAction(
  registrationId: string,
  answers: RegistrationAnswers,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a registration.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "manage",
  });
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { error } = await supabase.rpc("set_registration_answers", {
    p_registration_id: registrationId,
    p_answers: answers,
  });

  if (error) {
    if (error.message === "REGISTRANT_NOT_FOUND") {
      return actionError("conflict", "That registration no longer exists.");
    }
    if (error.message === "EVENT_ANSWERS_INVALID") {
      return actionError(
        "conflict",
        REGISTRATION_ANSWER_ERROR_MESSAGES.EVENT_ANSWERS_INVALID,
      );
    }
    return actionError(
      "server_error",
      "Could not save these answers. Please try again.",
    );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Staff editing a registration's Instagram handle or the contact given in its
 * place, from the detail sheet (#1647). Validated like registering but never
 * required: an organizer records what they know, and blank clears it.
 */
export async function setRegistrationContactAction(
  registrationId: string,
  values: ContactValues,
): Promise<RegistrantActionResult> {
  const problem = contactError(values, false);
  if (problem) return actionError("conflict", problem);

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a registration.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkEventAccess(supabase, {
    table: "event_registrations",
    level: "manage",
  });
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { error } = await supabase.rpc("set_registration_contact", {
    p_registration_id: registrationId,
    p_instagram_handle: values.hasNoInstagram
      ? null
      : values.instagramHandle.trim() || null,
    p_has_no_instagram: values.hasNoInstagram || null,
    p_preferred_contact_method: values.hasNoInstagram
      ? values.method || null
      : null,
    p_preferred_contact_detail: values.hasNoInstagram
      ? values.detail.trim() || null
      : null,
  });

  if (error) {
    if (error.message === "REGISTRATION_NOT_FOUND") {
      return actionError("conflict", "That registration no longer exists.");
    }
    const message = REGISTRATION_CONTACT_ERROR_MESSAGES[error.message];
    if (message) return actionError("conflict", message);
    return actionError(
      "server_error",
      "Could not save this. Please try again.",
    );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Messaging registrants (#1317, on #1203's primitive)
// ---------------------------------------------------------------------------

const EVENTS_PATH = "/portal/events";

export type RegistrantMessageResult = { error: string } | { success: true };

/**
 * The guard the messaging actions open with. It hands back the user as well as
 * the client because every one of them needs the actor's id: the history row's
 * insert runs on the service-role client, where auth.uid() is null and
 * `sent_by` is therefore the only record of who sent the message.
 *
 * `events: manage`, not `view`. Door staff work a shift on `events: view` and
 * have to be able to read the registrant list; writing to the people on it, on
 * the organization's own letterhead, is a different thing.
 */
async function requireEventsManage(): Promise<
  { supabase: SupabaseClient; user: User } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    REGISTRANT_MESSAGE_ERRORS.SIGNED_OUT,
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    EVENTS_MODULE,
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase, user: userResult.user };
}

type RegistrationRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  name: string | null;
  email: string | null;
  person_id: string | null;
  cancelled_at: string | null;
};

const REGISTRATION_MESSAGE_SELECT =
  "id, tenant_id, event_id, name, email, person_id, cancelled_at";

/**
 * Write to one registrant, about the event they registered for.
 *
 * The question about parking, the note that the start time moved, the answer
 * about a party size: until now every one of those happened in somebody's
 * personal mailbox and the event kept no record of any of it. This is that
 * correspondence, kept with the registration.
 *
 * The recipient is resolved here from the registration, never taken from the
 * client, for the reason #1203 gives: an action that accepted an address would
 * be a relay that mails anyone at all behind `events: manage`. The read runs
 * under the caller's own session, so a registration in another tenant is not
 * found rather than being written to.
 *
 * `personId` may be null and that is not a fault -- sendStaffMessage() has
 * taken it nullable since #1204's contact messages -- so an unlinked
 * registration can still be answered.
 */
export async function sendEventRegistrantMessageAction(input: {
  messageId: string;
  registrationId: string;
  subject: string;
  body: string;
}): Promise<RegistrantMessageResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  const { data, error } = await guard.supabase
    .from("event_registrations")
    .select(REGISTRATION_MESSAGE_SELECT)
    .eq("id", input.registrationId)
    .maybeSingle<RegistrationRow>();

  if (error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!data) return { error: REGISTRANT_MESSAGE_ERRORS.NOT_FOUND };
  // #1418. A cancelled registration has dropped out of messaging.
  if (data.cancelled_at) return { error: REGISTRANT_MESSAGE_ERRORS.CANCELLED };
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REGISTRANT_MESSAGE_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail,
    recipientName: (data.name ?? "").trim(),
    module: EVENTS_MODULE,
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: input.registrationId,
    subject,
    body,
    sentBy: guard.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    return { error: await explainSkippedSend(guard.supabase) };
  }
  if (outcome === "failed") return { error: RECORD_MESSAGE_ERRORS.FAILED };

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

/**
 * Send the registrant's own confirmation (#1068) again.
 *
 * The case this answers is the ordinary one: somebody says they never got
 * their confirmation, and there is no way from the portal to tell whether it
 * went, let alone to send it again. It re-renders through the original sender
 * rather than a copy, so a resent confirmation carries the same details -- and
 * the same calendar attachment -- as a fresh one.
 */
export async function resendEventRegistrationConfirmationAction(
  registrationId: string,
): Promise<RegistrantMessageResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("event_registrations")
    .select(REGISTRATION_MESSAGE_SELECT)
    .eq("id", registrationId)
    .maybeSingle<RegistrationRow>();

  if (error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!data) return { error: REGISTRANT_MESSAGE_ERRORS.NOT_FOUND };
  // #1418. A cancelled registration has dropped out of messaging.
  if (data.cancelled_at) return { error: REGISTRANT_MESSAGE_ERRORS.CANCELLED };
  // The sender answers `skipped` for both of these, which would read to the
  // organizer as "already sent". Say what is actually wrong instead.
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REGISTRANT_MESSAGE_ERRORS.NO_EMAIL };
  if (!data.person_id) return { error: REGISTRANT_MESSAGE_ERRORS.NO_PERSON };

  const admin = createSupabaseAdminClient();
  const dedupeSuffix = resendDedupeSuffix();
  // An object rather than a `let`: TypeScript narrows a variable a callback
  // assigns to its initial type, and this is only ever read afterwards.
  const sent: { subject?: string } = {};

  // #1591. A fresh answers link with every resend, superseding the old one:
  // the newest email from the organization is the one that works.
  const answersLink = await issueConfirmationAnswersLink(admin, registrationId);

  const outcome = await sendEventRegistrationConfirmation(admin, {
    registrationId,
    siteUrl: await getRequestOrigin(),
    dedupeSuffix,
    answersLink,
    onRendered: (email) => {
      sent.subject = email.subject;
    },
  });

  if (outcome === "skipped") {
    return {
      error: await explainSkippedSend(
        guard.supabase,
        REGISTRANT_MESSAGE_ERRORS.RESENT_RECENTLY,
      ),
    };
  }
  if (outcome === "failed") {
    return { error: REGISTRANT_MESSAGE_ERRORS.RESEND_FAILED };
  }

  // The resend joins the history like any other send, so the sheet explains a
  // second copy the registrant may ask about. The body is empty on purpose:
  // the organization wrote this one, and the renderer is where it lives.
  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail,
    module: EVENTS_MODULE,
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: registrationId,
    subject: sent.subject ?? "Your registration",
    body: "",
    kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    dedupeKey: eventRegistrationConfirmationDedupeKey(
      registrationId,
      dedupeSuffix,
    ),
    status: outcome,
    sentBy: guard.user.id,
  });

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Asking for missing answers by emailed link (#1502)
// ---------------------------------------------------------------------------

export type AnswerRequestResult =
  { error: string } | { success: true; recipients: number };

type AnswerRequestEvent = {
  id: string;
  name: string;
  tenant_id: string;
  timezone: string;
};

/**
 * Mints a token per recipient, stores the hashes, and hands back the
 * recipients whose links were written with the raw token beside each -- the
 * only place it exists apart from the email. A registration the RPC skipped
 * (cancelled since the list was read) is dropped here, so it is never mailed
 * a link that does not work.
 */
async function writeAnswerRequests(
  supabase: SupabaseClient,
  eventId: string,
  recipients: readonly AnswerRequestRecipient[],
): Promise<
  | { recipients: AnswersRequestRecipientWithToken[]; expiresAt: string }
  | { error: string }
> {
  const minted = recipients.map((recipient) => ({
    ...recipient,
    ...mintToken(),
  }));
  const { data, error } = await supabase.rpc("request_registration_answers", {
    p_event_id: eventId,
    p_requests: minted.map((recipient) => ({
      registration_id: recipient.registrationId,
      token_hash: recipient.tokenHash,
    })),
  });
  if (error) {
    if (error.message === "EVENT_ENDED") {
      return { error: ANSWER_REQUEST_ERRORS.EVENT_ENDED };
    }
    if (error.message === "EVENT_NOT_FOUND") {
      return { error: REGISTRANT_MESSAGE_ERRORS.EVENT_NOT_FOUND };
    }
    return { error: ANSWER_REQUEST_ERRORS.FAILED };
  }
  const rows = (data ?? []) as {
    registration_id: string;
    expires_at: string;
  }[];
  const written = new Set(rows.map((row) => row.registration_id));
  const kept = minted.filter((recipient) =>
    written.has(recipient.registrationId),
  );
  if (kept.length === 0) return { error: ANSWER_REQUEST_ERRORS.NO_RECIPIENTS };
  return { recipients: kept, expiresAt: rows[0].expires_at };
}

function mintToken(): { token: string; tokenHash: string } {
  const { token, hash } = mintConfirmationToken();
  return { token, tokenHash: hash };
}

async function loadAnswerRequestEvent(
  supabase: SupabaseClient,
  eventId: string,
) {
  return supabase
    .from("events")
    .select("id, name, tenant_id, timezone")
    .eq("id", eventId)
    .maybeSingle<AnswerRequestEvent>();
}

/**
 * Email every active registration still missing a required answer its own
 * link to complete them (#1502).
 *
 * Shaped like sendEventAnnouncementAction(): who is mailed is resolved here,
 * under the caller's session and from the same pure function the dialog
 * counted with, so the number shown is the number sent and the browser never
 * names a recipient. The links are written before the response -- so a link
 * works the moment it arrives -- and only the mail is deferred.
 */
export async function askForMissingAnswersAction(input: {
  batchId: string;
  eventId: string;
  includeRecent: boolean;
  intro: string;
}): Promise<AnswerRequestResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const intro = input.intro.trim();
  if (!intro) return { error: ANSWER_REQUEST_ERRORS.INTRO_EMPTY };
  if (intro.length > MAX_ANSWERS_REQUEST_INTRO_LENGTH) {
    return { error: ANSWER_REQUEST_ERRORS.INTRO_TOO_LONG };
  }

  const [event, registrations, questions] = await Promise.all([
    loadAnswerRequestEvent(guard.supabase, input.eventId),
    guard.supabase
      .from("event_registrations")
      .select(
        "id, name, email, person_id, answers:event_registration_answers(question_id, value), answer_request:event_registration_answer_requests(requested_at, answered_at, source)",
      )
      .eq("event_id", input.eventId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: true }),
    loadRegistrationQuestions(guard.supabase, input.eventId),
  ]);

  if (event.error || registrations.error) {
    return { error: RECORD_MESSAGE_ERRORS.FAILED };
  }
  if (!event.data) return { error: REGISTRANT_MESSAGE_ERRORS.EVENT_NOT_FOUND };
  if (questions.length === 0)
    return { error: ANSWER_REQUEST_ERRORS.NO_QUESTIONS };

  const resolved = resolveAnswerRequests(
    (registrations.data ?? []).map((row) => toRegistrant(row, false)),
    questions,
    { includeRecent: input.includeRecent },
  );
  if (resolved.recipients.length === 0) {
    return { error: ANSWER_REQUEST_ERRORS.NO_RECIPIENTS };
  }
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  const written = await writeAnswerRequests(
    guard.supabase,
    input.eventId,
    resolved.recipients,
  );
  if ("error" in written) return written;

  const batch: RegistrationAnswersRequestBatch = {
    tenantId: event.data.tenant_id,
    eventId: event.data.id,
    eventName: event.data.name,
    timeZone: event.data.timezone,
    expiresAt: written.expiresAt,
    batchId: input.batchId,
    subject: answersRequestSubject(event.data.name),
    intro,
    recipients: written.recipients,
    sentBy: guard.user.id,
    // Read before after(), for the announcement's reason.
    fallbackOrigin: await getRequestOrigin(),
  };
  const admin = createSupabaseAdminClient();

  after(async () => {
    try {
      await sendRegistrationAnswersRequests(admin, batch);
    } catch (error) {
      console.error("[registration-answers-request] the batch threw", error);
    }
  });

  revalidatePath(EVENTS_PATH);
  return { success: true, recipients: written.recipients.length };
}

/**
 * The same request, to one registrant, from the detail sheet (#1502). Sent
 * while the staffer waits -- one email is a single provider round trip -- so
 * a failure is reported here rather than discovered in the history later.
 * Not limited to registrations missing an answer: it is also how somebody is
 * given a way to correct one.
 */
export async function askRegistrantForAnswersAction(
  registrationId: string,
): Promise<RegistrantMessageResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("event_registrations")
    .select(REGISTRATION_MESSAGE_SELECT)
    .eq("id", registrationId)
    .maybeSingle<RegistrationRow>();

  if (error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!data) return { error: REGISTRANT_MESSAGE_ERRORS.NOT_FOUND };
  if (data.cancelled_at) return { error: REGISTRANT_MESSAGE_ERRORS.CANCELLED };
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REGISTRANT_MESSAGE_ERRORS.NO_EMAIL };

  const [event, questions] = await Promise.all([
    loadAnswerRequestEvent(guard.supabase, data.event_id),
    loadRegistrationQuestions(guard.supabase, data.event_id),
  ]);
  if (event.error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!event.data) return { error: REGISTRANT_MESSAGE_ERRORS.EVENT_NOT_FOUND };
  if (questions.length === 0)
    return { error: ANSWER_REQUEST_ERRORS.NO_QUESTIONS };
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  const written = await writeAnswerRequests(guard.supabase, data.event_id, [
    {
      registrationId,
      name: (data.name ?? "").trim(),
      email: toEmail,
      personId: data.person_id,
    },
  ]);
  if ("error" in written) return written;

  const summary = await sendRegistrationAnswersRequests(
    createSupabaseAdminClient(),
    {
      tenantId: event.data.tenant_id,
      eventId: event.data.id,
      eventName: event.data.name,
      timeZone: event.data.timezone,
      expiresAt: written.expiresAt,
      batchId: crypto.randomUUID(),
      subject: answersRequestSubject(event.data.name),
      intro: defaultAnswersRequestIntro(event.data.name),
      recipients: written.recipients,
      sentBy: guard.user.id,
      fallbackOrigin: await getRequestOrigin(),
    },
  );

  if (summary.failed > 0) return { error: ANSWER_REQUEST_ERRORS.FAILED };
  if (summary.sent === 0) {
    return { error: await explainSkippedSend(guard.supabase) };
  }

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export type EventAnnouncementResult =
  { error: string } | { success: true; recipients: number };

/**
 * Tell everybody registered for this event something.
 *
 * Everything that decides the send happens before the response: the audience
 * is resolved here, under the caller's own session, so the count the organizer
 * was shown is the count that is mailed, and both the cap and the org-wide
 * kill switch refuse *in front of them* rather than silently in a background
 * task. Only the sending itself is deferred, because fifty spaced sends is
 * the better part of a minute of provider round trips and nobody should watch
 * a spinner for it -- the announcements card is where the outcome is read.
 *
 * The audience is re-resolved here rather than trusted from the browser for
 * the same reason the one-to-one composer takes no address: an action that
 * accepted a recipient list would be a relay that mails anyone at all behind
 * `events: manage`.
 */
export async function sendEventAnnouncementAction(input: {
  /** Minted by the composer; shared by every copy, and half of each dedupe key. */
  batchId: string;
  eventId: string;
  audience: AnnouncementAudience;
  subject: string;
  body: string;
}): Promise<EventAnnouncementResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const validated = validateRecordMessage({
    messageId: input.batchId,
    subject: input.subject,
    body: input.body,
  });
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  if (!isAnnouncementAudience(input.audience)) {
    return { error: ANNOUNCEMENT_ERRORS.AUDIENCE_INVALID };
  }

  const [event, registrations] = await Promise.all([
    guard.supabase
      .from("events")
      .select("id, name, tenant_id")
      .eq("id", input.eventId)
      .maybeSingle<{ id: string; name: string; tenant_id: string }>(),
    guard.supabase
      .from("event_registrations")
      .select("id, name, email, person_id, checked_in_at")
      .eq("event_id", input.eventId)
      // #1418. Nobody who cancelled hears about the event again.
      .is("cancelled_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (event.error || registrations.error) {
    return { error: RECORD_MESSAGE_ERRORS.FAILED };
  }
  if (!event.data) return { error: REGISTRANT_MESSAGE_ERRORS.EVENT_NOT_FOUND };

  const resolved = resolveAnnouncementAudience(
    (registrations.data ?? []) as AudienceRegistration[],
    input.audience,
  );
  const refusal = announcementRefusal(resolved);
  if (refusal) return { error: refusal };

  // Refused in front of the organizer rather than discovered by the sender
  // after the response: "nothing was sent, and here is why" is only useful
  // while somebody is still looking at the composer.
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers to resolve an origin from.
  const fallbackOrigin = await getRequestOrigin();
  const admin = createSupabaseAdminClient();
  const request = {
    tenantId: event.data.tenant_id,
    eventId: event.data.id,
    eventName: event.data.name,
    batchId: input.batchId,
    subject,
    body,
    recipients: resolved.recipients,
    sentBy: guard.user.id,
    fallbackOrigin,
  };

  after(async () => {
    try {
      await sendEventAnnouncement(admin, request);
    } catch (error) {
      // Nothing left to tell: the response has gone. Each recipient's own
      // outcome is in the ledger and the history card either way.
      console.error("[event-announcement] the batch threw", error);
    }
  });

  return { success: true, recipients: resolved.recipients.length };
}

export type CancelRegistrationInput = {
  registrationId: string;
  reason: CancellationReason;
  note: string;
  /** Email the registrant that it was cancelled. */
  notify: boolean;
};

/**
 * Cancel a registration from the Registrants tab (#1418). The row stays; its
 * seats, option counts and unsent discount code are released by
 * `cancel_event_registration()`, which also refuses a checked-in row.
 */
export async function cancelRegistrationAction(
  input: CancelRegistrationInput,
): Promise<RegistrantActionResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return fromGuard("forbidden", guard);

  if (!isCancellationReason(input.reason)) {
    return actionError(
      "invalid_input",
      CANCELLATION_ERRORS.CANCELLATION_REASON_INVALID,
    );
  }

  const { error } = await guard.supabase.rpc("cancel_event_registration", {
    p_registration_id: input.registrationId,
    p_reason: input.reason,
    p_note: input.note,
  });
  if (error) return cancellationFailure(error.message);

  if (input.notify) {
    const fallbackOrigin = await getRequestOrigin();
    const sentBy = guard.user.id;
    after(async () => {
      await sendRegistrationCancellationNotice(createSupabaseAdminClient(), {
        registrationId: input.registrationId,
        sentBy,
        fallbackOrigin,
      });
    });
  }

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

/**
 * Undo a cancellation (#1418). Refused where the seats or an option's cap have
 * been taken since, or where the person has registered again.
 */
export async function restoreRegistrationAction(
  registrationId: string,
): Promise<RegistrantActionResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return fromGuard("forbidden", guard);

  const { error } = await guard.supabase.rpc("restore_event_registration", {
    p_registration_id: registrationId,
  });
  if (error) return cancellationFailure(error.message);

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

function cancellationFailure(code: string): ActionFailure {
  const message = CANCELLATION_ERRORS[code];
  return message
    ? actionError("conflict", message)
    : actionError(
        "server_error",
        "Could not update this registration. Please try again.",
      );
}

/**
 * Mark one or many registrants added to the event's group chat, or not
 * (#1648). Rows already in that state keep their date and name.
 */
export async function setRegistrationsGroupChatAction(input: {
  eventId: string;
  registrationIds: string[];
  added: boolean;
}): Promise<{ success: true; changed: number } | ActionFailure> {
  const guard = await requireEventsManage();
  if ("error" in guard) return fromGuard("forbidden", guard);

  const { data, error } = await guard.supabase.rpc(
    "set_registrations_group_chat",
    {
      p_event_id: input.eventId,
      p_registration_ids: input.registrationIds,
      p_added: input.added,
    },
  );
  if (error) {
    const message = GROUP_CHAT_ERROR_MESSAGES[error.message];
    return message
      ? actionError("conflict", message)
      : actionError(
          "server_error",
          "Could not update the group chat list. Please try again.",
        );
  }

  revalidatePath(EVENTS_PATH);
  return { success: true, changed: data ?? 0 };
}
