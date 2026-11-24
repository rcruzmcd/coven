import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { loadStorySource, storyFingerprint } from "./story-data";
import { POST_TEMPLATES } from "./post-templates";

/** What the post page's Story images panel (#1909) shows. */
export type StoryImagesState = {
  /** The post features an item the frames can be drawn from. */
  hasItem: boolean;
  /** That item has a photo; frame 1 shows a tinted panel without one. */
  hasPhoto: boolean;
  /** How many generated frames the post holds now. */
  generated: number;
  /**
   * The generated set no longer matches the post, its item or the tenant's
   * branding -- or a frame of it was removed.
   */
  stale: boolean;
};

export async function loadStoryImagesState(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  postId: string,
): Promise<StoryImagesState> {
  const [load, { data: rows }] = await Promise.all([
    loadStorySource(supabase, admin, postId),
    supabase
      .from("social_post_media")
      .select("generated_frame, generated_fingerprint")
      .eq("content_opportunity_id", postId)
      .not("generated_frame", "is", null),
  ]);
  const generated = rows ?? [];
  if (load.status !== "ok") {
    return {
      hasItem: false,
      hasPhoto: false,
      generated: generated.length,
      stale: false,
    };
  }
  const current = storyFingerprint(load.source);
  return {
    hasItem: true,
    hasPhoto: load.source.photoSource !== null,
    generated: generated.length,
    stale:
      generated.length > 0 &&
      (generated.length <
        POST_TEMPLATES[load.source.templateKey].frames.length ||
        generated.some((row) => row.generated_fingerprint !== current)),
  };
}
