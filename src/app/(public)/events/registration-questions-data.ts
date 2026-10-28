import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toRegistrationQuestion,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * An event's registration questions (#1501), in order, or an empty list for
 * the events that ask none -- almost all of them, which then render exactly as
 * before. Read through `public_event_registration_questions`, which leaves out
 * archived questions.
 */
export async function loadRegistrationQuestions(
  supabase: SupabaseClient,
  eventId: string,
): Promise<RegistrationQuestion[]> {
  const { data } = await supabase
    .from("public_event_registration_questions")
    .select(
      "id, kind, prompt, help, required, options, min_value, max_value, show_if, place_granularity, place_allow_other",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  return (data ?? []).flatMap((row) => {
    const question = toRegistrationQuestion(row);
    return question ? [question] : [];
  });
}
