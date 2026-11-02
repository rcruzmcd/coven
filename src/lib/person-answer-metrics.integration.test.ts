// Integration test for profile question check-in snapshots, metric rows, the
// impact RPCs' counts and the answers breakdown (#1745, part of #1409),
// against a local Supabase stack. Requires `bun run db:start && bun run
// db:reset`; run via `bun run test:integration`.
//
// Questions and metrics are tenant-wide, so each test saves the full set it
// needs and afterAll removes whatever this file left on the seeded tenant.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createPerson,
  createProgram,
  createPublishedEvent,
  SEEDED_USERS,
  seededTenantId,
  serviceRoleClient,
  signInAs,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const uuid = () => crypto.randomUUID();

let tenantId: string;
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  await clear();
});

afterAll(async () => {
  await clear();
  while (cleanups.length) await cleanups.pop()!();
});

async function clear() {
  await service
    .from("person_answer_metrics")
    .delete()
    .eq("tenant_id", tenantId);
  await service
    .from("person_answer_snapshots")
    .delete()
    .eq("tenant_id", tenantId);
  await service.from("person_answers").delete().eq("tenant_id", tenantId);
  await service.from("person_questions").delete().eq("tenant_id", tenantId);
}

type Option = { id: string; key: string; label: string };
const option = (key: string, label: string): Option => ({
  id: uuid(),
  key,
  label,
});

/** Discipline, then a ski and a snowboard level conditional on it. */
function riderQuestions() {
  const discipline = {
    id: uuid(),
    ski: option("ski", "Ski"),
    snowboard: option("snowboard", "Snowboard"),
    both: option("both", "Both"),
  };
  const levels = () => ({
    first_time: option("first_time", "First time"),
    beginner: option("beginner", "Beginner"),
    advanced: option("advanced", "Advanced"),
  });
  const ski = { id: uuid(), ...levels() };
  const board = { id: uuid(), ...levels() };
  const household = { id: uuid() };
  const opts = (q: object) =>
    Object.values(q).filter((v): v is Option => typeof v === "object");
  const questions = [
    {
      id: discipline.id,
      kind: "single_choice",
      prompt: "Do you ski or ride?",
      options: opts(discipline),
      snapshot_at_checkin: true,
    },
    {
      id: ski.id,
      kind: "single_choice",
      prompt: "Ski level",
      options: opts(ski),
      show_if: {
        any: [
          {
            question_id: discipline.id,
            option_ids: [discipline.ski.id, discipline.both.id],
          },
        ],
      },
      snapshot_at_checkin: true,
    },
    {
      id: board.id,
      kind: "single_choice",
      prompt: "Snowboard level",
      options: opts(board),
      show_if: {
        any: [
          {
            question_id: discipline.id,
            option_ids: [discipline.snowboard.id, discipline.both.id],
          },
        ],
      },
      snapshot_at_checkin: true,
    },
    {
      id: household.id,
      kind: "number",
      prompt: "Household size",
    },
  ].map((q) => ({
    ask_after_registration: true,
    ask_on_my_details: true,
    ...q,
  }));
  return { discipline, ski, board, household, questions };
}

async function saveQuestions(questions: unknown) {
  const { error } = await adminClient.rpc("save_person_questions", {
    p_questions: questions,
  });
  if (error) throw error;
}

function saveMetrics(metrics: unknown, as: SupabaseClient = adminClient) {
  return as.rpc("save_person_answer_metrics", { p_metrics: metrics });
}

