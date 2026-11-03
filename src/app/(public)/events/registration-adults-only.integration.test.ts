// Integration test for the per-event age requirement (#1417, #1782),
// against the real RPC on a local Supabase stack: an 18+ or 21+ event refuses
// a registration without the confirmation, records it and the age with one,
// and never stores an under-18 answer; any other event ignores the
// confirmation. The age reaches the public site through public_events, and
// `adults_only` -- what main still writes -- stays in step with it.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));
// As in registration-riding.integration.test.ts: the confirmation email is
// scheduled with after(), which throws outside a request scope.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
mock.module("next/server", () => ({ ...nextServer, after: () => {} }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const fixture = await createPublishedEvent({ name: `Adults only ${run}` });
const registeredEmails: string[] = [];

async function setMinimumAge(value: 18 | 21 | null) {
  const { error } = await service
    .from("events")
    .update({ minimum_age: value })
    .eq("id", fixture.id);
  if (error) throw error;
}

afterEach(() => setMinimumAge(null));

afterAll(async () => {
  await fixture.cleanup();
  if (registeredEmails.length) {
    await service.from("people").delete().in("email", registeredEmails);
  }
});

function nextEmail() {
  const email = uniqueEmail(`adults-only-${run}`);
  registeredEmails.push(email);
  return email;
}

/** Straight at the RPC, as the public API calls it. */
async function registerDirect(fields: Record<string, unknown>) {
  const email = nextEmail();
  const { error } = await anonClient().rpc("register_for_event", {
    p_event_id: fixture.id,
    p_name: "Adults Only Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 2,
    p_notes: null,
    p_ip_address: uniqueIp(),
    ...fields,
  } as never);
  return { email, error };
}

async function stored(email: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select(
      "adults_only_confirmed_at, confirmed_minimum_age, party_includes_minor, accompanying_adult_name",
    )
    .eq("event_id", fixture.id)
    .eq("email", email)
    .single();
  if (error) throw error;
  return data;
}

describe("an 18+ event", () => {
  test("refuses a registration without the confirmation", async () => {
    await setMinimumAge(18);
    const { error } = await registerDirect({});
    expect(error?.message).toBe("ADULTS_ONLY_CONFIRMATION_REQUIRED");

    const { error: unticked } = await registerDirect({
      p_adults_only_confirmed: false,
    });
    expect(unticked?.message).toBe("ADULTS_ONLY_CONFIRMATION_REQUIRED");
  });

  test("accepts one with it and records when", async () => {
    await setMinimumAge(18);
    const before = Date.now();
    const { email, error } = await registerDirect({
      p_adults_only_confirmed: true,
    });
    expect(error).toBeNull();

    const row = await stored(email);
    expect(row.adults_only_confirmed_at).not.toBeNull();
    expect(row.confirmed_minimum_age).toBe(18);
    expect(
      new Date(row.adults_only_confirmed_at!).getTime(),
    ).toBeGreaterThanOrEqual(before - 60_000);
  });

  test("never stores an under-18 answer, whatever the tenant setting", async () => {
    await setMinimumAge(18);
    const { email, error } = await registerDirect({
      p_adults_only_confirmed: true,
      p_party_includes_minor: true,
      p_accompanying_adult_name: "Robin Rivera",
    });
    expect(error).toBeNull();
    expect(await stored(email)).toMatchObject({
      party_includes_minor: null,
      accompanying_adult_name: null,
    });
  });

  test("the form's refusal belongs to step 2", async () => {
    await setMinimumAge(18);
    currentIp = uniqueIp();
    const fd = new FormData();
    fd.set("name", "Adults Only Registrant");
    fd.set("email", nextEmail());

    const result = await registerForEventAction(fixture.id, fd);

    expect(result).toMatchObject({ step: "event" });
  });

  test("the form registers with the box ticked", async () => {
    await setMinimumAge(18);
    currentIp = uniqueIp();
    const email = nextEmail();
    const fd = new FormData();
    fd.set("name", "Adults Only Registrant");
    fd.set("email", email);
    fd.set("adultsOnlyConfirmed", "on");

    const result = await registerForEventAction(fixture.id, fd);

    expect(result).toMatchObject({ success: true });
    expect((await stored(email)).adults_only_confirmed_at).not.toBeNull();
  });
});

describe("a 21+ event", () => {
  test("refuses without the confirmation, naming the age", async () => {
    await setMinimumAge(21);
    const { error } = await registerDirect({});
    expect(error?.message).toBe("ADULTS_ONLY_CONFIRMATION_REQUIRED");
    expect(error?.details).toBe("21");

    currentIp = uniqueIp();
    const fd = new FormData();
    fd.set("name", "Adults Only Registrant");
    fd.set("email", nextEmail());
    const result = await registerForEventAction(fixture.id, fd);
    expect(result).toMatchObject({ step: "event" });
    expect("error" in result && result.error).toContain("21 or over");
  });

  test("records 21 as the age confirmed", async () => {
    await setMinimumAge(21);
    const { email, error } = await registerDirect({
      p_adults_only_confirmed: true,
      p_party_includes_minor: true,
    });
    expect(error).toBeNull();
    expect(await stored(email)).toMatchObject({
      confirmed_minimum_age: 21,
      party_includes_minor: null,
    });
  });
});

describe("any other event", () => {
  test("ignores the confirmation and records nothing", async () => {
    const { email, error } = await registerDirect({
      p_adults_only_confirmed: true,
    });
    expect(error).toBeNull();
    expect(await stored(email)).toMatchObject({
      adults_only_confirmed_at: null,
      confirmed_minimum_age: null,
    });
  });
});

describe("the setting", () => {
  test("round-trips through the portal's client and reaches public_events", async () => {
    const admin = adminClient;
    const { error } = await admin
      .from("events")
      .update({ minimum_age: 21 })
      .eq("id", fixture.id);
    expect(error).toBeNull();

    const { data: portal } = await admin
      .from("events")
      .select("minimum_age, adults_only")
      .eq("id", fixture.id)
      .single();
    expect(portal).toEqual({ minimum_age: 21, adults_only: true });

    const { data: publicRow } = await anonClient()
      .from("public_events")
      .select("minimum_age, adults_only")
      .eq("id", fixture.id)
      .single();
    expect(publicRow).toEqual({ minimum_age: 21, adults_only: true });
  });

  // Main still reads and writes `adults_only` until it ships #1782.
  test("main writing adults_only alone sets 18 or clears the age", async () => {
    const read = async () =>
      (
        await service
          .from("events")
          .select("minimum_age, adults_only")
          .eq("id", fixture.id)
          .single()
      ).data;

    await service
      .from("events")
      .update({ adults_only: true })
      .eq("id", fixture.id);
    expect(await read()).toEqual({ minimum_age: 18, adults_only: true });

    await setMinimumAge(21);
    await service
      .from("events")
      .update({ adults_only: true, name: fixture.name })
      .eq("id", fixture.id);
    expect(await read()).toEqual({ minimum_age: 21, adults_only: true });

    await service
      .from("events")
      .update({ adults_only: false })
      .eq("id", fixture.id);
    expect(await read()).toEqual({ minimum_age: null, adults_only: false });
  });
});
