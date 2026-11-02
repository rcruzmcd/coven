"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type { Json } from "@/lib/database.types";
import { PERSON_QUESTION_ERROR_MESSAGES } from "@/lib/person-questions";
import { PERSON_ANSWER_METRIC_ERROR_MESSAGES } from "@/lib/person-answer-metrics";
import { PROFILE_QUESTIONS_PATH } from "./profile-questions-draft";

export type ProfileQuestionsActionResult =
  { success: true } | { error: string };

/**
 * Saves the tenant's profile questions as the editor holds them (#1743). The
 * contents are checked by `save_person_questions()`; this only refuses a
 * payload that is not a list of objects at all.
 */
export async function savePersonQuestionsAction(
  questions: unknown,
): Promise<ProfileQuestionsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change the profile questions.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "person_answers",
    "manage",
  );
  if (permissionError) return permissionError;

  if (
    !Array.isArray(questions) ||
    questions.some(
      (item) => !item || typeof item !== "object" || Array.isArray(item),
    )
  ) {
    return { error: PERSON_QUESTION_ERROR_MESSAGES.PERSON_QUESTIONS_INVALID };
  }

  const { error } = await supabase.rpc("save_person_questions", {
    p_questions: questions as Json[],
  });
  if (error) {
    return {
      error:
        PERSON_QUESTION_ERROR_MESSAGES[error.message] ??
        "The profile questions could not be saved. Please try again.",
    };
  }

  revalidatePath(PROFILE_QUESTIONS_PATH);
  return { success: true };
}

/**
 * Saves the tenant's profile metrics as the Metrics section holds them
 * (#1745). The contents are checked by `save_person_answer_metrics()`.
 */
export async function savePersonAnswerMetricsAction(
  metrics: unknown,
): Promise<ProfileQuestionsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change the profile figures.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "person_answers",
    "manage",
  );
  if (permissionError) return permissionError;

  if (
    !Array.isArray(metrics) ||
    metrics.some(
      (item) => !item || typeof item !== "object" || Array.isArray(item),
    )
  ) {
    return {
      error: PERSON_ANSWER_METRIC_ERROR_MESSAGES.PERSON_ANSWER_METRICS_INVALID,
    };
  }

  const { error } = await supabase.rpc("save_person_answer_metrics", {
    p_metrics: metrics as Json[],
  });
  if (error) {
    return {
      error:
        PERSON_ANSWER_METRIC_ERROR_MESSAGES[error.message] ??
        "The figures could not be saved. Please try again.",
    };
  }

  revalidatePath(PROFILE_QUESTIONS_PATH);
  return { success: true };
}
