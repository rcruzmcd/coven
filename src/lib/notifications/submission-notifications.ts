import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { resolveAutoReply } from "@/lib/notifications/auto-replies-resolver";
import { tenantMailContext } from "@/lib/email/identity";
import type { EmailOrgBrand } from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";
import { lexiconForTenant } from "@/lib/tenant-lexicon";
import {
  renderArtworkSubmissionEmail,
  renderContactMessageEmail,
  renderGearRequestEmail,
  renderVolunteerApplicationEmail,
} from "@/lib/notifications/submission-emails";
import { renderGearRequestConfirmationEmail } from "@/lib/notifications/gear-request-confirmation-email";
import { formatRegistrationContact } from "@/lib/registration-contact";
import { renderEventRegistrationConfirmationEmail } from "@/lib/notifications/event-registration-confirmation-email";
import { loadCarpoolCostNotice } from "@/lib/notifications/carpool-cost-notice";
import type { IssuedAnswersLink } from "@/lib/notifications/registration-answer-self-links";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";
import { renderVolunteerApplicationConfirmationEmail } from "@/lib/notifications/volunteer-application-confirmation-email";
import { renderContactMessageConfirmationEmail } from "@/lib/notifications/contact-message-confirmation-email";
import { renderArtworkSubmissionConfirmationEmail } from "@/lib/notifications/artwork-submission-confirmation-email";
import { contactTopicLabel } from "@/lib/contact-topics";
import { getTenantTimeZone } from "@/lib/org-timezone";
import {
  MEETUP_INSTRUCTIONS_SETTING_KEY,
  PAYMENT_METHODS_SETTING_KEY,
  SHIPPING_INSTRUCTIONS_SETTING_KEY,
  isDeliveryMethod,
  parsePaymentMethods,
} from "@/lib/gear-requests";
import { personDisplayName } from "@/lib/format";

/**
 * The event-triggered sends: a new volunteer application, a new contact
 * message (#742) and a new artwork submission (#870) reach the people who own
 * that queue -- and, since #1237, the person who filled the form in gets an
 * acknowledgement of their own. Every public form in this application now
 * answers both sides.
 *
 * Called from `after()` in the public Server Actions, so nothing here may
 * throw and nothing here may matter to the visitor who submitted the form --
 * their submission is already committed and their response already sent. Every
 * failure is a log line and, where a delivery row exists, a ledger entry.
 *
 * Runs on the service-role client, which bypasses RLS. Every tenant_id below
 * is passed explicitly rather than defaulted, and every recipient is resolved
 * inside one named tenant: there is no policy underneath this to catch a
 * mistake.
 */

export const VOLUNTEER_APPLICATION_KIND = "volunteer_application";
export const CONTACT_MESSAGE_KIND = "contact_message";
export const ARTWORK_SUBMISSION_KIND = "artwork_submission";
export const GEAR_REQUEST_KIND = "gear_request";

/** Who owns the ops inbox. `administration` is the standing fallback. */
const CONTACT_MESSAGE_RESOURCES = ["communications", "administration"];
const VOLUNTEER_APPLICATION_RESOURCES = ["volunteers"];
const ARTWORK_SUBMISSION_RESOURCES = ["artwork_submissions"];
const GEAR_REQUEST_RESOURCES = ["inventory"];

export type NotifySummary = {
  /** Role holders who could have been mailed, before the gates. */
  considered: number;
  sent: number;
  /** Muted by the org switch, opted out, or already recorded. */
  skipped: number;
  failed: number;
};

const NOTHING: NotifySummary = {
  considered: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};

/**
 * Keyed on the reference code rather than the row id, because that is all
 * submit_volunteer_application() hands back (20260827010000) -- the same
 * resolution createVolunteerApplication() in test/integration-setup.ts does.
 * The tenant has to come with it: a reference code is unique *within* a
 * tenant, so an unscoped lookup would be a cross-tenant read waiting to
 * happen.
 */
