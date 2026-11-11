// Integration coverage for the event reminder job (#1652) against a real
// local Supabase stack: who is due, the claim that stops a second run (or two
// overlapping ones) sending twice, and the cancellations that send nothing.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  createSuspendedTenant,
  serviceRoleClient,
  uniqueEmail,
} from "../../../test/integration-setup";
import { EVENT_REMINDER_KIND } from "@/lib/outbound-messages";

mock.module("server-only", () => ({}));

const sent: { to: string; subject: string; text: string }[] = [];
mock.module("@/lib/email/send", () => ({
  sendEmail: async (message: { to: string; subject: string; text: string }) => {
    sent.push(message);
    return { ok: true, id: null };
  },
}));

const { runEventReminders } = await import("./event-reminders");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";
const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 1000;

type Fixture = Awaited<ReturnType<typeof createPublishedEvent>>;
const events: Fixture[] = [];
let tenantId: string;

async function reminderEvent(status: "published" | "cancelled" = "published") {
  // Starts tomorrow, two days' notice: its send time was yesterday morning.
  const event = await createPublishedEvent({
    startsAt: new Date(Date.now() + DAY).toISOString(),
  });
  events.push(event);
  const { data, error } = await service
    .from("events")
    .update({ reminder_enabled: true, reminder_days_before: 2, status })
    .eq("id", event.id)
    .select("tenant_id")
    .single();
  if (error) throw error;
  tenantId = data.tenant_id as string;
  return event;
}

