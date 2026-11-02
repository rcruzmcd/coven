// Integration test for per-tenant person profile questions (#1743, part of
// #1409), against the real RPCs on a local Supabase stack: the editor's save
// and its retirement rules, apply_person_answers() through all four write
// paths (validation, required, which questions each form has, hidden-answer
// deletion), the gates, the audit trail, merge and tenant isolation.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
//
// Questions are tenant-wide, so every test saves the full set it needs and
// afterAll removes whatever this file left on the seeded tenant.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createPerson,
  createProgram,
  createPublishedEvent,
  enableModule,
  SEEDED_USERS,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
  withModule,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const uuid = () => crypto.randomUUID();

let tenantId: string;
let restoreModule: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const registeredEmails: string[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  await clearQuestions();
  while (cleanups.length) await cleanups.pop()!();
  for (let i = 0; i < registeredEmails.length; i += 50) {
    await service
      .from("people")
      .delete()
      .in("email", registeredEmails.slice(i, i + 50));
  }
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  await restoreModule();
});

async function clearQuestions() {
  await service.from("person_answers").delete().eq("tenant_id", tenantId);
  await service.from("person_questions").delete().eq("tenant_id", tenantId);
}

type Option = { id: string; label: string; key?: string; archived?: boolean };

type QuestionInput = {
  id: string;
  key?: string;
  kind: string;
  prompt: string;
  required?: boolean;
  options?: Option[];
  show_if?: unknown;
  min_value?: number;
  ask_after_registration?: boolean;
  ask_on_my_details?: boolean;
  snapshot_at_checkin?: boolean;
  program_ids?: string[];
};

/** Chatter Snow's rider profile, as #1409 section 6 configures it. */
function rider() {
  const o = (key: string, label: string): Option => ({
    id: uuid(),
    key,
    label,
  });
  const discipline = {
    id: uuid(),
    ski: o("ski", "Ski"),
    snowboard: o("snowboard", "Snowboard"),
    both: o("both", "Both"),
  };
  const levels = () => ({
    first_time: o("first_time", "First time"),
    beginner: o("beginner", "Beginner"),
    advanced: o("advanced", "Advanced"),
  });
  const ski = { id: uuid(), ...levels() };
  const snowboard = { id: uuid(), ...levels() };
  const mountain = { id: uuid() };
  const options = (q: Record<string, unknown>) =>
    Object.values(q).filter((v): v is Option => typeof v === "object");

  const questions: QuestionInput[] = [
    {
      id: discipline.id,
      key: "riding_discipline",
      kind: "single_choice",
      prompt: "Do you ski or ride?",
      required: true,
      options: options(discipline),
      ask_after_registration: true,
      ask_on_my_details: true,
      snapshot_at_checkin: true,
    },
    {
      id: ski.id,
      key: "ski_level",
      kind: "single_choice",
      prompt: "Ski level",
      required: true,
      options: options(ski),
      show_if: {
        any: [
          {
            question_id: discipline.id,
            option_ids: [discipline.ski.id, discipline.both.id],
          },
        ],
      },
      ask_after_registration: true,
      ask_on_my_details: true,
    },
    {
      id: snowboard.id,
      key: "snowboard_level",
      kind: "single_choice",
      prompt: "Snowboard level",
      required: true,
      options: options(snowboard),
      show_if: {
        any: [
          {
            question_id: discipline.id,
            option_ids: [discipline.snowboard.id, discipline.both.id],
          },
        ],
      },
      ask_after_registration: true,
      ask_on_my_details: true,
    },
    {
      id: mountain.id,
      key: "preferred_mountain",
      kind: "short_text",
      prompt: "Home mountain",
      ask_after_registration: false,
      ask_on_my_details: true,
    },
  ];
  return { questions, discipline, ski, snowboard, mountain };
}

function save(questions: unknown, as: SupabaseClient = adminClient) {
  return as.rpc("save_person_questions", { p_questions: questions });
}

async function saved(fixture: { questions: unknown }) {
  const { error } = await save(fixture.questions);
  if (error) throw error;
}

async function questions() {
  const { data, error } = await adminClient
    .from("person_questions")
    .select(
      "id, key, kind, prompt, sort_order, options, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin, archived_at",
    )
    .order("sort_order");
  if (error) throw error;
  return data;
}

