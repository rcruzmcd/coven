import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import type { MailIdentity } from "@/lib/email/identity";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { unsubscribeHeaders } from "@/lib/email/unsubscribe-token";
import {
  isNotificationKind,
  notificationKindDefault,
} from "@/lib/notifications/kinds";
import type { DeliverySkipReason } from "@/lib/notifications/delivery-record";

/**
 * Claim the send, then send it (#488, extracted for #742).
 *
 * The insert comes first so that two invocations racing -- a retried Server
 * Action, or the same cron firing from two Vercel projects that share
 * vercel.json -- resolve on notification_deliveries' unique constraint rather
 * than on a "have we sent yet?" read that both would answer "no". The loser
 * gets 23505 and stops. The winner owns the row and finishes it with whatever
 * the provider said.
 *
 * This lives in one file rather than once per sender because the two branches
 * that matter -- 23505 means skip, and a failed finalize must not be reported
 * as a failed send -- are the whole correctness argument for the ledger. Its
 * callers are the scheduled task digest, the event-triggered submission
 * notices, and the leadership ops report (#743) -- the last of which is
 * addressed to an inbox rather than a person, hence the nullable personId.
 *
 * Runs on the service-role client, which bypasses RLS. tenant_id is therefore
 * written explicitly rather than left to its column default: default_tenant_id()
 * resolves to null for a sessionless caller once a second tenant exists.
 */

export type DeliveryOutcome = "sent" | "skipped" | "failed";

export type DeliveryRequest = {
  tenantId: string;
  /**
   * The recipient's people.id, or null for a send addressed to the
   * organization -- the ops report's configured inbox has no `people` row
   * behind it. A null row dedupes on the partial unique index added in
   * 20260907120000 rather than on the four-column constraint, since Postgres
   * treats NULLs in a unique index as distinct.
   */
  personId: string | null;
  /**
   * Who this tenant's mail goes out as (#857), from tenantMailIdentity().
   *
   * Required, and resolved by the caller rather than here, for two reasons.
   * Every sender below already loops grouped by tenant -- they each call
   * isOrgEmailEnabled() once per tenant -- so resolving beside that is one
   * lookup per tenant instead of one per recipient. And making it required is
   * what stops a fourth sender being written that quietly sends as the
   * platform: there is no default to fall through to.
   */
  identity: MailIdentity;
  /** A NOTIFICATION_KINDS key. */
  kind: string;
  /** What makes this send unique within its kind. */
  dedupeKey: string;
  to: string;
  /**
   * A thunk, not a value: a claim that loses the race renders nothing, and a
   * digest body costs a pass over someone's whole outstanding workload.
   */
  render: () => RenderedEmail;
  /**
   * Overrides the tenant's resolved Reply-To for this one message. The contact
   * message notice sets it to the address of whoever wrote in, so a reply
   * reaches them rather than the organization's own inbox.
   */
  replyTo?: string;
  /** Tag on this sender's log lines, e.g. "[task-digest]". */
  logPrefix: string;
};

/**
 * Whether this person has switched this kind off (#1165).
 *
 * Only asked for a kind that is on by default -- the three receipts a
 * constituent can now opt out of. Every other kind is opt-*in*, and its sender
 * has already resolved who asked for it; re-reading the table here would turn
 * a transient error into a digest nobody gets.
 *
 * Fails closed, like every other reader of this table: an unreadable
 * preference is not permission to send. A receipt that does not arrive is a
 * question somebody can ask; one that arrives after they opted out is not
 * something anybody can take back.
 */
async function hasOptedOut(
  admin: SupabaseClient,
  request: DeliveryRequest,
): Promise<boolean> {
  if (!request.personId) return false;
  if (!notificationKindDefault(request.kind)) return false;

  const { data, error } = await admin
    .from("person_notification_preferences")
    .select("enabled")
    .eq("tenant_id", request.tenantId)
    .eq("person_id", request.personId)
    .eq("kind", request.kind)
    .maybeSingle();

  if (error) {
    console.error(
      `${request.logPrefix} could not read this person's email preferences; sending nothing`,
      error,
    );
    return true;
  }
  return data ? !data.enabled : false;
}

