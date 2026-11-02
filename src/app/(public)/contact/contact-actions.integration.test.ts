// Integration test: exercises the real submitContactMessageAction against a
// real local Supabase stack (submit_contact_message RPC, honeypot, rate
// limiting). anon has no direct access to contact_messages, so every check
// the RPC makes is only observable through this path -- a mocked client
// can't catch a honeypot or rate-limit regression that lives in SQL.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  anonClient,
  deleteContactMessages,
  findContactMessages,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const service = serviceRoleClient();

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

// The action schedules its notification send with after() (#742). This file
// imports the action directly, so there is no request scope and Next's real
// after() would throw -- and the notifier it schedules imports "server-only",
// which throws outside Next's bundler. Everything else in next/server is kept,
// so the mock cannot surprise another file sharing this process.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

/** Settles everything the action scheduled, and reports how much there was. */
async function drainAfterTasks() {
  const scheduled = afterTasks.length;
  await Promise.all(afterTasks.splice(0));
  return scheduled;
}

const { submitContactMessageAction } = await import("./contact-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Every email a test submits, cleaned up afterwards. Deleting by email is a
// no-op for the cases that expect no row, so tests can register an address
// before knowing whether it made it into the table.
const submittedEmails: string[] = [];
function contactEmail(tag: string) {
  const email = uniqueEmail(tag);
  submittedEmails.push(email);
  return email;
}

afterEach(async () => {
  // Settle the scheduled sends before deleting their rows, so a notify still
  // in flight cannot race the cleanup it is reading through.
  await drainAfterTasks();
  // Both sends the action schedules (#1237): the ops inbox's notice and the
  // sender's own acknowledgement.
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", ["contact_message", "contact_message_confirmation"]);
  while (submittedEmails.length) {
    await deleteContactMessages(submittedEmails.pop()!);
  }
});

/**
 * Opts the seeded admin -- the only account holding communications:manage --
 * in to the contact-message notice for the duration of one test, so the two
 * cases below can tell "sent nothing" apart from "nobody was listening".
 * The gate matrix itself is covered in
 * src/lib/notifications/submission-notifications.integration.test.ts.
 */
async function withAdminOptedIn(kind: string, body: () => Promise<void>) {
  const { data: person } = await service
    .from("people")
    .select("id")
    .eq("email", "admin@example.test")
    .single();
  const personId = person!.id as string;
  await service
    .from("person_notification_preferences")
    .upsert(
      { person_id: personId, kind, enabled: true },
      { onConflict: "tenant_id,person_id,kind" },
    );
  try {
    await body();
  } finally {
    await service
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", personId)
      .eq("kind", kind);
  }
}

async function deliveryCount(kind: string) {
  const { count } = await service
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind);
  return count ?? 0;
}

describe("submitContactMessageAction (integration)", () => {
  test("stores a message from an anonymous visitor", async () => {
    currentIp = uniqueIp();
    const email = contactEmail("happy-path");

    const result = await submitContactMessageAction(
      formData({
        name: "Jamie Rivera",
        email,
        topic: "volunteering",
        message: "I'd love to help out this season.",
      }),
    );

    expect(result).toEqual({ success: true });
    const messages = await findContactMessages(email);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      name: "Jamie Rivera",
      topic: "volunteering",
      message: "I'd love to help out this season.",
    });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const email = contactEmail("honeypot");

    const result = await submitContactMessageAction(
      formData({
        name: "A Bot",
        email,
        topic: "general",
        message: "Cheap watches.",
        company: "Definitely A Company",
      }),
    );

    // The RPC reports fake success to avoid tipping off bots, but nothing is
    // inserted -- only a DB check can catch a regression here.
    expect(result).toEqual({ success: true });
    expect(await findContactMessages(email)).toHaveLength(0);
  });

  test("rejects an email the RPC considers invalid but the parser let through", async () => {
    currentIp = uniqueIp();

    // The form parser only requires an "@"; the RPC additionally requires a
    // dot-suffixed domain. This asserts the RPC's stricter check is the
    // authoritative one and that its error code reaches the user.
    const result = await submitContactMessageAction(
      formData({
        name: "Jamie Rivera",
        email: "jamie@example",
        topic: "general",
        message: "Hello there.",
      }),
    );

    expect(result).toEqual({
      error: "A valid email is required.",
      code: "INVALID_EMAIL",
    });
    expect(await findContactMessages("jamie@example")).toHaveLength(0);
  });

  test("rate-limits repeated submissions from the same IP", async () => {
    currentIp = uniqueIp();
    // No per-email throttle on contact messages, so one address is enough to
    // walk the per-IP window (5 per 15 minutes).
    const email = contactEmail("rate-limit");

    for (let i = 0; i < 5; i++) {
      const result = await submitContactMessageAction(
        formData({
          name: "Repeat Sender",
          email,
          topic: "general",
          message: `Message ${i}`,
        }),
      );
      expect(result).toEqual({ success: true });
    }

    const limited = await submitContactMessageAction(
      formData({
        name: "Repeat Sender",
        email,
        topic: "general",
        message: "One too many",
      }),
    );

    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
      code: "RATE_LIMITED",
    });
    expect(await findContactMessages(email)).toHaveLength(5);
  });

  test("tells the ops inbox about a real submission, and not about a bot", async () => {
    await withAdminOptedIn("contact_message", async () => {
      currentIp = uniqueIp();
      const result = await submitContactMessageAction(
        formData({
          name: "Robin Vale",
          email: contactEmail("notify"),
          topic: "general",
          message: "Do you take gear donations?",
        }),
      );
      expect(result).toMatchObject({ success: true });

      // Scheduled, not awaited: the visitor's response does not wait on it.
      expect(await drainAfterTasks()).toBe(1);
      expect(await deliveryCount("contact_message")).toBe(1);

      currentIp = uniqueIp();
      await submitContactMessageAction(
        formData({
          name: "A Bot",
          email: contactEmail("notify-honeypot"),
          topic: "general",
          message: "Cheap watches.",
          company: "Definitely A Company",
        }),
      );

      // The RPC answers a filled honeypot with an id for a row it never
      // inserted, so the send is scheduled and then finds nothing to announce.
      expect(await drainAfterTasks()).toBe(1);
      expect(await deliveryCount("contact_message")).toBe(1);
    });
  });
});
