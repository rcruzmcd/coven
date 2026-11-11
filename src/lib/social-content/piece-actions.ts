"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentPieceForm, type ContentPieceFormData } from "./piece-form";
import { CONTENT_STATUSES, SOCIAL_POST_MEDIA_BUCKET } from "./pieces";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { planEventPosts, planTitleKey } from "./event-plan";
import { getDefaultLeadTimeDays, getEventPlanTemplate } from "./queries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ContentPieceActionResult =
  { error: string } | { success: true; warning?: string };

/** An event or community date a social post can be related to (#1793). */
export type SocialContentLinkOption = {
  id: string;
  label: string;
  starts_at: string;
};

export type SocialContentLinkOptions = {
  events: SocialContentLinkOption[];
  calendarItems: SocialContentLinkOption[];
};

/**
 * Every page a piece shows on: the calendar, `/portal/social` and each post's
 * own page under it (hence `layout`), and the event it is related to. The
 * calendar item's detail page reads under `/portal/calendar` and refreshes
 * with `router.refresh()` like it always has.
 */
function revalidatePiecePaths(eventIds: (string | null | undefined)[]) {
  revalidatePath("/portal/calendar");
  revalidatePath("/portal/social", "layout");
  for (const eventId of new Set(eventIds)) {
    if (eventId) revalidatePath(`/portal/events/${eventId}`);
  }
}

function pieceColumns(data: ContentPieceFormData) {
  return {
    calendar_item_id: data.calendarItemId,
    event_id: data.eventId,
    title: data.title,
    content: data.content,
    post_format: data.postFormat,
    collaborator_handles: data.collaboratorHandles,
    content_status: data.contentStatus,
    skip_reason: data.skipReason,
    internal_notes: data.internalNotes,
    owner_id: data.ownerId,
    reviewer_id: data.reviewerId,
    lead_time_days: data.leadTimeDays,
    publish_due_at: data.publishDueAt,
    review_due_at: data.reviewDueAt,
    draft_due_at: data.draftDueAt,
  };
}

/**
 * Replaces a post's tags (#1826), after its row is saved. A failure here is a
 * warning rather than an error: the post itself saved.
 */
async function saveTags(
  supabase: SupabaseClient<Database>,
  postId: string,
  data: ContentPieceFormData,
): Promise<string | undefined> {
  const { error } = await supabase.rpc("set_social_post_tags", {
    p_post_id: postId,
    p_tags: data.tags.map((tag) =>
      "personId" in tag ? { person_id: tag.personId } : { handle: tag.handle },
    ),
  });
  if (error) {
    console.error("Could not save the social post's tags", error);
    return "The post saved, but its tags didn't. Open it and save again.";
  }
  return undefined;
}

/**
 * Adds one social post. What it is related to -- a community date, an event,
 * both or neither -- comes from the form's `calendarItemId` and `eventId`,
 * which a caller opening the form from an item or event fills in.
 */
export async function createContentPieceAction(
  formData: FormData,
): Promise<ContentPieceActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a social post.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentPieceForm(formData);
  if ("error" in parsed) return parsed;
  const { data } = parsed;

  const { data: created, error } = await supabase
    .from("content_opportunities")
    .insert({
      ...pieceColumns(data),
      status_changed_by: user.id,
      status_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not add the social post. Please try again." };
  }

  const warning =
    data.tags.length > 0
      ? await saveTags(supabase, created.id, data)
      : undefined;

  revalidatePiecePaths([data.eventId]);
  return warning ? { success: true, warning } : { success: true };
}

