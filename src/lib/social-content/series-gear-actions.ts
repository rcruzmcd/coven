"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type { Database } from "@/lib/database.types";
import { SOCIAL_POST_MEDIA_BUCKET } from "./pieces";
import {
  GEAR_SPOTLIGHT,
  normalizeTemplateText,
  parseTemplateText,
  type TemplateText,
} from "./post-templates";
import {
  copyGearPhotoToPost,
  gearPostDetails,
  loadGearItems,
  tenantSiteOrigin,
  type GearItemOption,
} from "./series-gear-fill";
import {
  MAX_RECENT_EXCLUSION,
  gearCaptionEdited,
  gearItemLink,
  hasGearDetails,
  isSeriesContentSource,
  renderGearCaption,
  type GearPostDetails,
} from "./series-gear";

export type { GearItemOption } from "./series-gear-fill";

/**
 * A series that features a random Gear Library item (#1841): turning it on,
 * and swapping the item a post features until it is published.
 */

type Client = SupabaseClient<Database>;

async function authorize(
  message: string,
  level: "view" | "manage" = "manage",
): Promise<{ error: string } | { supabase: Client }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    level,
  );
  if (permissionError) return permissionError;
  return { supabase };
}

function revalidateSocial() {
  revalidatePath("/portal/social", "layout");
  revalidatePath("/portal/calendar");
}

/** The items a post can feature, and the one it features now. */
export async function listPostGearItemsAction(
  postId: string,
): Promise<{ items: GearItemOption[] } | { error: string }> {
  const auth = await authorize(
    "You must be signed in to see Gear Library items.",
    "view",
  );
  if ("error" in auth) return auth;
  const items = await loadGearItems(auth.supabase, String(postId));
  return items
    ? { items }
    : { error: "Could not load the Gear Library. Please try again." };
}

/** What each new post in a series features, and how far back repeats count. */
export async function updateSeriesContentSourceAction(
  seriesId: string,
  contentSource: string,
  recentExclusionCount: number,
): Promise<{ error: string } | { success: true }> {
  const auth = await authorize("You must be signed in to change a series.");
  if ("error" in auth) return auth;

  if (!isSeriesContentSource(contentSource)) {
    return { error: "Choose what each post features." };
  }
  const count = Number(recentExclusionCount);
  if (!Number.isInteger(count) || count < 0 || count > MAX_RECENT_EXCLUSION) {
    return {
      error: `Enter a number of posts from 0 to ${MAX_RECENT_EXCLUSION}.`,
    };
  }

  const { data, error } = await auth.supabase
    .from("social_post_series")
    .update({ content_source: contentSource, recent_exclusion_count: count })
    .eq("id", seriesId)
    .is("ended_at", null)
    .select("id");
  if (error) return { error: "Could not change the series. Please try again." };
  if (!data || data.length === 0) {
    return { error: "This series has ended and can't be changed." };
  }
  revalidateSocial();
  return { success: true };
}

export type SwapGearResult =
  { error: string } | { success: true; photoCopied: boolean };

const SWAP_ERRORS: Record<string, string> = {
  POST_PUBLISHED: "This post is published, so its item can't be changed.",
  NOT_GEAR_POST: "This post's series doesn't feature Gear Library items.",
  NO_GEAR_AVAILABLE: "No other available gear with a photo to pick.",
  ITEM_NOT_ELIGIBLE:
    "That item is no longer available with a photo. Choose another.",
  POST_NOT_FOUND: "Could not find the social post.",
};

/**
 * Swaps the item a post features: `itemId`, or a new random pick when null.
 * The caption and photo the post was filled in with are replaced; a caption
 * someone edited is only replaced once `replaceEditedCaption` says so. The
 * post keeps its status.
 */
