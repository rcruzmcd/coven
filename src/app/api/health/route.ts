import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Uptime check for the host it is requested on (#1894). See `@/lib/health`
 * for what a 200 and a 503 mean.
 *
 * Unauthenticated on purpose: the monitors are a third party. Reachable on a
 * `portal.` host as well as the apex, because the proxy passes `/api/`
 * through on both (`ROOT_PATH_PREFIXES` in `src/proxy.ts`) rather than
 * rewriting it under `/portal`. Not cached: Next 16 route handlers are
 * dynamic by default, and `no-store` keeps any CDN in front from holding it.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { status, body } = await checkHealth(supabase);
  return NextResponse.json(body, {
    status,
    // A cached 200 is the outage this endpoint exists to catch.
    headers: { "Cache-Control": "no-store" },
  });
}
