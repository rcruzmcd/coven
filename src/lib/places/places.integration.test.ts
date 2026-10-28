// Integration test for the places reference table and the `place` question
// kind (#1699), against the real seed on a local Supabase stack:
// search_places() ranking with and without a service area, its granularities,
// NJ's repeated municipal names, the answer validation in
// apply_registration_answers(), and the service area setting; and the ZIP
// shortcut and aliases (#1700).
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const uuid = () => crypto.randomUUID();

const cleanups: (() => Promise<void>)[] = [];
const registeredEmails: string[] = [];
let previousArea: unknown = null;

const ids: Record<string, string> = {};
async function placeId(key: string) {
  const { data, error } = await service.rpc("place_key_id", { p_key: key });
  if (error) throw error;
  return data as string;
}

beforeAll(async () => {
  for (const [name, key] of Object.entries({
    nj: "state:34",
    brooklyn: "county:36047",
    essex: "county:34013",
    williamsburg: "nta:BK0102",
    montclair: "cousub:3401347500",
    newark: "place:3451000",
    tomsRiver: "cousub:3402973125",
    eastWilliamsburg: "nta:BK0104",
  })) {
    ids[name] = await placeId(key);
  }
  const { data } = await adminClient.rpc("registration_service_area");
  previousArea = data;
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  await service.from("people").delete().in("email", registeredEmails);
  const restore = Array.isArray(previousArea)
    ? previousArea.map((place: { id: string }) => place.id)
    : [];
  await adminClient.rpc("set_registration_service_area", {
    p_place_ids: restore,
  });
});

async function search(
  query: string,
  granularity: string,
  area?: string[],
): Promise<
  {
    id: string;
    kind: string;
    label: string;
    in_area: boolean;
    matched: string | null;
  }[]
> {
  const { data, error } = await anon.rpc("search_places", {
    p_query: query,
    p_granularity: granularity,
    p_area: area,
  });
  if (error) throw error;
  return data;
}

describe("places", () => {
  test("anyone can read the table and nobody can write it", async () => {
    const { data, error } = await anon
      .from("places")
      .select("label")
      .eq("id", ids.montclair)
      .single();
    expect(error).toBeNull();
    expect(data?.label).toBe("Montclair Twp, Essex Co., NJ");

    const { error: insertError } = await adminClient.from("places").insert({
      id: uuid(),
      kind: "locality",
      name: "Nowhere",
      label: "Nowhere",
      state_code: "NJ",
      source: "test",
      source_id: run,
    });
    expect(insertError).not.toBeNull();
  });

  test("has NJ's 564 municipalities", async () => {
    const { count, error } = await anon
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("kind", "locality")
      .eq("state_code", "NJ")
      .neq("place_type", "CDP");
    expect(error).toBeNull();
    // place_type is null only for Princeton, which neq leaves out.
    const { count: princeton } = await anon
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("kind", "locality")
      .eq("state_code", "NJ")
      .is("place_type", null);
    expect((count ?? 0) + (princeton ?? 0)).toBe(564);
  });
});