async function answersOf(personId: string) {
  const { data, error } = await adminClient
    .from("person_answers")
    .select(
      "id, question_id, kind, value, answer_text, prompt_as_shown, answered_via, registration_id",
    )
    .eq("person_id", personId);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.question_id, row]));
}

async function person() {
  const fixture = await createPerson({ name: `Profile ${run}` });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

function setPersonAnswers(
  personId: string,
  answers: unknown,
  as: SupabaseClient = adminClient,
) {
  return as.rpc("set_person_answers", {
    p_person_id: personId,
    p_answers: answers,
  });
}

async function event() {
  const fixture = await createPublishedEvent({ name: `Profile ${run}` });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function register(eventId: string) {
  const email = uniqueEmail(`profile-${run}`);
  registeredEmails.push(email);
  const { data, error } = await anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Profile Tester",
    p_email: email,
    p_phone: "555-0100",
    p_party_size: 1,
    p_notes: "",
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  const registrationId = data as string;
  const { data: row, error: rowError } = await adminClient
    .from("event_registrations")
    .select("person_id")
    .eq("id", registrationId)
    .single();
  if (rowError) throw rowError;
  return { registrationId, personId: row.person_id as string };
}

function saveRegistrant(registrationId: string, answers: unknown) {
  return anon.rpc("save_registrant_person_answers", {
    p_registration_id: registrationId,
    p_answers: answers,
    p_ip_address: uniqueIp(),
  });
}

describe("save_person_questions", () => {
  test("stores the questions in order, with keys, scopes and where asked", async () => {
    const fixture = rider();
    const program = await createProgram();
    cleanups.push(program.cleanup);
    fixture.questions[3] = {
      ...fixture.questions[3],
      program_ids: [program.id],
    };
    await saved(fixture);

    const rows = await questions();
    expect(rows.map((row) => row.key)).toEqual([
      "riding_discipline",
      "ski_level",
      "snowboard_level",
      "preferred_mountain",
    ]);
    expect(rows[0].snapshot_at_checkin).toBe(true);
    expect(rows[3].ask_after_registration).toBe(false);
    expect(rows[1].show_if).toEqual({
      any: [
        {
          question_id: fixture.discipline.id,
          option_ids: expect.arrayContaining([
            fixture.discipline.ski.id,
            fixture.discipline.both.id,
          ]),
        },
      ],
    });
    const { data: scopes } = await adminClient
      .from("person_question_scopes")
      .select("question_id, program_id");
    expect(scopes).toEqual([
      { question_id: fixture.mountain.id, program_id: program.id },
    ]);

    // Reordered and rescoped in one save.
    const reordered = [fixture.questions[3], ...fixture.questions.slice(0, 3)];
    reordered[0] = { ...reordered[0], program_ids: [] };
    expect((await save(reordered)).error).toBeNull();
    expect((await questions()).map((row) => row.key)).toEqual([
      "preferred_mountain",
      "riding_discipline",
      "ski_level",
      "snowboard_level",
    ]);
    const { count } = await adminClient
      .from("person_question_scopes")
      .select("question_id", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  test("refuses what person questions cannot be", async () => {
    const base = {
      id: uuid(),
      kind: "short_text",
      prompt: "Anything else?",
    };
    const refused = async (question: object) =>
      (await save([{ ...base, ...question }])).error?.message;

    expect(await refused({ kind: "consent" })).toBe("PERSON_QUESTIONS_INVALID");
    expect(await refused({ prompt: " " })).toBe(
      "PERSON_QUESTIONS_PROMPT_REQUIRED",
    );
    expect(await refused({ key: "Not A Key" })).toBe(
      "PERSON_QUESTIONS_KEY_INVALID",
    );
    expect(await refused({ program_ids: [uuid()] })).toBe(
      "PERSON_QUESTIONS_SCOPE_INVALID",
    );
    expect(
      (
        await save([
          { ...base, key: "same" },
          { ...base, id: uuid(), key: "same" },
        ])
      ).error?.message,
    ).toBe("PERSON_QUESTIONS_KEY_TAKEN");
    expect(
      (await save(Array.from({ length: 21 }, () => ({ ...base, id: uuid() }))))
        .error?.message,
    ).toBe("PERSON_QUESTIONS_TOO_MANY");
  });

  test("needs Profile answers at Manage", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    expect((await save([], volunteer)).error?.message).toBe(
      "Not authorized to edit profile questions",
    );
    await withModule(tenantId, "person_questions", false, async () => {
      expect((await save([])).error?.message).toBe(
        "Not authorized to edit profile questions",
      );
    });
  });

  test("retires an answered question rather than rewriting it", async () => {
    const fixture = rider();
    await saved(fixture);
    const personId = await person();
    expect(
      (
        await setPersonAnswers(personId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.ski.id]: fixture.ski.beginner.id,
        })
      ).error,
    ).toBeNull();

    // Kind is fixed once answered.
    const changed = structuredClone(fixture.questions);
    changed[1] = { ...changed[1], kind: "multi_choice" };
    expect((await save(changed)).error?.message).toBe(
      "PERSON_QUESTIONS_KIND_LOCKED",
    );

    // An option somebody chose is archived, not removed.
    const removed = structuredClone(fixture.questions);
    removed[1] = {
      ...removed[1],
      options: removed[1].options!.filter(
        (option) => option.id !== fixture.ski.beginner.id,
      ),
    };
    expect((await save(removed)).error?.message).toBe(
      "PERSON_QUESTIONS_OPTION_IN_USE",
    );
    const archived = structuredClone(fixture.questions);
    archived[1] = {
      ...archived[1],
      prompt: "Ski level (relabelled)",
      options: archived[1].options!.map((option) =>
        option.id === fixture.ski.beginner.id
          ? { ...option, archived: true }
          : option,
      ),
    };
    expect((await save(archived)).error).toBeNull();

    // The answer keeps its words, and re-saving it keeps the archived option.
    const before = await answersOf(personId);
    expect(before[fixture.ski.id].prompt_as_shown).toBe("Ski level");
    expect(
      (
        await setPersonAnswers(personId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.ski.id]: fixture.ski.beginner.id,
        })
      ).error,
    ).toBeNull();

    // Left out: answered ones archived, unanswered ones deleted; sending an
    // archived one back restores it.
    expect((await save([archived[0], archived[1]])).error).toBeNull();
    const rows = await questions();
    expect(rows.map((row) => [row.key, row.archived_at !== null])).toEqual([
      ["riding_discipline", false],
      ["ski_level", false],
    ]);
    expect((await save([archived[0]])).error).toBeNull();
    const { data: ski } = await adminClient
      .from("person_questions")
      .select("archived_at")
      .eq("id", fixture.ski.id)
      .single();
    expect(ski?.archived_at).not.toBeNull();
    expect((await save([archived[0], archived[1]])).error).toBeNull();
    expect((await questions()).every((row) => row.archived_at === null)).toBe(
      true,
    );

    // An archived question keeps its key.
    expect((await save([archived[0]])).error).toBeNull();
    expect(
      (
        await save([
          archived[0],
          { id: uuid(), kind: "short_text", prompt: "x", key: "ski_level" },
        ])
      ).error?.message,
    ).toBe("PERSON_QUESTIONS_KEY_TAKEN");

    const { data: usage } = await adminClient.rpc("person_question_usage");
    expect(usage).toContainEqual({
      question_id: fixture.ski.id,
      answers: 1,
      option_ids: [fixture.ski.beginner.id],
    });
    await clearQuestions();
  });
});