/**
 * Record a send that never happened, so the delivery log can say so (#1310).
 *
 * Until this existed, an opt-out was the one outcome the ledger did not hold:
 * deliverEmail() returned "skipped" and wrote nothing, so the receipt somebody
 * had switched off and the receipt that was never triggered looked identical
 * from the portal -- both absent. 20260906140000 already claimed this table
 * was "the evidence that an opt-out was honored"; this is what makes that
 * sentence true.
 *
 * A 23505 here is not a problem to report. It means a row for this
 * (tenant, person, kind, dedupe_key) already exists, which is the ledger
 * answering the question this row was going to answer.
 */
async function recordSkip(
  admin: SupabaseClient,
  request: DeliveryRequest,
  reason: DeliverySkipReason,
): Promise<DeliveryOutcome> {
  const { error } = await admin.from("notification_deliveries").insert({
    tenant_id: request.tenantId,
    person_id: request.personId,
    kind: request.kind,
    dedupe_key: request.dedupeKey,
    status: "skipped",
    skip_reason: reason,
  });

  if (error && error.code !== "23505") {
    console.error(
      `${request.logPrefix} could not record a skipped delivery`,
      error,
    );
  }
  return "skipped";
}

/**
 * One-click unsubscribe (#1921), for exactly the mail a person can switch off:
 * a registry kind addressed to a `people` row. A sign-in code, a staff
 * member's one-to-one message or the ops report has no switch to flip, and a
 * header promising one would be a link that cannot keep its word.
 *
 * Mailbox providers read this pair as "stop sending me this" and offer it
 * beside the spam button; without it, the spam button is the only way out, and
 * every press of it counts against the sending domain.
 */
export function listUnsubscribeHeaders(
  request: Pick<DeliveryRequest, "tenantId" | "personId" | "kind" | "identity">,
): Record<string, string> | null {
  if (!request.personId || !isNotificationKind(request.kind)) return null;
  return unsubscribeHeaders(
    {
      tenantId: request.tenantId,
      personId: request.personId,
      kind: request.kind,
    },
    {
      origin: request.identity.origin,
      secret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
    },
  );
}

export async function deliverEmail(
  admin: SupabaseClient,
  request: DeliveryRequest,
): Promise<DeliveryOutcome> {
  if (await hasOptedOut(admin, request)) {
    return recordSkip(admin, request, "opted_out");
  }

  const { data: claimed, error: claimError } = await admin
    .from("notification_deliveries")
    .insert({
      tenant_id: request.tenantId,
      person_id: request.personId,
      kind: request.kind,
      dedupe_key: request.dedupeKey,
      status: "pending",
    })
    .select("id")
    .single();

  if (claimError) {
    // Deliberately no skip row: the row that won the race is already the
    // ledger's answer for this send, and a second one cannot be written
    // without colliding with it.
    if (claimError.code === "23505") return "skipped";
    console.error(
      `${request.logPrefix} could not claim a delivery row; skipping this recipient`,
      claimError,
    );
    return "failed";
  }

  const message = request.render();
  const replyTo = request.replyTo ?? request.identity.replyTo;
  const headers = listUnsubscribeHeaders(request);
  const result = await sendEmail({
    to: request.to,
    from: request.identity.from,
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(replyTo ? { replyTo } : {}),
    ...(headers ? { headers } : {}),
    // Whatever the renderer chose to attach (#1068). The ledger records that a
    // message went out, not what travelled with it, so nothing else here
    // changes.
    ...(message.attachments?.length
      ? { attachments: message.attachments }
      : {}),
  });

  const { error: finalizeError } = await admin
    .from("notification_deliveries")
    .update(
      result.ok
        ? {
            status: "sent",
            provider_message_id: result.id,
            sent_at: new Date().toISOString(),
          }
        : { status: "failed", error: result.error },
    )
    .eq("id", claimed.id as string);

  // A finalize failure does not undo the send, so it must not look like one:
  // the row stays 'pending' and the log is the only place that says otherwise.
  if (finalizeError) {
    console.error(
      `${request.logPrefix} sent, but could not record the outcome for delivery ${claimed.id}`,
      finalizeError,
    );
  }

  return result.ok ? "sent" : "failed";
}
