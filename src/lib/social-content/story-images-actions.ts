"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_POST_MEDIA, SOCIAL_POST_MEDIA_BUCKET } from "./pieces";
import { loadStorySource, storyFingerprint } from "./story-data";
import { POST_TEMPLATES } from "./post-templates";
import { renderStoryFrame } from "./story-render";

const MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to change this post.",
  POST_NOT_FOUND: "This post no longer exists.",
  POST_PUBLISHED: "This post is published, so its images can't change.",
  NOT_GEAR_STORY:
    "Story images are made for an Instagram story that features a Gear Library item.",
  TOO_MANY_MEDIA: `A post holds up to ${MAX_POST_MEDIA} files. Remove some to make room for the three story images.`,
};

/**
 * Generate story images (#1909): renders the post's three Gear Spotlight
 * frames (#1908), uploads them to its media and swaps them in for any set
 * generated before, leaving media someone added by hand where it is. Each
 * frame is rendered and uploaded in turn rather than all at once, to keep a
 * function's memory to one 1080x1920 PNG at a time.
 */
export async function generateSocialPostStoryImagesAction(
  postId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to generate story images.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const id = String(postId);
  const load = await loadStorySource(supabase, createSupabaseAdminClient(), id);
  if (load.status !== "ok") return { error: MESSAGES.NOT_GEAR_STORY };

  const { data: tenantId } = await supabase.rpc("current_tenant_id");
  if (!tenantId) return { error: MESSAGES.PERMISSION_DENIED };

  const origin = await getRequestOrigin();
  const requestUrl = `${origin}/api/social-posts/${id}/story/1`;
  const bucket = supabase.storage.from(SOCIAL_POST_MEDIA_BUCKET);
  const uploaded: string[] = [];
  const discard = async () => {
    if (uploaded.length === 0) return;
    const { error } = await bucket.remove(uploaded);
    if (error) console.error("Could not remove unused story images", error);
  };

  for (const frame of POST_TEMPLATES[load.source.templateKey].frames) {
    let bytes: ArrayBuffer;
    try {
      const image = await renderStoryFrame(load.source, frame, requestUrl);
      bytes = await image.arrayBuffer();
    } catch (error) {
      console.error(`Could not render story frame ${frame}`, error);
      await discard();
      return { error: "Couldn't draw the story images. Please try again." };
    }
    const path = `${tenantId}/${id}/${randomUUID()}.png`;
    const { error } = await bucket.upload(path, bytes, {
      contentType: "image/png",
    });
    if (error) {
      console.error(`Could not upload story frame ${frame}`, error);
      await discard();
      return { error: "Couldn't save the story images. Please try again." };
    }
    uploaded.push(path);
  }

  const { data: replaced, error } = await supabase.rpc(
    "replace_social_post_story_images",
    {
      p_post_id: id,
      p_paths: uploaded,
      p_fingerprint: storyFingerprint(load.source),
    },
  );
  if (error) {
    console.error("Could not attach the story images", error);
    await discard();
    return {
      error:
        MESSAGES[error.message] ??
        "Couldn't add the story images to the post. Please try again.",
    };
  }

  // The rows are gone, so nothing shows the old files; a failure here only
  // orphans them.
  if (replaced && replaced.length > 0) {
    const { error: removeError } = await bucket.remove(replaced);
    if (removeError) {
      console.error("Could not remove replaced story images", removeError);
    }
  }
  revalidatePath("/portal/social", "layout");
  return { ok: true };
}
