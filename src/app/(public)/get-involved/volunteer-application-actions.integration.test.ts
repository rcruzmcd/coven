// Integration test: exercises the real submitVolunteerApplicationAction
// against a real local Supabase stack (submit_volunteer_application RPC,
// honeypot, per-email dedup, per-IP rate limiting). anon has no direct
// access to volunteer_applications, so the RPC is the only observable
// enforcement point -- a mocked client can't catch a regression in any of
// these checks. Requires `bun run db:start && bun run db:reset` first; run
// via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  deleteVolunteerApplications,
  findVolunteerApplications,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import { VOLUNTEER_APPLICATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

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

const { submitVolunteerApplicationAction } =
  await import("./volunteer-application-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Every email a test submits, cleaned up afterwards (along with the `people`
// row the RPC resolves behind each application). Deleting by email is a
// no-op for the cases that expect no row.
const submittedEmails: string[] = [];
function applicantEmail(tag: string) {
  const email = uniqueEmail(tag);
  submittedEmails.push(email);
  return email;
}

afterEach(async () => {
  // Settle the scheduled sends before deleting their rows, so a notify still
  // in flight cannot race the cleanup it is reading through.
  await drainAfterTasks();
  // Both sends (#1069): the staff notice and the applicant's own confirmation.
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", [
      "volunteer_application",
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    ]);
  while (submittedEmails.length) {
    await deleteVolunteerApplications(submittedEmails.pop()!);
  }
});

