import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryEvent } from "@/lib/email/resend-webhook";
import { switchOffNotificationKind } from "@/lib/notifications/switch-off-kind";

const LOG_PREFIX = "[resend-webhook]";

/**
 * Write a bounce or complaint back onto the ledger row it belongs to (#1921).
 *
 * A complaint also switches that kind off for that person: "this is spam" is
 * the strongest unsubscribe there is, and mailing them the same thing
 * tomorrow is how a domain's complaint rate climbs past the 0.3% Gmail
 * enforces. A bounce switches nothing off -- Resend already suppresses a
 * hard-bounced address account-wide, and the person may fix their address.
 *
 * Returns false only for a failure worth a retry (a read or write error), so
 * the route can answer 500 and Resend redelivers. An email id with no ledger
 * row -- a test send, a message from another deployment sharing the Resend
 * account -- is not one: retrying cannot make the row appear.
 */
export async function recordDeliveryEvent(
  admin: SupabaseClient,
  event: DeliveryEvent,
): Promise<boolean> {
  const { data: row, error } = await admin
    .from("notification_deliveries")
    .update({
      provider_event: event.event,
      provider_event_at: event.occurredAt,
      provider_event_detail: event.detail,
    })
    .eq("provider_message_id", event.emailId)
    .eq("status", "sent")
    .select("tenant_id, person_id, kind")
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} could not record ${event.event}`, error);
    return false;
  }
  if (!row) return true;

  if (event.event === "complained" && row.person_id) {
    await switchOffNotificationKind(
      admin,
      {
        tenantId: row.tenant_id as string,
        personId: row.person_id as string,
        kind: row.kind as string,
      },
      LOG_PREFIX,
    );
  }
  return true;
}
