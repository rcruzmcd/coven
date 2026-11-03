"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request-origin";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { RECORD_MESSAGE_ERRORS } from "@/lib/notifications/record-message";
import {
  reminderTenantContext,
  sendEventReminder,
} from "@/lib/notifications/event-reminders";
import { renderEventReminderEmail } from "@/lib/notifications/event-reminder-email";
import {
  manualReminderDedupeKey,
  REMINDER_ERRORS,
  storedReminderIntro,
  type EventReminderStatus,
} from "@/lib/event-reminders";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";
import { eventCarpoolNotice } from "@/lib/event-carpools";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";

/**
 * The reminder's portal side (#1652): Planning's status line and preview, and
 * "Send reminder now" on a registration. The hourly job is in
 * `@/lib/notifications/event-reminders`; "Send reminder now" goes through the
 * same sender after stamping the registration under the caller's session.
 */

type Result<T = Record<never, never>> = ({ success: true } & T) | ActionFailure;

export async function loadEventReminderStatusAction(
  eventId: string,
): Promise<Result<{ status: EventReminderStatus | null }>> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "events", "view");
  if (denied) return fromGuard("forbidden", denied);

  const { data, error } = await supabase
    .rpc("event_reminder_status", { p_event_id: eventId })
    .maybeSingle<{ send_at: string; recipients: number; sent: number }>();
  if (error) {
    return actionError("server_error", "Could not read the reminder's status.");
  }
  return {
    success: true,
    status: data
      ? { sendAt: data.send_at, recipients: data.recipients, sent: data.sent }
      : null,
  };
}

/**
 * The reminder as a registrant would get it, with the intro being typed and a
 * made-up registrant: "Alex", in no car on a carpool event, with a link that
 * goes nowhere. Renders only; nothing is issued or sent.
 */
export async function previewEventReminderAction(input: {
  eventId: string;
  intro: string;
}): Promise<Result<{ subject: string; html: string }>> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "events", "view");
  if (denied) return fromGuard("forbidden", denied);

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, tenant_id, name, starts_at, ends_at, timezone, location, carpools_enabled, carpool_cost_notice",
    )
    .eq("id", input.eventId)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      name: string;
      starts_at: string;
      ends_at: string | null;
      timezone: string;
      location: string | null;
      carpools_enabled: boolean;
      carpool_cost_notice: unknown;
    }>();
  if (error || !event) {
    return actionError("server_error", "Could not load the event.");
  }

  const context = await reminderTenantContext(
    createSupabaseAdminClient(),
    event.tenant_id,
    await getRequestOrigin(),
  );
  const origin = context.mail.origin.replace(/\/+$/, "");
  const rendered = renderEventReminderEmail({
    orgName: context.mail.displayName,
    firstName: "Alex",
    eventName: event.name,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timeZone: event.timezone,
    location: event.location,
    intro: storedReminderIntro(input.intro),
    carpool: event.carpools_enabled
      ? {
          car: null,
          notice: eventCarpoolNotice(event.carpool_cost_notice, context.notice),
        }
      : null,
    answersLink: {
      url: `${origin}${publicEventAnswersPath(event.id, "preview")}`,
      expiresAt: event.ends_at ?? event.starts_at,
    },
    accountUrl: context.accountsOn ? `${origin}/my/registration/preview` : null,
    siteUrl: context.mail.origin,
    branding: context.mail.branding,
  });
  return { success: true, subject: rendered.subject, html: rendered.html };
}

/**
 * "Send reminder now": stamps the registration sent -- so the hourly job will
 * not send it again -- and sends it straight away, whether or not it was sent
 * before. Each press is its own delivery.
 */
export async function sendEventReminderNowAction(input: {
  eventId: string;
  registrationId: string;
}): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) {
    return actionError("unauthenticated", userResult.error);
  }
  const denied = await checkPermission(supabase, "events", "manage");
  if (denied) return fromGuard("forbidden", denied);
  if (!(await getOrgEmailEnabled(supabase))) {
    return actionError("conflict", RECORD_MESSAGE_ERRORS.EMAIL_OFF);
  }

  const { data: registration } = await supabase
    .from("event_registrations")
    .select("id, tenant_id")
    .eq("id", input.registrationId)
    .eq("event_id", input.eventId)
    // #1764. No reminder goes to a test registration's typed address.
    .eq("is_test", false)
    .maybeSingle<{ id: string; tenant_id: string }>();
  if (!registration) {
    return actionError("conflict", REMINDER_ERRORS.NOTHING_TO_SEND);
  }

  const { data: stamped, error: stampError } = await supabase.rpc(
    "stamp_event_reminder",
    { p_registration_id: registration.id },
  );
  if (stampError) return actionError("server_error", REMINDER_ERRORS.FAILED);
  if (!stamped) return actionError("conflict", REMINDER_ERRORS.NOTHING_TO_SEND);

  const admin = createSupabaseAdminClient();
  const context = await reminderTenantContext(
    admin,
    registration.tenant_id,
    await getRequestOrigin(),
  );
  const outcome = await sendEventReminder(admin, context, {
    registrationId: registration.id,
    dedupeKey: manualReminderDedupeKey(registration.id, crypto.randomUUID()),
    sentBy: userResult.user.id,
  });
  if (outcome === "failed") {
    return actionError("server_error", REMINDER_ERRORS.FAILED);
  }
  if (outcome === "skipped") {
    return actionError("conflict", REMINDER_ERRORS.NOTHING_TO_SEND);
  }
  return { success: true };
}
