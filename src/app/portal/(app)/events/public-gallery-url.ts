import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEventPhotosPath } from "@/app/(public)/events/event-path";
import { publicSiteHref } from "@/lib/portal/paths";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { getRequestHost, getRequestOrigin } from "@/lib/request-origin";

/**
 * The event's public gallery page (#1654), as this request's host links to
 * it: absolute when the public site is on another host than the portal, a
 * path when it is this one, and null when the organization has no public site
 * to link to from here. The caller decides whether the gallery is served.
 */
export async function publicGalleryHref(
  supabase: SupabaseClient,
  eventId: string,
): Promise<string | null> {
  const [tenantContext, requestHost] = await Promise.all([
    getTenantContext(supabase),
    getRequestHost(),
  ]);
  return publicSiteHref(
    requestHost,
    currentTenant(tenantContext)?.custom_domain ?? null,
    publicEventPhotosPath(eventId),
  );
}

/**
 * The gallery link for an email (#1555), so always absolute, or null unless
 * the page it names would answer: `public_event_media()`'s own rule -- the
 * Public event gallery setting is on, the event is public and published, and
 * something in it is public.
 */
export async function loadPublicGalleryEmailUrl(
  supabase: SupabaseClient,
  eventId: string,
): Promise<string | null> {
  const [enabled, event, publicItem] = await Promise.all([
    supabase.rpc("event_public_gallery_enabled"),
    supabase
      .from("events")
      .select("visibility, status")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_media")
      .select("id")
      .eq("event_id", eventId)
      .eq("is_public", true)
      .limit(1),
  ]);
  const served =
    enabled.data === true &&
    event.data?.visibility === "public" &&
    event.data?.status === "published" &&
    (publicItem.data?.length ?? 0) > 0;
  if (!served) return null;

  const href = await publicGalleryHref(supabase, eventId);
  if (!href) return null;
  return href.startsWith("/") ? `${await getRequestOrigin()}${href}` : href;
}
