import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { runSocialPostSeriesGenerator } from "@/lib/social-content/series-generator";

/**
 * The daily generator for recurring social posts, on a Vercel Cron (#1840).
 *
 * The same CRON_SECRET guard and counts-only response as the other cron
 * routes. Safe to run twice (the schedule is in vercel.json): a series'
 * date can hold only one post, so the second run creates nothing.
 */
export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    // No detail, deliberately: "no secret configured" and "wrong secret" are
    // the same answer to anyone outside.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSocialPostSeriesGenerator(
    createSupabaseAdminClient(),
  );
  return NextResponse.json(result);
}
