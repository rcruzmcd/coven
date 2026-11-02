"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnswerBreakdownData } from "@/lib/person-answer-breakdown";

/**
 * Registrations per option of each profile question snapshotted at check-in,
 * on one event (#1745), for the Profile answers card.
 *
 * Through get_event_answer_breakdown(), which reads the snapshots and falls
 * back to current answers, and checks `person_answers: view` beside the
 * card's own permission.
 */
export async function getEventAnswerBreakdownAction(
  eventId: string,
): Promise<{ data: AnswerBreakdownData } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_answer_breakdown", {
    p_event_id: eventId,
  });
  if (error) {
    return { error: "Could not load the profile answers." };
  }
  const result = (data ?? {}) as Partial<AnswerBreakdownData>;
  return {
    data: {
      registrations: Number(result.registrations ?? 0),
      questions: result.questions ?? [],
      counts: result.counts ?? [],
      answered: result.answered ?? {},
    },
  };
}
