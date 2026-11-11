import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import {
  tenantMailContext,
  type TenantMailContext,
} from "@/lib/email/identity";
import { activeTenantIds } from "@/lib/notifications/active-tenants";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { loadCarpoolCostNotice } from "@/lib/notifications/carpool-cost-notice";
import { eventCarpoolNotice } from "@/lib/event-carpools";
import {
  eventReminderSubject,
  eventReminderSummary,
  renderEventReminderEmail,
  type EventReminderMessage,
} from "@/lib/notifications/event-reminder-email";
import {
  EVENT_REGISTRATION_RECORD_TYPE,
  EVENT_REMINDER_KIND,
} from "@/lib/outbound-messages";
import { ANNOUNCEMENT_SEND_INTERVAL_MS } from "@/lib/event-announcements";
import { scheduledReminderDedupeKey } from "@/lib/event-reminders";
import { toCarpoolAssignment } from "@/lib/carpool-assignment";
import { moduleEnabled, modulesForTenant } from "@/lib/portal/modules";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";

/**
 * The event reminder's sends (#1652): the hourly job, and "Send reminder now"
 * for one registration. Both run on the service-role client, and both have
 * already stamped `reminder_sent_at` before anything here runs -- the claim is
 * what makes a retried run send nothing twice, and the delivery ledger's
 * dedupe key is the second lock behind it.
 *
 * Modelled on sendCarpoolAssignments(): one mail context per tenant, a spaced
 * loop, a fresh answers link issued just before each mail, and each outcome
 * logged in that registration's message history. A failed send stays stamped:
 * a provider error is not proof nothing went, and staff can send it again from
 * the registration.
 */

/** What a tenant's sends share. */
export type ReminderTenantContext = {
  tenantId: string;
  mail: TenantMailContext;
  notice: readonly string[];
  accountsOn: boolean;
};

export async function reminderTenantContext(
  admin: SupabaseClient,
  tenantId: string,
  fallbackOrigin: string,
): Promise<ReminderTenantContext> {
  const [mail, notice, modules] = await Promise.all([
    tenantMailContext(admin, tenantId, { fallbackOrigin }),
    loadCarpoolCostNotice(admin, tenantId),
    modulesForTenant(admin, tenantId),
  ]);
  return {
    tenantId,
    mail,
    notice,
    accountsOn: moduleEnabled(modules, "constituent_accounts"),
  };
}

/**
 * The event's own carpool notice where it sets one (none, when it hides it),
 * else the organization's, already in `context`. Only read for an event that
 * organizes carpools; a failed read falls back to the organization's.
 */
async function reminderCarpoolNotice(
  admin: SupabaseClient,
  context: ReminderTenantContext,
  row: { event_id: string; tenant_id: string },
): Promise<string[]> {
  const { data, error } = await admin
    .from("events")
    .select("carpool_cost_notice")
    .eq("id", row.event_id)
    .eq("tenant_id", row.tenant_id)
    .maybeSingle<{ carpool_cost_notice: unknown }>();
  if (error) {
    console.error(
      "[event-reminder] could not read the event's carpool notice; sending the organization's",
      error,
    );
  }
  return eventCarpoolNotice(data?.carpool_cost_notice, context.notice);
}

type ReminderRow = {
  registration_id: string;
  tenant_id: string;
  event_id: string;
  name: string;
  email: string;
  person_id: string | null;
  event_name: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  location: string | null;
  reminder_intro: string | null;
  carpools_enabled: boolean;
  car: unknown;
};

/**
 * One registration's reminder, after it has been stamped. "skipped" where the
 * registration is gone, cancelled or has no address, or the ledger already
 * holds this send.
 */
