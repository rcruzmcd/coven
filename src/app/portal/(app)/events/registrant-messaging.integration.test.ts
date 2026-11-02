// Integration coverage for writing to event registrants from the portal
// (#1317): the permission gates on all three actions, the sentences they
// refuse with, the read policy on `outbound_messages` -- which is data-driven
// off each row's own module, so a queue whose module is `events` has to be
// exercised against a real database rather than a mock -- and the two things
// an announcement has that no earlier adopter of #1203's primitive did: a
// per-recipient dedupe key, and rows that share a `batch_id`.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { freezeClock } from "../../../../../test/frozen-clock";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  unprivilegedActors,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));
mock.module("server-only", () => ({}));

// The announcement action schedules its sends with after() (#1317). This file
// imports the action directly, so there is no request scope and Next's real
// after() would throw. Everything else in next/server is kept, so the mock
// cannot surprise another file sharing this process.
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

/** Settles everything an action scheduled, and reports how much there was. */
async function drainAfterTasks() {
  const scheduled = afterTasks.length;
  await Promise.all(afterTasks.splice(0));
  return scheduled;
}

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventRegistrantsAction,
  resendEventRegistrationConfirmationAction,
  sendEventAnnouncementAction,
  sendEventRegistrantMessageAction,
} = await import("./registrants-actions");
const { EVENT_REGISTRATION_RECORD_TYPE, EVENT_ANNOUNCEMENT_KIND } =
  await import("@/lib/outbound-messages");
const { MAX_ANNOUNCEMENT_RECIPIENTS } =
  await import("@/lib/event-announcements");

const service = serviceRoleClient();
const DENIED = { error: "You don't have permission to perform this action." };
const NO_EMAIL = {
  error: "This registration has no email address to write to.",
};

// Two lists, drained in this order. `people` is referenced by
// `event_registrations`, so a person deleted before the event they registered
// for takes a 23503 and stays behind; the registrations go when the event
// does, and only then is there nothing pointing at the person.
const eventCleanups: (() => Promise<void>)[] = [];
const personCleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  revalidatePathMock.mockClear();
  afterTasks.splice(0);
  // Everything but the seeded gear message, which the isolation case below
  // reads as the other module's row.
  await service
    .from("outbound_messages")
    .delete()
    .neq("id", "eeeeeeee-0000-4000-8000-000000003001");
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", [
      "staff_message",
      EVENT_ANNOUNCEMENT_KIND,
      "event_registration_confirmation",
    ]);
});

afterAll(async () => {
  for (const cleanup of eventCleanups) await cleanup();
  for (const cleanup of personCleanups) await cleanup();
});

/**
 * An event with one registration on it, seeded through the admin client rather
 * than the public RPC -- which adds capacity and deadline validation this file
 * is not about. The `people` row is real, because that is the ordinary shape
 * of a registration and the one the confirmation resend needs.
 */
async function newRegistration(
  overrides: {
    email?: string | null;
    personId?: string | null;
    checkedIn?: boolean;
  } = {},
): Promise<{ eventId: string; registrationId: string; email: string }> {
  const event = await createPublishedEvent({ visibility: "public" });
  eventCleanups.unshift(event.cleanup);
  const registration = await addRegistration(event.id, overrides);
  return { eventId: event.id, ...registration };
}

async function addRegistration(
  eventId: string,
  overrides: {
    email?: string | null;
    personId?: string | null;
    checkedIn?: boolean;
    name?: string;
  } = {},
): Promise<{ registrationId: string; email: string }> {
  let personId = overrides.personId;
  if (personId === undefined) {
    const person = await createPerson();
    personCleanups.unshift(person.cleanup);
    personId = person.id;
  }
  const email =
    overrides.email === undefined
      ? uniqueEmail("registrant")
      : (overrides.email ?? "");

  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: personId,
      name: overrides.name ?? "Integration Test Registrant",
      email,
      party_size: 1,
      checked_in_at: overrides.checkedIn ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { registrationId: data.id as string, email };
}

function message(
  registrationId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    messageId: crypto.randomUUID(),
    registrationId,
    subject: "About Saturday",
    body: "Parking is on the north side; come to the red door.",
    ...overrides,
  };
}