export async function updateContentPieceAction(
  id: string,
  formData: FormData,
): Promise<ContentPieceActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a social post.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentPieceForm(formData);
  if ("error" in parsed) return parsed;
  const { data } = parsed;

  const { data: current, error: fetchError } = await supabase
    .from("content_opportunities")
    .select("content_status, event_id")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { error: "Could not find the social post to update." };
  }

  const statusChanged = current.content_status !== data.contentStatus;

  const { error } = await supabase
    .from("content_opportunities")
    .update({
      ...pieceColumns(data),
      ...(statusChanged
        ? {
            status_changed_by: user.id,
            status_changed_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the social post. Please try again." };
  }

  const warning = await saveTags(supabase, id, data);

  // The event it was related to loses it as well as the one it moves to.
  revalidatePiecePaths([current.event_id, data.eventId]);
  return warning ? { success: true, warning } : { success: true };
}

/**
 * Moves a post to another status without touching anything else, for the
 * status control on `/portal/social/[pieceId]` (#1794). Skipping still needs a
 * reason, the same rule the full form applies.
 */
export async function updateContentPieceStatusAction(
  id: string,
  contentStatus: string,
  skipReason: string | null = null,
): Promise<ContentPieceActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a social post.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!CONTENT_STATUSES.some((option) => option.value === contentStatus)) {
    return { error: "Select a valid content status." };
  }
  const reason = skipReason?.trim() || null;
  if (contentStatus === "skipped" && !reason) {
    return { error: "A reason is required when content is skipped." };
  }

  const { data: updated, error } = await supabase
    .from("content_opportunities")
    .update({
      content_status: contentStatus,
      skip_reason: contentStatus === "skipped" ? reason : null,
      status_changed_by: user.id,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("event_id");

  if (error) {
    return { error: "Could not update the social post. Please try again." };
  }
  if (!updated || updated.length === 0) {
    return { error: "Could not find the social post to update." };
  }

  revalidatePiecePaths(updated.map((row) => row.event_id));
  return { success: true };
}

export async function deleteContentPieceAction(
  id: string,
): Promise<ContentPieceActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete a social post.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  // The media rows cascade with the post; their objects would not, so they
  // go first. An object that fails to go is orphaned, not shown.
  const { data: media } = await supabase
    .from("social_post_media")
    .select("storage_path")
    .eq("content_opportunity_id", id);
  if (media && media.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(SOCIAL_POST_MEDIA_BUCKET)
      .remove(media.map((row) => row.storage_path));
    if (storageError) {
      console.error("Could not remove the social post's media", storageError);
    }
  }

  const { data: deleted, error } = await supabase
    .from("content_opportunities")
    .delete()
    .eq("id", id)
    .select("event_id");

  if (error) {
    return { error: "Could not delete the social post. Please try again." };
  }

  revalidatePiecePaths((deleted ?? []).map((row) => row.event_id));
  return { success: true };
}

/**
 * Creates the chosen posts of an event's starter plan (#1798). The plan is
 * worked out again here from the event, the tenant's template, time zone and
 * lead time, rather than taken from the preview, and a title the event already
 * has a post with is skipped -- so running it twice creates each post once.
 * `titles` is what the preview left ticked.
 */
export async function generateEventPlanAction(
  eventId: string,
  titles: string[],
): Promise<{ error: string } | { success: true; created: number }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add social posts.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: event } = await supabase
    .from("events")
    .select("id, starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "Could not find the event." };
  if (!event.starts_at) {
    return { error: "Set the event's start date before generating a plan." };
  }

  const [template, timeZone, leadTimeDays] = await Promise.all([
    getEventPlanTemplate(supabase),
    getOrgTimeZone(supabase),
    getDefaultLeadTimeDays(supabase),
  ]);

  // Titles the event already has are skipped in SQL, atomically with the
  // insert (`insert_event_plan_posts`), so neither a concurrent run nor a
  // row cap on a read here can let a duplicate through.
  const chosen = new Set(titles.map(planTitleKey));
  const posts = planEventPosts({
    template,
    startsAt: event.starts_at,
    timeZone,
    leadTimeDays,
    existingTitles: [],
  })
    .filter((post) => chosen.has(planTitleKey(post.title)))
    .map((post) => ({
      title: post.title,
      lead_time_days: leadTimeDays,
      publish_due_at: post.publishDueAt,
      review_due_at: post.reviewDueAt,
      draft_due_at: post.draftDueAt,
    }));

  let created = 0;
  if (posts.length > 0) {
    const { data, error } = await supabase.rpc("insert_event_plan_posts", {
      p_event_id: eventId,
      p_posts: posts,
    });
    if (error) {
      return { error: "Could not add the social posts. Please try again." };
    }
    created = data ?? 0;
  }

  revalidatePiecePaths([eventId]);
  return { success: true, created };
}

/** What a reason "Skip all" on a cancelled event's posts records (#1799). */
const EVENT_CANCELLED_SKIP_REASON = "Event cancelled";

/**
 * Moves an event's open posts by one saved change of its start, from
 * `fromStartsAt` to `toStartsAt` (#1799): the publish, review and draft dates
 * of every dated post not yet published or skipped, in one statement
 * (`shift_event_social_posts`). The database records each saved change and
 * lets it be applied once, so two people accepting the same reschedule move
 * the posts once.
 */
export async function shiftEventPostsAction(
  eventId: string,
  fromStartsAt: string,
  toStartsAt: string,
): Promise<{ error: string } | { success: true; moved: number }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to move social posts.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  if (Date.parse(fromStartsAt) === Date.parse(toStartsAt)) {
    return { success: true, moved: 0 };
  }

  const { data, error } = await supabase.rpc("shift_event_social_posts", {
    p_event_id: eventId,
    p_from_starts_at: fromStartsAt,
    p_to_starts_at: toStartsAt,
  });
  if (error) {
    if (error.message.includes("EVENT_START_CHANGE_USED")) {
      return {
        error: "These social posts were already moved for this date change.",
      };
    }
    return { error: "Could not move the social posts. Please try again." };
  }

  revalidatePiecePaths([eventId]);
  return { success: true, moved: data ?? 0 };
}

/**
 * Skips every post of a cancelled event still open (#1799), recording why.
 * Published posts, and posts already skipped, keep what they have.
 */
export async function skipEventPostsAction(
  eventId: string,
): Promise<{ error: string } | { success: true; skipped: number }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update social posts.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: event } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "Could not find the event." };
  if (event.status !== "cancelled") {
    return { error: "Only a cancelled event's posts can be skipped together." };
  }

  const { data, error } = await supabase
    .from("content_opportunities")
    .update({
      content_status: "skipped",
      skip_reason: EVENT_CANCELLED_SKIP_REASON,
      status_changed_by: user.id,
      status_changed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .not("content_status", "in", "(published,skipped)")
    .select("id");
  if (error) {
    return { error: "Could not skip the social posts. Please try again." };
  }

  revalidatePiecePaths([eventId]);
  return { success: true, skipped: data?.length ?? 0 };
}

/**
 * The events and community dates the Related to picker offers, newest first.
 *
 * Gated on `content_calendar` view like the pieces themselves. The events are
 * whatever the events select policy returns for this reader, so a content
 * manager with no events access simply gets none, and the picker offers
 * community dates alone.
 */
export async function listSocialContentLinkOptionsAction(): Promise<SocialContentLinkOptions> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return { events: [], calendarItems: [] };

  const [events, calendarItems] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("events")
        .select("id, name, starts_at")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("calendar_items")
        .select("id, title, starts_at")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  return {
    events: events.map((event) => ({
      id: event.id,
      label: event.name,
      starts_at: event.starts_at,
    })),
    calendarItems: calendarItems.map((item) => ({
      id: item.id,
      label: item.title,
      starts_at: item.starts_at,
    })),
  };
}
