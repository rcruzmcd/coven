import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedReturnHost, parseReturnOrigin } from "./platform-google";

/**
 * An active tenant's `custom_domain`, matched exactly. Service role because
 * `tenants` is not readable by anon, and this must not fall through to
 * `public_tenant_id()`'s parent-domain or sole-tenant matching.
 */
async function isActiveTenantDomain(domain: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("tenants")
    .select("id")
    .eq("status", "active")
    .eq("custom_domain", domain)
    .maybeSingle();
  return !error && Boolean(data);
}

/** The validated return origin, or null when it may not receive a token. */
export async function allowedReturnOrigin(
  raw: string | null | undefined,
  platformOrigin: string,
): Promise<string | null> {
  const url = parseReturnOrigin(raw);
  if (!url) return null;
  return (await isAllowedReturnHost(url, platformOrigin, isActiveTenantDomain))
    ? url.origin
    : null;
}
