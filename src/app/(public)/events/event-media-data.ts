import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";
import { EVENT_MEDIA_BUCKET } from "@/lib/storage/event-media-files";
import {
  EMPTY_PUBLIC_EVENT_MEDIA,
  PUBLIC_EVENT_MEDIA_REUSE_SECONDS,
  PUBLIC_EVENT_MEDIA_TTL_SECONDS,
  buildPublicEventMedia,
  publicEventMediaReuseBucket,
  publicEventMediaToSign,
  type PublicEventMedia,
  type PublicEventMediaRow,
  type PublicEventPhotoWindow,
} from "@/lib/public-event-gallery";

/**
 * Signed URLs for one page's paths, reused across requests (#1683) so a
 * revisit, or the next visitor, gets the same URLs and the browser's image
 * cache answers. `bucket` is part of the key rather than left to
 * `revalidate` alone: a stale entry is served once before it refreshes, and
 * an old enough one would hand out URLs that have already expired. Only paths
 * `public_event_media()` just returned reach here, so the cache never decides
 * what is public. A failed signing is not cached.
 */
export const signPublicEventMedia = unstable_cache(
  async (paths: string[], bucket: number): Promise<[string, string][]> => {
    void bucket;
    const { data, error } = await createSupabaseAdminClient()
      .storage.from(EVENT_MEDIA_BUCKET)
      .createSignedUrls(paths, PUBLIC_EVENT_MEDIA_TTL_SECONDS);
    if (error) throw error;
    return (data ?? []).flatMap((item) =>
      item.path && item.signedUrl
        ? [[item.path, item.signedUrl] as [string, string]]
        : [],
    );
  },
  ["public-event-media-signed-urls"],
  { revalidate: PUBLIC_EVENT_MEDIA_REUSE_SECONDS },
);

/**
 * An event's public photos and videos (#1654), signed for this request.
 *
 * The bucket has no anon policy, so the service-role client reads the rows
 * and signs them -- for the tenant the request host resolved to, which
 * `public_event_media()` checks the event against along with its visibility,
 * its status and the tenant's Public event gallery setting. Only the signed
 * URLs leave the server. `window` picks the photos: the event page's preview
 * of the newest, or one page of the gallery (#1683).
 */
export async function loadPublicEventMedia(
  eventId: string,
  window: PublicEventPhotoWindow,
): Promise<PublicEventMedia> {
  const { tenant } = await getPublicSite(await createSupabaseServerClient());
  if (!tenant) return EMPTY_PUBLIC_EVENT_MEDIA;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("public_event_media", {
    p_tenant_id: tenant.id,
    p_event_id: eventId,
  });
  if (error) {
    console.error("Could not read the event's public media", error);
    return EMPTY_PUBLIC_EVENT_MEDIA;
  }

  const rows = (data ?? []) as PublicEventMediaRow[];
  const { photos, videos } = publicEventMediaToSign(rows, window);
  const paths = [...photos, ...videos].map((row) => row.path);
  let urls = new Map<string, string>();
  if (paths.length > 0) {
    try {
      urls = new Map(
        await signPublicEventMedia(
          paths,
          publicEventMediaReuseBucket(Date.now()),
        ),
      );
    } catch (signError) {
      console.error("Could not sign public event media", signError);
    }
  }

  return buildPublicEventMedia(rows, window, urls);
}