export async function notifyNewVolunteerApplication(
  admin: SupabaseClient,
  options: { tenantId: string; referenceCode: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("volunteer_applications")
    .select("id, tenant_id, name, email, role_interest")
    .eq("tenant_id", options.tenantId)
    .eq("reference_code", options.referenceCode)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the volunteer application",
      error,
    );
    return { ...NOTHING };
  }
  // Not an error: submit_volunteer_application() answers a filled honeypot
  // with a freshly generated reference code for a row it never inserted -- and
  // that generator guarantees the code is unused -- so a lookup that finds
  // nothing is a bot, which is ordinary traffic.
  if (!data) return { ...NOTHING };

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: VOLUNTEER_APPLICATION_KIND,
    resourceKeys: VOLUNTEER_APPLICATION_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${VOLUNTEER_APPLICATION_KIND}:${data.id as string}`,
    fallbackOrigin: options.siteUrl,
    render: (origin, brand) =>
      renderVolunteerApplicationEmail(
        {
          applicationId: data.id as string,
          name: (data.name as string) ?? "",
          email: (data.email as string) ?? "",
          roleInterest: (data.role_interest as string | null) ?? null,
        },
        origin,
        brand,
      ),
  });
}

export async function notifyNewContactMessage(
  admin: SupabaseClient,
  options: { messageId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("contact_messages")
    .select("id, tenant_id, name, email, topic")
    .eq("id", options.messageId)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the contact message",
      error,
    );
    return { ...NOTHING };
  }
  // Same honeypot reasoning as above: submit_contact_message() returns a
  // gen_random_uuid() for a row it never inserted.
  if (!data) return { ...NOTHING };

  const submitterEmail = (data.email as string) ?? "";
  // The topic is one of the strings a tenant renames (#896), and this is
  // the one render path with neither a session nor a host to resolve it
  // from -- it runs after the response, as the service role.
  const lexicon = await lexiconForTenant(admin, data.tenant_id as string);

  // The sender's own acknowledgement (#1237), started here rather than by the
  // three call sites: a contact message arrives through the public action, the
  // tenant API route and whatever comes next, and a send wired up at each of
  // them is a send one of them forgets. Started before the staff notice and
  // awaited after it, so neither waits on the other's provider, and guarded so
  // that an unexpected throw in the newer path cannot take down the notice
  // this function existed for -- everything in here runs after the response,
  // where a rejection has nobody left to tell.
  const acknowledgement = sendContactMessageConfirmation(admin, {
    messageId: data.id as string,
    siteUrl: options.siteUrl,
  }).catch((error: unknown) => {
    console.error(
      "[contact-message-confirm] the acknowledgement threw; the staff notice is unaffected",
      error,
    );
    return "failed" as DeliveryOutcome;
  });

  const summary = await notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: CONTACT_MESSAGE_KIND,
    resourceKeys: CONTACT_MESSAGE_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${CONTACT_MESSAGE_KIND}:${data.id as string}`,
    // The organization sends through Resend but reads its mail elsewhere, so
    // without this a staffer hitting reply answers a no-reply address. Pointing
    // it at the person who wrote in makes reply do the obvious thing. The
    // volunteer notice deliberately has no equivalent: an application is
    // answered from the queue, where the reply is recorded.
    replyTo: submitterEmail || undefined,
    fallbackOrigin: options.siteUrl,
    render: (origin, brand) =>
      renderContactMessageEmail(
        {
          messageId: data.id as string,
          name: (data.name as string) ?? "",
          email: submitterEmail,
          topic: (data.topic as string) ?? "",
        },
        origin,
        lexicon,
        brand,
      ),
  });

  await acknowledgement;
  // The staff summary, unchanged: this function answers for the notice it has
  // always answered for. The acknowledgement keeps its own ledger row, which
  // is where its outcome is readable.
  return summary;
}

