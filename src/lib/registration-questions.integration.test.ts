// Integration test for per-event registration questions (#1501), against the
// real RPCs on a local Supabase stack: saving questions of every kind, the
// validation and condition rules, archiving a question that has answers, the
// required/visible/well-formed rules on both registration paths, the
// self-service and staff writes, and who can read what. The retention purge's
// share is asserted in the retention suite, which owns a tenant to run it on.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  enableModule,
  SEEDED_USERS,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";

type Kind =
  "single_choice" | "multi_choice" | "short_text" | "number" | "consent";

type QuestionInput = {
  id: string;
  kind: Kind;
  prompt: string;
  help?: string | null;
  required?: boolean;
  options?: {
    id: string;
    label: string;
    key?: string | null;
    hint?: string | null;
    archived?: boolean;
  }[];
  min_value?: number | null;
  max_value?: number | null;
  shares_contact?: boolean;
  allow_other?: boolean;
  // #1742: either form; stored as {any}.
  show_if?:
    | { question_id: string; option_ids: string[] }
    | { any: { question_id: string; option_ids: string[] }[] }
    | null;
};

type AnswerRow = {
  question_id: string | null;
  kind: string;
  prompt_as_shown: string;
  value: unknown;
  answer_text: string;
};

type MyQuestionRow = {
  question_id: string;
  kind: string;
  value: unknown;
  answer_text: string | null;
  editable: boolean;
};

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const uuid = () => crypto.randomUUID();

let tenantId: string;
let restoreModule: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const createdPeople: string[] = [];
// register_for_event() mints a person per new address; they outlive the
// event's own cleanup, and test/seed-shape counts them.
const registeredEmails: string[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  for (let i = 0; i < registeredEmails.length; i += 50) {
    await service
      .from("people")
      .delete()
      .in("email", registeredEmails.slice(i, i + 50));
  }
  await service.from("people").delete().in("id", createdPeople);
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  await restoreModule();
});

