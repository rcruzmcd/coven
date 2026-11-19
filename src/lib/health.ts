import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicTenant } from "@/lib/branding";

/**
 * What `GET /api/health` answers (#1894).
 *
 * The 2026-11-16 to 11-18 PostgREST outage served every host a 200 with the
 * placeholder home page for two days, because every public loader falls back
 * to defaults on a failed read and nothing that returns 200 looks broken to an
 * uptime monitor. This is the one response that is not allowed to fall back.
 *
 * It answers through `getPublicTenant`, the same read the public layout makes,
 * on the same server client -- so a 200 here means the request host,
 * `TENANT_HOST_OVERRIDE`, the publishable key, PostgREST and tenant resolution
 * all worked together, and a 503 means the public site is rendering defaults
 * (or 404ing) right now. A separate probe query would only prove that
 * *something* can reach the database.
 *
 * The body names the tenant's slug and nothing else: the endpoint is
 * unauthenticated and polled by a third party.
 */
export type HealthBody =
  { ok: true; tenant: string } | { ok: false; code: string };

export type HealthResult = { status: 200 | 503; body: HealthBody };

/**
 * How long the read may take before the check calls it down. PostgREST's
 * `PGRST002` loop answered quickly, but a stalled pool does not, and a
 * monitor's own timeout reports "timeout" with no code at all -- this keeps
 * the answer a 503 with a reason. Well under Sentry Uptime's 10s default.
 */
export const HEALTH_TIMEOUT_MS = 5_000;

/** The `code` for each failure that PostgREST does not name itself. */
export const HEALTH_CODES = {
  /** The host resolved to no tenant (only possible with >1 active tenant). */
  noTenant: "no_tenant",
  /** The read did not answer within `HEALTH_TIMEOUT_MS`. */
  timeout: "timeout",
  /** The read failed without a PostgREST code -- a connection error. */
  unreachable: "unreachable",
} as const;

export async function checkHealth(
  supabase: SupabaseClient,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  let result: Awaited<ReturnType<typeof getPublicTenant>> | "timeout";
  try {
    result = await Promise.race([
      getPublicTenant(supabase, { retry: false }),
      timedOut,
    ]);
  } catch {
    // supabase-js returns errors rather than throwing them, but a thrown one
    // is still the database being unreachable, not a reason to 500.
    result = { status: "unavailable", code: "" };
  } finally {
    clearTimeout(timer);
  }

  if (result === "timeout") {
    return down(HEALTH_CODES.timeout);
  }
  switch (result.status) {
    case "resolved":
      return { status: 200, body: { ok: true, tenant: result.tenant.slug } };
    case "unresolved":
      return down(HEALTH_CODES.noTenant);
    case "unavailable":
      return down(result.code || HEALTH_CODES.unreachable);
  }
}

function down(code: string): HealthResult {
  return { status: 503, body: { ok: false, code } };
}