export async function notifyNewArtworkSubmission(
  admin: SupabaseClient,
  options: { submissionId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("artwork_submissions")
    .select(
      "id, tenant_id, submitter_name, title, events(name), artwork_submission_images(id)",
    )
    .eq("id", options.submissionId)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the artwork submission",
      error,
    );
    return { ...NOTHING };
  }
  // Same honeypot reasoning as the two above: submit_artwork() answers a filled
  // honeypot with a gen_random_uuid() for a row it never inserted.
  if (!data) return { ...NOTHING };

  const event = data.events as { name: string } | { name: string }[] | null;
  const eventName = Array.isArray(event)
    ? (event[0]?.name ?? "")
    : (event?.name ?? "");
  const images = (data.artwork_submission_images ?? []) as unknown[];

  // The artist's own acknowledgement (#1237), for the reason and with the
  // guard the contact form's above sets out.
  const acknowledgement = sendArtworkSubmissionConfirmation(admin, {
    submissionId: data.id as string,
    siteUrl: options.siteUrl,
  }).catch((error: unknown) => {
    console.error(
      "[artwork-submission-confirm] the acknowledgement threw; the staff notice is unaffected",
      error,
    );
    return "failed" as DeliveryOutcome;
  });

  const summary = await notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: ARTWORK_SUBMISSION_KIND,
    resourceKeys: ARTWORK_SUBMISSION_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${ARTWORK_SUBMISSION_KIND}:${data.id as string}`,
    // No replyTo. A submission is answered from the queue once the piece has
    // been looked at, not by replying to the notice -- the same call the
    // volunteer notice makes.
    fallbackOrigin: options.siteUrl,
    render: (origin, brand) =>
      renderArtworkSubmissionEmail(
        {
          submissionId: data.id as string,
          name: (data.submitter_name as string) ?? "",
          eventName,
          title: (data.title as string | null) ?? null,
          imageCount: images.length,
        },
        origin,
        brand,
      ),
  });

  await acknowledgement;
  return summary;
}

type ContactMessageRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  topic: string | null;
  created_at: string;
};

/**
 * What makes one sender's acknowledgement unique, on the existing pattern:
 * the kind and the row it is about.
 *
 * No resend suffix, unlike the gear, volunteer and artwork receipts: there is
 * no portal screen that re-sends one of *these*, because there is nothing in
 * it worth recovering -- no reference code, no instructions, just "we got it".
 * Staff answering a message use the message itself, which is correspondence
 * and goes out under `staff_message`. The artwork acknowledgement below was
 * held to the same rule until #1309 and is no longer: it names the call the
 * artist answered and counts what arrived, which is worth a second copy.
 */
export function contactMessageConfirmationDedupeKey(messageId: string): string {
  return `${CONTACT_MESSAGE_CONFIRMATION_KIND}:${messageId}`;
}

/**
 * The acknowledgement whoever wrote in through the contact form gets (#1237).
 *
 * Sits beside notifyNewContactMessage() rather than inside its recipient loop,
 * for the reason notifyVolunteerApplicationConfirmation() does: two sends with
 * two dedupe keys and two failure modes, and the staff notice must not be lost
 * because the sender's address bounced, nor the reverse.
 *
 * Three things here are load-bearing and easy to undo by accident:
 *
 * **The Reply-To is the tenant's own**, which is what leaving `replyTo` unset
 * means -- deliverEmail() falls through to `identity.replyTo`. The staff
 * notice points Reply-To at whoever wrote in (#742), which is right for staff
 * and exactly wrong here: this message *is* to the person who wrote in, and
 * pointing their reply back at themselves would lose it.
 *
 * **A lookup that finds nothing is a bot.** submit_contact_message() answers a
 * filled honeypot with a gen_random_uuid() for a row it never inserted, so the
 * `!data` branch is the honeypot rule, unchanged and still load-bearing -- and
 * it matters more here than for the staff notice, because this send is aimed
 * at an address an anonymous visitor typed.
 *
 * **The person is resolved, never created.** The directory row is looked up by
 * address so that somebody who switched this receipt off on `/my` is honoured
 * by hasOptedOut(); it is not minted, because writing a `people` row for
 * everyone who uses a contact form would turn a message into a directory
 * entry. No row means no preference to consult, which is the default, which is
 * on.
 */
export async function sendContactMessageConfirmation(
  admin: SupabaseClient,
  options: { messageId: string; siteUrl: string },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("contact_messages")
    .select("id, tenant_id, name, email, topic, created_at")
    .eq("id", options.messageId)
    .maybeSingle<ContactMessageRow>();

  if (error) {
    console.error(
      "[contact-message-confirm] could not read the contact message for its acknowledgement",
      error,
    );
    return "failed";
  }

  // The honeypot, and an address to write to. The RPC refuses a message whose
  // email fails its own format check, so the blank case is belt and braces --
  // but this must never post to "".
  const to = data?.email?.trim() ?? "";
  if (!data || !to) return "skipped";

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  const [mail, reply, lexicon, timeZone, person] = await Promise.all([
    tenantMailContext(admin, data.tenant_id, {
      fallbackOrigin: options.siteUrl,
    }),
    resolveAutoReply(admin, data.tenant_id, CONTACT_MESSAGE_CONFIRMATION_KIND),
    lexiconForTenant(admin, data.tenant_id),
    getTenantTimeZone(admin, data.tenant_id),
    personIdForEmail(admin, data.tenant_id, to),
  ]);

  // The second gate, after the org-wide kill switch above and before the
  // person's own inside deliverEmail(). The third is the reason `person` can
  // be null at all -- see personIdForEmail().
  if (!reply.enabled || !person) return "skipped";

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: person.personId,
    kind: CONTACT_MESSAGE_CONFIRMATION_KIND,
    dedupeKey: contactMessageConfirmationDedupeKey(data.id),
    to,
    render: () =>
      renderContactMessageConfirmationEmail(
        {
          orgName: mail.displayName,
          senderName: (data.name ?? "").trim(),
          topicLabel: contactTopicLabel(data.topic ?? "", lexicon),
          receivedAt: data.created_at,
          timeZone,
          siteUrl: mail.origin,
          branding: mail.branding,
        },
        reply.slots,
      ),
    logPrefix: "[contact-message-confirm]",
  });
}

type ArtworkSubmissionRow = {
  id: string;
  tenant_id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  title: string | null;
  call: { title: string } | { title: string }[] | null;
  artwork_submission_images: unknown[] | null;
};

/**
 * What makes this acknowledgement's send unique, and what a resend appends to
 * it (#1309).
 *
 * The suffix is the gear receipt's, for the reason
 * gearRequestConfirmationDedupeKey() gives: the first send already claimed the
 * bare key, so a second insert with it raises 23505, deliverEmail() returns
 * `skipped`, and at the call site that is indistinguishable from success --
 * a resend on the original key would silently do nothing.
 */
export function artworkSubmissionConfirmationDedupeKey(
  submissionId: string,
  suffix?: string,
): string {
  return `${ARTWORK_SUBMISSION_CONFIRMATION_KIND}:${submissionId}${suffix ? `:${suffix}` : ""}`;
}

/**
 * The acknowledgement an artist gets after submitting to an open call
 * (#1237). The contact form's above documents the three rules both follow --
 * the tenant's own Reply-To, the honeypot, and a person resolved but never
 * created.
 *
 * The call is embedded rather than read separately, which the two tables'
 * composite foreign key `(tenant_id, call_id)` makes safe: the join cannot
 * cross a tenant even though the service-role client has no policy underneath
 * it. The event registration confirmation has to read its event separately for
 * exactly the reason this one does not -- `event_registrations.event_id`
 * references `events(id)` alone.
 */
export async function sendArtworkSubmissionConfirmation(
  admin: SupabaseClient,
  options: {
    submissionId: string;
    siteUrl: string;
    /**
     * Appended to the dedupe key so a deliberate resend is not read as the
     * first send's duplicate (#1203, adopted here in #1309). Absent on the
     * original send.
     */
    dedupeSuffix?: string;
    /**
     * The rendered message and the person it was ledgered against, for a
     * caller that has to record what it sent. Called from inside the render
     * thunk, which fires only after deliverEmail() has won the claim -- so it
     * fires if and only if an email really existed.
     *
     * The second argument is what this sender has that the gear and volunteer
     * ones do not: those are handed a person_id by their caller, while this
     * one resolves its own from the directory and may legitimately find none
     * (personIdForEmail()). A recorder that guessed would look the delivery
     * row up under the wrong person_id and lose the cross-reference
     * (findDeliveryId(), #1309).
     */
    onRendered?: (
      email: RenderedEmail,
      resolved: { personId: string | null },
    ) => void;
  },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("artwork_submissions")
    .select(
      "id, tenant_id, submitter_name, submitter_email, title, call:event_artwork_calls(title), artwork_submission_images(id)",
    )
    .eq("id", options.submissionId)
    .maybeSingle<ArtworkSubmissionRow>();

  if (error) {
    console.error(
      "[artwork-submission-confirm] could not read the artwork submission for its acknowledgement",
      error,
    );
    return "failed";
  }

  const to = data?.submitter_email?.trim() ?? "";
  if (!data || !to) return "skipped";

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  const [mail, reply, person] = await Promise.all([
    tenantMailContext(admin, data.tenant_id, {
      fallbackOrigin: options.siteUrl,
    }),
    resolveAutoReply(
      admin,
      data.tenant_id,
      ARTWORK_SUBMISSION_CONFIRMATION_KIND,
    ),
    personIdForEmail(admin, data.tenant_id, to),
  ]);

  if (!reply.enabled || !person) return "skipped";

  const call = Array.isArray(data.call) ? data.call[0] : data.call;
  const images = data.artwork_submission_images ?? [];

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: person.personId,
    kind: ARTWORK_SUBMISSION_CONFIRMATION_KIND,
    dedupeKey: artworkSubmissionConfirmationDedupeKey(
      data.id,
      options.dedupeSuffix,
    ),
    to,
    render: () => {
      const email = renderArtworkSubmissionConfirmationEmail(
        {
          orgName: mail.displayName,
          artistName: (data.submitter_name ?? "").trim(),
          callTitle: call?.title ?? "",
          title: data.title,
          imageCount: images.length,
          siteUrl: mail.origin,
          branding: mail.branding,
        },
        reply.slots,
      );
      options.onRendered?.(email, { personId: person.personId });
      return email;
    },
    logPrefix: "[artwork-submission-confirm]",
  });
}

/**
 * The directory row for an address in one tenant, or null where there is none.
 *
 * Only so that a person who switched a receipt off on `/my` is honoured:
 * hasOptedOut() consults `person_notification_preferences` by person, so an
 * acknowledgement sent with a null person can never be suppressed by one.
 * Contact messages and artwork submissions are the two public forms that mint
 * no `people` row of their own -- unlike gear requests, event registrations
 * and volunteer applications, whose RPCs all do -- so this is a read, and only
 * a read. Creating one here would quietly turn "wrote in once" into a
 * directory entry, which is a decision for the people who run the
 * organization, not for a send.
 *
 * `people.email` is stored lowercased and trimmed by a trigger
 * (20260904170000) and unique per tenant (20260906020000), so an equality
 * match on the normalized address is both exact and the index's own lookup --
 * no `ilike`, whose `_` would make `a_b@example.com` match somebody else.
 * Anonymous rows are excluded for the reason that migration gives: matching an
 * anonymous donor by address is meaningless, and one created first would win.
 *
 * Null -- as distinct from `{ personId: null }` -- means the question could
 * not be answered, and the caller stops there. That is the same fail-closed
 * call fetchOptedIn() and hasOptedOut() make and for the same reason: a
 * directory this send cannot read is a directory whose opt-out it cannot
 * honour, and a receipt that does not arrive is a question somebody can ask,
 * while one that arrives after they opted out is not something anybody can
 * take back.
 */
async function personIdForEmail(
  admin: SupabaseClient,
  tenantId: string,
  email: string,
): Promise<{ personId: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { personId: null };

  const { data, error } = await admin
    .from("people")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", normalized)
    .eq("is_anonymous", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not resolve the sender's directory row; sending nothing, since their preference cannot be consulted",
      error,
    );
    return null;
  }
  return { personId: (data?.id as string | undefined) ?? null };
}

type GearRequestRow = {
  id: string;
  tenant_id: string;
  person_id: string | null;
  delivery_method: string;
  payment_method: string | null;
  requester: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
};

const GEAR_REQUEST_SELECT =
  "id, tenant_id, person_id, delivery_method, payment_method, requester:people!gear_requests_tenant_id_person_id_fkey(name, preferred_name, email)";

/**
 * Staff side of a gear request (#1032): the inventory managers hear that
 * someone has asked. Keyed on the request id, which is what
 * request_gear_items() returns -- for a filled honeypot that is a uuid with
 * no row behind it, and this returns nothing, like the three above.
 */
export async function notifyNewGearRequest(
  admin: SupabaseClient,
  options: { requestId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("gear_requests")
    .select(GEAR_REQUEST_SELECT)
    .eq("id", options.requestId)
    .maybeSingle<GearRequestRow>();

  if (error) {
    console.error("[submission-notify] could not read the gear request", error);
    return { ...NOTHING };
  }
  if (!data) return { ...NOTHING };

  const { count } = await admin
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("gear_request_id", data.id)
    .eq("movement_type", "reserved");

  const lexicon = await lexiconForTenant(admin, data.tenant_id);

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id,
    kind: GEAR_REQUEST_KIND,
    resourceKeys: GEAR_REQUEST_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${GEAR_REQUEST_KIND}:${data.id}`,
    // No replyTo: a request is answered from its page, where the quote and
    // the handover are recorded -- the same call the volunteer notice makes.
    fallbackOrigin: options.siteUrl,
    render: (origin, brand) =>
      renderGearRequestEmail(
        {
          requestId: data.id,
          name: personDisplayName(data.requester, "Someone"),
          email: data.requester?.email ?? "",
          itemCount: count ?? 0,
          deliveryMethod: data.delivery_method,
        },
        origin,
        lexicon,
        brand,
      ),
  });
}