describe("search_places", () => {
  test("finds a town by its name, with a disambiguated label", async () => {
    const results = await search("montclair", "locality");
    expect(results[0]).toMatchObject({
      id: ids.montclair,
      label: "Montclair Twp, Essex Co., NJ",
      in_area: false,
    });
  });

  test("ranks places in the service area first, and still finds the rest", async () => {
    const without = await search("springfield", "locality");
    expect(without.every((place) => !place.in_area)).toBe(true);
    expect(without[0].label.endsWith(", NJ")).toBe(false);

    const within = await search("springfield", "locality", [ids.nj]);
    expect(
      within
        .slice(0, 2)
        .map((place) => place.label)
        .sort(),
    ).toEqual([
      "Springfield Twp, Burlington Co., NJ",
      "Springfield Twp, Union Co., NJ",
    ]);
    expect(within.slice(0, 2).every((place) => place.in_area)).toBe(true);
    expect(within.some((place) => !place.label.endsWith(", NJ"))).toBe(true);
  });

  test("tells NJ's repeated names apart", async () => {
    const labels = (await search("washington", "locality", [ids.nj])).map(
      (place) => place.label,
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Washington Twp, Morris Co., NJ",
        "Washington Twp, Warren Co., NJ",
        "Washington Boro, Warren Co., NJ",
      ]),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("matches every word, so a borough narrows a neighborhood", async () => {
    const results = await search("williamsburg brooklyn", "neighborhood");
    expect(results[0]).toMatchObject({
      id: ids.williamsburg,
      kind: "neighborhood",
      label: "Williamsburg, Brooklyn",
    });
  });

  test("lists neighborhoods only at neighborhood granularity", async () => {
    const locality = await search("williamsburg", "locality");
    expect(locality.some((place) => place.kind === "neighborhood")).toBe(false);
    const neighborhood = await search("williamsburg", "neighborhood");
    expect(neighborhood[0].id).toBe(ids.williamsburg);
  });

  test("answers 'new york' with the five boroughs", async () => {
    const results = await search("new york", "locality");
    expect(results.filter((place) => place.kind === "borough")).toHaveLength(5);
  });

  test("lists states, counties and boroughs for a service area", async () => {
    const results = await search("essex", "area");
    expect(results.map((place) => place.kind)).not.toContain("locality");
    expect(results.map((place) => place.id)).toContain(ids.essex);
  });

  test("returns nothing under two characters and refuses an unknown granularity", async () => {
    expect(await search("n", "locality")).toEqual([]);
    const { error } = await anon.rpc("search_places", {
      p_query: "newark",
      p_granularity: "street",
    });
    expect(error?.message).toBe("PLACE_GRANULARITY_INVALID");
  });
});

describe("search_places: ZIPs and aliases (#1700)", () => {
  test("anyone can read the ZIP table and nobody can write it", async () => {
    const { data, error } = await anon
      .from("place_zips")
      .select("place_id")
      .eq("zip", "07105");
    expect(error).toBeNull();
    expect(data).toEqual([{ place_id: ids.newark }]);

    const { error: insertError } = await adminClient
      .from("place_zips")
      .insert({ zip: "00000", place_id: ids.newark, share: 1 });
    expect(insertError).not.toBeNull();
  });

  test("a ZIP suggests the places it covers", async () => {
    const results = await search("07105", "locality");
    expect(results).toEqual([
      {
        id: ids.newark,
        kind: "locality",
        label: "Newark, Essex Co., NJ",
        in_area: false,
        matched: null,
      },
    ]);
  });

  test("an NYC ZIP lists its neighborhoods first, then the borough", async () => {
    const results = await search("11211", "neighborhood");
    expect(results.map((place) => place.id)).toEqual(
      expect.arrayContaining([
        ids.williamsburg,
        ids.eastWilliamsburg,
        ids.brooklyn,
      ]),
    );
    expect(results.at(-1)?.id).toBe(ids.brooklyn);

    const locality = await search("11211", "locality");
    expect(locality.map((place) => place.id)).toEqual([ids.brooklyn]);
  });

  test("a ZIP ranks the service area first, and finds no service area", async () => {
    const results = await search("11211", "neighborhood", [ids.brooklyn]);
    expect(results.every((place) => place.in_area)).toBe(true);
    expect(await search("07105", "area")).toEqual([]);
    expect(await search("00000", "locality")).toEqual([]);
  });

  test("a section's name finds its municipality and says which name matched", async () => {
    const [first] = await search("ironbound", "locality");
    expect(first).toMatchObject({
      id: ids.newark,
      label: "Newark, Essex Co., NJ",
      matched: "Ironbound",
    });
    const [newark] = await search("newark", "locality");
    expect(newark).toMatchObject({ id: ids.newark, matched: null });
  });

  test("shows the alias typed, not a longer one", async () => {
    const [first] = await search("kings", "locality");
    expect(first).toMatchObject({ id: ids.brooklyn, matched: "Kings" });
  });

  test("'township' finds a Twp, and 'borough' still finds Borough Park", async () => {
    const [toms] = await search("toms river township", "locality");
    expect(toms).toMatchObject({
      id: ids.tomsRiver,
      label: "Toms River Twp, Ocean Co., NJ",
    });
    const [montclair] = await search("montclair twp", "locality");
    expect(montclair.id).toBe(ids.montclair);
    const boroughPark = await search("borough park", "neighborhood");
    expect(boroughPark[0].label).toBe("Borough Park, Brooklyn");
  });
});

describe("place questions", () => {
  // Fresh per event: a question id belongs to one event.
  let questionIds = { from: uuid(), hood: uuid() };

  async function eventWithPlaceQuestions() {
    questionIds = { from: uuid(), hood: uuid() };
    const fixture = await createPublishedEvent({ name: `Places ${run}` });
    cleanups.push(fixture.cleanup);
    const { error } = await adminClient.rpc(
      "save_event_registration_questions",
      {
        p_event_id: fixture.id,
        p_questions: [
          {
            id: questionIds.from,
            kind: "place",
            prompt: "Which borough/city are you coming from?",
            place_granularity: "locality",
          },
          {
            id: questionIds.hood,
            kind: "place",
            prompt: "Neighborhood",
            place_granularity: "neighborhood",
            place_allow_other: false,
          },
        ],
      },
    );
    if (error) throw error;
    return fixture.id;
  }

  function register(eventId: string, answers: unknown) {
    const email = uniqueEmail(`places-${run}`);
    registeredEmails.push(email);
    return anon.rpc("register_for_event", {
      p_event_id: eventId,
      p_name: "Places Tester",
      p_email: email,
      p_phone: "555-0100",
      p_party_size: 1,
      p_notes: "",
      p_ip_address: uniqueIp(),
      p_answers: answers,
    });
  }

  test("saves the granularity and Not listed, which defaults on", async () => {
    const eventId = await eventWithPlaceQuestions();
    const { data } = await anon
      .from("public_event_registration_questions")
      .select("id, kind, place_granularity, place_allow_other")
      .eq("event_id", eventId)
      .order("sort_order");
    expect(data).toEqual([
      {
        id: questionIds.from,
        kind: "place",
        place_granularity: "locality",
        place_allow_other: true,
      },
      {
        id: questionIds.hood,
        kind: "place",
        place_granularity: "neighborhood",
        place_allow_other: false,
      },
    ]);
  });

  test("refuses an unknown granularity and a condition on a place question", async () => {
    const fixture = await createPublishedEvent({ name: `Places ${run}` });
    cleanups.push(fixture.cleanup);
    const placeId = uuid();
    const bad = await adminClient.rpc("save_event_registration_questions", {
      p_event_id: fixture.id,
      p_questions: [
        {
          id: placeId,
          kind: "place",
          prompt: "From",
          place_granularity: "street",
        },
      ],
    });
    expect(bad.error?.message).toBe("EVENT_QUESTIONS_INVALID");

    const conditional = await adminClient.rpc(
      "save_event_registration_questions",
      {
        p_event_id: fixture.id,
        p_questions: [
          { id: placeId, kind: "place", prompt: "From" },
          {
            id: uuid(),
            kind: "short_text",
            prompt: "Which part?",
            show_if: { question_id: placeId, option_ids: [uuid()] },
          },
        ],
      },
    );
    expect(conditional.error?.message).toBe(
      "EVENT_QUESTIONS_CONDITION_INVALID",
    );
  });

  test("stores the place's own label, whatever label was sent", async () => {
    const eventId = await eventWithPlaceQuestions();
    const { data: registrationId, error } = await register(eventId, {
      [questionIds.from]: { place_id: ids.brooklyn, label: "Somewhere else" },
      [questionIds.hood]: { place_id: ids.williamsburg },
    });
    expect(error).toBeNull();
    const { data: answers } = await adminClient
      .from("event_registration_answers")
      .select("question_id, value, answer_text")
      .eq("registration_id", registrationId)
      .order("sort_order");
    expect(answers).toEqual([
      {
        question_id: questionIds.from,
        value: { place_id: ids.brooklyn, label: "Brooklyn, NY" },
        answer_text: "Brooklyn, NY",
      },
      {
        question_id: questionIds.hood,
        value: { place_id: ids.williamsburg, label: "Williamsburg, Brooklyn" },
        answer_text: "Williamsburg, Brooklyn",
      },
    ]);
  });

  test("stores Not listed as typed, where the question allows it", async () => {
    const eventId = await eventWithPlaceQuestions();
    const { data: registrationId, error } = await register(eventId, {
      [questionIds.from]: { other: "  Hoboken waterfront " },
    });
    expect(error).toBeNull();
    const { data: answers } = await adminClient
      .from("event_registration_answers")
      .select("value, answer_text")
      .eq("registration_id", registrationId);
    expect(answers).toEqual([
      {
        value: { other: "Hoboken waterfront" },
        answer_text: "Hoboken waterfront",
      },
    ]);
  });

  test("refuses a place finer or coarser than the question, an unknown id and Not listed where it is off", async () => {
    const eventId = await eventWithPlaceQuestions();
    for (const answers of [
      // A neighborhood to a city/town question.
      { [questionIds.from]: { place_id: ids.williamsburg } },
      // A state is never an answer.
      { [questionIds.from]: { place_id: ids.nj } },
      { [questionIds.from]: { place_id: uuid() } },
      { [questionIds.from]: { place_id: "not-a-uuid" } },
      { [questionIds.from]: "Brooklyn" },
      { [questionIds.from]: { other: "x".repeat(201) } },
      { [questionIds.hood]: { other: "Somewhere" } },
    ]) {
      const { error } = await register(eventId, answers);
      expect(error?.message).toBe("EVENT_ANSWERS_INVALID");
    }
  });
});

describe("service area", () => {
  test("is set by staff, read by the public form, and limited to areas", async () => {
    const { error } = await adminClient.rpc("set_registration_service_area", {
      p_place_ids: [ids.brooklyn, ids.nj],
    });
    expect(error).toBeNull();

    const { data: settings } = await anon
      .from("public_registration_settings")
      .select("service_area")
      .single();
    expect([...(settings?.service_area ?? [])].sort()).toEqual(
      [ids.brooklyn, ids.nj].sort(),
    );

    const { data: area } = await adminClient.rpc("registration_service_area");
    expect((area as { label: string }[]).map((place) => place.label)).toEqual([
      "Brooklyn, NY",
      "New Jersey",
    ]);

    const invalid = await adminClient.rpc("set_registration_service_area", {
      p_place_ids: [ids.montclair],
    });
    expect(invalid.error?.message).toBe("SERVICE_AREA_INVALID");

    const denied = await anon.rpc("set_registration_service_area", {
      p_place_ids: [ids.nj],
    });
    expect(denied.error).not.toBeNull();

    await adminClient.rpc("set_registration_service_area", { p_place_ids: [] });
    const { data: cleared } = await anon
      .from("public_registration_settings")
      .select("service_area")
      .single();
    expect(cleared?.service_area).toEqual([]);
  });
});