async function register(
  eventId: string,
  options: { createdDaysAgo?: number; cancelled?: boolean } = {},
) {
  const email = uniqueEmail("reminder");
  const { data, error } = await service
    .from("event_registrations")
    .insert({
      tenant_id: tenantId,
      event_id: eventId,
      name: "Riley Reminder",
      email,
      party_size: 1,
      created_at: new Date(
        Date.now() - (options.createdDaysAgo ?? 5) * DAY,
      ).toISOString(),
      ...(options.cancelled
        ? {
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "not_attending",
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, email };
}

function sentTo(email: string) {
  return sent.filter((message) => message.to === email);
}

async function stamp(registrationId: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select("reminder_sent_at")
    .eq("id", registrationId)
    .single();
  if (error) throw error;
  return data.reminder_sent_at as string | null;
}

let active: { id: string; email: string };
let cancelled: { id: string; email: string };
let late: { id: string; email: string };
let onCancelledEvent: { id: string; email: string };

beforeAll(async () => {
  const event = await reminderEvent();
  active = await register(event.id);
  cancelled = await register(event.id, { cancelled: true });
  // Registered after the send time: the confirmation is close enough.
  late = await register(event.id, { createdDaysAgo: 0 });
  const cancelledEvent = await reminderEvent("cancelled");
  onCancelledEvent = await register(cancelledEvent.id);
});

afterAll(async () => {
  const ids = [active, cancelled, late, onCancelledEvent].map((r) => r.id);
  await service.from("outbound_messages").delete().in("record_id", ids);
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", EVENT_REMINDER_KIND);
  for (const event of events) await event.cleanup();
});

describe("runEventReminders (#1652)", () => {
  test("sends each due registration exactly one reminder, however often it runs", async () => {
    // Two overlapping runs, then a third after both: the claim is taken under
    // skip locked and stamped before the send.
    await Promise.all([
      runEventReminders(service, { siteUrl: SITE_URL, dailyLimit: LIMIT }),
      runEventReminders(service, { siteUrl: SITE_URL, dailyLimit: LIMIT }),
    ]);
    await runEventReminders(service, { siteUrl: SITE_URL, dailyLimit: LIMIT });

    expect(sentTo(active.email)).toHaveLength(1);
    expect(sentTo(active.email)[0].subject).toStartWith("Reminder: ");
    expect(await stamp(active.id)).not.toBeNull();

    const { data: history } = await service
      .from("outbound_messages")
      .select("kind, status, sent_by")
      .eq("record_id", active.id);
    expect(history).toEqual([
      { kind: EVENT_REMINDER_KIND, status: "sent", sent_by: null },
    ]);
  });

  test("sends nothing to a cancelled registration, a late one or a cancelled event", async () => {
    for (const registration of [cancelled, late, onCancelledEvent]) {
      expect(sentTo(registration.email)).toHaveLength(0);
      expect(await stamp(registration.id)).toBeNull();
    }
  });

  test("claims nothing once the day's budget is spent", async () => {
    const event = await reminderEvent();
    const waiting = await register(event.id);
    const summary = await runEventReminders(service, {
      siteUrl: SITE_URL,
      dailyLimit: 0,
    });
    expect(summary.claimed).toBe(0);
    expect(await stamp(waiting.id)).toBeNull();

    await runEventReminders(service, { siteUrl: SITE_URL, dailyLimit: LIMIT });
    expect(sentTo(waiting.email)).toHaveLength(1);
    await service
      .from("outbound_messages")
      .delete()
      .eq("record_id", waiting.id);
  });

  test("Planning's status counts who it goes to and who has been sent", async () => {
    const { data, error } = await adminClient
      .rpc("event_reminder_status", { p_event_id: events[0].id })
      .single<{ send_at: string; recipients: number; sent: number }>();
    expect(error).toBeNull();
    // The active registration only: not the cancelled one, not the late one.
    expect(data).toMatchObject({ recipients: 1, sent: 1 });
    expect(Date.parse(data!.send_at)).toBeLessThan(Date.now());
  });

  test("only events: manage can stamp a registration for Send reminder now", async () => {
    const { error } = await anonClient().rpc("stamp_event_reminder", {
      p_registration_id: active.id,
    });
    expect(error).not.toBeNull();
    const { data } = await adminClient.rpc("stamp_event_reminder", {
      p_registration_id: cancelled.id,
    });
    expect(data).toBe(false);
  });
});

describe("runEventReminders tenant status (#1674)", () => {
  /**
   * A due registration on a second tenant's event. Provisioned suspended
   * (#795); the control activates it only for the length of one run.
   */
  const tag = crypto.randomUUID().slice(0, 8);
  const B_EMAIL = uniqueEmail(`reminder-b-${tag}`);
  let tenantB: Awaited<ReturnType<typeof createSuspendedTenant>>;
  let bRegistrationId: string;

  beforeAll(async () => {
    tenantB = await createSuspendedTenant(`reminder-${tag}`);
    const {
      data: { user },
    } = await adminClient.auth.getUser();
    const { data: event, error: eventError } = await service
      .from("events")
      .insert({
        tenant_id: tenantB.id,
        name: `IT B Reminder Event ${tag}`,
        starts_at: new Date(Date.now() + DAY).toISOString(),
        timezone: "America/Denver",
        visibility: "public",
        status: "published",
        reminder_enabled: true,
        reminder_days_before: 2,
        created_by: user!.id,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    const { data: registration, error: registrationError } = await service
      .from("event_registrations")
      .insert({
        tenant_id: tenantB.id,
        event_id: event.id,
        name: "Riley In B",
        email: B_EMAIL,
        party_size: 1,
        created_at: new Date(Date.now() - 5 * DAY).toISOString(),
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    bRegistrationId = registration.id as string;
  });

  afterAll(async () => {
    await tenantB.cleanup([
      "outbound_messages",
      "notification_deliveries",
      "event_registrations",
      "events",
    ]);
  });

  for (const status of ["suspended", "archived"] as const) {
    test(`claims and sends nothing for a tenant that is ${status}`, async () => {
      await tenantB.setStatus(status);
      try {
        await runEventReminders(service, {
          siteUrl: SITE_URL,
          dailyLimit: LIMIT,
        });
      } finally {
        await tenantB.setStatus("suspended");
      }
      expect(sentTo(B_EMAIL)).toHaveLength(0);
      // Left unclaimed, so it still goes if the tenant is reactivated in time.
      expect(await stamp(bRegistrationId)).toBeNull();
    });
  }

  test("the same registration is sent once the tenant is active", async () => {
    await tenantB.setStatus("active");
    try {
      await runEventReminders(service, {
        siteUrl: SITE_URL,
        dailyLimit: LIMIT,
      });
    } finally {
      await tenantB.setStatus("suspended");
    }
    expect(sentTo(B_EMAIL)).toHaveLength(1);
    expect(await stamp(bRegistrationId)).not.toBeNull();
  });
});