export async function swapFeaturedGearAction(
  postId: string,
  itemId: string | null,
  replaceEditedCaption: boolean,
): Promise<SwapGearResult> {
  const auth = await authorize("You must be signed in to change a post.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { data: post, error: postError } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, content, content_status, featured_inventory_item_id, featured_media_id, gear_brand, gear_best_for, gear_why, template_text, series:social_post_series!content_opportunities_series_id_fkey(content)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (postError || !post) return { error: SWAP_ERRORS.POST_NOT_FOUND };
  if (post.content_status === "published") {
    return { error: SWAP_ERRORS.POST_PUBLISHED };
  }
  const details = gearPostDetails(post);

  const template = post.series?.content ?? null;
  const origin = await tenantSiteOrigin(supabase, post.tenant_id);

  // A swap clears the post's gear details (#1906), so typed ones are asked
  // about like an edited caption.
  if (!replaceEditedCaption && hasGearDetails(details)) {
    return {
      error:
        "This post's brand, best for or why-we-love-it was filled in since the page loaded. Reload to replace it.",
    };
  }
  if (!replaceEditedCaption) {
    const items = await loadGearItems(supabase, post.id);
    const current = items?.find((item) => item.featured) ?? null;
    if (
      gearCaptionEdited(
        post.content,
        template,
        current,
        current ? gearItemLink(origin, current.id) : null,
        details,
      )
    ) {
      return {
        error:
          "This post's caption was edited since the page loaded. Reload to replace it.",
      };
    }
  }

  const { data: pickedId, error: pickError } = await supabase.rpc(
    "set_social_post_featured_gear",
    { p_post_id: post.id, p_item_id: itemId ?? undefined },
  );
  if (pickError || !pickedId) {
    const known = Object.keys(SWAP_ERRORS).find((code) =>
      pickError?.message.includes(code),
    );
    if (!known) console.error("Could not swap the featured gear", pickError);
    return {
      error: known
        ? SWAP_ERRORS[known]
        : "Could not change the item. Please try again.",
    };
  }

  const items = await loadGearItems(supabase, post.id);
  const picked = items?.find((item) => item.id === pickedId);
  if (!picked) return { error: "Could not change the item. Please try again." };

  const { error: captionError } = await supabase
    .from("content_opportunities")
    .update({
      content: renderGearCaption(
        template,
        picked,
        gearItemLink(origin, picked.id),
      ),
    })
    .eq("id", post.id);
  if (captionError) {
    console.error("Could not write the gear caption", captionError);
  }

  const photoCopied = await replaceFeaturedPhoto(
    supabase,
    post.tenant_id,
    post.id,
    post.featured_media_id,
    picked,
  );

  revalidateSocial();
  return { success: true, photoCopied };
}

export type GearDetailsInput = {
  brand: string;
  best_for: string;
  why: string;
};

/**
 * Saves a gear post's brand, best for and why-we-love-it (#1906). A caption
 * nobody edited is filled in again, so its {brand}, {best_for} and {why}
 * placeholders show the new values; an edited one is left alone.
 */
export async function updateGearDetailsAction(
  postId: string,
  input: GearDetailsInput,
): Promise<{ error: string } | { success: true; captionUpdated: boolean }> {
  const auth = await authorize("You must be signed in to change a post.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const normalized = normalizeTemplateText(GEAR_SPOTLIGHT, null, {
    ...input,
  });
  if ("error" in normalized) return normalized;
  const next: GearPostDetails = {
    brand: normalized.text.brand ?? null,
    best_for: normalized.text.best_for ?? null,
    why: normalized.text.why ?? null,
  };

  const { data: post, error: postError } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, content, content_status, featured_inventory_item_id, gear_brand, gear_best_for, gear_why, template_text, series:social_post_series!content_opportunities_series_id_fkey(content, content_source)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (postError || !post) return { error: SWAP_ERRORS.POST_NOT_FOUND };
  if (post.series?.content_source !== "random_gear_item") {
    return { error: SWAP_ERRORS.NOT_GEAR_POST };
  }
  if (post.content_status === "published") {
    return { error: "This post is published, so it can't be changed." };
  }

  // template_text is what the story reads (#1924); the gear columns stay in
  // step until main reads it.
  const update: {
    template_key: string;
    template_text: TemplateText;
    gear_brand: string | null;
    gear_best_for: string | null;
    gear_why: string | null;
    content?: string;
  } = {
    template_key: GEAR_SPOTLIGHT.key,
    template_text: {
      ...parseTemplateText(post.template_text),
      ...normalized.text,
    },
    gear_brand: next.brand,
    gear_best_for: next.best_for,
    gear_why: next.why,
  };
  for (const { key } of GEAR_SPOTLIGHT.fields) {
    if (!(key in normalized.text)) delete update.template_text[key];
  }

  const template = post.series.content ?? null;
  const items = post.featured_inventory_item_id
    ? await loadGearItems(supabase, post.id)
    : null;
  const item = items?.find((option) => option.featured) ?? null;
  if (item) {
    const link = gearItemLink(
      await tenantSiteOrigin(supabase, post.tenant_id),
      item.id,
    );
    if (
      !gearCaptionEdited(
        post.content,
        template,
        item,
        link,
        gearPostDetails(post),
      )
    ) {
      update.content = renderGearCaption(template, item, link, next);
    }
  }

  const { error } = await supabase
    .from("content_opportunities")
    .update(update)
    .eq("id", post.id)
    .neq("content_status", "published");
  if (error) return { error: "Could not save the details. Please try again." };

  revalidateSocial();
  return {
    success: true,
    captionUpdated:
      update.content !== undefined &&
      update.content !== (post.content ?? "").trim(),
  };
}

/** Removes the previous item's photo and adds the new one's. */
async function replaceFeaturedPhoto(
  supabase: Client,
  tenantId: string,
  postId: string,
  previousMediaId: string | null,
  item: GearItemOption,
): Promise<boolean> {
  if (previousMediaId) {
    const { data: removed } = await supabase
      .from("social_post_media")
      .delete()
      .eq("id", previousMediaId)
      .select("storage_path");
    const paths = (removed ?? []).flatMap((row) =>
      row.storage_path ? [row.storage_path] : [],
    );
    if (paths.length > 0) {
      const { error } = await supabase.storage
        .from(SOCIAL_POST_MEDIA_BUCKET)
        .remove(paths);
      if (error) console.error("Could not remove the old gear photo", error);
    }
  }

  const photo = await copyGearPhotoToPost(supabase, tenantId, postId, item);
  if (!photo) return false;
  const { data: media, error } = await supabase.rpc(
    "record_social_post_media",
    { p_path: photo.path, p_original_filename: photo.filename },
  );
  if (error || !media) {
    console.error("Could not record the gear photo", error);
    await supabase.storage.from(SOCIAL_POST_MEDIA_BUCKET).remove([photo.path]);
    return false;
  }
  const { error: linkError } = await supabase
    .from("content_opportunities")
    .update({ featured_media_id: media.id })
    .eq("id", postId);
  if (linkError) console.error("Could not link the gear photo", linkError);
  return true;
}
