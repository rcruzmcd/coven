import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnsubscribeClaim } from "@/lib/email/unsubscribe-token";
import { isNotificationKind } from "@/lib/notifications/kinds";

/**
 * Turn one kind of email off for one person, on their behalf (#1921) -- what a
 * one-click unsubscribe and a spam complaint both mean.
 *
 * Writes the same `enabled = false` row the person's own switch on `/my` or
 * /portal/account would, so the screen, the sender (`hasOptedOut()` for an
 * opt-out kind, the recipient queries for an opt-in one) and the delivery
 * log's `opted_out` reason all agree without knowing how the row got there.
 *
 * Service-role, since there is no session: tenant_id and person_id come from a
 * signed token or a ledger row, never from the request.
 */
export async function switchOffNotificationKind(
  admin: SupabaseClient,
  claim: UnsubscribeClaim,
  logPrefix: string,
): Promise<boolean> {
  if (!isNotificationKind(claim.kind)) return false;

  const { error } = await admin.from("person_notification_preferences").upsert(
    {
      tenant_id: claim.tenantId,
      person_id: claim.personId,
      kind: claim.kind,
      enabled: false,
    },
    { onConflict: "tenant_id,person_id,kind" },
  );

  if (error) {
    console.error(
      `${logPrefix} could not switch off ${claim.kind} for person ${claim.personId}`,
      error,
    );
    return false;
  }
  return true;
}
