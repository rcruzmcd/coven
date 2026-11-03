import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { loadCarpoolCostNotice } from "@/lib/notifications/carpool-cost-notice";
import {
  carpoolAssignmentSubject,
  carpoolAssignmentSummary,
  renderCarpoolAssignmentEmail,
} from "@/lib/notifications/carpool-assignment-email";
import {
  CARPOOL_ASSIGNMENT_KIND,
  EVENT_REGISTRATION_RECORD_TYPE,
} from "@/lib/outbound-messages";
import { ANNOUNCEMENT_SEND_INTERVAL_MS } from "@/lib/event-announcements";
import type { CarpoolAssignment } from "@/lib/carpool-assignment";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";

/**
 * Emails each person in a car their assignment (#1651), after the action has
 * resolved who. Modelled on sendRegistrationAnswersRequests(): one tenant, one
 * mail context, then a sequential, spaced loop that records each outcome in
 * that registration's message history. Runs on the service-role client after
 * the response, so nothing here throws at a caller.
 *
 * Each recipient gets a fresh answers link, issued just before their mail and
 * replacing the one their confirmation carried (#1591: the newest email
 * always works). A failed send keeps it -- unlike #1502's ask, there is no
 * "Asked" state for a stale link to misreport -- and is not stamped as
 * emailed, so "only those whose car changed" picks them up next time.
 */

export type CarpoolAssignmentEmailRecipient = {
  registrationId: string;
  name: string;
  email: string;
  personId: string | null;
  car: CarpoolAssignment;
  /** What the stamp records, from event_carpool_assignment_recipients(). */
  signature: string;
};

export type CarpoolAssignmentBatch = {
  tenantId: string;
  eventId: string;
  eventName: string;
  timeZone: string;
  /** `events.carpool_cost_notice`: null for the organization's notice. */
  eventNotice: string[] | null;
  /** Half of each recipient's dedupe key. */
  batchId: string;
  recipients: readonly CarpoolAssignmentEmailRecipient[];
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export type CarpoolAssignmentSummary = {
  sent: number;
  skipped: number;
  failed: number;
};

export function carpoolAssignmentDedupeKey(
  registrationId: string,
  batchId: string,
): string {
  return `${CARPOOL_ASSIGNMENT_KIND}:${registrationId}:${batchId}`;
}

export async function sendCarpoolAssignments(
  admin: SupabaseClient,
  batch: CarpoolAssignmentBatch,
): Promise<CarpoolAssignmentSummary> {
  const summary: CarpoolAssignmentSummary = { sent: 0, skipped: 0, failed: 0 };

  // Again here, for sendEventAnnouncement()'s reason: this runs after the
  // response, and the switch must not be satisfied by a stale read.
  if (!(await isOrgEmailEnabled(admin, batch.tenantId))) {
    summary.skipped = batch.recipients.length;
    return summary;
  }

  const [mail, notice] = await Promise.all([
    tenantMailContext(admin, batch.tenantId, {
      fallbackOrigin: batch.fallbackOrigin,
    }),
    batch.eventNotice ?? loadCarpoolCostNotice(admin, batch.tenantId),
  ]);
  const origin = mail.origin.replace(/\/+$/, "");
  const subject = carpoolAssignmentSubject(batch.eventName);

  for (const [index, recipient] of batch.recipients.entries()) {
    if (index > 0) await pause(ANNOUNCEMENT_SEND_INTERVAL_MS);

    const dedupeKey = carpoolAssignmentDedupeKey(
      recipient.registrationId,
      batch.batchId,
    );
    const answersLink = await issueLink(admin, recipient.registrationId);

    let outcome: DeliveryOutcome;
    try {
      outcome = await deliverEmail(admin, {
        tenantId: batch.tenantId,
        personId: recipient.personId,
        identity: mail.identity,
        kind: CARPOOL_ASSIGNMENT_KIND,
        dedupeKey,
        to: recipient.email,
        render: () =>
          renderCarpoolAssignmentEmail({
            orgName: mail.displayName,
            firstName: recipient.name.trim().split(/\s+/)[0] ?? "",
            eventName: batch.eventName,
            car: recipient.car,
            notice,
            answersLink: answersLink
              ? {
                  url: `${origin}${publicEventAnswersPath(batch.eventId, answersLink.token)}`,
                  expiresAt: answersLink.expiresAt,
                }
              : null,
            timeZone: batch.timeZone,
            siteUrl: mail.origin,
            branding: mail.branding,
          }),
        logPrefix: "[carpool-assignment]",
      });
    } catch (error) {
      console.error("[carpool-assignment] the send threw", error);
      outcome = "failed";
    }

    if (outcome === "skipped") {
      summary.skipped += 1;
      continue;
    }
    if (outcome === "sent") {
      summary.sent += 1;
      await stampEmailed(admin, batch, recipient);
    } else {
      summary.failed += 1;
    }

    await recordOutboundMessage(admin, {
      messageId: crypto.randomUUID(),
      tenantId: batch.tenantId,
      personId: recipient.personId,
      toEmail: recipient.email,
      module: "events",
      recordType: EVENT_REGISTRATION_RECORD_TYPE,
      recordId: recipient.registrationId,
      subject,
      // The card's lines, never the link: the token must not be stored.
      body: carpoolAssignmentSummary(recipient.car, mail.displayName),
      kind: CARPOOL_ASSIGNMENT_KIND,
      dedupeKey,
      status: outcome,
      sentBy: batch.sentBy,
    });
  }

  return summary;
}

/** A fresh answers link, or null where none could be issued. */
async function issueLink(
  admin: SupabaseClient,
  registrationId: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await admin.rpc("issue_registration_answer_link", {
    p_registration_id: registrationId,
    p_token_hash: hash,
    p_source: "carpool_assignment",
  });
  if (error) {
    console.error(
      "[carpool-assignment] could not issue an answers link",
      error,
    );
    return null;
  }
  return typeof data === "string" ? { token, expiresAt: data } : null;
}

async function stampEmailed(
  admin: SupabaseClient,
  batch: CarpoolAssignmentBatch,
  recipient: CarpoolAssignmentEmailRecipient,
): Promise<void> {
  const { error } = await admin.from("event_carpool_assignment_emails").upsert(
    {
      registration_id: recipient.registrationId,
      tenant_id: batch.tenantId,
      event_id: batch.eventId,
      emailed_at: new Date().toISOString(),
      signature: recipient.signature,
    },
    { onConflict: "registration_id" },
  );
  if (error) {
    // Costs only the "only changed" filter its accuracy: this person is
    // offered again next time.
    console.error("[carpool-assignment] could not stamp a send", error);
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
