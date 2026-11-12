import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SOCIAL_POST_MEDIA_BUCKET } from "./pieces";
import { copyGearPhotoToPost, tenantSiteOrigin } from "./series-gear-fill";
import { gearItemLink, renderGearCaption } from "./series-gear";

/** One post generate_social_post_series_posts() created. */
export type GeneratedPost = {
  id: string;
  featured_inventory_item_id: string | null;
};

/**
 * Fills in the caption and photo of the posts a gear series just created
 * (#1841), on the service-role client: there is no person behind the run, so
 * the audit log shows these writes as System, like the posts themselves.
 */
export async function fillGeneratedGearPosts(
  admin: SupabaseClient<Database>,
  seriesId: string,
  posts: GeneratedPost[],
): Promise<void> {
  const featured = posts.filter((post) => post.featured_inventory_item_id);
  if (featured.length === 0) return;

  const { data: series, error: seriesError } = await admin
    .from("social_post_series")
    .select("tenant_id, content")
    .eq("id", seriesId)
    .single();
  if (seriesError) throw seriesError;

  const itemIds = [
    ...new Set(featured.map((post) => post.featured_inventory_item_id!)),
  ];
  const { data: items, error: itemsError } = await admin
    .from("inventory_items")
    .select(
      "id, description, size, condition, photo_url, category:inventory_categories(label)",
    )
    .in("id", itemIds);
  if (itemsError) throw itemsError;
  const byId = new Map((items ?? []).map((item) => [item.id, item]));
  const origin = await tenantSiteOrigin(admin, series.tenant_id);

  for (const post of featured) {
    const item = byId.get(post.featured_inventory_item_id!);
    if (!item) continue;
    const link = gearItemLink(origin, item.id);
    const caption = renderGearCaption(
      series.content,
      {
        id: item.id,
        description: item.description,
        size: item.size,
        condition: item.condition,
        category_label: item.category?.label ?? null,
      },
      link,
    );

    const photo = await copyGearPhotoToPost(
      admin,
      series.tenant_id,
      post.id,
      item,
    );
    let mediaId: string | null = null;
    if (photo) {
      const { data: media, error: mediaError } = await admin
        .from("social_post_media")
        .insert({
          tenant_id: series.tenant_id,
          content_opportunity_id: post.id,
          storage_path: photo.path,
          original_filename: photo.filename,
          content_type: photo.contentType,
          size_bytes: photo.size,
          position: 0,
          uploaded_by: null,
        })
        .select("id")
        .single();
      if (mediaError) {
        console.error("Could not record the gear photo", mediaError);
        await admin.storage.from(SOCIAL_POST_MEDIA_BUCKET).remove([photo.path]);
      } else {
        mediaId = media.id;
      }
    }

    const { error: updateError } = await admin
      .from("content_opportunities")
      .update({ content: caption, featured_media_id: mediaId })
      .eq("id", post.id);
    if (updateError) throw updateError;
  }
}
