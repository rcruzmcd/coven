"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseCalendarItemForm } from "./calendar-item-form";
import { listCalendarCategories } from "./queries";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type { CalendarOwner } from "./calendar-shared";

/**
 * The tenant's category keys, for the form parsers. Read on every submit rather
 * than cached: the vocabulary is editable (#834), and validating against a
 * stale list would reject a category someone had just added.
 */
async function validCategoryKeys(supabase: SupabaseClient): Promise<string[]> {
  return (await listCalendarCategories(supabase)).map((c) => c.value);
}

export type CalendarActionResult =
  { error: string } | { success: true; warning?: string };

export async function syncCalendarItemLinks(
  supabase: SupabaseClient,
  itemId: string,
  categories: string[],
  programIds: string[],
): Promise<{ error: string } | null> {
  const { error: deleteCategoriesError } = await supabase
    .from("calendar_item_categories")
    .delete()
    .eq("item_id", itemId);
  if (deleteCategoriesError) {
    return { error: "Could not save categories. Please try again." };
  }
  if (categories.length > 0) {
    const { error } = await supabase
      .from("calendar_item_categories")
      .insert(categories.map((category) => ({ item_id: itemId, category })));
    if (error) return { error: "Could not save categories. Please try again." };
  }

  const { error: deleteProgramsError } = await supabase
    .from("calendar_item_programs")
    .delete()
    .eq("item_id", itemId);
  if (deleteProgramsError) {
    return { error: "Could not save related programs. Please try again." };
  }
  if (programIds.length > 0) {
    const { error } = await supabase.from("calendar_item_programs").insert(
      programIds.map((programId) => ({
        item_id: itemId,
        program_id: programId,
      })),
    );
    if (error)
      return { error: "Could not save related programs. Please try again." };
  }

  return null;
}

async function findRecurrenceOverlapWarning(
  supabase: SupabaseClient,
  item: {
    startsAt: string;
    endsAt: string | null;
    recurrenceRule: string | null;
  },
  excludeId?: string,
): Promise<string | undefined> {
  if (!item.recurrenceRule) return undefined;

  const windowEnd = item.endsAt ?? item.startsAt;
  let query = supabase
    .from("calendar_items")
    .select("id, title, starts_at, ends_at")
    .neq("calendar_status", "archived")
    .not("recurrence_rule", "is", null)
    .lte("starts_at", windowEnd);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  const overlap = (data ?? []).find(
    (row) => (row.ends_at ?? row.starts_at) >= item.startsAt,
  );
  if (!overlap) return undefined;

  return `This recurring item overlaps with "${overlap.title}" (starts ${new Date(overlap.starts_at).toLocaleDateString()}).`;
}

function findMissingToneGuidanceWarning(item: {
  isSensitiveTopic: boolean;
  toneGuidance: string | null;
}): string | undefined {
  if (item.isSensitiveTopic && !item.toneGuidance) {
    return "This item is flagged as a sensitive topic but has no tone guidance yet — add guidance so it's surfaced on its social posts.";
  }
  return undefined;
}

function combineWarnings(
  ...warnings: (string | undefined)[]
): string | undefined {
  const present = warnings.filter((warning): warning is string =>
    Boolean(warning),
  );
  return present.length > 0 ? present.join(" ") : undefined;
}

export async function createCalendarItemAction(
  formData: FormData,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create a calendar item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseCalendarItemForm(
    formData,
    await validCategoryKeys(supabase),
  );
  if ("error" in parsed) return parsed;
  const {
    title,
    itemType,
    startsAt,
    endsAt,
    timeZone,
    recurrenceRule,
    summary,
    priorityTier,
    priorityRationale,
    calendarStatus,
    visibility,
    ownerId,
    categories,
    programIds,
    decision,
    decisionNote,
    isSensitiveTopic,
    toneGuidance,
  } = parsed.data;

  const { data: inserted, error } = await supabase
    .from("calendar_items")
    .insert({
      title,
      item_type: itemType,
      starts_at: startsAt,
      ends_at: endsAt,
      time_zone: timeZone,
      recurrence_rule: recurrenceRule,
      summary,
      priority_tier: priorityTier,
      priority_rationale: priorityRationale,
      calendar_status: calendarStatus,
      visibility,
      owner_id: ownerId,
      decision,
      decision_note: decisionNote,
      is_sensitive_topic: isSensitiveTopic,
      tone_guidance: toneGuidance,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: "Could not create the calendar item. Please try again." };
  }

  const linkError = await syncCalendarItemLinks(
    supabase,
    inserted.id,
    categories,
    programIds,
  );
  if (linkError) return linkError;

  const warning = combineWarnings(
    await findRecurrenceOverlapWarning(
      supabase,
      { startsAt, endsAt, recurrenceRule },
      inserted.id,
    ),
    findMissingToneGuidanceWarning({ isSensitiveTopic, toneGuidance }),
  );

  revalidatePath("/portal/calendar");
  return warning ? { success: true, warning } : { success: true };
}