function announcement(
  eventId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    batchId: crypto.randomUUID(),
    eventId,
    audience: "everyone" as const,
    subject: "The road is closed",
    body: "Take Route 28 instead. We start at ten either way.",
    ...overrides,
  };
}

describe("sendEventRegistrantMessageAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await sendEventRegistrantMessageAction(message(crypto.randomUUID())),
    ).toEqual({ error: "You must be signed in to message a registrant." });
  });

  test("refuses a session without events:manage", async () => {
    // The door staff case: `events: view` reads the list and cannot write to
    // the people on it on the organization's letterhead.
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await sendEventRegistrantMessageAction(message(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("an organizer sends, and it joins the registration's history", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const input = message(registration.registrationId);
    expect(await sendEventRegistrantMessageAction(input)).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/events");

    const { data } = await service
      .from("outbound_messages")
      .select(
        "id, to_email, module, record_type, record_id, status, kind, batch_id, delivery_id",
      )
      .eq("record_id", registration.registrationId)
      .single();
    expect(data).toMatchObject({
      id: input.messageId,
      to_email: registration.email,
      module: "events",
      record_type: EVENT_REGISTRATION_RECORD_TYPE,
      status: "sent",
      kind: "staff_message",
      // Null: a message to one person is not part of an announcement, and the
      // event-level card is exactly the rows where this is set.
      batch_id: null,
    });
    expect(data!.delivery_id).not.toBeNull();
  });

  test("one composition sends one email, whatever the client does", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const input = message(registration.registrationId);

    expect(await sendEventRegistrantMessageAction(input)).toEqual({
      success: true,
    });
    expect(await sendEventRegistrantMessageAction(input)).toEqual({
      error:
        "That message has already gone out. Reopen the composer to send another.",
    });

    const { count } = await service
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", registration.registrationId);
    expect(count).toBe(1);
  });

  test("says what is wrong instead of sending nothing quietly", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventRegistrantMessageAction(
        message(registration.registrationId, { subject: " " }),
      ),
    ).toEqual({ error: "Write a subject." });
    expect(
      await sendEventRegistrantMessageAction(
        message(registration.registrationId, { messageId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "Reopen the message and try again." });
    expect(
      await sendEventRegistrantMessageAction(message(crypto.randomUUID())),
    ).toEqual({ error: "This registration could not be found." });
  });

  test("an anonymized registration is refused, not sent to nobody", async () => {
    // What run_retention_purge's rule C leaves behind: the name replaced, the
    // address blanked in place, the person unlinked. The column is NOT NULL,
    // so blank rather than absent is the shape this has to answer for.
    const registration = await newRegistration();
    await service
      .from("event_registrations")
      .update({ name: "Removed", email: "", person_id: null })
      .eq("id", registration.registrationId);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventRegistrantMessageAction(
        message(registration.registrationId),
      ),
    ).toEqual(NO_EMAIL);
    expect(
      await resendEventRegistrationConfirmationAction(
        registration.registrationId,
      ),
    ).toEqual(NO_EMAIL);
  });

  test("a registration with no people row can still be written to", async () => {
    // sendStaffMessage() has taken a null person_id since #1204's contact
    // messages, and findDeliveryId() then takes its `.is(person_id, null)`
    // branch -- which is the only reason the history row keeps its link to the
    // ledger for somebody who is not in the directory.
    const registration = await newRegistration({ personId: null });
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventRegistrantMessageAction(
        message(registration.registrationId),
      ),
    ).toEqual({ success: true });

    const { data } = await service
      .from("outbound_messages")
      .select("person_id, delivery_id, status")
      .eq("record_id", registration.registrationId)
      .single();
    expect(data!.person_id).toBeNull();
    expect(data!.status).toBe("sent");
    expect(data!.delivery_id).not.toBeNull();
  });
});

