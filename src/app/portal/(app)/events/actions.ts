"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseEventAttendanceForm,
  parseEventForm,
  parseEventPlanningForm,
  parseEventRegistrationOptionsField,
  parseEventReportForm,
  parseReopenReason,
  REGISTRATION_OPTIONS_SAVE_ERRORS,
} from "./event-form";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkEventAccess } from "@/lib/auth/event-access";
import { checkUser } from "@/lib/auth/current-user";
import { REGISTRATION_QUESTION_ERROR_MESSAGES } from "@/lib/registration-questions";
import {
  parseRegistrationQuestionsField,
  REGISTRATION_QUESTIONS_FIELD,
  toEventRegistrationQuestion,
  type EventRegistrationQuestion,
} from "./registration-questions-draft";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateEventResult = { error: string } | { success: true };

/**
 * Replaces an event's program links with `programIds`. Delete-then-reinsert
 * rather than a diff: the set is a handful of rows, and this keeps unchecking
 * the last program working without a special case. Mirrors
 * `syncCalendarItemLinks` in the calendar module, which handles the same
 * relationship against the same `programs` table.
 */
async function syncEventPrograms(
  supabase: SupabaseClient,
  eventId: string,
  programIds: string[],
): Promise<{ error: string } | null> {
  const { error: deleteError } = await supabase
    .from("event_programs")
    .delete()
    .eq("event_id", eventId);
  if (deleteError) {
    return { error: "Could not save programs. Please try again." };
  }

  if (programIds.length === 0) return null;

  const { error } = await supabase.from("event_programs").insert(
    programIds.map((programId) => ({
      event_id: eventId,
      program_id: programId,
    })),
  );
  if (error) return { error: "Could not save programs. Please try again." };

  return null;
}

