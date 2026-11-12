"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { getOrgTimeZone } from "@/lib/org-timezone";
import type { Database } from "@/lib/database.types";
import { isSeriesCadence } from "./series";
import { gearTemplateFromPost } from "./series-gear-fill";

/**
 * Recurring social posts (#1839): make a series from a post, change how
 * often it repeats, and its workflow settings. The posts themselves are
 * created by the scheduled generator (#1840).
 */
export type SeriesActionResult = { error: string } | { success: true };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function authorize(
  message: string,
): Promise<{ error: string } | { supabase: SupabaseClient<Database> }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase };
}

function parseEndsOn(raw: string | null): string | null | { error: string } {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  return DAY_PATTERN.test(value) ? value : { error: "Enter a valid end date." };
}

function revalidateSocial() {
  revalidatePath("/portal/social", "layout");
  revalidatePath("/portal/calendar");
}

const CREATE_ERRORS: Record<string, string> = {
  NO_PUBLISH_DATE: "Set a publish date before making this post repeat.",
  ALREADY_IN_SERIES: "This post already repeats.",
  POST_NOT_FOUND: "Could not find the social post.",
};

/** Makes a post the first of a new series, repeating from its publish date. */
export async function createSeriesFromPostAction(
  postId: string,
  cadence: string,
  endsOn: string | null,
): Promise<SeriesActionResult> {
  const auth = await authorize("You must be signed in to make a post repeat.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  if (!isSeriesCadence(cadence))
    return { error: "Choose how often it repeats." };
  const ends = parseEndsOn(endsOn);
  if (ends && typeof ends === "object") return ends;

  const timeZone = await getOrgTimeZone(supabase);
  const { error } = await supabase.rpc("create_social_post_series", {
    p_post_id: postId,
    p_cadence: cadence,
    p_time_zone: timeZone,
    p_ends_on: ends ?? undefined,
  });
  if (error) {
    const known = Object.keys(CREATE_ERRORS).find((code) =>
      error.message.includes(code),
    );
    if (known) return { error: CREATE_ERRORS[known] };
    if (error.code === "23514") {
      return { error: "The end date can't be before the first post." };
    }
    return { error: "Could not make the post repeat. Please try again." };
  }

  revalidateSocial();
  return { success: true };
}

/** Changes how often a series repeats and when it stops. */
export async function updateSeriesScheduleAction(
  seriesId: string,
  cadence: string,
  endsOn: string | null,
): Promise<SeriesActionResult> {
  const auth = await authorize("You must be signed in to change a series.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  if (!isSeriesCadence(cadence))
    return { error: "Choose how often it repeats." };
  const ends = parseEndsOn(endsOn);
  if (ends && typeof ends === "object") return ends;

  const { data, error } = await supabase
    .from("social_post_series")
    .update({ cadence, ends_on: ends })
    .eq("id", seriesId)
    .select("id");
  if (error) {
    return error.code === "23514"
      ? { error: "The end date can't be before the first post." }
      : { error: "Could not change the series. Please try again." };
  }
  if (!data || data.length === 0)
    return { error: "Could not find the series." };

  revalidateSocial();
  return { success: true };
}

export type SeriesStateChange = "pause" | "resume" | "end";

/**
 * Pauses, resumes or ends a series. Ending is final: an ended series
 * cannot be resumed, so it is refused here as well as hidden in the UI.
 */
export async function setSeriesStateAction(
  seriesId: string,
  change: SeriesStateChange,
): Promise<SeriesActionResult> {
  const auth = await authorize("You must be signed in to change a series.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const now = new Date().toISOString();
  const update =
    change === "pause"
      ? { paused_at: now }
      : change === "resume"
        ? { paused_at: null }
        : change === "end"
          ? { ended_at: now }
          : null;
  if (!update) return { error: "Choose a valid change." };

  const { data, error } = await supabase
    .from("social_post_series")
    .update(update)
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

/** Whether new posts in the series skip review. */
export async function setSeriesAutoApproveAction(
  seriesId: string,
  autoApprove: boolean,
): Promise<SeriesActionResult> {
  const auth = await authorize("You must be signed in to change a series.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("social_post_series")
    .update({ auto_approve: autoApprove })
    .eq("id", seriesId)
    .select("id");
  if (error) return { error: "Could not change the series. Please try again." };
  if (!data || data.length === 0)
    return { error: "Could not find the series." };

  revalidateSocial();
  return { success: true };
}

/**
 * Copies a post's current content into its series, so the posts the series
 * creates from now on start from it. Posts already created keep their own.
 */
export async function updateSeriesTemplateFromPostAction(
  postId: string,
): Promise<SeriesActionResult> {
  const auth = await authorize("You must be signed in to change a series.");
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc("update_social_post_series_template", {
    p_post_id: postId,
  });
  if (error) {
    return error.message.includes("NOT_IN_SERIES")
      ? { error: "This post doesn't repeat." }
      : { error: "Could not update the series. Please try again." };
  }

  // A gear post's caption names its own item (#1841); the series keeps the
  // caption without it, so later posts don't carry this one's item too.
  const gearTemplate = await gearTemplateFromPost(supabase, postId);
  if (gearTemplate !== null) {
    const { data: post } = await supabase
      .from("content_opportunities")
      .select("series_id")
      .eq("id", postId)
      .single();
    if (post?.series_id) {
      await supabase
        .from("social_post_series")
        .update({ content: gearTemplate || null })
        .eq("id", post.series_id);
    }
  }

  revalidateSocial();
  return { success: true };
}