describe("resendEventRegistrationConfirmationAction", () => {
  test("refuses a session without events:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await resendEventRegistrationConfirmationAction(crypto.randomUUID()),
    ).toEqual(DENIED);
  });

  test("sends a second copy, records it as a receipt, and is idempotent in the minute", async () => {
    // Both calls in one clock minute, which the second one's refusal needs.
    freezeClock();
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await resendEventRegistrationConfirmationAction(
        registration.registrationId,
      ),
    ).toEqual({ success: true });

    const { data } = await service
      .from("outbound_messages")
      .select("kind, status, subject, body, delivery_id, batch_id")
      .eq("record_id", registration.registrationId)
      .single();
    expect(data!.kind).toBe("event_registration_confirmation");
    expect(data!.status).toBe("sent");
    // The rendered email's own subject, so the card shows what arrived rather
    // than the fallback this action carries for a send that rendered nothing.
    expect(data!.subject).not.toBe("Your registration");
    // No body: the organization wrote this one, and the renderer is where it
    // lives.
    expect(data!.body).toBe("");
    expect(data!.batch_id).toBeNull();
    // The suffix the action minted has to be the one the sender claimed, or
    // the history row loses its link to the ledger (#1310).
    expect(data!.delivery_id).not.toBeNull();

    // Twice inside the minute is one email, and says so.
    expect(
      await resendEventRegistrationConfirmationAction(
        registration.registrationId,
      ),
    ).toEqual({
      error: "The confirmation has already been resent in the last minute.",
    });
  });
});

describe("sendEventAnnouncementAction", () => {
  test("refuses a session without events:manage", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await sendEventAnnouncementAction(announcement(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("reaches everybody once, and the rows share a batch", async () => {
    const first = await newRegistration();
    const second = await addRegistration(first.eventId);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const input = announcement(first.eventId);
    expect(await sendEventAnnouncementAction(input)).toEqual({
      success: true,
      recipients: 2,
    });
    expect(await drainAfterTasks()).toBe(1);

    const { data } = await service
      .from("outbound_messages")
      .select("record_id, batch_id, kind, module, record_type, status, subject")
      .in("record_id", [first.registrationId, second.registrationId]);

    expect(data).toHaveLength(2);
    for (const row of data!) {
      expect(row).toMatchObject({
        batch_id: input.batchId,
        kind: EVENT_ANNOUNCEMENT_KIND,
        module: "events",
        // The registration's own id, not the event's: a registrant's history
        // shows the announcements they received beside anything written to
        // them personally, with no union.
        record_type: EVENT_REGISTRATION_RECORD_TYPE,
        status: "sent",
        subject: input.subject,
      });
    }
    expect(new Set(data!.map((row) => row.record_id))).toEqual(
      new Set([first.registrationId, second.registrationId]),
    );
  });

  test("a retried send mails nobody twice, per registration", async () => {
    // The key is `event_announcement:<registrationId>:<batchId>`. One key for
    // the whole batch would dedupe against nothing for a registration with a
    // null person_id -- Postgres treats NULLs in a unique index as distinct --
    // and those people would get a second copy.
    const registration = await newRegistration({ personId: null });
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const input = announcement(registration.eventId);
    expect(await sendEventAnnouncementAction(input)).toMatchObject({
      success: true,
    });
    await drainAfterTasks();
    expect(await sendEventAnnouncementAction(input)).toMatchObject({
      success: true,
    });
    await drainAfterTasks();

    const { count } = await service
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", registration.registrationId);
    expect(count).toBe(1);
  });

  test("the audience filters on the check-in ledger", async () => {
    const arrived = await newRegistration({ checkedIn: true });
    const expected = await addRegistration(arrived.eventId);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventAnnouncementAction(
        announcement(arrived.eventId, { audience: "not_checked_in" }),
      ),
    ).toEqual({ success: true, recipients: 1 });
    await drainAfterTasks();

    const { data } = await service
      .from("outbound_messages")
      .select("record_id")
      .not("batch_id", "is", null);
    expect(data!.map((row) => row.record_id)).toEqual([
      expected.registrationId,
    ]);
  });

  test("two registrations on one address get one email", async () => {
    const first = await newRegistration();
    // Same address, different case and padding: collapsed on
    // lower(trim(email)), and the first registration is the one that carries
    // the send.
    await addRegistration(first.eventId, {
      email: `  ${first.email.toUpperCase()}  `,
    });
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventAnnouncementAction(announcement(first.eventId)),
    ).toEqual({ success: true, recipients: 1 });
    await drainAfterTasks();

    const { data } = await service
      .from("outbound_messages")
      .select("record_id")
      .not("batch_id", "is", null);
    expect(data!.map((row) => row.record_id)).toEqual([first.registrationId]);
  });

  test("a registration with no address is excluded, not mailed", async () => {
    const withAddress = await newRegistration();
    await addRegistration(withAddress.eventId, { email: "", personId: null });
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventAnnouncementAction(announcement(withAddress.eventId)),
    ).toEqual({ success: true, recipients: 1 });
  });

  test("refuses an empty audience, a bad audience and an unknown event", async () => {
    const registration = await newRegistration({ checkedIn: false });
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await sendEventAnnouncementAction(
        announcement(registration.eventId, { audience: "checked_in" }),
      ),
    ).toEqual({
      error:
        "Nobody in that audience has an email address, so there is nothing to send.",
    });
    expect(
      await sendEventAnnouncementAction(
        announcement(registration.eventId, { audience: "everybody" }),
      ),
    ).toEqual({ error: "Choose who this announcement is for." });
    expect(
      await sendEventAnnouncementAction(announcement(crypto.randomUUID())),
    ).toEqual({ error: "This event could not be found." });
    // Nothing was scheduled by any of the three.
    expect(await drainAfterTasks()).toBe(0);
  });

  test("refuses an audience over the cap, naming it", async () => {
    const first = await newRegistration();
    for (let index = 0; index < MAX_ANNOUNCEMENT_RECIPIENTS; index += 1) {
      await addRegistration(first.eventId, { personId: null });
    }
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const result = await sendEventAnnouncementAction(
      announcement(first.eventId),
    );
    expect("error" in result && result.error).toContain(
      String(MAX_ANNOUNCEMENT_RECIPIENTS),
    );
    expect(await drainAfterTasks()).toBe(0);
  });

  test("nothing sends while the organization's email switch is off", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const { data: tenant } = await service
      .from("event_registrations")
      .select("tenant_id")
      .eq("id", registration.registrationId)
      .single();
    await service.from("app_settings").upsert(
      {
        tenant_id: tenant!.tenant_id,
        key: "notifications.email_enabled",
        value: false,
      },
      { onConflict: "tenant_id,key" },
    );

    try {
      expect(
        await sendEventAnnouncementAction(announcement(registration.eventId)),
      ).toEqual({
        error:
          "Outbound email is switched off for this organization, so nothing was sent.",
      });
      expect(
        await sendEventRegistrantMessageAction(
          message(registration.registrationId),
        ),
      ).toEqual({
        error:
          "Outbound email is switched off for this organization, so nothing was sent.",
      });
      expect(await drainAfterTasks()).toBe(0);
    } finally {
      await service.from("app_settings").upsert(
        {
          tenant_id: tenant!.tenant_id,
          key: "notifications.email_enabled",
          value: true,
        },
        { onConflict: "tenant_id,key" },
      );
    }
  });
});

