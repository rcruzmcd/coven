// Integration test: exercises get_program_impact_rollup_data (20260901040000)
// against a real local Supabase stack.
//
// This suite exists because of the bug it now guards. The RPC reads
// `volunteer_hours where event_id = any(...)`, but the event editor's
// Volunteers tab used to write a parallel `event_volunteer_hours` table, so
// hours logged there never reached the Program Impact Report. Nothing caught
// it: impact-rollup.test.ts is a pure-function suite over hand-built fixtures,
// and no test ever called the RPC. The consolidation in 20260904010000 fixed
// the data; this is what stops the two drifting apart again -- it logs hours
// through the real Server Action and asserts they come back out of the RPC.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createProgram,
  createPublishedEvent,
  signInAs,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";
import { computeProgramImpactRollup } from "./impact-rollup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createEventVolunteerHoursAction } =
  await import("../../events/volunteers-actions");

function hoursForm(hours: string) {
  const fd = new FormData();
  fd.set("hours", hours);
  fd.set("loggedDate", new Date().toISOString().slice(0, 10));
  fd.set("notes", "Ran the gear table");
  return fd;
}

describe("get_program_impact_rollup_data (integration)", () => {
  test("counts volunteer hours logged from the event editor's Volunteers tab", async () => {
    const program = await createProgram();
    const event = await createPublishedEvent();
    const person = await createPerson();

    const linked = await adminClient
      .from("event_programs")
      .insert({ event_id: event.id, program_id: program.id });
    if (linked.error) throw linked.error;

    const signup = await adminClient
      .from("event_volunteers")
      .insert({ event_id: event.id, person_id: person.id });
    if (signup.error) throw signup.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Baseline: a program whose event has no hours reports zero.
    const before = await adminClient.rpc("get_program_impact_rollup_data", {
      p_program_id: program.id,
    });
    if (before.error) throw before.error;
    expect(before.data.event_ids).toEqual([event.id]);
    expect(before.data.volunteer_hours).toEqual([]);

    expect(
      await createEventVolunteerHoursAction(
        event.id,
        person.id,
        hoursForm("4.5"),
      ),
    ).toEqual({ success: true });

    const after = await adminClient.rpc("get_program_impact_rollup_data", {
      p_program_id: program.id,
    });
    if (after.error) throw after.error;
    expect(after.data.volunteer_hours).toHaveLength(1);
    expect(after.data.volunteer_hours[0].event_id).toBe(event.id);

    // Through the same aggregation the report page uses, so a regression in
    // either the RPC or sumVolunteerHours fails here.
    const rollup = computeProgramImpactRollup({
      eventCount: after.data.event_ids.length,
      events: after.data.events,
      distributedMovements: after.data.distributed_movements,
      volunteerHours: after.data.volunteer_hours,
      registrations: after.data.registrations,
      checkinCounts: after.data.checkin_counts,
      discountCodes: after.data.discount_codes,
      eventVolunteers: after.data.event_volunteers,
      volunteerHourPeople: after.data.volunteer_hour_people,
      assistanceExpenses: after.data.assistance_expenses,
      offeredCodes: after.data.offered_codes,
      optionCounts: after.data.option_counts,
    });
    expect(rollup.volunteerHours).toBe(4.5);
    // The same person signed up and logged hours, so they count once.
    expect(rollup.volunteerParticipants).toBe(1);

    await adminClient.from("volunteer_hours").delete().eq("event_id", event.id);
    await adminClient
      .from("event_volunteers")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
    await person.cleanup();
    await program.cleanup();
  });
});