/**
 * The requester's own confirmation (#1032). Not a role-holder send: the
 * recipient is the person the request is about, who has no account and no
 * preference row -- so this bypasses the opt-in and goes straight to the
 * ledger, gated only by the tenant's kill switch. deliverEmail() needs a
 * people row, and request_gear_items() always mints one.
 *
 * Reads the tenant's `gear_requests.*` settings here, at send time, rather
 * than storing the instructions on the request: they are the organization's
 * words about what happens next, and the row is about what was asked for.
 */
/**
 * What makes this receipt's send unique. A resend passes a suffix, because the
 * first send already claimed the bare key: a second insert with it raises
 * 23505, deliverEmail() returns `skipped`, and at the call site that is
 * indistinguishable from success -- so a resend on the original key would
 * silently do nothing. `resendDedupeSuffix()` builds the suffix from the
 * server's clock (#1203).
 */
export function gearRequestConfirmationDedupeKey(
  requestId: string,
  suffix?: string,
): string {
  return `${GEAR_REQUEST_CONFIRMATION_KIND}:${requestId}${suffix ? `:${suffix}` : ""}`;
}

export async function sendGearRequestConfirmation(
  admin: SupabaseClient,
  options: {
    requestId: string;
    siteUrl: string;
    /**
     * Appended to the dedupe key so a deliberate resend is not read as the
     * first send's duplicate (#1203). Absent on the original send.
     */
    dedupeSuffix?: string;
    /**
     * The rendered message, for a caller that has to record what it sent.
     * Called from inside the render thunk, which is exactly the right moment:
     * deliverEmail() renders only after it has won the claim, so this fires
     * if and only if an email really existed.
     */
    onRendered?: (email: RenderedEmail) => void;
  },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("gear_requests")
    .select(GEAR_REQUEST_SELECT)
    .eq("id", options.requestId)
    .maybeSingle<GearRequestRow>();

  if (error) {
    console.error(
      "[submission-notify] could not read the gear request for its confirmation",
      error,
    );
    return "failed";
  }
  // Honeypot, or a requester with no address to write to.
  if (!data || !data.person_id || !data.requester?.email) return "skipped";
  if (!isDeliveryMethod(data.delivery_method)) return "skipped";
  const deliveryMethod = data.delivery_method;

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  const [items, settings, tenant, mail, reply] = await Promise.all([
    admin
      .from("inventory_movements")
      .select("inventory_item:inventory_items(description)")
      .eq("gear_request_id", data.id)
      .eq("movement_type", "reserved"),
    admin
      .from("app_settings")
      .select("key, value")
      .eq("tenant_id", data.tenant_id)
      .in("key", [
        PAYMENT_METHODS_SETTING_KEY,
        MEETUP_INSTRUCTIONS_SETTING_KEY,
        SHIPPING_INSTRUCTIONS_SETTING_KEY,
      ]),
    admin.from("tenants").select("name").eq("id", data.tenant_id).maybeSingle(),
    tenantMailContext(admin, data.tenant_id, {
      fallbackOrigin: options.siteUrl,
    }),
    resolveAutoReply(admin, data.tenant_id, GEAR_REQUEST_CONFIRMATION_KIND),
  ]);

  // The second of the three gates, between the org-wide kill switch above and
  // a recipient's own opt-out -- which this send has none of, the requester
  // having no account. Off means this receipt is off: no send, and no ledger
  // row to make a later "on" look like a duplicate.
  if (!reply.enabled) return "skipped";

  const settingsByKey = new Map(
    ((settings.data ?? []) as { key: string; value: unknown }[]).map((row) => [
      row.key,
      row.value,
    ]),
  );
  const instructionsKey =
    deliveryMethod === "shipping"
      ? SHIPPING_INSTRUCTIONS_SETTING_KEY
      : MEETUP_INSTRUCTIONS_SETTING_KEY;
  const instructions = settingsByKey.get(instructionsKey);
  const paymentMethods = parsePaymentMethods(
    settingsByKey.get(PAYMENT_METHODS_SETTING_KEY),
  );

  type ItemRow = {
    inventory_item: { description: string | null } | null;
  };
  const descriptions = ((items.data ?? []) as unknown as ItemRow[])
    .map((row) => row.inventory_item?.description?.trim() ?? "")
    .filter(Boolean);

  const requesterEmail = data.requester.email;
  const requester = data.requester;
  const orgName = ((tenant.data?.name as string | undefined) ?? "").trim();

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: data.person_id,
    kind: GEAR_REQUEST_CONFIRMATION_KIND,
    dedupeKey: gearRequestConfirmationDedupeKey(data.id, options.dedupeSuffix),
    to: requesterEmail,
    render: () => {
      const email = renderGearRequestConfirmationEmail(
        {
          orgName: orgName || mail.identity.from,
          requesterName: personDisplayName(requester, ""),
          items: descriptions,
          deliveryMethod,
          instructions: typeof instructions === "string" ? instructions : "",
          paymentMethod:
            deliveryMethod === "shipping"
              ? (paymentMethods.find(
                  (method) => method.key === data.payment_method,
                ) ?? null)
              : null,
          siteUrl: mail.origin,
          branding: mail.branding,
        },
        reply.slots,
      );
      options.onRendered?.(email);
      return email;
    },
    logPrefix: "[gear-request-confirm]",
  });
}

type VolunteerApplicationRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  name: string | null;
  email: string | null;
  reference_code: string;
};

/**
 * The applicant's own confirmation (#1069), carrying the reference code.
 *
 * Sits beside notifyNewVolunteerApplication() rather than inside it: the two
 * are separate sends with separate dedupe keys and separate failure modes, and
 * the staff notice must not be lost because the applicant's address bounced,
 * nor the reverse. The action calls both from one after() block.
 *
 * Keyed on the reference code with its tenant, for the reason that function
 * documents: a code is unique only *within* a tenant, and the service-role
 * client has no RLS underneath it to keep an unscoped lookup honest.
 *
 * Not a role-holder send -- the recipient is the applicant, who has no account
 * and no preference row -- so it bypasses the opt-in and goes straight to the
 * ledger, gated only by the tenant's kill switch.
 */
export function volunteerApplicationConfirmationDedupeKey(
  applicationId: string,
  suffix?: string,
): string {
  return `${VOLUNTEER_APPLICATION_CONFIRMATION_KIND}:${applicationId}${suffix ? `:${suffix}` : ""}`;
}

export async function notifyVolunteerApplicationConfirmation(
  admin: SupabaseClient,
  options: {
    tenantId: string;
    referenceCode: string;
    siteUrl: string;
    /**
     * Appended to the dedupe key so a deliberate resend is not read as the
     * first send's duplicate (#1203, adopted here in #1204). Absent on the
     * original send.
     */
    dedupeSuffix?: string;
    /**
     * The rendered message, for a caller that has to record what it sent.
     * Called from inside the render thunk, which fires only after
     * deliverEmail() has won the claim -- so it fires if and only if an email
     * really existed.
     */
    onRendered?: (email: RenderedEmail) => void;
  },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("volunteer_applications")
    .select("id, tenant_id, person_id, name, email, reference_code")
    .eq("tenant_id", options.tenantId)
    .eq("reference_code", options.referenceCode)
    .maybeSingle<VolunteerApplicationRow>();

  if (error) {
    console.error(
      "[submission-notify] could not read the volunteer application for its confirmation",
      error,
    );
    return "failed";
  }

  // No row is a filled honeypot: submit_volunteer_application() answers one
  // with a freshly generated reference code for a row it never inserted. The
  // blank-address check is belt and braces -- the RPC refuses an address that
  // does not match its own format check -- but this must never post to "".
  const to = data?.email?.trim() ?? "";
  if (!data || !to) return "skipped";

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  const [mail, reply] = await Promise.all([
    tenantMailContext(admin, data.tenant_id, {
      fallbackOrigin: options.siteUrl,
    }),
    resolveAutoReply(
      admin,
      data.tenant_id,
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    ),
  ]);

  // The second of the three gates, after the org-wide kill switch above. An
  // applicant has no account and so no opt-out of their own, which makes this
  // the last word -- and switching it off costs them the reference code, the
  // only key to /get-involved/volunteer/status.
  if (!reply.enabled) return "skipped";

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: data.person_id,
    kind: VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    dedupeKey: volunteerApplicationConfirmationDedupeKey(
      data.id,
      options.dedupeSuffix,
    ),
    to,
    render: () => {
      const email = renderVolunteerApplicationConfirmationEmail(
        {
          orgName: mail.displayName,
          applicantName: (data.name ?? "").trim(),
          referenceCode: data.reference_code,
          siteUrl: mail.origin,
          branding: mail.branding,
        },
        reply.slots,
      );
      options.onRendered?.(email);
      return email;
    },
    logPrefix: "[volunteer-application-confirm]",
  });
}

type EventRegistrationRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  person_id: string | null;
  name: string | null;
  email: string | null;
  party_size: number | null;
  instagram_handle: string | null;
  has_no_instagram: boolean | null;
  preferred_contact_method: string | null;
  preferred_contact_detail: string | null;
  is_test: boolean;
  tested_by: string | null;
};

type ConfirmationEventRow = {
  name: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  timezone: string;
  confirmation_note: string | null;
  carpools_enabled: boolean;
};

const EVENT_REGISTRATION_SELECT =
  "id, tenant_id, event_id, person_id, name, email, party_size, instagram_handle, has_no_instagram, preferred_contact_method, preferred_contact_detail, is_test, tested_by";

/**
 * The registrant's own confirmation (#1068), shaped like the gear requester's
 * above: the recipient is the person the row is about, who has no account and
 * no preference row, so this bypasses the opt-in and goes straight to the
 * ledger, gated only by the tenant's kill switch. register_for_event() always
 * mints the `people` row deliverEmail() needs.
 *
 * Three things here look like omissions and are not:
 *
 * It reads `event_registrations.email` rather than resolving the address
 * through deliveryAddress() (#1042). That rule exists for portal mail, where an
 * account holder's `notification_email` redirects messages away from the
 * address that identifies them in the directory. This is not portal mail: the
 * registrant typed an address into a public form seconds ago and the screen
 * names that address back to them, so posting the receipt to a different
 * mailbox than the one the page promised would be a bug, not a courtesy.
 *
 * It does not join `people` at all. Everything the message needs -- the name
 * they typed, the address they typed, the party size -- is on the registration,
 * and personDisplayName()'s fallback chain ends at the email address, which
 * would greet somebody as "Hi bob@example.com,".
 *
 * The first read is keyed on the registration's primary key with no tenant
 * filter, as the gear confirmation's is: it is an unguessable uuid, and the
 * tenant is named on everything downstream of it -- the events read below, and
 * the ledger row deliverEmail() writes.
 */
/**
 * What makes this receipt's send unique. A resend passes a suffix, because the
 * first send already claimed the bare key: a second insert with it raises
 * 23505, deliverEmail() returns `skipped`, and at the call site that is
 * indistinguishable from success. `resendDedupeSuffix()` builds the suffix
 * from the server's clock (#1203), so a receipt can be sent again tomorrow
 * while a double-click inside the same minute stays the no-op it should be.
 */