/**
 * Opts the seeded admin -- the only account holding volunteers:manage -- in to
 * the volunteer-application notice for the duration of one test, so the case
 * below can tell "sent nothing" apart from "nobody was listening". The gate
 * matrix itself is covered in
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

describe("submitVolunteerApplicationAction (integration)", () => {
  test("stores pronouns on the application and on the person record", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("pronouns");

    const result = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email, pronouns: "  they/them  " }),
    );
    expect(result).toMatchObject({ success: true });

    const [application] = await findVolunteerApplications(email);
    expect(application.pronouns).toBe("they/them");

    const { data: person } = await adminClient
      .from("people")
      .select("pronouns")
      .eq("id", application.person_id as string)
      .single();
    expect(person?.pronouns).toBe("they/them");
  });

  test("stores an application and returns its reference code", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("happy-path");

    const result = await submitVolunteerApplicationAction(
      formData({
        name: "Jamie Rivera",
        email,
        phone: "555-0100",
        roleInterest: "Ride Buddy",
        availability: "Weekends",
      }),
    );

    // The code is what the applicant later types into the status lookup, so
    // it has to be the one actually persisted, not a throwaway.
    expect(result).toMatchObject({ success: true });
    const referenceCode = (result as { referenceCode: string }).referenceCode;
    expect(referenceCode).toMatch(/^[A-Z2-9]{8}$/);

    const applications = await findVolunteerApplications(email);
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      name: "Jamie Rivera",
      phone: "555-0100",
      role_interest: "Ride Buddy",
      availability: "Weekends",
      reference_code: referenceCode,
      status: "new",
    });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("honeypot");

    const result = await submitVolunteerApplicationAction(
      formData({
        name: "A Bot",
        email,
        company: "Definitely A Company",
      }),
    );

    // The RPC hands back a freshly generated (but unstored) code so probing
    // bots learn nothing was rejected -- only a DB check catches this.
    expect(result).toMatchObject({ success: true });
    expect(await findVolunteerApplications(email)).toHaveLength(0);
  });

  test("rejects a second application from the same email within a day", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("already-submitted");

    const first = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email }),
    );
    expect(first).toMatchObject({ success: true });

    // Case-insensitive on purpose: the RPC's dedup lowercases both sides, so
    // a re-submission with different casing must not slip a duplicate in.
    const second = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email: email.toUpperCase() }),
    );

    expect(second).toEqual({
      error:
        "We already have a recent application from this email — we'll be in touch soon.",
      code: "ALREADY_SUBMITTED",
    });
    expect(await findVolunteerApplications(email)).toHaveLength(1);
  });

  test("rejects an email the RPC considers invalid but the parser let through", async () => {
    currentIp = uniqueIp();

    // The form parser only requires an "@"; the RPC additionally requires a
    // dot-suffixed domain. This asserts the RPC's stricter check is the
    // authoritative one and that its error code reaches the user.
    const result = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email: "jamie@example" }),
    );

    expect(result).toEqual({
      error: "A valid email is required.",
      code: "INVALID_EMAIL",
    });
    expect(await findVolunteerApplications("jamie@example")).toHaveLength(0);
  });

  test("rate-limits repeated submissions from the same IP", async () => {
    currentIp = uniqueIp();
    // A fresh email each time, so it's the per-IP window (5 per 15 minutes)
    // being exercised here and not the per-email dedup.
    for (let i = 0; i < 5; i++) {
      const result = await submitVolunteerApplicationAction(
        formData({
          name: "Repeat Applicant",
          email: applicantEmail(`rate-${i}`),
        }),
      );
      expect(result).toMatchObject({ success: true });
    }

    const blockedEmail = applicantEmail("rate-5");
    const limited = await submitVolunteerApplicationAction(
      formData({ name: "Repeat Applicant", email: blockedEmail }),
    );

    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
      code: "RATE_LIMITED",
    });
    expect(await findVolunteerApplications(blockedEmail)).toHaveLength(0);
  });

  test("tells the volunteer queue about a real application, and not about a bot", async () => {
    await withAdminOptedIn("volunteer_application", async () => {
      currentIp = uniqueIp();
      const result = await submitVolunteerApplicationAction(
        formData({
          name: "Robin Vale",
          email: applicantEmail("notify"),
          roleInterest: "Trip lead",
        }),
      );
      expect(result).toMatchObject({ success: true });

      // Scheduled, not awaited: the applicant's reference code does not wait
      // on it.
      expect(await drainAfterTasks()).toBe(1);
      expect(await deliveryCount("volunteer_application")).toBe(1);

      currentIp = uniqueIp();
      await submitVolunteerApplicationAction(
        formData({
          name: "A Bot",
          email: applicantEmail("notify-honeypot"),
          company: "Definitely A Company",
        }),
      );

      // The RPC answers a filled honeypot with a reference code for a row it
      // never inserted, so the send is scheduled and finds nothing to announce.
      expect(await drainAfterTasks()).toBe(1);
      expect(await deliveryCount("volunteer_application")).toBe(1);
    });
  });
});

// #1069. The action's own half of the applicant's confirmation: that it is
// scheduled beside the staff notice, and against the right person. What the
// message says is unit-tested.
describe("submitVolunteerApplicationAction confirmation", () => {
  test("emails the applicant their reference code, whoever is listening", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("confirm-applicant");

    const result = await submitVolunteerApplicationAction(
      formData({ name: "Confirmed Applicant", email }),
    );
    expect(result).toMatchObject({ success: true });

    // Scheduled, not awaited: nothing about it may reach the applicant, so it
    // has to be drained before the ledger is read.
    await drainAfterTasks();

    const { data: person } = await service
      .from("people")
      .select("id")
      .eq("email", email)
      .single();
    const { data: rows } = await service
      .from("notification_deliveries")
      .select("person_id, dedupe_key, status")
      .eq("kind", VOLUNTEER_APPLICATION_CONFIRMATION_KIND);

    expect(rows).toHaveLength(1);
    expect(rows![0].person_id).toBe(person!.id);
    expect(rows![0].status).toBe("sent");

    // Nobody opted in to the staff notice here, and the applicant still hears.
    const [application] = await findVolunteerApplications(email);
    expect(rows![0].dedupe_key).toBe(
      `${VOLUNTEER_APPLICATION_CONFIRMATION_KIND}:${application.id}`,
    );
  });

  test("schedules nothing for a filled honeypot", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("confirm-honeypot");

    const result = await submitVolunteerApplicationAction(
      formData({ name: "Bot", email, company: "Acme Spam Co" }),
    );
    expect(result).toMatchObject({ success: true });

    await drainAfterTasks();

    const { data: rows } = await service
      .from("notification_deliveries")
      .select("id")
      .eq("kind", VOLUNTEER_APPLICATION_CONFIRMATION_KIND);
    expect(rows).toEqual([]);
  });
});
