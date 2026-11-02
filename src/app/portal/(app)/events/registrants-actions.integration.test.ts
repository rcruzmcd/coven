// Integration test: exercises the real admin-side registrant Server Actions
// against a real local Supabase stack (checkPermission, then real
// `event_registrations` RLS). Public sign-up goes through the
// register_for_event() RPC (covered by
// src/app/(public)/events/event-registration-actions.integration.test.ts);
// what's covered here is the staff check-in path added in 20260824190000 --
// select on events:view, insert/update on events:manage -- which is the only
// place staff write this table directly.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  createPublishedEvent,
  signInAs,
  setProfileAnswers,
  uniqueEmail,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventRegistrantsAction,
  checkInRegistrantAction,
  undoCheckInAction,
  createWalkInCheckInAction,
  addRegistrantAction,
} = await import("./registrants-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = {
  error: {
    code: "forbidden",
    message: "You don't have permission to perform this action.",
  },
} as const;

// listEventRegistrantsAction is a read, and reads still answer
// `{ error: string }` -- the #1082 envelope covers the write paths.
const DENIED_READ = {
  error: "You don't have permission to perform this action.",
};

// A pre-existing registration to check in, seeded straight through the
// admin session rather than the public RPC (which adds capacity/deadline
// validation this file isn't about).
async function seedRegistration(eventId: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Integration Test Registrant",
      email: uniqueEmail("registrant"),
      party_size: 2,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function seedRegistrationFor(eventId: string, personId: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: personId,
      name: "Integration Test Registrant",
      email: uniqueEmail("registrant"),
      party_size: 1,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function walkInPerson(personId: string) {
  return {
    id: personId,
    name: "Integration Test Walk-in",
    email: uniqueEmail("walkin"),
    phone: null,
  };
}

describe("event registrant check-in actions (integration)", () => {
  test("requires a signed-in user to check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = anonClient();

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to check in a registrant.",
      },
    });

    await event.cleanup();
  });

  test("admin role (events manage) can list, check in, undo, and add a walk-in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      success: true,
    });

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.registrants).toHaveLength(1);
    expect(listed.data.registrants[0].checked_in_at).not.toBeNull();

    expect(await undoCheckInAction(registrationId)).toEqual({ success: true });

    const afterUndo = await listEventRegistrantsAction(event.id);
    if (!("data" in afterUndo)) throw new Error("expected data");
    expect(afterUndo.data.registrants[0].checked_in_at).toBeNull();

    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 1),
    ).toEqual({ success: true });

    const withWalkIn = await listEventRegistrantsAction(event.id);
    if (!("data" in withWalkIn)) throw new Error("expected data");
    expect(withWalkIn.data.registrants).toHaveLength(2);

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role can add a registrant without checking them in", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await addRegistrantAction(event.id, walkInPerson(person.id), 2),
    ).toEqual({ success: true });

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.registrants).toHaveLength(1);
    expect(listed.data.registrants[0].checked_in_at).toBeNull();
    expect(listed.data.registrants[0].party_size).toBe(2);

    await event.cleanup();
    await person.cleanup();
  });

  test("rejects adding a duplicate registrant for the same person/event", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const person1 = walkInPerson(person.id);

    expect(await addRegistrantAction(event.id, person1, 1)).toEqual({
      success: true,
    });
    expect(await addRegistrantAction(event.id, person1, 1)).toEqual({
      error: {
        code: "conflict",
        message: "This person already has a registration for this event.",
      },
    });

    await event.cleanup();
    await person.cleanup();
  });

  // Regression: two different people with no email on file both fell back
  // to email = '' in the insert and collided on the (event_id, email)
  // unique index - the second add would fail as though it were a duplicate
  // of the first, even though they're different people
  // (20260901010000_fix_event_registrations_blank_email_collision.sql).
  test("two different registrants with no email can both be added to the same event", async () => {
    const event = await createPublishedEvent();
    const personA = await createPerson({ name: "No Email A" });
    const personB = await createPerson({ name: "No Email B" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const noEmail = (id: string, name: string) => ({
      id,
      name,
      email: null,
      phone: null,
    });

    expect(
      await addRegistrantAction(event.id, noEmail(personA.id, "No Email A"), 1),
    ).toEqual({ success: true });
    expect(
      await addRegistrantAction(event.id, noEmail(personB.id, "No Email B"), 1),
    ).toEqual({ success: true });

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.registrants).toHaveLength(2);

    await event.cleanup();
    await personA.cleanup();
    await personB.cleanup();
  });

  test("event_coordinator role (events manage) can check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("rejects a walk-in party size below 1", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 0),
    ).toEqual({
      error: {
        code: "invalid_input",
        message: "Party size must be at least 1.",
        fields: { partySize: "Party size must be at least 1." },
      },
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list registrants but not check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.registrants).toHaveLength(1);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);
    expect(await undoCheckInAction(registrationId)).toEqual(DENIED);
    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 1),
    ).toEqual(DENIED);
    expect(
      await addRegistrantAction(event.id, walkInPerson(person.id), 1),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role (events view only) can list registrants but not check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.registrants).toHaveLength(1);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither list registrants nor check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventRegistrantsAction(event.id)).toEqual(DENIED_READ);
    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });

  // #1746, replacing the Rides column's tests (#653): the Profile column
  // reads the check-in snapshot first, and only events:manage with
  // person_answers:view sees it at all.
  test("the Profile summary is as of check-in, and only for events:manage", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await setProfileAnswers(person.id, {
      riding_discipline: "snowboard",
      snowboard_level: "beginner",
    });
    const registrationId = await seedRegistrationFor(event.id, person.id);

    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    expect(await checkInRegistrantAction(registrationId)).toEqual({
      success: true,
    });
    // Moved on since the day; the row still says what the door saw.
    await setProfileAnswers(person.id, {
      riding_discipline: "snowboard",
      snowboard_level: "advanced",
    });

    const asCoordinator = await listEventRegistrantsAction(event.id);
    if (!("data" in asCoordinator)) throw new Error("expected data");
    expect(asCoordinator.data.registrants[0].profileSummary).toBe(
      "Snowboard · Beginner",
    );

    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const asVolunteer = await listEventRegistrantsAction(event.id);
    if (!("data" in asVolunteer)) throw new Error("expected data");
    expect(asVolunteer.data.registrants[0].profileSummary).toBeNull();

    await event.cleanup();
    await person.cleanup();
  });

  test("a deactivated (former) account cannot check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });
});
