import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerRowsToAnswers,
  toRegistrationQuestion,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * The public reads of profile questions (#1744), through the two definer
 * functions that exist because `person_questions` is closed to anyone without
 * `person_answers: view`.
 */

function toQuestions(rows: readonly Record<string, unknown>[] | null) {
  return (rows ?? []).flatMap((row) => {
    const question = toRegistrationQuestion(
      row as Parameters<typeof toRegistrationQuestion>[0],
    );
    return question && question.kind !== "consent" ? [question] : [];
  });
}

/**
 * The questions registration step 2 asks for one event: questions only, with
 * no answers, because the form is never pre-filled for a registrant matched
 * from a typed email (#1409 section 3). Empty for a tenant asking none.
 */
export async function loadEventPersonQuestions(
  supabase: SupabaseClient,
  eventId: string,
): Promise<RegistrationQuestion[]> {
  const { data } = await supabase.rpc("public_event_person_questions", {
    p_event_id: eventId,
  });
  return toQuestions(data);
}

export type MyPersonQuestions = {
  /** Asked on /my/details. */
  myDetails: RegistrationQuestion[];
  /** Asked after registering, for pre-filling a signed-in registrant. */
  afterRegistration: RegistrationQuestion[];
  /** The caller's own current answers, by question id. */
  answers: RegistrationAnswers;
};

/** The signed-in constituent's questions and their own answers. */
export async function loadMyPersonQuestions(
  supabase: SupabaseClient,
): Promise<MyPersonQuestions> {
  const { data } = await supabase.rpc("my_person_questions");
  const rows = (data ?? []) as {
    id: string;
    ask_after_registration: boolean;
    ask_on_my_details: boolean;
    value: unknown;
  }[];
  return {
    myDetails: toQuestions(rows.filter((row) => row.ask_on_my_details)),
    afterRegistration: toQuestions(
      rows.filter((row) => row.ask_after_registration),
    ),
    answers: answerRowsToAnswers(
      rows.flatMap((row) =>
        row.value === null || row.value === undefined
          ? []
          : [{ question_id: row.id, value: row.value }],
      ),
    ),
  };
}
