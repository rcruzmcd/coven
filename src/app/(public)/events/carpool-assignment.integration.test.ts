// Registrants see their carpool assignment (#1651), against a real local
// stack: the two registrant reads, the staff read behind "Email carpool
// assignments", and the widened answers-link rule.
//
// The point of most of these is what does NOT come back: a car-mate is a
// first name, a handle and a party size, and never a phone, an email, the
// preferred contact detail, the car's notes or anyone's paid status.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);

const SECRETS = {
  phone: `555-01${run.slice(0, 2)}`,
  detail: `signal-${run}`,
  notes: `Staff note ${run}`,
};

let tenantId: string;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const createdPeople: string[] = [];

async function carpoolEvent(enabled = true) {
  const event = await createPublishedEvent({ name: `Carpool card ${run}` });
  cleanups.push(event.cleanup);
  const { error } = await service
    .from("events")
    .update({ carpools_enabled: enabled })
    .eq("id", event.id);
  if (error) throw error;
  return event.id as string;
}

async function registration(
  eventId: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await service
    .from("event_registrations")
    .insert({
      tenant_id: tenantId,
      event_id: eventId,
      name,
      email: uniqueEmail(`carpool-card-${run}`),
      phone: SECRETS.phone,
      party_size: 1,
      ...extra,
    })
    .select("id, email")
    .single();
  if (error) throw new Error(`registration: ${error.message}`);
  return { id: data.id as string, email: data.email as string };
}

async function car(eventId: string, driverId: string | null) {
  const { data, error } = await service
    .from("event_carpool_cars")
    .insert({
      tenant_id: tenantId,
      event_id: eventId,
      label: "Car 1",
      driver_registration_id: driverId,
      seats: 4,
      leaving_from: "Union Square",
      notes: SECRETS.notes,
    })
    .select("id")
    .single();
  if (error) throw new Error(`car: ${error.message}`);
  return data.id as string;
}

async function ride(eventId: string, carId: string, registrationId: string) {
  const { error } = await service.from("event_carpool_passengers").insert({
    tenant_id: tenantId,
    event_id: eventId,
    car_id: carId,
    registration_id: registrationId,
    paid_driver_at: new Date().toISOString(),
  });
  if (error) throw new Error(`passenger: ${error.message}`);
}

/** A live answers link for the registration, as the confirmation issues one. */
async function link(registrationId: string) {
  const { hash } = mintConfirmationToken();
  const { data, error } = await service.rpc("issue_registration_answer_link", {
    p_registration_id: registrationId,
    p_token_hash: hash,
    p_source: "confirmation",
  });
  if (error) throw error;
  expect(typeof data).toBe("string");
  return hash;
}

