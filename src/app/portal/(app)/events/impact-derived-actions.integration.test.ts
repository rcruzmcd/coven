// Integration test: exercises get_event_impact_derived_data (20260904030000)
// against a real local Supabase stack.
//
// The reason this needs a real stack rather than a pure-function suite: the RPC
// is `security definer` specifically so the board role -- which holds
// event_impact:view but events:none and people:none -- gets real numbers on the
// Impact card. Under plain RLS those same queries return zero rows and the card
// would quietly read "0 participants" for exactly the role that opens it to
// report. Only a real stack with real policies can catch a regression there.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  seededTenantId,
  serviceRoleClient,
  setProfileAnswers,
  signInAs,
} from "../../../../../test/integration-setup";
import { SEEDED_EVENT_IDS } from "../../../../../test/seed-fixtures";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getEventImpactDerivedAction } =
  await import("./impact-derived-actions");

// Expenses go straight in as paid: the approval workflow is not under test.
const service = serviceRoleClient();

/**
 * An event with one checked-in registrant, one volunteer, one assigned $45
 * rental code and two expenses: a paid one flagged as participant assistance
 * and an unflagged one (#1588).
 */
async function seedEvent() {
  const event = await createPublishedEvent();
  const person = await createPerson();
  const volunteer = await createPerson();

  const registration = await adminClient
    .from("event_registrations")
    .insert({
      event_id: event.id,
      name: "Checked In Rider",
      email: `rider-${event.id}@example.test`,
      person_id: person.id,
      checked_in_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (registration.error) throw registration.error;

  const signup = await adminClient
    .from("event_volunteers")
    .insert({ event_id: event.id, person_id: volunteer.id });
  if (signup.error) throw signup.error;

  const code = await adminClient.from("discount_codes").insert({
    event_id: event.id,
    code: `TEST-${event.id.slice(0, 8)}`,
    registration_id: registration.data.id,
    assigned_at: new Date().toISOString(),
    kind: "rental",
    value: 45,
  });
  if (code.error) throw code.error;

  const { data: user } = await adminClient.auth.getUser();
  const actor = {
    tenant_id: await seededTenantId(),
    created_by: user.user!.id,
    submitted_by: user.user!.id,
  };
  const expenses = await service.from("event_expenses").insert([
    {
      ...actor,
      event_id: event.id,
      description: "Rentals for riders",
      amount: 100,
      status: "paid",
      participant_assistance: true,
    },
    {
      ...actor,
      event_id: event.id,
      description: "Rentals awaiting payment",
      amount: 70,
      status: "approved",
      participant_assistance: true,
    },
    {
      ...actor,
      event_id: event.id,
      description: "Hot chocolate",
      amount: 30,
      status: "paid",
      // A bulk insert sends every key, so the default would arrive as null.
      participant_assistance: false,
    },
  ]);
  if (expenses.error) throw expenses.error;

  return {
    event,
    person,
    volunteer,
    registrationId: registration.data.id,
    cleanup: async () => {
      await service.from("event_expenses").delete().eq("event_id", event.id);
      await adminClient
        .from("discount_codes")
        .delete()
        .eq("event_id", event.id);
      await adminClient
        .from("event_volunteers")
        .delete()
        .eq("event_id", event.id);
      await adminClient
        .from("event_registrations")
        .delete()
        .eq("event_id", event.id);
      await event.cleanup();
      await person.cleanup();
      await volunteer.cleanup();
    },
  };
}

/** One of the seeded tenant's metric rows (#1746), by key. */
function metric(
  data: {
    answerMetrics:
      { key: string | null; count: number; answered: number }[] | null;
  },
  key: string,
) {
  return data.answerMetrics?.find((row) => row.key === key);
}

/** Checks the registration in again, which is what takes the snapshot. */
async function recheckIn(registrationId: string) {
  for (const checked_in_at of [null, new Date().toISOString()]) {
    const { error } = await adminClient
      .from("event_registrations")
      .update({ checked_in_at })
      .eq("id", registrationId);
    if (error) throw error;
  }
}

describe("get_event_impact_derived_data (integration)", () => {
  test("admin sees participation, volunteer and discount figures", async () => {
    const seeded = await seedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.checkedIn).toBe(1);
    expect(result.data.participants).toBe(1); // no headcount typed, so check-ins
    expect(result.data.firstTimeParticipants).toBe(1);
    expect(result.data.recurringParticipants).toBe(0);
    expect(result.data.volunteerParticipants).toBe(1);
    expect(result.data.discountCodesAssigned).toBe(1);

    await seeded.cleanup();
  });

  test("a typed headcount wins over check-ins, which stay visible as reference", async () => {
    const seeded = await seedEvent();
    const updated = await adminClient
      .from("events")
      .update({ attendance_count: 40 })
      .eq("id", seeded.event.id);
    if (updated.error) throw updated.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.participants).toBe(40);
    expect(result.data.checkedIn).toBe(1);

    await seeded.cleanup();
  });

  test("finance and board see the same numbers as admin, not RLS-blanked zeros", async () => {
    const seeded = await seedEvent();

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const asAdmin = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in asAdmin) throw new Error(asAdmin.error);

    for (const user of [SEEDED_USERS.finance, SEEDED_USERS.board]) {
      currentSupabase = await signInAs(user);
      const result = await getEventImpactDerivedAction(seeded.event.id);
      if ("error" in result) throw new Error(result.error);
      expect(result.data).toEqual(asAdmin.data);
    }

    await seeded.cleanup();
  });

  // #1577: the seeded past event hands out one $15 pullover to one person.
  test("people served reads the event's distributions, for board as for admin", async () => {
    for (const user of [SEEDED_USERS.admin, SEEDED_USERS.board]) {
      currentSupabase = await signInAs(user);
      const result = await getEventImpactDerivedAction(SEEDED_EVENT_IDS.past);
      if ("error" in result) throw new Error(result.error);
      expect(result.data.peopleServed).toEqual({
        distributed: 1,
        recipients: 1,
        value: 15,
      });
    }
  });

  test("an event with nothing distributed serves nobody", async () => {
    const seeded = await seedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.peopleServed).toEqual({
      distributed: 0,
      recipients: 0,
      value: 0,
    });
    await seeded.cleanup();
  });

  // Issue #653, on profile questions since #1746: the beginner figure reads
  // the level snapshotted at check-in, and only falls back to the current
  // answer where no snapshot was taken.
  test("beginner participants follow the check-in snapshot, not later edits", async () => {
    const seeded = await seedEvent();
    await setProfileAnswers(seeded.person.id, {
      riding_discipline: "snowboard",
      snowboard_level: "beginner",
    });
    await recheckIn(seeded.registrationId);

    // The person has since moved on; the event's figure must not.
    await setProfileAnswers(seeded.person.id, {
      riding_discipline: "snowboard",
      snowboard_level: "advanced",
    });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);

    expect(metric(result.data, "beginner_participants")).toMatchObject({
      count: 1,
      answered: 1,
    });

    await seeded.cleanup();
  });

  test("with no snapshot the current answer still counts", async () => {
    const seeded = await seedEvent();

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const before = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in before) throw new Error(before.error);
    expect(metric(before.data, "beginner_participants")?.answered).toBe(0);

    // Answered after the event, the way the person form or the door would
    // for somebody nobody asked at the time.
    await setProfileAnswers(seeded.person.id, {
      riding_discipline: "ski",
      ski_level: "beginner",
    });

    const after = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in after) throw new Error(after.error);
    expect(metric(after.data, "beginner_participants")).toMatchObject({
      count: 1,
      answered: 1,
    });

    await seeded.cleanup();
  });

  // #1588: the last typed impact figures, derived.
  test("derives rental subsidies and assistance from codes and paid expenses", async () => {
    const seeded = await seedEvent();
    for (const user of [SEEDED_USERS.admin, SEEDED_USERS.board]) {
      currentSupabase = await signInAs(user);
      const result = await getEventImpactDerivedAction(seeded.event.id);
      if ("error" in result) throw new Error(result.error);
      expect(result.data.rentalSubsidies).toBe(1);
      // $45 code + $0 given out + $100 paid assistance; the approved and
      // unflagged expenses are not counted.
      expect(result.data.assistance).toEqual({
        discountCodes: 45,
        distributions: 0,
        expenses: 100,
        total: 145,
      });
    }
    await seeded.cleanup();
  });

  test("a cancelled registrant's code is not counted", async () => {
    const seeded = await seedEvent();
    const cancelled = await adminClient
      .from("event_registrations")
      .update({
        // A cancelled registration can't also be checked in.
        checked_in_at: null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "not_attending",
      })
      .eq("id", seeded.registrationId);
    if (cancelled.error) throw cancelled.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.discountCodesAssigned).toBe(0);
    expect(result.data.rentalSubsidies).toBe(0);
    expect(result.data.assistance?.discountCodes).toBe(0);
    await seeded.cleanup();
  });

  test("an auto-assign event's codes are not subsidy or assistance", async () => {
    const seeded = await seedEvent();
    const autoAssign = await adminClient
      .from("events")
      .update({ auto_assign_discount_codes: true })
      .eq("id", seeded.event.id);
    if (autoAssign.error) throw autoAssign.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.data.discountCodesAssigned).toBe(1);
    expect(result.data.rentalSubsidies).toBe(0);
    expect(result.data.assistance?.total).toBe(100);
    await seeded.cleanup();
  });

  // Seeded with `any`, which is what the rider columns counted: a first
  // time on either board counts, even beside a beginner level on the other.
  test("first time on snow counts a first_time level on either discipline", async () => {
    const seeded = await seedEvent();
    await setProfileAnswers(seeded.person.id, {
      riding_discipline: "both",
      ski_level: "first_time",
      snowboard_level: "beginner",
    });
    await recheckIn(seeded.registrationId);

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);
    expect(metric(result.data, "first_time_on_snow")?.count).toBe(1);
    expect(metric(result.data, "beginner_participants")?.count).toBe(1);
    await seeded.cleanup();
  });

  test("a role with no events or impact access is refused", async () => {
    const seeded = await seedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await getEventImpactDerivedAction(seeded.event.id)).toEqual({
      error: "Could not load the computed figures. Please try again.",
    });

    await seeded.cleanup();
  });
});
