import type { SupabaseClient } from "@supabase/supabase-js";
import { reportIfQueryFailed } from "@/lib/observability/query-error";
import { resolveImageUrl } from "@/lib/inventory";

/**
 * The public site's photos, as the pages read them.
 *
 * Every admin-editable image on the site is an `image` slot in the content
 * registry (`src/lib/site-content.ts`, keyed `site_images.<slot>`), edited
 * beside the copy it accompanies at Website > Pages and stored
 * in `site_content` like any other slot (#812). The `public_site_images` view
 * serves the published rows with the prefix stripped, so a page looks its
 * photo up by the short name: `urls.about_story_photo`.
 *
 * Adding a slot is one registry entry plus a `getSiteImageUrls()` read on the
 * page that shows it -- no migration, and the view never changes.
 */

/** Reads every published site image slot, resolved to a renderable URL. Unset slots are omitted. */
export async function getSiteImageUrls(
  supabase: SupabaseClient,
): Promise<Record<string, string | null>> {
  const result = await supabase
    .from("public_site_images")
    .select("slot, value");
  reportIfQueryFailed(result, "site-images.public_site_images");
  const { data } = result;

  const urls: Record<string, string | null> = {};
  for (const row of data ?? []) {
    urls[row.slot] = resolveImageUrl(
      typeof row.value === "string" ? row.value : null,
    );
  }
  return urls;
}