function byToken(hash: string, client: SupabaseClient = anon) {
  return client.rpc("registration_carpool_by_token", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

/** Driver Dana, passenger Pat (party of 2, no Instagram), passenger Riley. */
async function filledCar() {
  const eventId = await carpoolEvent();
  const driver = await registration(eventId, "Dana Driver", {
    instagram_handle: "dana.drives",
    has_no_instagram: false,
  });
  const pat = await registration(eventId, "Pat Passenger", {
    party_size: 2,
    has_no_instagram: true,
    preferred_contact_method: "whatsapp",
    preferred_contact_detail: SECRETS.detail,
  });
  const riley = await registration(eventId, "Riley Rider", {
    instagram_handle: "riley",
    has_no_instagram: false,
  });
  const carId = await car(eventId, driver.id);
  await ride(eventId, carId, pat.id);
  await ride(eventId, carId, riley.id);
  return { eventId, carId, driver, pat, riley };
}

type RecipientRow = {
  registration_id: string;
  signature: string;
  changed: boolean;
};

async function recipients(eventId: string): Promise<RecipientRow[]> {
  const { data, error } = await adminClient.rpc(
    "event_carpool_assignment_recipients",
    { p_event_id: eventId },
  );
  if (error) throw error;
  return data as RecipientRow[];
}

function expectNothingPrivate(value: unknown, emails: string[]) {
  const text = JSON.stringify(value);
  for (const secret of [...Object.values(SECRETS), ...emails]) {
    expect(text).not.toContain(secret);
  }
  for (const key of ["phone", "email", "preferred_contact", "notes", "paid"]) {
    expect(text).not.toContain(key);
  }
}

beforeAll(async () => {
  tenantId = await seededTenantId();
  cleanups.push(await enableModule(tenantId, "constituent_accounts"));
});

afterAll(async () => {
  await service
    .from("event_registrations")
    .delete()
    .in("person_id", createdPeople);
  await service.from("people").delete().in("id", createdPeople);
  for (const userId of createdUsers) {
    await service.auth.admin.deleteUser(userId);
  }
  for (const cleanup of cleanups.reverse()) await cleanup();
});

describe("registration_carpool_by_token", () => {
  test("a passenger sees the car, the driver and the other riders, and nothing private", async () => {
    const { pat, riley, driver } = await filledCar();
    const { data, error } = await byToken(await link(riley.id));

    expect(error).toBeNull();
    expect(data).toEqual({
      car: {
        car_label: "Car 1",
        leaving_from: "Union Square",
        role: "passenger",
        party_size: 1,
        driver: {
          first_name: "Dana",
          instagram_handle: "dana.drives",
          has_no_instagram: false,
          party_size: 1,
        },
        riders: [
          {
            first_name: "Pat",
            instagram_handle: null,
            has_no_instagram: true,
            party_size: 2,
          },
        ],
      },
      // The organization's notice, as the event sets none.
      notice: null,
    });
    expectNothingPrivate(data, [pat.email, riley.email, driver.email]);
  });

  test("the driver sees their riders and no driver line", async () => {
    const { driver, pat, riley } = await filledCar();
    const { data } = await byToken(await link(driver.id));
    const card = (data as { car: Record<string, unknown> }).car;

    expect(card.role).toBe("driver");
    expect(card.driver).toBeNull();
    expect(
      (card.riders as { first_name: string }[]).map((row) => row.first_name),
    ).toEqual(["Pat", "Riley"]);
    expectNothingPrivate(data, [pat.email, riley.email, driver.email]);
  });

  test("someone in no car yet gets a view with no car", async () => {
    const eventId = await carpoolEvent();
    const reg = await registration(eventId, "Waiting Walker");
    // An event with carpools on issues the link with no questions asked.
    const { data, error } = await byToken(await link(reg.id));
    expect(error).toBeNull();
    expect(data).toEqual({ car: null, notice: null });
  });

  test("carries the event's own carpool cost notice, or none (#1772)", async () => {
    const eventId = await carpoolEvent();
    const reg = await registration(eventId, "Notice Reader");
    const token = await link(reg.id);

    for (const notice of [["Rides are free on this trip."], []]) {
      const { error: updateError } = await service
        .from("events")
        .update({ carpool_cost_notice: notice })
        .eq("id", eventId);
      expect(updateError).toBeNull();
      const { data, error } = await byToken(token);
      expect(error).toBeNull();
      expect(data).toEqual({ car: null, notice });
    }
  });

  test("an event with carpools off gets no view, and no link without questions", async () => {
    const eventId = await carpoolEvent(false);
    const reg = await registration(eventId, "No Carpool");
    const { data, error } = await service.rpc(
      "issue_registration_answer_link",
      {
        p_registration_id: reg.id,
        p_token_hash: mintConfirmationToken().hash,
        p_source: "carpool_assignment",
      },
    );
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("an unknown token, or another tenant's site, reveals nothing", async () => {
    const { riley } = await filledCar();
    const hash = await link(riley.id);

    const unknown = await byToken(mintConfirmationToken().hash);
    expect(unknown.data).toBeNull();
    expect(unknown.error?.message).toBe("LINK_INVALID");

    const elsewhere = await byToken(
      hash,
      anonClient({ slug: `no-such-tenant-${run}` }),
    );
    expect(elsewhere.data).toBeNull();
    expect(elsewhere.error?.message).toBe("LINK_INVALID");
  });
});

describe("my_registration_carpool", () => {
  test("a linked registrant sees their own car, and nobody else's", async () => {
    const { eventId, carId } = await filledCar();
    const email = uniqueEmail(`carpool-my-${run}`);
    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    createdUsers.push(user.user!.id);
    const { data: person, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: "Morgan Mine",
        email,
        auth_user_id: user.user!.id,
      })
      .select("id")
      .single();
    if (personError) throw personError;
    createdPeople.push(person.id as string);

    const mine = await registration(eventId, "Morgan Mine", {
      person_id: person.id,
    });
    await ride(eventId, carId, mine.id);
    const someoneElse = await registration(eventId, "Not Morgan");

    const client = await signIn(email);
    const own = await client.rpc("my_registration_carpool", {
      p_registration_id: mine.id,
    });
    expect(own.error).toBeNull();
    expect(
      (own.data as { car: { car_label: string; role: string } }).car,
    ).toMatchObject({ car_label: "Car 1", role: "passenger" });

    const other = await client.rpc("my_registration_carpool", {
      p_registration_id: someoneElse.id,
    });
    expect(other.data).toBeNull();
  });
});

describe("event_carpool_assignment_recipients", () => {
  test("lists everyone in a car, and a change since the last email", async () => {
    const { eventId, carId, driver, pat, riley } = await filledCar();

    const rows = await recipients(eventId);
    expect(rows.map((row) => row.registration_id)).toEqual([
      driver.id,
      pat.id,
      riley.id,
    ]);
    expect(rows.every((row) => row.changed)).toBe(true);

    // Stamped as the sender does after a successful send.
    const { error } = await service
      .from("event_carpool_assignment_emails")
      .insert(
        rows.map((row) => ({
          tenant_id: tenantId,
          event_id: eventId,
          registration_id: row.registration_id,
          signature: row.signature,
        })),
      );
    if (error) throw error;
    const unchanged = await recipients(eventId);
    expect(unchanged.some((row) => row.changed)).toBe(false);

    // A new car-mate changes everybody's car, and the newcomer is unsent.
    const newcomer = await registration(eventId, "Nova Newcomer");
    await ride(eventId, carId, newcomer.id);
    const after = await recipients(eventId);
    expect(after.every((row) => row.changed)).toBe(true);
  });

  test("refuses anyone without events: manage", async () => {
    const { eventId } = await filledCar();
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    for (const client of [volunteer, anon]) {
      const { data, error } = await client.rpc(
        "event_carpool_assignment_recipients",
        { p_event_id: eventId },
      );
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });

  test("the stamps are unreadable outside the functions", async () => {
    const { eventId } = await filledCar();
    for (const client of [adminClient, anon]) {
      const { data } = await client
        .from("event_carpool_assignment_emails")
        .select("registration_id")
        .eq("event_id", eventId);
      expect(data ?? []).toEqual([]);
    }
  });
});