export async function sendEventReminder(
  admin: SupabaseClient,
  context: ReminderTenantContext,
  input: { registrationId: string; dedupeKey: string; sentBy: string | null },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .rpc("event_reminder_message", { p_registration_id: input.registrationId })
    .maybeSingle<ReminderRow>();
  if (error) {
    console.error("[event-reminder] could not read a reminder", error);
    return "failed";
  }
  if (!data || data.tenant_id !== context.tenantId) return "skipped";

  const origin = context.mail.origin.replace(/\/+$/, "");
  const link = await issueLink(admin, data.registration_id);
  const message: EventReminderMessage = {
    orgName: context.mail.displayName,
    firstName: data.name.trim().split(/\s+/)[0] ?? "",
    eventName: data.event_name,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    timeZone: data.timezone,
    location: data.location,
    intro: data.reminder_intro,
    carpool: data.carpools_enabled
      ? {
          car: toCarpoolAssignment(data.car),
          notice: await reminderCarpoolNotice(admin, context, data),
        }
      : null,
    answersLink: link
      ? {
          url: `${origin}${publicEventAnswersPath(data.event_id, link.token)}`,
          expiresAt: link.expiresAt,
        }
      : null,
    accountUrl: context.accountsOn
      ? `${origin}/my/registration/${data.registration_id}`
      : null,
    siteUrl: context.mail.origin,
    branding: context.mail.branding,
  };

  let outcome: DeliveryOutcome;
  try {
    outcome = await deliverEmail(admin, {
      tenantId: context.tenantId,
      personId: data.person_id,
      identity: context.mail.identity,
      kind: EVENT_REMINDER_KIND,
      dedupeKey: input.dedupeKey,
      to: data.email,
      render: () => renderEventReminderEmail(message),
      logPrefix: "[event-reminder]",
    });
  } catch (sendError) {
    console.error("[event-reminder] the send threw", sendError);
    outcome = "failed";
  }

  if (outcome === "skipped") return outcome;

  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: context.tenantId,
    personId: data.person_id,
    toEmail: data.email,
    module: "events",
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: data.registration_id,
    subject: eventReminderSubject(
      data.event_name,
      data.starts_at,
      data.timezone,
    ),
    // The details and car, never the link: the token must not be stored.
    body: eventReminderSummary(message),
    kind: EVENT_REMINDER_KIND,
    dedupeKey: input.dedupeKey,
    status: outcome,
    sentBy: input.sentBy,
  });
  return outcome;
}

export type ReminderRunSummary = {
  /** Tenants with due reminders. */
  tenants: number;
  /** Registrations claimed (and stamped) this run. */
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  /** What the daily budget allowed this run, after the last day's sends. */
  budget: number;
};

/**
 * The hourly run. Reads the last day's sends against the daily limit, then
 * claims and sends tenant by tenant until the budget is spent; whatever is
 * left is claimed by a later run. A tenant that is not active (#1674), has
 * Events off, or has its email switch off claims nothing, so its reminders go
 * once it is back on and the event has not started.
 */
export async function runEventReminders(
  admin: SupabaseClient,
  options: { now?: Date; siteUrl: string; dailyLimit: number },
): Promise<ReminderRunSummary> {
  const now = options.now ?? new Date();
  const summary: ReminderRunSummary = {
    tenants: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    budget: 0,
  };

  const { data: tenantIds, error: tenantsError } = await admin.rpc(
    "event_reminder_due_tenants",
  );
  if (tenantsError) {
    console.error("[event-reminder] could not list due tenants", tenantsError);
    return summary;
  }
  const tenants = (tenantIds ?? []) as string[];
  summary.tenants = tenants.length;
  if (tenants.length === 0) return summary;

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sentToday, error: countError } = await admin.rpc(
    "event_reminders_sent_since",
    { p_since: since },
  );
  if (countError) {
    // Unknown is not room to send: the cap is the provider's, not ours.
    console.error("[event-reminder] could not count today's sends", countError);
    return summary;
  }
  let budget = Math.max(options.dailyLimit - Number(sentToday ?? 0), 0);
  summary.budget = budget;

  const active = await activeTenantIds(admin, "[event-reminder]");

  for (const tenantId of tenants) {
    if (budget <= 0) break;
    if (!active.has(tenantId)) continue;
    if (!(await isOrgEmailEnabled(admin, tenantId))) continue;
    const modules = await modulesForTenant(admin, tenantId);
    if (!moduleEnabled(modules, "events")) continue;

    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_event_reminders",
      { p_tenant_id: tenantId, p_limit: budget },
    );
    if (claimError) {
      console.error("[event-reminder] could not claim reminders", claimError);
      continue;
    }
    const registrationIds = (claimed ?? []) as string[];
    if (registrationIds.length === 0) continue;
    budget -= registrationIds.length;
    summary.claimed += registrationIds.length;

    const context = await reminderTenantContext(
      admin,
      tenantId,
      options.siteUrl,
    );
    for (const [index, registrationId] of registrationIds.entries()) {
      if (index > 0) await pause(ANNOUNCEMENT_SEND_INTERVAL_MS);
      const outcome = await sendEventReminder(admin, context, {
        registrationId,
        dedupeKey: scheduledReminderDedupeKey(registrationId),
        sentBy: null,
      });
      summary[outcome] += 1;
    }
  }

  return summary;
}

/** A fresh answers link, or null where none could be issued. */
async function issueLink(
  admin: SupabaseClient,
  registrationId: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await admin.rpc("issue_registration_answer_link", {
    p_registration_id: registrationId,
    p_token_hash: hash,
    p_source: "reminder",
  });
  if (error) {
    console.error("[event-reminder] could not issue an answers link", error);
    return null;
  }
  return typeof data === "string" ? { token, expiresAt: data } : null;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
