// Integration test for what happens to a person's profile answers outside the
// forms (#1746): merging two records, a deletion request, and anonymizing.
// Against the seeded tenant's rider questions (ensureRiderQuestions()), on a
// local Supabase stack; run via `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createPerson,
  createPublishedEvent,
  ensureRiderQuestions,
  serviceRoleClient,
  setProfileAnswers,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  await ensureRiderQuestions();
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** The person's current answers, by question key, in words. */
async function answersOf(personId: string) {
  const { data, error } = await service
    .from("person_answers")
    .select("answer_text, question:person_questions(key)")
    .eq("person_id", personId);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map((row) => [
      (row.question as unknown as { key: string }).key,
      row.answer_text,
    ]),
  );
}

async function questionId(key: string) {
  const { data, error } = await adminClient
    .from("person_questions")
    .select("id")
    .eq("key", key)
    .is("archived_at", null)
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("merge_people", () => {
  // The rider columns resolved discipline and levels as a group; per question,
  // the survivor's answer wins, and a merged-in answer its own discipline
  // hides is dropped.
  test("keeps the survivor's answers and drops what they hide", async () => {
    const survivor = await createPerson();
    const duplicate = await createPerson();
    cleanups.push(survivor.cleanup);
    await setProfileAnswers(survivor.id, {
      riding_discipline: "ski",
      ski_level: "advanced",
    });
    await setProfileAnswers(duplicate.id, {
      riding_discipline: "snowboard",
      snowboard_level: "beginner",
      preferred_mountain: "hunter",
    });

    const { error } = await adminClient.rpc("merge_people", {
      p_survivor_id: survivor.id,
      p_duplicate_id: duplicate.id,
    });
    if (error) throw error;

    expect(await answersOf(survivor.id)).toEqual({
      riding_discipline: "Skis",
      ski_level: "Advanced",
      preferred_mountain: "Hunter",
    });
  });
});

describe("delete_person_answers", () => {
  test("deletes the named questions, what they hide, and records the request", async () => {
    const person = await createPerson();
    cleanups.push(async () => {
      await service
        .from("retention_run_tables")
        .delete()
        .eq("subject_person_id", person.id);
      await person.cleanup();
    });
    await setProfileAnswers(person.id, {
      riding_discipline: "ski",
      ski_level: "beginner",
      preferred_mountain: "windham",
    });

    const { error } = await adminClient.rpc("delete_person_answers", {
      p_person_id: person.id,
      p_reason: "Asked us to",
      p_question_ids: [await questionId("riding_discipline")],
    });
    if (error) throw error;

    // The level goes with the discipline that showed it; the mountain stays.
    expect(await answersOf(person.id)).toEqual({
      preferred_mountain: "Windham",
    });

    const { data: logged } = await adminClient
      .from("retention_run_tables")
      .select("policy_key, action")
      .eq("subject_person_id", person.id)
      .eq("policy_key", "person_answers");
    expect(logged).toEqual([
      { policy_key: "person_answers", action: "deleted" },
    ]);
  });
});

describe("anonymizing a person", () => {
  test("deletes their answers, after snapshotting them onto past check-ins", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent();
    cleanups.push(person.cleanup, event.cleanup);

    // Checked in before they answered: no snapshot, so the event's figures
    // still read their answers.
    const { data: registration, error: registrationError } = await adminClient
      .from("event_registrations")
      .insert({
        event_id: event.id,
        name: "Lifecycle Registrant",
        email: `lifecycle-${event.id}@example.test`,
        person_id: person.id,
        checked_in_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    await setProfileAnswers(person.id, {
      riding_discipline: "snowboard",
      snowboard_level: "first_time",
    });

    const { error } = await service
      .from("people")
      .update({ is_anonymous: true, name: null, email: null })
      .eq("id", person.id);
    if (error) throw error;

    expect(await answersOf(person.id)).toEqual({});
    const { data: snapshots } = await service
      .from("person_answer_snapshots")
      .select("answer_text, option_keys")
      .eq("registration_id", registration.id);
    expect((snapshots ?? []).map((row) => row.answer_text).sort()).toEqual([
      "First time on a snowboard",
      "Snowboard",
    ]);
  });
});
