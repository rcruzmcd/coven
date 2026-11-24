import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  isEventSource,
  loadStorySource,
  sourceFrames,
  storyFingerprint,
} from "./story-data";

/** What the post page's Story images panel (#1909) shows. */
export type StoryImagesState = {
  /**
   * The post has the record its template draws from: a featured item, or for
   * an event template (#1926) its event.
   */
  hasItem: boolean;
  /** What the template is drawn from; absent, a featured item. */
  record?: "inventory_item" | "event";
  /** Images a set holds; absent, Gear Spotlight's three. A recap post's follows its photos (#1927). */
  frames?: number;
  /**
   * That item has a photo; frame 1 shows a tinted panel without one. A post
   * that chose "No photo" (#1925) isn't warned about it.
   */
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
  const frames = sourceFrames(load.source).length;
  const source = load.source;
  const event = isEventSource(source);
  return {
    hasItem: true,
    record: event ? "event" : "inventory_item",
    frames,
    // An event without a photo draws a brand layout, which needs none.
    hasPhoto: isEventSource(source) || source.itemHasPhoto,
    generated: generated.length,
    stale:
      generated.length > 0 &&
      (generated.length !== frames ||
        generated.some((row) => row.generated_fingerprint !== current)),
  };
}