describe("apply_person_answers, through the staff form", () => {
  test("validates, stores words and deletes what a new answer hides", async () => {
    const fixture = rider();
    await saved(fixture);
    const personId = await person();

    expect(
      (
        await setPersonAnswers(personId, {
          [fixture.discipline.id]: fixture.discipline.both.id,
          [fixture.ski.id]: fixture.ski.advanced.id,
          [fixture.snowboard.id]: fixture.snowboard.first_time.id,
          [fixture.mountain.id]: "  Camelback ",
        })
      ).error,
    ).toBeNull();
    let answers = await answersOf(personId);
    expect(Object.keys(answers)).toHaveLength(4);
    expect(answers[fixture.ski.id]).toMatchObject({
      kind: "single_choice",
      value: fixture.ski.advanced.id,
      answer_text: "Advanced",
      prompt_as_shown: "Ski level",
      answered_via: "staff",
    });
    expect(answers[fixture.mountain.id].answer_text).toBe("Camelback");

    // Switching to skis hides the snowboard level, which goes.
    expect(
      (
        await setPersonAnswers(personId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.ski.id]: fixture.ski.advanced.id,
          [fixture.snowboard.id]: fixture.snowboard.first_time.id,
          [fixture.mountain.id]: "Camelback",
        })
      ).error,
    ).toBeNull();
    answers = await answersOf(personId);
    expect(answers[fixture.snowboard.id]).toBeUndefined();
    expect(answers[fixture.ski.id]).toBeDefined();

    // Staff are not held to required; an absent answer is a cleared one.
    expect(
      (await setPersonAnswers(personId, { [fixture.mountain.id]: "Blue" }))
        .error,
    ).toBeNull();
    answers = await answersOf(personId);
    expect(Object.keys(answers)).toEqual([fixture.mountain.id]);

    for (const bad of [
      { [fixture.discipline.id]: uuid() },
      { [fixture.discipline.id]: ["ski"] },
      { [uuid()]: "x" },
      { [fixture.mountain.id]: "x".repeat(501) },
      "not an object",
    ]) {
      expect((await setPersonAnswers(personId, bad)).error?.message).toBe(
        "PERSON_ANSWERS_INVALID",
      );
    }
    await clearQuestions();
  });

  test("records the change in the audit log", async () => {
    const fixture = rider();
    await saved(fixture);
    const personId = await person();
    await setPersonAnswers(personId, { [fixture.mountain.id]: "Hunter" });
    const answer = (await answersOf(personId))[fixture.mountain.id];
    const { data } = await adminClient
      .from("audit_log")
      .select("action, actor_id")
      .eq("table_name", "person_answers")
      .eq("record_id", answer.id);
    expect(data).toEqual([{ action: "insert", actor_id: expect.any(String) }]);
    await clearQuestions();
  });

  test("needs People and Profile answers at Manage, in this tenant", async () => {
    const fixture = rider();
    await saved(fixture);
    const personId = await person();
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    expect(
      (await setPersonAnswers(personId, {}, volunteer)).error?.message,
    ).toBe("Not authorized to edit profile answers");
    expect((await setPersonAnswers(uuid(), {})).error?.message).toBe(
      "PERSON_NOT_FOUND",
    );
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    await setPersonAnswers(personId, { [fixture.mountain.id]: "Hunter" });
    const { data } = await noAccess
      .from("person_answers")
      .select("id")
      .eq("person_id", personId);
    expect(data).toEqual([]);
    await clearQuestions();
  });
});