describe("who can read a registration's messages", () => {
  test("only a manager of the events module", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    await sendEventRegistrantMessageAction(
      message(registration.registrationId),
    );

    for (const actor of await unprivilegedActors()) {
      const { data } = await actor.client
        .from("outbound_messages")
        .select("id, subject")
        .eq("record_id", registration.registrationId);
      expect(data ?? [], actor.name).toEqual([]);
    }

    const organizer = await signInAs(SEEDED_USERS.coordinator);
    const { data: mine } = await organizer
      .from("outbound_messages")
      .select("id")
      .eq("record_id", registration.registrationId);
    expect(mine).toHaveLength(1);
  });

  test("the list action hands the history to a manager and nothing to a viewer", async () => {
    const registration = await newRegistration();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    await sendEventRegistrantMessageAction(
      message(registration.registrationId),
    );

    const asManager = await listEventRegistrantsAction(registration.eventId);
    if (!("data" in asManager)) throw new Error("expected data");
    expect(
      asManager.data.messages.byRecord[registration.registrationId],
    ).toHaveLength(1);
    expect(asManager.data.messaging).not.toBeNull();

    // `events: view` reads the registrants and none of the correspondence --
    // and is not told the Reply-To or the switch's position either, since the
    // composer it would feed is not rendered for them.
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const asViewer = await listEventRegistrantsAction(registration.eventId);
    if (!("data" in asViewer)) throw new Error("expected data");
    expect(asViewer.data.registrants.length).toBeGreaterThan(0);
    expect(asViewer.data.messages.byRecord).toEqual({});
    expect(asViewer.data.messaging).toBeNull();
  });
});