async function event(overrides?: Parameters<typeof createPublishedEvent>[0]) {
  const fixture = await createPublishedEvent({
    name: `Questions ${run}`,
    ...overrides,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

function saveQuestions(
  eventId: string,
  questions: unknown,
  as: SupabaseClient = adminClient,
) {
  return as.rpc("save_event_registration_questions", {
    p_event_id: eventId,
    p_questions: questions,
  });
}

async function questionsOf(eventId: string) {
  const { data, error } = await adminClient
    .from("event_registration_questions")
    .select(
      "id, kind, prompt, help, required, sort_order, options, min_value, max_value, show_if, shares_contact, archived_at",
    )
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

/**
 * The carpool questions the ticket was written for: a single choice, a number
 * shown only to drivers, free text, a multi choice and a sharing consent.
 */
function carpool() {
  const drive = uuid();
  const ride = uuid();
  const own = uuid();
  const snacks = uuid();
  const music = uuid();
  const quiet = uuid();
  const ids = {
    gettingThere: uuid(),
    seats: uuid(),
    leavingFrom: uuid(),
    extras: uuid(),
    share: uuid(),
  };
  const questions: QuestionInput[] = [
    {
      id: ids.gettingThere,
      kind: "single_choice",
      prompt: "Getting there",
      help: "So the partner can match riders to drivers.",
      required: true,
      options: [
        { id: drive, label: "Driving, can offer seats" },
        { id: ride, label: "Need a ride" },
        { id: own, label: "Making my own way" },
      ],
    },
    {
      id: ids.seats,
      kind: "number",
      prompt: "Seats available",
      required: true,
      min_value: 1,
      max_value: 6,
      show_if: { question_id: ids.gettingThere, option_ids: [drive] },
    },
    { id: ids.leavingFrom, kind: "short_text", prompt: "Leaving from" },
    {
      id: ids.extras,
      kind: "multi_choice",
      prompt: "In the car",
      options: [
        { id: snacks, label: "Snacks" },
        { id: music, label: "Music" },
        { id: quiet, label: "Quiet" },
      ],
    },
    {
      id: ids.share,
      kind: "consent",
      prompt: "OK to share my name and contact with the partner",
      // Ignored: a consent box is declinable by definition.
      required: true,
      shares_contact: true,
    },
  ];
  return {
    questions,
    ids,
    options: { drive, ride, own, snacks, music, quiet },
  };
}

async function eventWithQuestions() {
  const eventId = await event();
  const fixture = carpool();
  const { error } = await saveQuestions(eventId, fixture.questions);
  if (error) throw error;
  return { eventId, ...fixture };
}

function register(eventId: string, answers?: unknown) {
  const email = uniqueEmail(`questions-${run}`);
  registeredEmails.push(email);
  return anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Questions Tester",
    p_email: email,
    p_phone: "555-0100",
    p_party_size: 2,
    p_notes: "",
    p_ip_address: uniqueIp(),
    ...(answers === undefined ? {} : { p_answers: answers }),
  });
}

async function answersOf(registrationId: string) {
  const { data, error } = await adminClient
    .from("event_registration_answers")
    .select("question_id, kind, prompt_as_shown, value, answer_text")
    .eq("registration_id", registrationId)
    .order("sort_order");
  if (error) throw error;
  return data as AnswerRow[];
}

async function registrationsOf(eventId: string) {
  const { count, error } = await adminClient
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw error;
  return count;
}

describe("save_event_registration_questions", () => {
  test("saves every kind under the caller's ids, in the order given", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    const saved = await questionsOf(eventId);

    expect(saved.map((q) => [q.id, q.kind, q.sort_order])).toEqual([
      [ids.gettingThere, "single_choice", 0],
      [ids.seats, "number", 1],
      [ids.leavingFrom, "short_text", 2],
      [ids.extras, "multi_choice", 3],
      [ids.share, "consent", 4],
    ]);
    const [gettingThere, seats, leavingFrom, extras, share] = saved;
    expect(gettingThere.help).toBe(
      "So the partner can match riders to drivers.",
    );
    expect(gettingThere.required).toBe(true);
    expect(gettingThere.options).toEqual([
      { id: options.drive, label: "Driving, can offer seats" },
      { id: options.ride, label: "Need a ride" },
      { id: options.own, label: "Making my own way" },
    ]);
    expect([seats.min_value, seats.max_value]).toEqual([1, 6]);
    // Sent bare, stored as a one-item any (#1742).
    expect(seats.show_if).toEqual({
      any: [{ question_id: ids.gettingThere, option_ids: [options.drive] }],
    });
    expect(leavingFrom.options).toEqual([]);
    expect(leavingFrom.help).toBeNull();
    expect(extras.options).toHaveLength(3);
    // A consent box is never required, whatever was sent.
    expect(share.required).toBe(false);
    expect(share.shares_contact).toBe(true);
    expect(saved.every((q) => q.archived_at === null)).toBe(true);
  });

  test("reorders and renames in place, keeping the ids", async () => {
    const { eventId, questions, ids } = await eventWithQuestions();
    const [gettingThere, seats, leavingFrom, extras, share] = questions;

    const { error } = await saveQuestions(eventId, [
      { ...share, prompt: "Share with the partner?" },
      leavingFrom,
      gettingThere,
      seats,
      extras,
    ]);
    expect(error).toBeNull();
    expect(
      (await questionsOf(eventId)).map((q) => [q.id, q.sort_order, q.prompt]),
    ).toEqual([
      [ids.share, 0, "Share with the partner?"],
      [ids.leavingFrom, 1, "Leaving from"],
      [ids.gettingThere, 2, "Getting there"],
      [ids.seats, 3, "Seats available"],
      [ids.extras, 4, "In the car"],
    ]);
  });

  test("shares_contact is kept only on a consent question", async () => {
    const eventId = await event();
    const text = uuid();
    const { error } = await saveQuestions(eventId, [
      { id: text, kind: "short_text", prompt: "Notes", shares_contact: true },
    ]);
    expect(error).toBeNull();
    expect((await questionsOf(eventId))[0].shares_contact).toBe(false);
  });

  test("keeps a short column label, trimmed, and refuses one over 24 characters (#1512)", async () => {
    const eventId = await event();
    const id = uuid();
    const save = (column_label: unknown) =>
      saveQuestions(eventId, [
        { id, kind: "short_text", prompt: "Which borough?", column_label },
      ]);
    const labelOf = async () =>
      (
        await adminClient
          .from("event_registration_questions")
          .select("column_label")
          .eq("id", id)
          .single()
      ).data?.column_label;

    expect((await save("  Borough ")).error).toBeNull();
    expect(await labelOf()).toBe("Borough");

    const tooLong = await save("x".repeat(25));
    expect(tooLong.error?.message).toBe(
      "EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG",
    );
    expect(await labelOf()).toBe("Borough");

    // Blank, or left out, clears it.
    expect((await save("   ")).error).toBeNull();
    expect(await labelOf()).toBeNull();
  });

  test("refuses a malformed list, and a refusal saves nothing", async () => {
    const eventId = await event();
    const a = uuid();
    const b = uuid();
    const text = (id = uuid()): QuestionInput => ({
      id,
      kind: "short_text",
      prompt: "Text",
    });
    const choice = (
      id: string,
      kind: Kind = "single_choice",
      extra: Partial<QuestionInput> = {},
    ): QuestionInput => ({
      id,
      kind,
      prompt: `Choice ${id.slice(0, 4)}`,
      options: [
        { id: a, label: "A" },
        { id: b, label: "B" },
      ],
      ...extra,
    });
    const refusal = async (questions: unknown) =>
      (await saveQuestions(eventId, questions)).error?.message;

    // EVENT_QUESTIONS_INVALID
    expect(await refusal({})).toBe("EVENT_QUESTIONS_INVALID");
    expect(await refusal(null)).toBe("EVENT_QUESTIONS_INVALID");
    expect(await refusal([{ kind: "short_text", prompt: "No id" }])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );
    expect(
      await refusal([{ id: "not-a-uuid", kind: "short_text", prompt: "Q" }]),
    ).toBe("EVENT_QUESTIONS_INVALID");
    expect(await refusal([{ id: uuid(), kind: "essay", prompt: "Q" }])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );
    const twice = uuid();
    expect(await refusal([text(twice), text(twice)])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );
    expect(await refusal([{ ...text(), prompt: "x".repeat(301) }])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );
    expect(await refusal([{ ...text(), help: "x".repeat(501) }])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );
    expect(
      await refusal([
        {
          id: uuid(),
          kind: "number",
          prompt: "N",
          min_value: 5,
          max_value: 1,
        },
      ]),
    ).toBe("EVENT_QUESTIONS_INVALID");
    expect(
      await refusal([
        { id: uuid(), kind: "number", prompt: "N", min_value: 1.5 },
      ]),
    ).toBe("EVENT_QUESTIONS_INVALID");
    expect(
      await refusal([
        { id: uuid(), kind: "number", prompt: "N", max_value: "6" },
      ]),
    ).toBe("EVENT_QUESTIONS_INVALID");

    // An id that is another event's question.
    const { ids } = await eventWithQuestions();
    expect(await refusal([text(ids.leavingFrom)])).toBe(
      "EVENT_QUESTIONS_INVALID",
    );

    // EVENT_QUESTIONS_TOO_MANY
    expect(await refusal(Array.from({ length: 21 }, () => text()))).toBe(
      "EVENT_QUESTIONS_TOO_MANY",
    );

    // EVENT_QUESTIONS_PROMPT_REQUIRED
    expect(await refusal([{ ...text(), prompt: "  " }])).toBe(
      "EVENT_QUESTIONS_PROMPT_REQUIRED",
    );
    expect(await refusal([{ id: uuid(), kind: "short_text" }])).toBe(
      "EVENT_QUESTIONS_PROMPT_REQUIRED",
    );

    // EVENT_QUESTIONS_OPTIONS_INVALID
    expect(
      await refusal([choice(uuid(), "single_choice", { options: [] })]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");
    expect(
      await refusal([
        choice(uuid(), "multi_choice", { options: [{ id: a, label: "A" }] }),
      ]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");
    expect(
      await refusal([
        choice(uuid(), "single_choice", {
          options: [
            { id: a, label: "Same" },
            { id: b, label: " same " },
          ],
        }),
      ]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");
    expect(
      await refusal([
        choice(uuid(), "single_choice", {
          options: [
            { id: a, label: "A" },
            { id: a, label: "B" },
          ],
        }),
      ]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");
    expect(
      await refusal([
        choice(uuid(), "single_choice", {
          options: [
            { id: "nope", label: "A" },
            { id: b, label: "B" },
          ],
        }),
      ]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");
    expect(
      await refusal([
        choice(uuid(), "single_choice", {
          options: [
            { id: a, label: "  " },
            { id: b, label: "B" },
          ],
        }),
      ]),
    ).toBe("EVENT_QUESTIONS_OPTIONS_INVALID");

    // EVENT_QUESTIONS_CONDITION_INVALID
    const parent = uuid();
    const child = uuid();
    const showIf = (questionId: string, optionIds = [a]) => ({
      show_if: { question_id: questionId, option_ids: optionIds },
    });
    // On a later question.
    expect(
      await refusal([{ ...text(child), ...showIf(parent) }, choice(parent)]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    // On a question that is not single choice.
    expect(
      await refusal([
        choice(parent, "multi_choice"),
        { ...text(child), ...showIf(parent) },
      ]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    expect(
      await refusal([text(parent), { ...text(child), ...showIf(parent) }]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    // #1742. Naming a question twice, no clause, or not an object.
    expect(
      await refusal([
        choice(parent),
        {
          ...text(child),
          show_if: {
            any: [
              { question_id: parent, option_ids: [a] },
              { question_id: parent, option_ids: [b] },
            ],
          },
        },
      ]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    expect(
      await refusal([choice(parent), { ...text(child), show_if: { any: [] } }]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    expect(
      await refusal([choice(parent), { ...text(child), show_if: [parent] }]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    // On itself, on nothing, on no option, and on an option it does not have.
    expect(
      await refusal([choice(parent, "single_choice", showIf(parent))]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    expect(await refusal([{ ...text(child), ...showIf(uuid()) }])).toBe(
      "EVENT_QUESTIONS_CONDITION_INVALID",
    );
    expect(
      await refusal([
        choice(parent),
        { ...text(child), ...showIf(parent, []) },
      ]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");
    expect(
      await refusal([
        choice(parent),
        { ...text(child), ...showIf(parent, [uuid()]) },
      ]),
    ).toBe("EVENT_QUESTIONS_CONDITION_INVALID");

    expect(await questionsOf(eventId)).toEqual([]);
  });

  test("needs events: manage", async () => {
    const eventId = await event();
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await saveQuestions(
      eventId,
      carpool().questions,
      volunteer,
    );
    expect(error).not.toBeNull();
    expect(await questionsOf(eventId)).toEqual([]);
  });

  test("archives a removed question that has answers, deletes one that has none, and restores an archived id", async () => {
    const { eventId, questions, ids, options } = await eventWithQuestions();
    const [gettingThere, seats, leavingFrom, extras, share] = questions;
    const { data: registrationId, error } = await register(eventId, {
      [ids.gettingThere]: options.own,
      [ids.leavingFrom]: "Boulder",
    });
    expect(error).toBeNull();

    // Leaving from was answered; In the car was not.
    expect(
      (await saveQuestions(eventId, [gettingThere, seats, share])).error,
    ).toBeNull();
    const after = await questionsOf(eventId);
    const archived = after.find((q) => q.id === ids.leavingFrom);
    expect(archived?.archived_at).not.toBeNull();
    expect(after.some((q) => q.id === ids.extras)).toBe(false);
    expect(
      after.filter((q) => q.archived_at === null).map((q) => q.id),
    ).toEqual([ids.gettingThere, ids.seats, ids.share]);

    // The answer is kept, and still says what it said.
    expect(await answersOf(registrationId as string)).toContainEqual({
      question_id: ids.leavingFrom,
      kind: "short_text",
      prompt_as_shown: "Leaving from",
      value: "Boulder",
      answer_text: "Boulder",
    });

    // The public form no longer asks it.
    const { data: shown } = await anon
      .from("public_event_registration_questions")
      .select("id")
      .eq("event_id", eventId);
    expect((shown ?? []).map((row) => row.id)).not.toContain(ids.leavingFrom);

    // A new registration's answers leave the archived question's alone, and
    // a key naming it is refused like any other unknown question.
    expect(
      (
        await register(eventId, {
          [ids.gettingThere]: options.own,
          [ids.leavingFrom]: "Denver",
        })
      ).error?.message,
    ).toBe("EVENT_ANSWERS_INVALID");

    // Sending its id back restores it, answers and all.
    expect(
      (
        await saveQuestions(eventId, [
          gettingThere,
          seats,
          leavingFrom,
          extras,
          share,
        ])
      ).error,
    ).toBeNull();
    const restored = await questionsOf(eventId);
    expect(restored.map((q) => [q.id, q.archived_at])).toEqual([
      [ids.gettingThere, null],
      [ids.seats, null],
      [ids.leavingFrom, null],
      [ids.extras, null],
      [ids.share, null],
    ]);
    expect(
      (await answersOf(registrationId as string)).map((row) => row.question_id),
    ).toContain(ids.leavingFrom);
  });
});

describe("registering for an event with questions", () => {
  test("an event with no questions is unchanged, and refuses answers it cannot place", async () => {
    const eventId = await event();
    expect((await register(eventId)).error).toBeNull();
    expect((await register(eventId, null)).error).toBeNull();
    expect((await register(eventId, {})).error).toBeNull();
    expect((await register(eventId, { [uuid()]: "x" })).error?.message).toBe(
      "EVENT_ANSWERS_INVALID",
    );
    expect(await registrationsOf(eventId)).toBe(3);
  });

  test("requires a visible required question, and a refusal leaves no registration behind", async () => {
    const { eventId, ids } = await eventWithQuestions();
    expect((await register(eventId)).error?.message).toBe(
      "EVENT_ANSWERS_REQUIRED",
    );
    expect((await register(eventId, {})).error?.message).toBe(
      "EVENT_ANSWERS_REQUIRED",
    );
    // An empty choice is no choice.
    expect(
      (await register(eventId, { [ids.gettingThere]: "" })).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect(
      (await register(eventId, { [ids.gettingThere]: null })).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect(await registrationsOf(eventId)).toBe(0);
  });

  test("a hidden question is not required, and an answer sent for it is dropped", async () => {
    const { eventId, ids, options } = await eventWithQuestions();

    // A driver must say how many seats.
    expect(
      (await register(eventId, { [ids.gettingThere]: options.drive })).error
        ?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect(await registrationsOf(eventId)).toBe(0);

    // A rider is never asked, and a seat count they send anyway is not kept.
    const { data: id, error } = await register(eventId, {
      [ids.gettingThere]: options.ride,
      [ids.seats]: 3,
    });
    expect(error).toBeNull();
    expect(
      (await answersOf(id as string)).map((row) => row.question_id),
    ).toEqual([ids.gettingThere]);

    // Even an answer that would be invalid, since nobody asked it.
    expect(
      (
        await register(eventId, {
          [ids.gettingThere]: options.own,
          [ids.seats]: 99,
        })
      ).error,
    ).toBeNull();
  });

  test("refuses an answer that does not fit its question", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    const base = { [ids.gettingThere]: options.drive, [ids.seats]: 2 };
    const refusal = async (answers: unknown) =>
      (await register(eventId, answers)).error?.message;

    for (const answers of [
      // Not an object.
      [options.drive],
      "answers",
      // A question this event does not ask.
      { ...base, [uuid()]: "x" },
      { ...base, "not-a-uuid": "x" },
      // An option the question does not have, or the wrong shape.
      { [ids.gettingThere]: uuid() },
      { [ids.gettingThere]: [options.drive] },
      { ...base, [ids.extras]: [options.snacks, uuid()] },
      { ...base, [ids.extras]: options.snacks },
      { ...base, [ids.extras]: [1] },
      // A number out of bounds, fractional, or not a number.
      { ...base, [ids.seats]: 0 },
      { ...base, [ids.seats]: 7 },
      { ...base, [ids.seats]: 2.5 },
      { ...base, [ids.seats]: "2" },
      // Text too long, or not text.
      { ...base, [ids.leavingFrom]: "x".repeat(501) },
      { ...base, [ids.leavingFrom]: 80301 },
      // Consent is a boolean.
      { ...base, [ids.share]: "yes" },
      { ...base, [ids.share]: 1 },
    ]) {
      expect(await refusal(answers)).toBe("EVENT_ANSWERS_INVALID");
    }
    expect(await registrationsOf(eventId)).toBe(0);

    // 500 characters exactly, after trimming, is fine.
    expect(
      await refusal({
        ...base,
        [ids.leavingFrom]: `  ${"x".repeat(500)}  `,
      }),
    ).toBeUndefined();
  });

  test("stores each answer with its words as shown, and a rename never rewrites them", async () => {
    const { eventId, questions, ids, options } = await eventWithQuestions();
    const { data: id, error } = await register(eventId, {
      // Upper-case ids are the same ids.
      [ids.gettingThere.toUpperCase()]: options.drive.toUpperCase(),
      [ids.seats]: 3,
      [ids.leavingFrom]: "  Boulder, CO  ",
      // Out of order and repeated: stored in the question's own order.
      [ids.extras]: [options.quiet, options.snacks, options.quiet],
      [ids.share]: false,
    });
    expect(error).toBeNull();
    const registrationId = id as string;

    const expected: AnswerRow[] = [
      {
        question_id: ids.gettingThere,
        kind: "single_choice",
        prompt_as_shown: "Getting there",
        value: options.drive,
        answer_text: "Driving, can offer seats",
      },
      {
        question_id: ids.seats,
        kind: "number",
        prompt_as_shown: "Seats available",
        value: 3,
        answer_text: "3",
      },
      {
        question_id: ids.leavingFrom,
        kind: "short_text",
        prompt_as_shown: "Leaving from",
        value: "Boulder, CO",
        answer_text: "Boulder, CO",
      },
      {
        question_id: ids.extras,
        kind: "multi_choice",
        prompt_as_shown: "In the car",
        value: [options.snacks, options.quiet],
        answer_text: "Snacks, Quiet",
      },
      {
        question_id: ids.share,
        kind: "consent",
        prompt_as_shown: "OK to share my name and contact with the partner",
        value: false,
        answer_text: "No",
      },
    ];
    expect(await answersOf(registrationId)).toEqual(expected);

    // A ticked box reads Yes; unanswered optional questions store nothing.
    const { data: other } = await register(eventId, {
      [ids.gettingThere]: options.own,
      [ids.share]: true,
      [ids.leavingFrom]: "   ",
      [ids.extras]: [],
    });
    expect(await answersOf(other as string)).toEqual([
      expect.objectContaining({ question_id: ids.gettingThere }),
      expect.objectContaining({
        question_id: ids.share,
        value: true,
        answer_text: "Yes",
      }),
    ]);

    // Rename every question and option the answer above quotes.
    const renamed = questions.map((q) => ({
      ...q,
      prompt: `${q.prompt} (renamed)`,
      options: q.options?.map((o) => ({ ...o, label: `${o.label}!` })),
    }));
    expect((await saveQuestions(eventId, renamed)).error).toBeNull();
    expect(await answersOf(registrationId)).toEqual(expected);
  });
});

/** A signed-in account linked to a person of the seeded tenant. */
async function constituent() {
  const email = uniqueEmail(`questions-my-${run}`);
  const { data: user, error: userError } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (userError) throw userError;
  createdUsers.push(user.user!.id);
  const { data: person, error } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      source_type: "other",
      name: `Questions Registrant ${run}`,
      email,
      auth_user_id: user.user!.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  createdPeople.push(person.id as string);
  return signIn(email);
}

function registerMyself(
  client: SupabaseClient,
  eventId: string,
  answers?: unknown,
) {
  return client.rpc("register_myself_for_event", {
    p_event_id: eventId,
    p_party_size: 1,
    p_ip_address: uniqueIp(),
    ...(answers === undefined ? {} : { p_answers: answers }),
  });
}

describe("the registrant's own answers", () => {
  test("register_myself_for_event takes them under the same rules", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    const client = await constituent();

    expect(
      (
        await registerMyself(client, eventId, {
          [ids.gettingThere]: options.drive,
        })
      ).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect(await registrationsOf(eventId)).toBe(0);

    const { data: id, error } = await registerMyself(client, eventId, {
      [ids.gettingThere]: options.drive,
      [ids.seats]: 4,
      [ids.share]: true,
    });
    expect(error).toBeNull();
    expect(
      (await answersOf(id as string)).map((row) => [
        row.question_id,
        row.answer_text,
      ]),
    ).toEqual([
      [ids.gettingThere, "Driving, can offer seats"],
      [ids.seats, "4"],
      [ids.share, "Yes"],
    ]);
    await service
      .from("event_registrations")
      .delete()
      .eq("id", id as string);
  });

  test("reads back and changes them on their own registration only, until the event ends", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    const client = await constituent();
    const { data: id, error } = await registerMyself(client, eventId, {
      [ids.gettingThere]: options.ride,
    });
    expect(error).toBeNull();
    const registrationId = id as string;

    const mine = async (as: SupabaseClient = client) => {
      const { data, error: readError } = await as.rpc(
        "my_registration_questions",
        { p_registration_id: registrationId },
      );
      if (readError) throw readError;
      return (data ?? []) as MyQuestionRow[];
    };

    // Every current question, answered or not.
    const rows = await mine();
    expect(
      rows.map((row) => [row.question_id, row.value, row.answer_text]),
    ).toEqual([
      [ids.gettingThere, options.ride, "Need a ride"],
      [ids.seats, null, null],
      [ids.leavingFrom, null, null],
      [ids.extras, null, null],
      [ids.share, null, null],
    ]);
    expect(rows.every((row) => row.editable)).toBe(true);

    const set = (answers: unknown, as: SupabaseClient = client) =>
      as.rpc("set_my_registration_answers", {
        p_registration_id: registrationId,
        p_answers: answers,
      });

    // Held to required, like registering.
    expect(
      (await set({ [ids.gettingThere]: options.drive })).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect((await set({})).error?.message).toBe("EVENT_ANSWERS_REQUIRED");
    expect(
      (await set({ [ids.gettingThere]: options.drive, [ids.seats]: 9 })).error
        ?.message,
    ).toBe("EVENT_ANSWERS_INVALID");
    // A refusal leaves the old answers as they were.
    expect((await answersOf(registrationId)).map((r) => r.answer_text)).toEqual(
      ["Need a ride"],
    );

    expect(
      (
        await set({
          [ids.gettingThere]: options.drive,
          [ids.seats]: 2,
          [ids.share]: true,
        })
      ).error,
    ).toBeNull();
    expect(
      (await answersOf(registrationId)).map((row) => row.answer_text),
    ).toEqual(["Driving, can offer seats", "2", "Yes"]);

    // An answer left out is cleared.
    expect((await set({ [ids.gettingThere]: options.own })).error).toBeNull();
    expect(
      (await answersOf(registrationId)).map((row) => row.answer_text),
    ).toEqual(["Making my own way"]);

    // Nobody else's registration, and nothing to say whether it exists.
    const other = await constituent();
    expect(
      (await set({ [ids.gettingThere]: options.ride }, other)).error?.message,
    ).toBe("REGISTRATION_NOT_FOUND");
    expect(await mine(other)).toEqual([]);
    expect(
      (await answersOf(registrationId)).map((row) => row.answer_text),
    ).toEqual(["Making my own way"]);

    // A change of the registrant's own is stamped for staff (#1591).
    const { data: stamped } = await service
      .from("event_registrations")
      .select("answers_changed_at")
      .eq("id", registrationId)
      .single();
    expect(stamped?.answers_changed_at).not.toBeNull();

    // Not closed with the registration window (#1591): changing an answer
    // takes no place, so it stays open until the event ends.
    await adminClient
      .from("events")
      .update({ registration_enabled: false })
      .eq("id", eventId);
    expect((await mine()).every((row) => row.editable)).toBe(true);
    expect((await set({ [ids.gettingThere]: options.ride })).error).toBeNull();

    await adminClient
      .from("events")
      .update({
        starts_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", eventId);
    expect(
      (await set({ [ids.gettingThere]: options.drive })).error?.message,
    ).toBe("EVENT_ENDED");
    expect((await mine()).every((row) => !row.editable)).toBe(true);

    await service.from("event_registrations").delete().eq("id", registrationId);
  });
});

describe("the staff path", () => {
  test("is not held to required, is held to well-formed, and needs events: manage", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    const { data: registration, error } = await adminClient
      .from("event_registrations")
      .insert({ event_id: eventId, name: "Walk-in", email: "", party_size: 1 })
      .select("id")
      .single();
    if (error) throw error;

    const set = (answers: unknown, as: SupabaseClient = adminClient) =>
      as.rpc("set_registration_answers", {
        p_registration_id: registration.id,
        p_answers: answers,
      });

    // A driver whose seat count nobody asked.
    expect((await set({ [ids.gettingThere]: options.drive })).error).toBeNull();
    expect(await answersOf(registration.id)).toEqual([
      expect.objectContaining({
        question_id: ids.gettingThere,
        answer_text: "Driving, can offer seats",
      }),
    ]);
    expect(
      (await set({ [ids.leavingFrom]: "x".repeat(501) })).error?.message,
    ).toBe("EVENT_ANSWERS_INVALID");
    expect((await set({})).error).toBeNull();
    expect(await answersOf(registration.id)).toEqual([]);

    expect(
      (
        await adminClient.rpc("set_registration_answers", {
          p_registration_id: uuid(),
          p_answers: {},
        })
      ).error?.message,
    ).toBe("REGISTRANT_NOT_FOUND");

    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    expect(
      (await set({ [ids.gettingThere]: options.own }, volunteer)).error,
    ).not.toBeNull();
    expect(await answersOf(registration.id)).toEqual([]);
  });
});

describe("who can read the tables", () => {
  test("anon reads neither table directly, nor writes them; nobody writes them directly", async () => {
    const { eventId, ids, options } = await eventWithQuestions();
    expect(
      (await register(eventId, { [ids.gettingThere]: options.own })).error,
    ).toBeNull();

    for (const table of [
      "event_registration_questions",
      "event_registration_answers",
    ] as const) {
      const { data } = await anon.from(table).select("id").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    for (const table of [
      "event_registration_questions",
      "event_registration_answers",
    ] as const) {
      const { data } = await noAccess
        .from(table)
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);
      expect(data ?? []).toEqual([]);
    }

    const { error } = await adminClient
      .from("event_registration_questions")
      .insert({ event_id: eventId, kind: "short_text", prompt: "Sneaky" });
    expect(error).not.toBeNull();

    expect((await saveQuestions(eventId, [], anon)).error).not.toBeNull();
    expect((await questionsOf(eventId)).length).toBe(5);
  });

  test("the public view shows the current questions of published public events only, without shares_contact", async () => {
    const { eventId, ids } = await eventWithQuestions();
    const { data, error } = await anon
      .from("public_event_registration_questions")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order");
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id)).toEqual([
      ids.gettingThere,
      ids.seats,
      ids.leavingFrom,
      ids.extras,
      ids.share,
    ]);
    expect(Object.keys(data![0]).sort()).toEqual(
      [
        // #1742
        "allow_other",
        "event_id",
        "help",
        "id",
        "kind",
        "max_value",
        "min_value",
        "options",
        // #1699
        "place_allow_other",
        "place_granularity",
        "prompt",
        "required",
        "show_if",
        "sort_order",
      ].sort(),
    );
    expect(
      (
        await anon
          .from("public_event_registration_questions")
          .select("shares_contact")
          .limit(1)
      ).error,
    ).not.toBeNull();

    // A draft or private event's questions stay out.
    for (const overrides of [
      { status: "draft" as const },
      { visibility: "private" as const },
    ]) {
      const hiddenEvent = await event(overrides);
      const q = uuid();
      expect(
        (
          await saveQuestions(hiddenEvent, [
            { id: q, kind: "short_text", prompt: "Hidden" },
          ])
        ).error,
      ).toBeNull();
      const { data: hidden } = await anon
        .from("public_event_registration_questions")
        .select("id")
        .eq("event_id", hiddenEvent);
      expect(hidden ?? []).toEqual([]);
    }
  });
});

// #1742. The rider profile's shape, as event questions: a discipline, a level
// for each sport shown by it, and a park question shown when either level is
// past first time; a mountain with "Other".
describe("any-of conditions, option keys and hints, and Other (#1742)", () => {
  async function profileEvent() {
    const eventId = await event();
    const o = {
      ski: uuid(),
      board: uuid(),
      both: uuid(),
      skiFirst: uuid(),
      skiAdvanced: uuid(),
      skiOld: uuid(),
      boardFirst: uuid(),
      boardAdvanced: uuid(),
      hunter: uuid(),
      belleayre: uuid(),
    };
    const ids = {
      discipline: uuid(),
      skiLevel: uuid(),
      boardLevel: uuid(),
      park: uuid(),
      mountain: uuid(),
    };
    const questions: QuestionInput[] = [
      {
        id: ids.discipline,
        kind: "single_choice",
        prompt: "Discipline",
        options: [
          { id: o.ski, label: "Ski", key: "ski" },
          { id: o.board, label: "Snowboard", key: "snowboard" },
          { id: o.both, label: "Both", key: "both" },
        ],
      },
      {
        id: ids.skiLevel,
        kind: "single_choice",
        prompt: "Ski level",
        options: [
          { id: o.skiFirst, label: "First time", key: "first_time" },
          {
            id: o.skiAdvanced,
            label: "Advanced",
            key: "advanced",
            hint: "  Blacks, any conditions ",
          },
          { id: o.skiOld, label: "Old level", archived: true },
        ],
        show_if: { question_id: ids.discipline, option_ids: [o.ski, o.both] },
      },
      {
        id: ids.boardLevel,
        kind: "single_choice",
        prompt: "Snowboard level",
        options: [
          { id: o.boardFirst, label: "First time", key: "first_time" },
          { id: o.boardAdvanced, label: "Advanced", key: "advanced" },
        ],
        show_if: {
          any: [{ question_id: ids.discipline, option_ids: [o.board, o.both] }],
        },
      },
      {
        id: ids.park,
        kind: "short_text",
        prompt: "Park riding",
        required: true,
        show_if: {
          any: [
            { question_id: ids.skiLevel, option_ids: [o.skiAdvanced] },
            { question_id: ids.boardLevel, option_ids: [o.boardAdvanced] },
          ],
        },
      },
      {
        id: ids.mountain,
        kind: "single_choice",
        prompt: "Preferred mountain",
        allow_other: true,
        options: [
          { id: o.hunter, label: "Hunter" },
          { id: o.belleayre, label: "Belleayre" },
        ],
      },
    ];
    const { error } = await saveQuestions(eventId, questions);
    if (error) throw error;
    return { eventId, ids, o, questions };
  }

  test("saves keys, trimmed hints, archived options, Other and any-of over a conditional question", async () => {
    const { eventId, ids, o } = await profileEvent();
    const saved = await questionsOf(eventId);
    const byId = new Map(saved.map((row) => [row.id, row]));

    expect(byId.get(ids.skiLevel)!.options).toEqual([
      { id: o.skiFirst, label: "First time", key: "first_time" },
      {
        id: o.skiAdvanced,
        label: "Advanced",
        key: "advanced",
        hint: "Blacks, any conditions",
      },
      { id: o.skiOld, label: "Old level", archived: true },
    ]);
    expect(byId.get(ids.park)!.show_if).toEqual({
      any: [
        { question_id: ids.skiLevel, option_ids: [o.skiAdvanced] },
        { question_id: ids.boardLevel, option_ids: [o.boardAdvanced] },
      ],
    });
    const { data } = await adminClient
      .from("event_registration_questions")
      .select("id, allow_other")
      .eq("event_id", eventId);
    expect(
      Object.fromEntries((data ?? []).map((row) => [row.id, row.allow_other])),
    ).toMatchObject({ [ids.mountain]: true, [ids.discipline]: false });
  });

  test("refuses bad keys and hints, too few offered options, and Other off a single choice", async () => {
    const eventId = await event();
    const option = (label: string, extra: object = {}) => ({
      id: uuid(),
      label,
      ...extra,
    });
    const choice = (options: unknown[], extra: object = {}) => [
      {
        id: uuid(),
        kind: "single_choice",
        prompt: "Pick",
        options,
        ...extra,
      },
    ];
    const refusal = async (questions: unknown) =>
      (await saveQuestions(eventId, questions)).error?.message;

    for (const options of [
      [option("A", { key: "same" }), option("B", { key: "same" })],
      [option("A", { key: "Not A Code" }), option("B")],
      [option("A", { key: "1st" }), option("B")],
      [option("A", { hint: "x".repeat(121) }), option("B")],
      [option("A", { archived: "yes" }), option("B")],
      [option("A", { key: 7 }), option("B")],
      [option("A"), option("B"), option("C", { archived: true })].map(
        (item, i) => (i === 0 ? { ...item, archived: true } : item),
      ),
    ]) {
      expect(await refusal(choice(options))).toBe(
        "EVENT_QUESTIONS_OPTIONS_INVALID",
      );
    }
    // Two offered and one archived is fine; Other is kept only on a single
    // choice.
    expect(
      await refusal(
        choice([option("A"), option("B"), option("C", { archived: true })]),
      ),
    ).toBeUndefined();
    const multi = uuid();
    expect(
      await refusal([
        {
          id: multi,
          kind: "multi_choice",
          prompt: "Days",
          allow_other: true,
          options: [option("Sat"), option("Sun")],
        },
      ]),
    ).toBeUndefined();
    const { data } = await adminClient
      .from("event_registration_questions")
      .select("allow_other")
      .eq("id", multi)
      .single();
    expect(data?.allow_other).toBe(false);
  });

  test("a hidden question counts as unanswered down the chain", async () => {
    const { eventId, ids, o } = await profileEvent();

    // Advanced on skis: park is shown, and required.
    expect(
      (
        await register(eventId, {
          [ids.discipline]: o.ski,
          [ids.skiLevel]: o.skiAdvanced,
        })
      ).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    // Either sport counts.
    const { data: both, error } = await register(eventId, {
      [ids.discipline]: o.both,
      [ids.skiLevel]: o.skiFirst,
      [ids.boardLevel]: o.boardAdvanced,
      [ids.park]: "Some",
    });
    expect(error).toBeNull();
    expect(
      (await answersOf(both as string)).map((row) => row.question_id),
    ).toEqual([ids.discipline, ids.skiLevel, ids.boardLevel, ids.park]);

    // Snowboard only, first time: the ski level sent anyway is hidden, so
    // it neither shows park nor is kept, and park is not required.
    const { data: board, error: boardError } = await register(eventId, {
      [ids.discipline]: o.board,
      [ids.skiLevel]: o.skiAdvanced,
      [ids.boardLevel]: o.boardFirst,
      [ids.park]: "Lots",
    });
    expect(boardError).toBeNull();
    expect(
      (await answersOf(board as string)).map((row) => row.question_id),
    ).toEqual([ids.discipline, ids.boardLevel]);
  });

  test("an archived option is refused in a new answer and kept in one that had it", async () => {
    const { eventId, ids, o } = await profileEvent();
    const answers = { [ids.discipline]: o.ski, [ids.skiLevel]: o.skiOld };
    expect((await register(eventId, answers)).error?.message).toBe(
      "EVENT_ANSWERS_INVALID",
    );

    // An answer from before the option was archived.
    const { data: registration, error } = await adminClient
      .from("event_registrations")
      .insert({ event_id: eventId, name: "Before", email: "", party_size: 1 })
      .select("id")
      .single();
    if (error) throw error;
    const { error: insertError } = await service
      .from("event_registration_answers")
      .insert({
        tenant_id: tenantId,
        registration_id: registration.id,
        question_id: ids.skiLevel,
        kind: "single_choice",
        prompt_as_shown: "Ski level",
        sort_order: 1,
        value: o.skiOld,
        answer_text: "Old level",
      });
    if (insertError) throw insertError;

    const set = (next: unknown) =>
      adminClient.rpc("set_registration_answers", {
        p_registration_id: registration.id,
        p_answers: next,
      });
    expect((await set(answers)).error).toBeNull();
    expect(await answersOf(registration.id)).toContainEqual(
      expect.objectContaining({
        question_id: ids.skiLevel,
        value: o.skiOld,
        answer_text: "Old level",
      }),
    );
    // Once changed away, it is gone for good.
    expect(
      (await set({ [ids.discipline]: o.ski, [ids.skiLevel]: o.skiFirst }))
        .error,
    ).toBeNull();
    expect((await set(answers)).error?.message).toBe("EVENT_ANSWERS_INVALID");
  });

  test("Other is stored as its words where allowed, and refused elsewhere", async () => {
    const { eventId, ids } = await profileEvent();
    const { data: id, error } = await register(eventId, {
      [ids.mountain]: { other: "  Jay Peak " },
    });
    expect(error).toBeNull();
    expect(await answersOf(id as string)).toEqual([
      expect.objectContaining({
        question_id: ids.mountain,
        value: { other: "Jay Peak" },
        answer_text: "Jay Peak",
      }),
    ]);

    for (const answers of [
      { [ids.mountain]: { other: "x".repeat(201) } },
      { [ids.mountain]: { other: 7 } },
      { [ids.mountain]: { place_id: uuid() } },
      { [ids.discipline]: { other: "Sledding" } },
    ]) {
      expect((await register(eventId, answers)).error?.message).toBe(
        "EVENT_ANSWERS_INVALID",
      );
    }
  });

  test("a condition stored bare, before #1742, still applies", async () => {
    const { eventId, ids, options: o } = await eventWithQuestions();
    // Rewrite the stored any-of back to the bare form a pre-#1742 save wrote.
    const { error } = await service
      .from("event_registration_questions")
      .update({
        show_if: { question_id: ids.gettingThere, option_ids: [o.drive] },
      })
      .eq("id", ids.seats);
    if (error) throw error;

    expect(
      (await register(eventId, { [ids.gettingThere]: o.drive })).error?.message,
    ).toBe("EVENT_ANSWERS_REQUIRED");
    expect(
      (await register(eventId, { [ids.gettingThere]: o.ride })).error,
    ).toBeNull();
  });
});