// The reason event_programs replaced events.program_id: an access day that
// serves two programs has to appear in both grant reports, and a single FK
// could only ever attribute it to one.
describe("get_program_impact_rollup_data with shared events (integration)", () => {
  test("counts one event toward every program it is linked to", async () => {
    const programA = await createProgram();
    const programB = await createProgram();
    const shared = await createPublishedEvent();
    const person = await createPerson();

    const linked = await adminClient.from("event_programs").insert([
      { event_id: shared.id, program_id: programA.id },
      { event_id: shared.id, program_id: programB.id },
    ]);
    if (linked.error) throw linked.error;

    const headcount = await adminClient
      .from("events")
      .update({ attendance_count: 12 })
      .eq("id", shared.id);
    if (headcount.error) throw headcount.error;

    const signup = await adminClient
      .from("event_volunteers")
      .insert({ event_id: shared.id, person_id: person.id });
    if (signup.error) throw signup.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await createEventVolunteerHoursAction(
        shared.id,
        person.id,
        hoursForm("3"),
      ),
    ).toEqual({ success: true });

    for (const program of [programA, programB]) {
      const result = await adminClient.rpc("get_program_impact_rollup_data", {
        p_program_id: program.id,
      });
      if (result.error) throw result.error;
      expect(result.data.event_ids).toEqual([shared.id]);

      const rollup = computeProgramImpactRollup({
        eventCount: result.data.event_ids.length,
        events: result.data.events,
        distributedMovements: result.data.distributed_movements,
        volunteerHours: result.data.volunteer_hours,
        registrations: result.data.registrations,
        checkinCounts: result.data.checkin_counts,
        discountCodes: result.data.discount_codes,
        eventVolunteers: result.data.event_volunteers,
        volunteerHourPeople: result.data.volunteer_hour_people,
        assistanceExpenses: result.data.assistance_expenses,
        offeredCodes: result.data.offered_codes,
        optionCounts: result.data.option_counts,
      });
      // The full figure for each program, not a split: both genuinely ran it.
      expect(rollup.volunteerHours).toBe(3);
      expect(rollup.participants).toBe(12);
    }

    await adminClient
      .from("volunteer_hours")
      .delete()
      .eq("event_id", shared.id);
    await adminClient
      .from("event_volunteers")
      .delete()
      .eq("event_id", shared.id);
    await shared.cleanup();
    await person.cleanup();
    await programA.cleanup();
    await programB.cleanup();
  });
});

// The Program Impact Report is the widest read in the programs module: one
// call returns every linked event's attendance, registrations, discount
// codes, volunteer hours and rider-profile counts. It is SECURITY DEFINER, so
// the `programs_reports:view` check inside the function is the only thing
// standing between an arbitrary signed-in session and all of it -- and every
// case above calls it as admin (#746).
describe("get_program_impact_rollup_data for unprivileged actors (integration)", () => {
  test("raises for every unprivileged session instead of returning data", async () => {
    const program = await createProgram();
    const event = await createPublishedEvent();
    const linked = await adminClient
      .from("event_programs")
      .insert({ event_id: event.id, program_id: program.id });
    if (linked.error) throw linked.error;

    // In a finally: a failed expectation below would otherwise strand the
    // event, and 20260903060000 makes an event with linked records
    // undeletable -- which resurfaces later as an unrelated seed-shape
    // row-count failure rather than as this test.
    try {
      // The program has real rows behind it, so a refusal below is the check
      // firing rather than an empty report.
      const privileged = await adminClient.rpc(
        "get_program_impact_rollup_data",
        { p_program_id: program.id },
      );
      expect(privileged.error).toBeNull();
      expect(privileged.data.event_ids).toEqual([event.id]);

      for (const { name, client } of await unprivilegedActors()) {
        const { data, error } = await client.rpc(
          "get_program_impact_rollup_data",
          { p_program_id: program.id },
        );
        expect({ actor: name, data, message: error?.message }).toEqual({
          actor: name,
          data: null,
          message: "Not authorized to view program impact reports",
        });
      }
    } finally {
      await adminClient
        .from("event_programs")
        .delete()
        .eq("event_id", event.id);
      await event.cleanup();
      await program.cleanup();
    }
  });
});
