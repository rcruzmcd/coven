import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { syncAllOutageSnapshots } from "@/lib/outage/sync";

/**
 * The daily rewrite of every tenant's outage snapshot in Global Config
 * (#1896). The saves keep a snapshot current within seconds; this catches what
 * they miss -- a row written outside the portal, a sync that failed -- and
 * deletes keys for domains no active tenant claims any more.
 *
 * Same CRON_SECRET guard and counts-only response as the other cron routes.
 * Answers `{ skipped: "not_configured" }` where Global Config is not
 * connected, which is every environment but production.
 */
export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    await syncAllOutageSnapshots(createSupabaseAdminClient()),
  );
}