export async function createEventAction(
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const {
    name,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    visibility,
    status,
    programIds,
    flierUrl,
  } = parsed.data;

  const { data: created, error } = await supabase
    .from("events")
    .insert({
      name,
      description,
      location,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      visibility,
      status,
      flier_url: flierUrl,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not create the event. Please try again." };
  }

  const programsError = await syncEventPrograms(
    supabase,
    created.id,
    programIds,
  );
  if (programsError) return programsError;

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAttendanceAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update attendance.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "events",
    level: "manage",
    eventId: id,
  });
  if (permissionError) return permissionError;

  const parsed = parseEventAttendanceForm(formData);
  if ("error" in parsed) return parsed;
  const { attendanceCount, attendanceNotes } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      attendance_count: attendanceCount,
      attendance_notes: attendanceNotes,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update attendance. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "events",
    level: "manage",
    eventId: id,
  });
  if (permissionError) return permissionError;

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const {
    name,
    description,
    location,
    startsAt,
    endsAt,
    timezone,
    visibility,
    status,
    programIds,
    flierUrl,
  } = parsed.data;

  // Moving an event earlier can strand a registration deadline past its new
  // end, which the events_registration_deadline_within_event check would
  // reject with an unhelpful generic error. Clamp it instead.
  const { data: existing } = await supabase
    .from("events")
    .select("registration_deadline")
    .eq("id", id)
    .single();

  const cutoff = endsAt ?? startsAt;
  const clampDeadline =
    existing?.registration_deadline != null &&
    Date.parse(existing.registration_deadline) > Date.parse(cutoff);

  const { error } = await supabase
    .from("events")
    .update({
      name,
      description,
      location,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      visibility,
      status,
      flier_url: flierUrl,
      ...(clampDeadline ? { registration_deadline: cutoff } : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event. Please try again." };
  }

  const programsError = await syncEventPrograms(supabase, id, programIds);
  if (programsError) return programsError;

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventPlanningAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update planning details.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "events",
    level: "manage",
    eventId: id,
  });
  if (permissionError) return permissionError;

  // The deadline is validated against the event's stored dates rather than
  // anything the client submitted alongside it.
  const { data: eventRow } = await supabase
    .from("events")
    .select("starts_at, ends_at")
    .eq("id", id)
    .single();
  if (!eventRow) {
    return { error: "Could not find that event." };
  }

  const parsed = parseEventPlanningForm(formData, {
    startsAt: eventRow.starts_at,
    endsAt: eventRow.ends_at,
  });
  if ("error" in parsed) return parsed;
  // #1407. Parsed up front so a bad question refuses the whole save rather
  // than half of it.
  const registrationOptions = parseEventRegistrationOptionsField(
    formData.get("registrationOptions"),
  );
  if (registrationOptions && "error" in registrationOptions) {
    return registrationOptions;
  }
  // #1501, the same way: sent only when the questions changed.
  const registrationQuestions = parseRegistrationQuestionsField(
    formData.get(REGISTRATION_QUESTIONS_FIELD),
  );
  if (registrationQuestions && "error" in registrationQuestions) {
    return registrationQuestions;
  }
  const {
    eventLeadId,
    capacity,
    registrationEnabled,
    registrationDeadline,
    autoAssignDiscountCodes,
    adultsOnly,
    budgetAmount,
    confirmationNote,
    groupChatEnabled,
    groupChatLabel,
    carpoolsEnabled,
    carpoolSeatsQuestionId,
    reminderEnabled,
    reminderDaysBefore,
    reminderIntro,
  } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      event_lead_id: eventLeadId,
      capacity,
      registration_enabled: registrationEnabled,
      registration_deadline: registrationDeadline,
      auto_assign_discount_codes: autoAssignDiscountCodes,
      ...(adultsOnly === null ? {} : { adults_only: adultsOnly }),
      budget_amount: budgetAmount,
      ...(confirmationNote === undefined
        ? {}
        : { confirmation_note: confirmationNote }),
      ...(groupChatEnabled === null
        ? {}
        : { group_chat_enabled: groupChatEnabled }),
      ...(groupChatLabel === undefined
        ? {}
        : { group_chat_label: groupChatLabel }),
      ...(carpoolsEnabled === null
        ? {}
        : { carpools_enabled: carpoolsEnabled }),
      ...(carpoolSeatsQuestionId === undefined
        ? {}
        : { carpool_seats_question_id: carpoolSeatsQuestionId }),
      ...(reminderEnabled === null
        ? {}
        : { reminder_enabled: reminderEnabled }),
      ...(reminderDaysBefore === null
        ? {}
        : { reminder_days_before: reminderDaysBefore }),
      ...(reminderIntro === undefined ? {} : { reminder_intro: reminderIntro }),
    })
    .eq("id", id);

  if (error) {
    // #1649. The trigger standing in for a foreign key.
    if (error.message === "CARPOOL_SEATS_QUESTION_INVALID") {
      return {
        error: "Seats can only come from a number question on this event.",
      };
    }
    return { error: "Could not update planning details. Please try again." };
  }

  if (registrationOptions) {
    const { error: optionsError } = await supabase.rpc(
      "save_event_registration_options",
      {
        p_event_id: id,
        p_prompt: registrationOptions.data.prompt ?? "",
        p_options: registrationOptions.data.options,
      },
    );
    if (optionsError) {
      return {
        error:
          REGISTRATION_OPTIONS_SAVE_ERRORS[optionsError.message] ??
          "Planning details were saved, but the registration question was not. Please try again.",
      };
    }
  }

  if (registrationQuestions) {
    const { error: questionsError } = await supabase.rpc(
      "save_event_registration_questions",
      { p_event_id: id, p_questions: registrationQuestions.data },
    );
    if (questionsError) {
      return {
        error:
          REGISTRATION_QUESTION_ERROR_MESSAGES[questionsError.message] ??
          "Planning details were saved, but the registration questions were not. Please try again.",
      };
    }
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventReportAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the event report.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "events",
    level: "manage",
    eventId: id,
  });
  if (permissionError) return permissionError;

  const parsed = parseEventReportForm(formData);
  if ("error" in parsed) return parsed;
  // `report_summary` is no longer written (#1576): the card computes the
  // summary from the event's records, and old text stays read-only.
  const { feedbackNotes, contentNotes } = parsed.data;

  const { data: current } = await supabase
    .from("events")
    .select("report_status")
    .eq("id", id)
    .single();

  // Submitting locks the whole Results card (#1588); reopen to edit.
  if (current?.report_status === "submitted") {
    return {
      error:
        "This event's report has been submitted. Reopen it to change the report.",
    };
  }

  const { error } = await supabase
    .from("events")
    .update({
      feedback_notes: feedbackNotes,
      content_notes: contentNotes,
      report_status:
        current?.report_status === "not_started"
          ? "in_progress"
          : current?.report_status,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event report. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function submitEventReportAction(
  id: string,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to submit the event report.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "events",
    level: "manage",
    eventId: id,
  });
  if (permissionError) return permissionError;

  // The RPC freezes the report's figures in report_snapshot as it submits
  // (#1579), reading every section whatever the submitter may see.
  const { error } = await supabase.rpc("submit_event_report", { p_id: id });

  if (error) {
    return { error: "Could not submit the event report. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Whether the signed-in user can reopen a submitted event report. Checked
 * separately from reopenEventReportAction so the Report tab can gate the
 * "Reopen report" button's visibility before the user attempts the action.
 */
export async function getCanReopenEventReportAction(): Promise<{
  data: { canReopen: boolean };
}> {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  return {
    data: { canReopen: hasPermission(permissions, "administration", "manage") },
  };
}

export async function reopenEventReportAction(
  id: string,
  reason: string,
): Promise<CreateEventResult> {
  const parsed = parseReopenReason(reason);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to reopen this report.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
    "Only an administrator can reopen a submitted report.",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("reopen_event_report", {
    p_id: id,
    p_reason: parsed.data,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export type EventOption = { id: string; name: string };

/**
 * Event picker options for dialogs that can be opened outside their own
 * module -- notably the sidebar quick actions, where there's no page query to
 * pass options down from. Gated on events:view rather than the narrower gate
 * used by the volunteers copy of this query, so the finance role (volunteers:
 * none) can still populate an event picker.
 */
export async function listEventOptionsAction(): Promise<
  { data: EventOption[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false });

  if (error) {
    return { error: "Could not load events. Please try again." };
  }

  return { data: (data ?? []) as EventOption[] };
}

/**
 * Another event's current questions (#1501), for the Planning tab's "Copy
 * from another event". Archived ones stay behind: they are kept for the
 * answers already given, not to be asked again. Gated at manage, since only
 * the editor copies, although RLS would let a viewer read them.
 */
export async function listCopyableRegistrationQuestionsAction(
  eventId: string,
): Promise<{ data: EventRegistrationQuestion[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_registration_questions")
    .select(
      "id, kind, prompt, help, column_label, required, options, min_value, max_value, show_if, shares_contact, place_granularity, place_allow_other",
    )
    .eq("event_id", eventId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) {
    return {
      error: "Could not load that event's questions. Please try again.",
    };
  }

  return {
    data: (data ?? []).flatMap((row) => {
      const question = toEventRegistrationQuestion(row);
      return question ? [question] : [];
    }),
  };
}

/**
 * Deleting is scoped to events nothing is attached to yet -- a mistyped
 * duplicate, a test row. A `before delete` trigger on events (see
 * 20260903060000) refuses anything with registrants, sponsors, staff,
 * volunteers, incidents, a giveaway, or linked finance records, since those
 * would either cascade away or be silently orphaned; those events get
 * Cancelled/Archived instead. The detail page pre-checks via
 * event_delete_blockers so the dialog can say so up front, but the trigger is
 * the enforcement.
 */
export async function deleteEventAction(
  id: string,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("events").delete().eq("id", id);

  if (error) {
    // The trigger's restrict_violation message already names what's blocking
    // and what to do instead, so it's worth more to the user than the generic.
    return {
      error:
        error.code === "23001"
          ? error.message
          : "Could not delete the event. Please try again.",
    };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}