describe("save_registrant_person_answers (anonymous, after registration)", () => {
  test("holds to required, writes nothing for nothing, and never clears", async () => {
    const fixture = rider();
    await saved(fixture);
    const eventId = await event();
    const { registrationId, personId } = await register(eventId);

    // Skipped: nothing written.
    expect((await saveRegistrant(registrationId, {})).error).toBeNull();
    expect(await answersOf(personId)).toEqual({});

    // A discipline without its level is refused.
    expect(
      (
        await saveRegistrant(registrationId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
        })
      ).error?.message,
    ).toBe("PERSON_ANSWERS_REQUIRED");

    expect(
      (
        await saveRegistrant(registrationId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.ski.id]: fixture.ski.beginner.id,
        })
      ).error,
    ).toBeNull();
    let answers = await answersOf(personId);
    expect(answers[fixture.ski.id]).toMatchObject({
      answered_via: "registration",
      registration_id: registrationId,
    });

    // Not asked here: the mountain is My details and staff only.
    expect(
      (await saveRegistrant(registrationId, { [fixture.mountain.id]: "x" }))
        .error?.message,
    ).toBe("PERSON_ANSWERS_INVALID");

    // A later partial answer leaves the stored ones standing, and a stored
    // level satisfies required.
    expect(
      (
        await saveRegistrant(registrationId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.ski.id]: "",
        })
      ).error,
    ).toBeNull();
    answers = await answersOf(personId);
    expect(answers[fixture.ski.id].value).toBe(fixture.ski.beginner.id);
    await clearQuestions();
  });

  test("asks a scoped question only after an event in its programs", async () => {
    const program = await createProgram();
    cleanups.push(program.cleanup);
    const scoped = {
      id: uuid(),
      kind: "number",
      prompt: "Household size",
      min_value: 1,
      ask_after_registration: true,
      program_ids: [program.id],
    };
    expect((await save([scoped])).error).toBeNull();

    const outside = await register(await event());
    expect(
      (await saveRegistrant(outside.registrationId, { [scoped.id]: 3 })).error
        ?.message,
    ).toBe("PERSON_ANSWERS_INVALID");

    const inside = await event();
    const link = await adminClient
      .from("event_programs")
      .insert({ event_id: inside, program_id: program.id });
    if (link.error) throw link.error;
    const registration = await register(inside);
    expect(
      (await saveRegistrant(registration.registrationId, { [scoped.id]: 0 }))
        .error?.message,
    ).toBe("PERSON_ANSWERS_INVALID");
    expect(
      (await saveRegistrant(registration.registrationId, { [scoped.id]: 3 }))
        .error,
    ).toBeNull();
    expect(
      (await answersOf(registration.personId))[scoped.id].answer_text,
    ).toBe("3");
    await clearQuestions();
  });

  test("the registration is the credential, for a day, with the module on", async () => {
    const fixture = rider();
    await saved(fixture);
    const { registrationId } = await register(await event());
    const answers = { [fixture.mountain.id]: "x" };

    expect((await saveRegistrant(uuid(), answers)).error?.message).toBe(
      "PERSON_ANSWERS_UNAVAILABLE",
    );
    await withModule(tenantId, "person_questions", false, async () => {
      expect(
        (await saveRegistrant(registrationId, answers)).error?.message,
      ).toBe("SECTION_UNAVAILABLE");
    });
    const aged = await service
      .from("event_registrations")
      .update({ created_at: new Date(Date.now() - 2 * 86400000).toISOString() })
      .eq("id", registrationId);
    if (aged.error) throw aged.error;
    expect((await saveRegistrant(registrationId, answers)).error?.message).toBe(
      "PERSON_ANSWERS_UNAVAILABLE",
    );
    await clearQuestions();
  });
});