export function eventRegistrationConfirmationDedupeKey(
  registrationId: string,
  suffix?: string,
): string {
  return `${EVENT_REGISTRATION_CONFIRMATION_KIND}:${registrationId}${suffix ? `:${suffix}` : ""}`;
}

export async function sendEventRegistrationConfirmation(
  admin: SupabaseClient,
  options: {
    registrationId: string;
    siteUrl: string;
    /**
     * Appended to the dedupe key so a deliberate resend is not read as the
     * first send's duplicate (#1203). Absent on the original send.
     */
    dedupeSuffix?: string;
    /**
     * The rendered message, for a caller that has to record what it sent.
     * Called from inside the render thunk, which is the right moment:
     * deliverEmail() renders only after it has won the claim, so this fires if
     * and only if an email really existed.
     *
     * One argument, like the gear sender's and unlike the artwork sender's:
     * this send is handed a `person_id` on the registration it read and never
     * resolves one of its own, so the caller already knows who it reached.
     */
    onRendered?: (email: RenderedEmail) => void;
    /**
     * The registrant's own answers link (#1591), issued by the caller --
     * issueConfirmationAnswersLink() -- so the success screen can show the
     * same one. Absent or null renders no link.
     */
    answersLink?: IssuedAnswersLink | null;
  },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("event_registrations")
    .select(EVENT_REGISTRATION_SELECT)
    .eq("id", options.registrationId)
    .maybeSingle<EventRegistrationRow>();

  if (error) {
    console.error(
      "[submission-notify] could not read the registration for its confirmation",
      error,
    );
    return "failed";
  }

  // No row is a filled honeypot: register_for_event() answers one with a freshly
  // generated uuid for a row it never inserted. A blank email is the staff-entered
  // shape 20260901010000 exists for -- a walk-in checked in from the portal whose
  // `people` row has no address on it -- and is nothing to report either.
  // #1764. A test registration has no person, and its confirmation goes to
  // the tester's own account address only -- never to whatever they typed.
  const to = data?.is_test
    ? await testerEmail(admin, data.tested_by)
    : (data?.email?.trim() ?? "");
  if (!data || (!data.person_id && !data.is_test) || !to) return "skipped";

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  // A second scoped read rather than an `event:events(...)` embed on purpose:
  // event_registrations.event_id references events(id) alone, with no composite
  // (tenant_id, id) foreign key, so an embed could not name its tenant -- and on
  // the service-role client there is no policy underneath to catch a mistake.
  // Inside the same Promise.all it costs no latency.
  const [event, mail, reply, optionCounts, answerRows, sharedCode] =
    await Promise.all([
      admin
        .from("events")
        .select(
          "name, starts_at, ends_at, location, timezone, confirmation_note, carpools_enabled",
        )
        .eq("id", data.event_id)
        .eq("tenant_id", data.tenant_id)
        .maybeSingle<ConfirmationEventRow>(),
      tenantMailContext(admin, data.tenant_id, {
        fallbackOrigin: options.siteUrl,
      }),
      resolveAutoReply(
        admin,
        data.tenant_id,
        EVENT_REGISTRATION_CONFIRMATION_KIND,
      ),
      // #1407. The answer to the event's registration question, echoed back so
      // a party can check it. A failed read leaves the row out rather than
      // holding up the receipt.
      admin
        .from("event_registration_option_counts")
        .select("label, quantity, sort_order")
        .eq("registration_id", data.id)
        .eq("tenant_id", data.tenant_id)
        .order("sort_order", { ascending: true }),
      // #1501. The answers to the event's registration questions, in the words
      // they were given in, for the same reason and with the same tolerance.
      admin
        .from("event_registration_answers")
        .select("prompt_as_shown, answer_text, sort_order")
        .eq("registration_id", data.id)
        .eq("tenant_id", data.tenant_id)
        .order("sort_order", { ascending: true }),
      // #1589. The event's shared code and PIN, the same for every registrant,
      // with the same tolerance: a failed read leaves the row out.
      admin
        .from("discount_codes")
        .select("code, pin")
        .eq("event_id", data.event_id)
        .eq("tenant_id", data.tenant_id)
        .eq("shared", true)
        .maybeSingle<{ code: string; pin: string | null }>(),
    ]);

  // The second of the three gates, after the org-wide kill switch above. A
  // registrant has no account and so no opt-out of their own; switching this
  // off costs them the calendar attachment as well as the receipt.
  if (!reply.enabled) return "skipped";

  if (event.error) {
    console.error(
      "[submission-notify] could not read the event for a registration confirmation",
      event.error,
    );
    return "failed";
  }
  if (!event.data) return "skipped";
  const registered = event.data;
  // #1650. Only on an event that organizes carpools, so every other
  // confirmation costs no read.
  const carpoolNotice = registered.carpools_enabled
    ? await loadCarpoolCostNotice(admin, data.tenant_id)
    : [];

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: data.person_id,
    kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    dedupeKey: eventRegistrationConfirmationDedupeKey(
      data.id,
      options.dedupeSuffix,
    ),
    to,
    render: () => {
      const email = renderEventRegistrationConfirmationEmail(
        {
          orgName: mail.displayName,
          registrantName: (data.name ?? "").trim(),
          eventName: registered.name,
          startsAt: registered.starts_at,
          endsAt: registered.ends_at,
          timeZone: registered.timezone,
          location: registered.location,
          partySize: data.party_size ?? 1,
          options: (optionCounts.data ?? []).map(({ label, quantity }) => ({
            label,
            quantity,
          })),
          answers: (answerRows.data ?? []).map(
            ({ prompt_as_shown, answer_text }) => ({
              prompt: prompt_as_shown,
              answer: answer_text,
            }),
          ),
          note: registered.confirmation_note,
          sharedCode: sharedCode.data ?? null,
          // #1647. Only where it was asked: null on every tenant that does
          // not require a handle, which renders no row.
          contact:
            data.has_no_instagram === null
              ? null
              : formatRegistrationContact(data),
          answersLink: options.answersLink
            ? {
                url: `${mail.origin.replace(/\/+$/, "")}${publicEventAnswersPath(data.event_id, options.answersLink.token)}`,
                expiresAt: options.answersLink.expiresAt,
              }
            : null,
          carpoolNotice,
          eventId: data.event_id,
          siteUrl: mail.origin,
          branding: mail.branding,
        },
        reply.slots,
      );
      const sent = data.is_test
        ? { ...email, subject: `${TEST_SUBJECT_PREFIX}${email.subject}` }
        : email;
      options.onRendered?.(sent);
      return sent;
    },
    logPrefix: "[event-registration-confirm]",
  });
}

