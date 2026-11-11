import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSiteContent, type SiteContentRow } from "@/lib/site-content";

export const PHOTOS_EMAIL_BODY_KEY = "events.photos_email_body";

/**
 * The tenant's Send photos message (#1555), read on the service-role client
 * because `site_content` is closed to an events manager. Only the published
 * value counts, and no row, or a read that fails, is the platform default.
 */
export async function loadPhotosEmailBody(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("site_content")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .eq("key", PHOTOS_EMAIL_BODY_KEY)
    .not("value", "is", null);
  if (error) {
    console.error(
      "[photos-email-body] could not read the message; using the default",
      error,
    );
  }
  return resolveSiteContent((data ?? []) as SiteContentRow[]).paragraphs(
    PHOTOS_EMAIL_BODY_KEY,
  );
}