export async function updateCalendarItemAction(
  id: string,
  formData: FormData,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a calendar item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseCalendarItemForm(
    formData,
    await validCategoryKeys(supabase),
  );
  if ("error" in parsed) return parsed;
  const {
    title,
    itemType,
    startsAt,
    endsAt,
    timeZone,
    recurrenceRule,
    summary,
    priorityTier,
    priorityRationale,
    calendarStatus,
    visibility,
    ownerId,
    categories,
    programIds,
    decision,
    decisionNote,
    isSensitiveTopic,
    toneGuidance,
  } = parsed.data;

  const { error } = await supabase
    .from("calendar_items")
    .update({
      title,
      item_type: itemType,
      starts_at: startsAt,
      ends_at: endsAt,
      time_zone: timeZone,
      recurrence_rule: recurrenceRule,
      summary,
      priority_tier: priorityTier,
      priority_rationale: priorityRationale,
      calendar_status: calendarStatus,
      visibility,
      owner_id: ownerId,
      decision,
      decision_note: decisionNote,
      is_sensitive_topic: isSensitiveTopic,
      tone_guidance: toneGuidance,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the calendar item. Please try again." };
  }

  const linkError = await syncCalendarItemLinks(
    supabase,
    id,
    categories,
    programIds,
  );
  if (linkError) return linkError;

  const warning = combineWarnings(
    await findRecurrenceOverlapWarning(
      supabase,
      { startsAt, endsAt, recurrenceRule },
      id,
    ),
    findMissingToneGuidanceWarning({ isSensitiveTopic, toneGuidance }),
  );

  revalidatePath("/portal/calendar");
  return warning ? { success: true, warning } : { success: true };
}

export async function updateCalendarItemsVisibilityAction(
  ids: string[],
  visibility: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update calendar item visibility.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  if (ids.length === 0) {
    return { error: "Select at least one calendar item to update." };
  }

  const { error } = await supabase
    .from("calendar_items")
    .update({ visibility })
    .in("id", ids);

  if (error) {
    return {
      error:
        "Could not update visibility for the selected items. Please try again.",
    };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function updateCalendarItemsStatusAction(
  ids: string[],
  calendarStatus: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update calendar item status.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  if (ids.length === 0) {
    return { error: "Select at least one calendar item to update." };
  }

  const { error } = await supabase
    .from("calendar_items")
    .update({ calendar_status: calendarStatus })
    .in("id", ids);

  if (error) {
    return {
      error:
        "Could not update status for the selected items. Please try again.",
    };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function updateCalendarItemsDecisionAction(
  ids: string[],
  decision: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update calendar item decisions.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  if (ids.length === 0) {
    return { error: "Select at least one calendar item to update." };
  }

  const { error } = await supabase
    .from("calendar_items")
    .update({ decision })
    .in("id", ids);

  if (error) {
    return {
      error:
        "Could not update the decision for the selected items. Please try again.",
    };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function deleteCalendarItemAction(
  id: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete a calendar item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.from("calendar_items").delete().eq("id", id);

  if (error) {
    return { error: "Could not delete the calendar item. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function duplicateCalendarItemAction(
  id: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to duplicate a calendar item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: original, error: fetchError } = await supabase
    .from("calendar_items")
    .select(
      "title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, visibility, owner_id, calendar_item_categories(category), calendar_item_programs(program_id)",
    )
    .eq("id", id)
    .single();

  if (fetchError || !original) {
    return { error: "Could not find the calendar item to duplicate." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("calendar_items")
    .insert({
      title: `${original.title} (copy)`,
      item_type: original.item_type,
      starts_at: original.starts_at,
      ends_at: original.ends_at,
      time_zone: original.time_zone,
      recurrence_rule: original.recurrence_rule,
      summary: original.summary,
      priority_tier: original.priority_tier,
      priority_rationale: original.priority_rationale,
      calendar_status: "idea",
      visibility: original.visibility,
      owner_id: original.owner_id,
      decision: null,
      decision_note: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      error: "Could not duplicate the calendar item. Please try again.",
    };
  }

  const categories = (original.calendar_item_categories ?? []).map(
    (row: { category: string }) => row.category,
  );
  const programIds = (original.calendar_item_programs ?? []).map(
    (row: { program_id: string }) => row.program_id,
  );
  const linkError = await syncCalendarItemLinks(
    supabase,
    inserted.id,
    categories,
    programIds,
  );
  if (linkError) return linkError;

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function archiveCalendarItemAction(
  id: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("calendar_items")
    .update({ calendar_status: "archived" })
    .eq("id", id);

  if (error) {
    return { error: "Could not archive the calendar item. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function restoreCalendarItemAction(
  id: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("calendar_items")
    .update({ calendar_status: "active" })
    .eq("id", id);

  if (error) {
    return { error: "Could not restore the calendar item. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function listCalendarOwnersAction(): Promise<
  { data: CalendarOwner[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("list_calendar_owners");

  if (error) {
    return { error: "Could not load calendar owners. Please try again." };
  }
  return { data: (data ?? []) as CalendarOwner[] };
}
