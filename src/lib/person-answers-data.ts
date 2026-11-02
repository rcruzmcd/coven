import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSON_ANSWER_COLUMNS,
  PERSON_QUESTION_COLUMNS,
  toPersonQuestion,
  type PersonAnswerRow,
  type PersonQuestion,
} from "@/lib/person-questions";

/**
 * The staff reads of profile questions and answers (#1744), under RLS: both
 * tables need `person_answers: view`, so a reader without it gets empty
 * results rather than an error, and the surfaces render nothing.
 */

/** The tenant's current questions, in order. Scopes are not read: staff see every question. */
export async function loadCurrentPersonQuestions(
  supabase: SupabaseClient,
): Promise<PersonQuestion[]> {
  const { data } = await supabase
    .from("person_questions")
    .select(PERSON_QUESTION_COLUMNS)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).flatMap((row) => {
    const question = toPersonQuestion(row);
    return question ? [question] : [];
  });
}

const ID_CHUNK = 100;

/** Each person's stored answers, by person id. */
export async function loadPersonAnswers(
  supabase: SupabaseClient,
  personIds: readonly string[],
): Promise<Map<string, PersonAnswerRow[]>> {
  const byPerson = new Map<string, PersonAnswerRow[]>();
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return byPerson;
  // In chunks: a large event's registrants would otherwise put thousands of
  // characters of ids in one request URL.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("person_answers")
        .select(PERSON_ANSWER_COLUMNS)
        .in("person_id", chunk),
    ),
  );
  const data = results.flatMap((result) => result.data ?? []);
  for (const row of data as (PersonAnswerRow & {
    person_id: string;
  })[]) {
    const { person_id, ...answer } = row;
    byPerson.set(person_id, [...(byPerson.get(person_id) ?? []), answer]);
  }
  return byPerson;
}

/** One check-in snapshot as the portal reads it (#1745): the words only. */
export type PersonAnswerSnapshotRow = {
  question_id: string;
  answer_text: string;
};

/** Each registration's check-in snapshots, by registration id (#1746). */
export async function loadAnswerSnapshots(
  supabase: SupabaseClient,
  registrationIds: readonly string[],
): Promise<Map<string, PersonAnswerSnapshotRow[]>> {
  const byRegistration = new Map<string, PersonAnswerSnapshotRow[]>();
  const ids = [...new Set(registrationIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("person_answer_snapshots")
        .select("registration_id, question_id, answer_text")
        .in("registration_id", chunk),
    ),
  );
  for (const row of results.flatMap(
    (result) => result.data ?? [],
  ) as (PersonAnswerSnapshotRow & {
    registration_id: string;
  })[]) {
    const { registration_id, ...snapshot } = row;
    byRegistration.set(registration_id, [
      ...(byRegistration.get(registration_id) ?? []),
      snapshot,
    ]);
  }
  return byRegistration;
}