async function person() {
  const fixture = await createPerson({ name: `Metrics ${run}` });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function answer(personId: string, answers: Record<string, unknown>) {
  const { error } = await adminClient.rpc("set_person_answers", {
    p_person_id: personId,
    p_answers: answers,
  });
  if (error) throw error;
}

async function event() {
  const fixture = await createPublishedEvent({ name: `Metrics ${run}` });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function register(eventId: string, personId: string, checkedIn = false) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Metrics Rider",
      email: `metrics-${uuid()}@example.test`,
      person_id: personId,
      checked_in_at: checkedIn ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function checkIn(registrationId: string) {
  const { error } = await adminClient
    .from("event_registrations")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", registrationId);
  if (error) throw error;
}

async function snapshots(registrationId: string) {
  const { data, error } = await adminClient
    .from("person_answer_snapshots")
    .select("question_id, answer_text, option_keys")
    .eq("registration_id", registrationId);
  if (error) throw error;
  return data;
}

type MetricCount = { label: string; count: number; answered: number };

async function eventMetrics(eventId: string, as: SupabaseClient = adminClient) {
  const { data, error } = await as.rpc("get_event_impact_derived_data", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return (data as { person_answer_metrics: MetricCount[] | null })
    .person_answer_metrics;
}

describe("profile metrics (#1745)", () => {
  let rider: ReturnType<typeof riderQuestions>;
  let beginners: string;
  let firstTimers: string;

  beforeAll(async () => {
    rider = riderQuestions();
    await saveQuestions(rider.questions);
    beginners = uuid();
    firstTimers = uuid();
    const { error } = await saveMetrics([
      {
        id: beginners,
        key: "beginner_participants",
        label: "Beginner participants",
        rule: "any",
        question_ids: [rider.ski.id, rider.board.id],
        option_keys: ["beginner"],
      },
      {
        id: firstTimers,
        key: null,
        label: "First time on snow",
        rule: "every_answered",
        question_ids: [rider.ski.id, rider.board.id],
        option_keys: ["first_time"],
      },
    ]);
    if (error) throw error;
  });

  test("check-in snapshots the snapshotted answers, with option keys, and only those", async () => {
    const eventId = await event();
    const p = await person();
    await answer(p, {
      [rider.discipline.id]: rider.discipline.ski.id,
      [rider.ski.id]: rider.ski.beginner.id,
      [rider.household.id]: 4,
    });
    const reg = await register(eventId, p);
    expect(await snapshots(reg)).toEqual([]);

    await checkIn(reg);
    const rows = await snapshots(reg);
    expect(rows.map((r) => [r.question_id, r.option_keys]).sort()).toEqual(
      [
        [rider.discipline.id, ["ski"]],
        [rider.ski.id, ["beginner"]],
      ].sort(),
    );
  });

  test("a figure counts what was true at check-in, not a later edit", async () => {
    const eventId = await event();
    const p = await person();
    await answer(p, {
      [rider.discipline.id]: rider.discipline.ski.id,
      [rider.ski.id]: rider.ski.beginner.id,
    });
    await register(eventId, p, true);
    await answer(p, {
      [rider.discipline.id]: rider.discipline.ski.id,
      [rider.ski.id]: rider.ski.advanced.id,
    });

    const metrics = await eventMetrics(eventId);
    expect(metrics?.map((m) => [m.label, m.count, m.answered])).toEqual([
      ["Beginner participants", 1, 1],
      ["First time on snow", 0, 1],
    ]);
  });

  test("with no snapshot at all, the current answer counts", async () => {
    const eventId = await event();
    const p = await person();
    await register(eventId, p, true);
    await answer(p, {
      [rider.discipline.id]: rider.discipline.snowboard.id,
      [rider.board.id]: rider.board.first_time.id,
    });

    const metrics = await eventMetrics(eventId);
    expect(metrics?.find((m) => m.label === "First time on snow")?.count).toBe(
      1,
    );
  });

  test("any counts one matching answer; every_answered needs all of them", async () => {
    const eventId = await event();
    const both = await person();
    await answer(both, {
      [rider.discipline.id]: rider.discipline.both.id,
      [rider.ski.id]: rider.ski.first_time.id,
      [rider.board.id]: rider.board.beginner.id,
    });
    const firstTimer = await person();
    await answer(firstTimer, {
      [rider.discipline.id]: rider.discipline.both.id,
      [rider.ski.id]: rider.ski.first_time.id,
      [rider.board.id]: rider.board.first_time.id,
    });
    await register(eventId, both, true);
    await register(eventId, firstTimer, true);
    // Not checked in: never counted.
    await register(eventId, await person());

    const metrics = await eventMetrics(eventId);
    expect(metrics?.map((m) => [m.label, m.count, m.answered])).toEqual([
      ["Beginner participants", 1, 2],
      ["First time on snow", 1, 2],
    ]);
  });

  test("the program rollup counts across its events", async () => {
    const program = await createProgram();
    cleanups.push(program.cleanup);
    for (let i = 0; i < 2; i++) {
      const eventId = await event();
      const { error } = await adminClient
        .from("event_programs")
        .insert({ event_id: eventId, program_id: program.id });
      if (error) throw error;
      const p = await person();
      await answer(p, {
        [rider.discipline.id]: rider.discipline.ski.id,
        [rider.ski.id]: rider.ski.beginner.id,
      });
      await register(eventId, p, true);
    }
    const { data, error } = await adminClient.rpc(
      "get_program_impact_rollup_data",
      { p_program_id: program.id },
    );
    if (error) throw error;
    const metrics = (data as { person_answer_metrics: MetricCount[] })
      .person_answer_metrics;
    expect(
      metrics.find((m) => m.label === "Beginner participants")?.count,
    ).toBe(2);
  });

  test("the board reads the counts under event_impact:view", async () => {
    const eventId = await event();
    const p = await person();
    await answer(p, {
      [rider.discipline.id]: rider.discipline.ski.id,
      [rider.ski.id]: rider.ski.beginner.id,
    });
    await register(eventId, p, true);
    const board = await signInAs(SEEDED_USERS.board);
    const metrics = await eventMetrics(eventId, board);
    expect(metrics?.[0].count).toBe(1);
  });

  test("the breakdown nests a level under the discipline it was asked for", async () => {
    const eventId = await event();
    for (const [discipline, level] of [
      [rider.discipline.ski.id, rider.ski.beginner.id],
      [rider.discipline.ski.id, rider.ski.beginner.id],
      [rider.discipline.both.id, rider.ski.advanced.id],
    ]) {
      const p = await person();
      await answer(p, {
        [rider.discipline.id]: discipline,
        [rider.ski.id]: level,
      });
      await register(eventId, p);
    }

    const { data, error } = await adminClient.rpc(
      "get_event_answer_breakdown",
      { p_event_id: eventId },
    );
    if (error) throw error;
    const breakdown = data as {
      registrations: number;
      questions: { id: string; parent_question_id: string | null }[];
      counts: {
        question_id: string;
        option_id: string | null;
        parent_option_id: string | null;
        registrations: number;
      }[];
    };
    expect(breakdown.registrations).toBe(3);
    // The number question is never on the card.
    expect(breakdown.questions.map((q) => q.id)).toEqual([
      rider.discipline.id,
      rider.ski.id,
      rider.board.id,
    ]);
    expect(
      breakdown.questions.find((q) => q.id === rider.ski.id)
        ?.parent_question_id,
    ).toBe(rider.discipline.id);
    const ski = breakdown.counts
      .filter((c) => c.question_id === rider.ski.id)
      .map((c) => [c.parent_option_id, c.option_id, c.registrations])
      .sort();
    expect(ski).toEqual(
      [
        [rider.discipline.ski.id, rider.ski.beginner.id, 2],
        [rider.discipline.both.id, rider.ski.advanced.id, 1],
      ].sort(),
    );
  });

  test("the breakdown needs person_answers:view", async () => {
    const eventId = await event();
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    const { error } = await noAccess.rpc("get_event_answer_breakdown", {
      p_event_id: eventId,
    });
    expect(error?.message).toContain("Not authorized");
  });
});

describe("save_person_answer_metrics", () => {
  let rider: ReturnType<typeof riderQuestions>;

  beforeAll(async () => {
    rider = riderQuestions();
    await saveQuestions(rider.questions);
  });

  const metric = (overrides: Record<string, unknown> = {}) => ({
    id: uuid(),
    key: null,
    label: "Beginners",
    rule: "any",
    question_ids: [rider.ski.id],
    option_keys: ["beginner"],
    ...overrides,
  });

  test("refuses a question that is not a choice", async () => {
    const { error } = await saveMetrics([
      metric({ question_ids: [rider.household.id] }),
    ]);
    expect(error?.message).toBe("PERSON_ANSWER_METRICS_QUESTIONS_INVALID");
  });

  test("refuses a key none of its questions offers", async () => {
    const { error } = await saveMetrics([metric({ option_keys: ["expert"] })]);
    expect(error?.message).toBe("PERSON_ANSWER_METRICS_OPTIONS_INVALID");
  });

  test("refuses a blank label and a duplicate key", async () => {
    expect((await saveMetrics([metric({ label: " " })])).error?.message).toBe(
      "PERSON_ANSWER_METRICS_LABEL_REQUIRED",
    );
    expect(
      (
        await saveMetrics([
          metric({ key: "same" }),
          metric({ key: "same", label: "Other" }),
        ])
      ).error?.message,
    ).toBe("PERSON_ANSWER_METRICS_KEY_TAKEN");
  });

  test("an option's id stands in for a missing key", async () => {
    const plain = { id: uuid(), label: "Yes" };
    const question = {
      id: uuid(),
      kind: "single_choice",
      prompt: "Plain",
      options: [plain, { id: uuid(), label: "No" }],
      ask_after_registration: true,
      ask_on_my_details: true,
    };
    await saveQuestions([...rider.questions, question]);
    const { error } = await saveMetrics([
      metric({ question_ids: [question.id], option_keys: [plain.id] }),
    ]);
    expect(error).toBeNull();
  });

  test("needs person_answers:manage", async () => {
    const board = await signInAs(SEEDED_USERS.board);
    const { error } = await saveMetrics([metric()], board);
    expect(error?.message).toContain("Not authorized");
  });

  test("replaces the set: rows left out are removed", async () => {
    const kept = metric();
    expect((await saveMetrics([kept, metric()])).error).toBeNull();
    expect((await saveMetrics([kept])).error).toBeNull();
    const { data } = await adminClient
      .from("person_answer_metrics")
      .select("id");
    expect(data?.map((row) => row.id)).toEqual([kept.id]);
  });

  test("a question a metric reads is archived, not deleted, when left out", async () => {
    expect((await saveMetrics([metric()])).error).toBeNull();
    await saveQuestions(
      rider.questions.filter((q) => q.id !== rider.ski.id && !q.show_if),
    );
    const { data } = await adminClient
      .from("person_questions")
      .select("archived_at")
      .eq("id", rider.ski.id)
      .single();
    expect(data?.archived_at).not.toBeNull();
  });
});