describe("set_my_person_answers (/my/details)", () => {
  async function constituent() {
    const email = uniqueEmail(`profile-my-${run}`);
    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    createdUsers.push(user.user!.id);
    registeredEmails.push(email);
    const { data, error } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: `Profile Constituent ${run}`,
        email,
        auth_user_id: user.user!.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return {
      client: await signIn(email),
      personId: data.id as string,
      userId: user.user!.id,
    };
  }

  test("writes the caller's own record, under required, naming them in the audit", async () => {
    const fixture = rider();
    await saved(fixture);
    const { client, personId, userId } = await constituent();

    expect(
      (
        await client.rpc("set_my_person_answers", {
          p_answers: { [fixture.mountain.id]: "Hunter" },
        })
      ).error?.message,
    ).toBe("PERSON_ANSWERS_REQUIRED");

    expect(
      (
        await client.rpc("set_my_person_answers", {
          p_answers: {
            [fixture.discipline.id]: fixture.discipline.snowboard.id,
            [fixture.snowboard.id]: fixture.snowboard.beginner.id,
            [fixture.mountain.id]: "Hunter",
          },
        })
      ).error,
    ).toBeNull();
    const answers = await answersOf(personId);
    expect(answers[fixture.snowboard.id].answered_via).toBe("self");

    const { data: audit } = await adminClient
      .from("audit_log")
      .select("actor_id")
      .eq("table_name", "person_answers")
      .eq("record_id", answers[fixture.snowboard.id].id);
    expect(audit).toEqual([{ actor_id: userId }]);

    const stranger = await signInAs(SEEDED_USERS.noAccess);
    expect(
      (await stranger.rpc("set_my_person_answers", { p_answers: {} })).error
        ?.message,
    ).toBe("No record to edit");
    await clearQuestions();
  });

  test("has only the questions asked on My details", async () => {
    const hidden = {
      id: uuid(),
      kind: "short_text",
      prompt: "Staff note",
      ask_on_my_details: false,
    };
    expect((await save([hidden])).error).toBeNull();
    const { client } = await constituent();
    expect(
      (
        await client.rpc("set_my_person_answers", {
          p_answers: { [hidden.id]: "x" },
        })
      ).error?.message,
    ).toBe("PERSON_ANSWERS_INVALID");
    await clearQuestions();
  });
});

