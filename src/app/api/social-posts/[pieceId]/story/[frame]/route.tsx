import { ImageResponse } from "next/og";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadStoryFrame } from "@/lib/social-content/story-data";
import { loadStoryFonts } from "@/lib/social-content/story-fonts";
import {
  buildStoryFrame,
  parseStoryFrame,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "@/lib/social-content/story-frames";
import { StoryFrameView } from "./story-frame-view";

/**
 * One frame of a featured-gear post's Gear Spotlight story, as a 1080x1920
 * PNG (#1908): 1 the item, 2 its details, 3 how to get it.
 *
 * Under `/api/` so the portal host's proxy passes it through rather than
 * rewriting it into `/portal/*`, like `/api/app-icon/[size]`. Nothing here is
 * public: it answers only a signed-in user who can open the post, and 404s a
 * post that features no item.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ pieceId: string; frame: string }> },
) {
  const { pieceId, frame: rawFrame } = await context.params;
  const frame = parseStoryFrame(rawFrame);
  if (!frame) return new Response("Not found", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const load = await loadStoryFrame(
    supabase,
    createSupabaseAdminClient(),
    pieceId,
    frame,
    request.url,
  );
  if (load.status === "unauthenticated") {
    return new Response("Sign in to view this image", { status: 401 });
  }
  if (load.status === "not_found") {
    return new Response("Not found", { status: 404 });
  }

  const model = buildStoryFrame({
    ...load.input,
    frame,
    headingTracking: load.typography.headingTracking,
  });
  const fonts = await loadStoryFonts(load.typography);

  return new ImageResponse(<StoryFrameView model={model} />, {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    fonts,
    headers: {
      // The post's own data, behind a session: never a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
