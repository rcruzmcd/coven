import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The tenants a scheduled sender may mail on behalf of: `status = 'active'`
 * (#1674).
 *
 * The cron jobs walk every tenant on the service-role client, and nothing else
 * they check -- the org email switch, a person's opt-in, the dedupe ledger --
 * knows about tenant status. A suspended or archived tenant is unreachable by
 * host and by slug (docs/tenants.md), so every link in its mail would land on
 * the NoTenant page; and suspending a tenant is meant to stop it acting.
 *
 * Read once per run, beside isOrgEmailEnabled() in each job's per-tenant loop.
 * Fails closed for the same reason that switch does: a status we could not
 * read is not permission to send, and a night with no mail is recoverable.
 */
export async function activeTenantIds(
  admin: SupabaseClient,
  logPrefix: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("tenants")
    .select("id")
    .eq("status", "active");

  if (error) {
    console.error(
      `${logPrefix} could not read tenant status; sending nothing`,
      error,
    );
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.id as string));
}
