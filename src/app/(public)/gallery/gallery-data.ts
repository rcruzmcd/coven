import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";
import { publicEventMediaReuseBucket } from "@/lib/public-event-gallery";
import {
  EMPTY_PUBLIC_GALLERY,
  PUBLIC_GALLERY_PAGE_SIZE,
  PUBLIC_GALLERY_THUMBS,
  buildPublicGalleryPage,
  publicGalleryPathsToSign,
  type PublicGalleryPage,
  type PublicGalleryRow,
} from "@/lib/public-gallery";
import { signPublicEventMedia } from "../events/event-media-data";

/**
 * Whether this host's Gallery has anything to show (#1655): the public event
 * gallery is on and something in it is public. The layout asks it to decide
 * the menu link, the page to decide whether to 404. `cache()`d per request.
 * A failed read is "nothing", so the menu never leads to an error.
 */
export const publicGalleryHasMedia = cache(async (): Promise<boolean> => {
  const { tenant } = await getPublicSite(await createSupabaseServerClient());
  if (!tenant) return false;
  const { data, error } = await createSupabaseAdminClient().rpc(
    "public_event_gallery_has_media",
    { p_tenant_id: tenant.id },
  );
  if (error) {
    console.error("Could not read whether the gallery has media", error);
    return false;
  }
  return data === true;
});

/**
 * One page of the Gallery (#1655), signed for this request. As for an
 * event's photos (#1654): the service-role client reads the rows for the
 * tenant the host resolved to, and only this page's thumbnails are signed.
 */
export async function loadPublicGalleryPage(
  page: number,
): Promise<PublicGalleryPage> {
  const { tenant } = await getPublicSite(await createSupabaseServerClient());
  if (!tenant) return EMPTY_PUBLIC_GALLERY;

  const { data, error } = await createSupabaseAdminClient().rpc(
    "public_event_gallery",
    {
      p_tenant_id: tenant.id,
      p_limit: PUBLIC_GALLERY_PAGE_SIZE,
      p_offset: (page - 1) * PUBLIC_GALLERY_PAGE_SIZE,
      p_thumbs: PUBLIC_GALLERY_THUMBS,
    },
  );
  if (error) {
    console.error("Could not read the public gallery", error);
    return EMPTY_PUBLIC_GALLERY;
  }

  const rows = (data ?? []) as PublicGalleryRow[];
  const paths = publicGalleryPathsToSign(rows);
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
      console.error("Could not sign public gallery thumbnails", signError);
    }
  }
  return buildPublicGalleryPage(rows, urls);
}
