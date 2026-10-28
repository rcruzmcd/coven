// Integration test for the place breakdowns (#1701): place_regions(), and
// get_event_place_breakdown() / get_program_place_reach() counting place
// answers by place and region, leaving cancelled registrations out, and
// refusing a caller without the permission.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  SEEDED_USERS,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";
import type { PlaceCountRow } from "./place-breakdown";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);

const cleanups: (() => Promise<void>)[] = [];
const registeredEmails: string[] = [];
const ids: Record<string, string> = {};
const questionId = crypto.randomUUID();
let eventId = "";
let programId = "";

async function placeId(key: string) {
  const { data, error } = await service.rpc("place_key_id", { p_key: key });
  if (error) throw error;
  return data as string;
}

async function register(answer: unknown): Promise<string> {
  const email = uniqueEmail(`breakdown-${run}`);
  registeredEmails.push(email);
  const { error } = await anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Breakdown Tester",
    p_email: email,
    p_phone: "555-0100",
    p_party_size: 1,
    p_notes: "",
    p_ip_address: uniqueIp(),
    p_answers: { [questionId]: answer },
  });
  if (error) throw error;
  const { data } = await service
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .eq("email", email)
    .single();
  return data!.id;
}

beforeAll(async () => {
  for (const [name, key] of Object.entries({
    brooklyn: "county:36047",
    essex: "county:34013",
    montclair: "cousub:3401347500",
    newark: "place:3451000",
    williamsburg: "nta:BK0102",
  })) {
    ids[name] = await placeId(key);
  }

  const fixture = await createPublishedEvent({ name: `Breakdown ${run}` });
  cleanups.push(fixture.cleanup);
  eventId = fixture.id;
  const { error } = await adminClient.rpc("save_event_registration_questions", {
    p_event_id: eventId,
    p_questions: [
      {
        id: questionId,
        kind: "place",
        prompt: "Where are you coming from?",
        place_granularity: "locality",
      },
    ],
  });
  if (error) throw error;

  await register({ place_id: ids.brooklyn });
  await register({ place_id: ids.brooklyn });
  await register({ place_id: ids.montclair });
  await register({ place_id: ids.newark });
  await register({ other: "Philadelphia" });
  const cancelled = await register({ place_id: ids.newark });
  const { error: cancelError } = await service
    .from("event_registrations")
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "not_attending",
    })
    .eq("id", cancelled);
  if (cancelError) throw cancelError;

  const { data: program, error: programError } = await adminClient
    .from("programs")
    .insert({ name: `Breakdown program ${run}` })
    .select("id")
    .single();
  if (programError) throw programError;
  programId = program.id;
  cleanups.push(async () => {
    await service.from("programs").delete().eq("id", programId);
  });
  const { error: linkError } = await adminClient
    .from("event_programs")
    .insert({ event_id: eventId, program_id: programId });
  if (linkError) throw linkError;
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  await service.from("people").delete().in("email", registeredEmails);
});

function countsByPlace(rows: PlaceCountRow[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.place_label ?? "other",
      { region: row.region_label, registrations: row.registrations },
    ]),
  );
}

describe("place_regions", () => {
  test("puts a place in its county or borough, and a region in itself", async () => {
    const { data, error } = await anon.rpc("place_regions", {
      p_place_ids: [ids.montclair, ids.williamsburg, ids.brooklyn],
    });
    expect(error).toBeNull();
    const rows = data as { place_id: string; region_id: string }[];
    const byId = new Map(rows.map((row) => [row.place_id, row]));
    expect(byId.get(ids.montclair)?.region_id).toBe(ids.essex);
    expect(byId.get(ids.williamsburg)?.region_id).toBe(ids.brooklyn);
    expect(byId.get(ids.brooklyn)?.region_id).toBe(ids.brooklyn);
  });
});

describe("get_event_place_breakdown", () => {
  test("counts registrations by place and region, Other apart, cancelled left out", async () => {
    const { data, error } = await adminClient.rpc("get_event_place_breakdown", {
      p_event_id: eventId,
    });
    expect(error).toBeNull();
    const rows = data as PlaceCountRow[];
    expect(rows.every((row) => row.question_id === questionId)).toBe(true);
    expect(countsByPlace(rows)).toEqual({
      "Brooklyn, NY": { region: "Brooklyn, NY", registrations: 2 },
      "Montclair Twp, Essex Co., NJ": {
        region: "Essex County, NJ",
        registrations: 1,
      },
      "Newark, Essex Co., NJ": { region: "Essex County, NJ", registrations: 1 },
      other: { region: null, registrations: 1 },
    });
  });

  test("is read by the board on event_impact, and refused without it", async () => {
    const board = await signInAs(SEEDED_USERS.board);
    const allowed = await board.rpc("get_event_place_breakdown", {
      p_event_id: eventId,
    });
    expect(allowed.error).toBeNull();
    expect((allowed.data as PlaceCountRow[]).length).toBe(4);

    const noRole = await signInAs(SEEDED_USERS.noAccess);
    const denied = await noRole.rpc("get_event_place_breakdown", {
      p_event_id: eventId,
    });
    expect(denied.error).not.toBeNull();

    const anonDenied = await anon.rpc("get_event_place_breakdown", {
      p_event_id: eventId,
    });
    expect(anonDenied.error).not.toBeNull();
  });
});

describe("get_program_place_reach", () => {
  test("counts the program's events' place answers", async () => {
    const { data, error } = await adminClient.rpc("get_program_place_reach", {
      p_program_id: programId,
    });
    expect(error).toBeNull();
    const rows = data as PlaceCountRow[];
    expect(rows.reduce((sum, row) => sum + row.registrations, 0)).toBe(5);
  });

  test("is refused without programs_reports", async () => {
    const noRole = await signInAs(SEEDED_USERS.noAccess);
    const { error } = await noRole.rpc("get_program_place_reach", {
      p_program_id: programId,
    });
    expect(error).not.toBeNull();
  });
});
