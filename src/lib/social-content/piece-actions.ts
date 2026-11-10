"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentPieceForm, type ContentPieceFormData } from "./piece-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

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
 * Every page a piece shows on: the calendar, its own route, and the event it
 * is related to. The calendar item's detail page reads under `/portal/calendar`
 * and refreshes with `router.refresh()` like it always has.
 */
function revalidatePiecePaths(eventIds: (string | null | undefined)[]) {
  revalidatePath("/portal/calendar");
  revalidatePath("/portal/social");
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

  const { error } = await supabase.from("content_opportunities").insert({
    ...pieceColumns(data),
    status_changed_by: user.id,
    status_changed_at: new Date().toISOString(),
  });

  if (error) {
    return { error: "Could not add the social post. Please try again." };
  }

  revalidatePiecePaths([data.eventId]);
  return { success: true };
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

  // The event it was related to loses it as well as the one it moves to.
  revalidatePiecePaths([current.event_id, data.eventId]);
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

  const [{ data: events }, { data: calendarItems }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, starts_at")
      .order("starts_at", { ascending: false }),
    supabase
      .from("calendar_items")
      .select("id, title, starts_at")
      .order("starts_at", { ascending: false }),
  ]);

  return {
    events: (events ?? []).map((event) => ({
      id: event.id,
      label: event.name,
      starts_at: event.starts_at,
    })),
    calendarItems: (calendarItems ?? []).map((item) => ({
      id: item.id,
      label: item.title,
      starts_at: item.starts_at,
    })),
  };
}