/** What a test registration's confirmation subject starts with (#1764). */
export const TEST_SUBJECT_PREFIX = "[Test] ";

/** The account address of whoever made a test registration, or "". */
async function testerEmail(
  admin: SupabaseClient,
  userId: string | null,
): Promise<string> {
  if (!userId) return "";
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error(
      "[submission-notify] could not read the tester for a test confirmation",
      error,
    );
    return "";
  }
  return data.user?.email?.trim() ?? "";
}

type Recipient = { person_id: string; email: string };

export async function notifyRoleHolders(
  admin: SupabaseClient,
  options: {
    tenantId: string;
    kind: string;
    resourceKeys: string[];
    minLevel: "view" | "manage";
    dedupeKey: string;
    replyTo?: string;
    /**
     * Where this tenant's site lives when it has no domain of its own -- the
     * origin the request came in on. The tenant's own wins where there is one
     * (#860); a thunk taking the origin rather than a closure over it is what
     * lets that be decided here, after the tenant is known.
     */
    fallbackOrigin: string;
    /**
     * The message, given this tenant's origin and its branding (#1238) -- both
     * resolved below, after the tenant is known, for the reason the origin is
     * a parameter at all.
     */
    render: (origin: string, brand: EmailOrgBrand) => RenderedEmail;
  },
): Promise<NotifySummary> {
  const summary: NotifySummary = { ...NOTHING };

  if (!(await isOrgEmailEnabled(admin, options.tenantId))) return summary;

  const recipients = await fetchRoleHolders(admin, options);
  summary.considered = recipients.length;
  if (recipients.length === 0) return summary;

  const optedIn = await fetchOptedIn(
    admin,
    options.tenantId,
    options.kind,
    recipients.map((recipient) => recipient.person_id),
  );

  // One tenant per call, so this is once per notice -- and after the gates
  // above, so a tenant with no role holders costs nothing (#857).
  const mail = await tenantMailContext(admin, options.tenantId, {
    fallbackOrigin: options.fallbackOrigin,
  });

  for (const recipient of recipients) {
    if (!optedIn.has(recipient.person_id)) {
      summary.skipped += 1;
      continue;
    }

    const outcome = await deliverEmail(admin, {
      tenantId: options.tenantId,
      identity: mail.identity,
      personId: recipient.person_id,
      kind: options.kind,
      dedupeKey: options.dedupeKey,
      to: recipient.email,
      render: () =>
        options.render(mail.origin, {
          orgName: mail.displayName,
          branding: mail.branding,
        }),
      replyTo: options.replyTo,
      logPrefix: "[submission-notify]",
    });

    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "skipped") summary.skipped += 1;
    else summary.failed += 1;
  }

  return summary;
}

/**
 * Everyone in this tenant whose portal roles reach the level on any of the
 * resources, already filtered to people with an address and an account.
 *
 * people_with_permission() rather than has_permission(): the latter answers
 * only for auth.uid(), and this caller has no session at all.
 */
async function fetchRoleHolders(
  admin: SupabaseClient,
  options: {
    tenantId: string;
    resourceKeys: string[];
    minLevel: "view" | "manage";
  },
): Promise<Recipient[]> {
  const { data, error } = await admin.rpc("people_with_permission", {
    p_tenant_id: options.tenantId,
    p_resource_keys: options.resourceKeys,
    p_min_level: options.minLevel,
  });

  if (error) {
    console.error(
      "[submission-notify] could not resolve recipients; notifying nobody",
      error,
    );
    return [];
  }
  return (data ?? []) as Recipient[];
}

/** The people who have opted in to this kind, within one tenant. */
async function fetchOptedIn(
  admin: SupabaseClient,
  tenantId: string,
  kind: string,
  personIds: string[],
): Promise<Set<string>> {
  const optedIn = new Set<string>();
  if (personIds.length === 0) return optedIn;

  const { data, error } = await admin
    .from("person_notification_preferences")
    .select("person_id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("enabled", true)
    .in("person_id", personIds);

  // Failing closed, like the digest's own reader: an unreadable preference
  // table means nobody has provably opted in, and sending on a guess is the
  // one mistake with no way back.
  if (error) {
    console.error(
      "[submission-notify] could not read notification preferences; sending nothing",
      error,
    );
    return optedIn;
  }
  for (const row of data ?? []) {
    optedIn.add(row.person_id as string);
  }
  return optedIn;
}
