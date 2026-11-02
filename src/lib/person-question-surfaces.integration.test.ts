// Integration test for the reads behind the profile-question asking surfaces
// (#1744, part of #1409): public_event_person_questions() for registration
// step 2 and my_person_questions() for /my/details and a signed-in
// registrant's pre-fill. Requires `bun run db:start && bun run db:reset`; run
// via `bun run test:integration`.
//
// Questions are tenant-wide, so each test saves the full set it needs and
// afterAll removes whatever this file left on the seeded tenant.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createProgram,
  createPublishedEvent,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
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
const createdEmails: string[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  await clearQuestions();
  while (cleanups.length) await cleanups.pop()!();
  if (createdEmails.length) {
    await service.from("people").delete().in("email", createdEmails);
  }
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  await restoreModule();
});

async function clearQuestions() {
  await service.from("person_answers").delete().eq("tenant_id", tenantId);
  await service.from("person_questions").delete().eq("tenant_id", tenantId);
}

async function saved(questions: object[]) {
  const { error } = await adminClient.rpc("save_person_questions", {
    p_questions: questions,
  });
  if (error) throw error;
}

async function event(overrides: { registration_enabled?: boolean } = {}) {
  const fixture = await createPublishedEvent({
    name: `Surfaces ${run}`,
    ...overrides,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function asked(eventId: string) {
  const { data, error } = await anon.rpc("public_event_person_questions", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as { id: string }[];
}

/** A signed-in constituent linked to their own record. */
async function constituent() {
  const email = uniqueEmail(`surfaces-${run}`);
  const { data: user, error: userError } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (userError) throw userError;
  createdUsers.push(user.user!.id);
  createdEmails.push(email);
  const { data, error } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      source_type: "other",
      name: `Surfaces Constituent ${run}`,
      email,
      auth_user_id: user.user!.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { client: await signIn(email), personId: data.id as string };
}

type MyRow = {
  id: string;
  value: unknown;
  answer_text: string | null;
  ask_on_my_details: boolean;
};

const registrationOnly = () => ({
  id: uuid(),
  kind: "short_text",
  prompt: "How did you hear about us?",
  ask_after_registration: true,
  ask_on_my_details: false,
});
const myDetailsOnly = () => ({
  id: uuid(),
  kind: "number",
  prompt: "Household size",
  min_value: 1,
  ask_after_registration: false,
  ask_on_my_details: true,
});
const staffOnly = () => ({
  id: uuid(),
  kind: "short_text",
  prompt: "Staff notes on experience",
  ask_after_registration: false,
  ask_on_my_details: false,
});

describe("public_event_person_questions (registration step 2)", () => {
  test("returns the questions asked after registering, to anon, without answers", async () => {
    const after = registrationOnly();
    await saved([after, myDetailsOnly(), staffOnly()]);
    const rows = await asked(await event());

    expect(rows.map((row) => row.id)).toEqual([after.id]);
    expect(rows[0]).not.toHaveProperty("value");
    expect(rows[0]).not.toHaveProperty("answer_text");
    await clearQuestions();
  });

  test("honours program scopes through the event's programs", async () => {
    const program = await createProgram();
    cleanups.push(program.cleanup);
    const everywhere = registrationOnly();
    const scoped = { ...registrationOnly(), program_ids: [program.id] };
    await saved([everywhere, scoped]);

    const outside = await event();
    expect((await asked(outside)).map((row) => row.id)).toEqual([
      everywhere.id,
    ]);

    const inside = await event();
    const link = await adminClient
      .from("event_programs")
      .insert({ event_id: inside, program_id: program.id });
    if (link.error) throw link.error;
    expect((await asked(inside)).map((row) => row.id)).toEqual([
      everywhere.id,
      scoped.id,
    ]);
    await clearQuestions();
  });

  test("asks nothing without registration, or with the module off", async () => {
    await saved([registrationOnly()]);
    expect(await asked(await event({ registration_enabled: false }))).toEqual(
      [],
    );
    const open = await event();
    await withModule(tenantId, "person_questions", false, async () => {
      expect(await asked(open)).toEqual([]);
    });
    expect(await asked(uuid())).toEqual([]);
    await clearQuestions();
  });
});

describe("my_person_questions (/my/details and pre-fill)", () => {
  test("returns the caller's own questions and answers, never staff-only ones", async () => {
    const after = registrationOnly();
    const mine = myDetailsOnly();
    const staff = staffOnly();
    await saved([after, mine, staff]);
    const { client, personId } = await constituent();
    const { error: setError } = await adminClient.rpc("set_person_answers", {
      p_person_id: personId,
      p_answers: {
        [after.id]: "A friend",
        [mine.id]: 4,
        [staff.id]: "Confident",
      },
    });
    if (setError) throw setError;

    const { data, error } = await client.rpc("my_person_questions");
    if (error) throw error;
    expect(
      (data as MyRow[]).map((row) => [
        row.id,
        row.value,
        row.answer_text,
        row.ask_on_my_details,
      ]),
    ).toEqual([
      [after.id, "A friend", "A friend", false],
      [mine.id, 4, "4", true],
    ]);
    await clearQuestions();
  });

  test("another constituent sees only their own answers, and anon is refused", async () => {
    const mine = myDetailsOnly();
    await saved([mine]);
    const first = await constituent();
    const second = await constituent();
    const { error: setError } = await first.client.rpc(
      "set_my_person_answers",
      { p_answers: { [mine.id]: 2 } },
    );
    if (setError) throw setError;

    const { data } = await second.client.rpc("my_person_questions");
    expect((data as MyRow[]).map((row) => [row.id, row.value])).toEqual([
      [mine.id, null],
    ]);
    expect((await anon.rpc("my_person_questions")).error).not.toBeNull();
    await clearQuestions();
  });
});