describe("set_registrant_person_answers (the door)", () => {
  test("writes every current question for a registrant of this tenant", async () => {
    const fixture = rider();
    await saved(fixture);
    const { registrationId, personId } = await register(await event());
    const door = (as: SupabaseClient, id: string, answers: unknown) =>
      as.rpc("set_registrant_person_answers", {
        p_registration_id: id,
        p_answers: answers,
      });

    expect(
      (
        await door(adminClient, registrationId, {
          [fixture.discipline.id]: fixture.discipline.ski.id,
          [fixture.mountain.id]: "Windham",
        })
      ).error,
    ).toBeNull();
    expect((await answersOf(personId))[fixture.mountain.id]).toMatchObject({
      answered_via: "staff",
      registration_id: registrationId,
    });
    expect((await door(adminClient, uuid(), {})).error?.message).toBe(
      "REGISTRANT_NOT_FOUND",
    );
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    expect((await door(noAccess, registrationId, {})).error?.message).toBe(
      "Not authorized to edit registrant profile answers",
    );
    await clearQuestions();
  });
});

describe("merging two records", () => {
  test("keeps the survivor's answer and takes the duplicate's where it has none", async () => {
    const fixture = rider();
    await saved(fixture);
    const survivor = await person();
    const duplicate = await person();
    await setPersonAnswers(survivor, {
      [fixture.discipline.id]: fixture.discipline.ski.id,
      [fixture.ski.id]: fixture.ski.advanced.id,
    });
    await setPersonAnswers(duplicate, {
      [fixture.discipline.id]: fixture.discipline.snowboard.id,
      [fixture.snowboard.id]: fixture.snowboard.beginner.id,
      [fixture.mountain.id]: "Belleayre",
    });

    const { error } = await adminClient.rpc("merge_people", {
      p_survivor_id: survivor,
      p_duplicate_id: duplicate,
    });
    expect(error).toBeNull();
    const answers = await answersOf(survivor);
    expect(answers[fixture.discipline.id].value).toBe(
      fixture.discipline.ski.id,
    );
    expect(answers[fixture.mountain.id].answer_text).toBe("Belleayre");
    await clearQuestions();
  });
});

describe("tenant isolation", () => {
  let otherTenantId: string | null = null;

  // Archived the moment it exists, as item-history's suite does: a second
  // active tenant would take public_tenant_id() off its sole-active fallback
  // for every other file in the run.
  afterAll(async () => {
    if (!otherTenantId) return;
    await service
      .from("person_answers")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service
      .from("person_questions")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service.from("people").delete().eq("tenant_id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  });

  test("another tenant's questions and answers are out of reach", async () => {
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Profile Other ${run}`,
      p_slug: `profile-other-${run}`,
      p_custom_domain: `profile-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    const archived = await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);
    if (archived.error) throw archived.error;

    const question = await service
      .from("person_questions")
      .insert({
        tenant_id: otherTenantId,
        kind: "short_text",
        prompt: "Other tenant's question",
      })
      .select("id")
      .single();
    if (question.error) throw question.error;
    const other = await service
      .from("people")
      .insert({
        tenant_id: otherTenantId,
        name: `Other ${run}`,
        source_type: "individual",
      })
      .select("id")
      .single();
    if (other.error) throw other.error;
    const answer = await service.from("person_answers").insert({
      tenant_id: otherTenantId,
      person_id: other.data.id,
      question_id: question.data.id,
      kind: "short_text",
      value: "secret",
      answer_text: "secret",
      prompt_as_shown: "Other tenant's question",
      answered_via: "staff",
    });
    if (answer.error) throw answer.error;

    const { data: seen } = await adminClient
      .from("person_questions")
      .select("id")
      .eq("id", question.data.id);
    expect(seen).toEqual([]);
    const { data: seenAnswers } = await adminClient
      .from("person_answers")
      .select("id")
      .eq("tenant_id", otherTenantId);
    expect(seenAnswers).toEqual([]);

    // Their person, and their question's id, are refused here.
    expect((await setPersonAnswers(other.data.id, {})).error?.message).toBe(
      "PERSON_NOT_FOUND",
    );
    expect(
      (
        await save([
          { id: question.data.id, kind: "short_text", prompt: "Mine now" },
        ])
      ).error?.message,
    ).toBe("PERSON_QUESTIONS_INVALID");
    const mine = await person();
    expect(
      (await setPersonAnswers(mine, { [question.data.id]: "x" })).error
        ?.message,
    ).toBe("PERSON_ANSWERS_INVALID");
  });
});
