"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkUser } from "@/lib/auth/current-user";
import { getRequestOrigin } from "@/lib/request-origin";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { RECORD_MESSAGE_ERRORS } from "@/lib/notifications/record-message";
import { MAX_ANNOUNCEMENT_RECIPIENTS } from "@/lib/event-announcements";
import { sendCarpoolAssignments } from "@/lib/notifications/carpool-assignments";
import { loadCarpoolAssignmentRows } from "@/lib/portal/event-carpools";
import {
  CARPOOL_ASSIGNMENT_ERRORS,
  resolveCarpoolAssignmentRecipients,
  type CarpoolAssignmentAudience,
} from "@/lib/carpool-assignment";
import { checkPermission } from "@/lib/auth/permissions";
import { checkEventAccess } from "@/lib/auth/event-access";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import {
  CARPOOL_ERROR_MESSAGES,
  carpoolsHref,
  toEventCarpoolNotice,
} from "@/lib/event-carpools";

/**
 * The carpool board's writes (#1649). Each is gated on `events: manage` here
 * and again in the function it calls, which also refuses an event with the
 * switch off and a registration of another event or tenant, or a cancelled
 * one.
 */

type Result<T = Record<never, never>> = ({ success: true } & T) | ActionFailure;

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function callCarpool<T>(
  eventId: string,
  call: (
    supabase: Client,
  ) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  fallback: string,
): Promise<{ success: true; data: T | null } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkEventAccess(supabase, {
    table: "event_carpool_cars",
    level: "manage",
    eventId,
  });
  if (denied) return fromGuard("forbidden", denied);

  const { data, error } = await call(supabase);
  if (error) {
    const message = CARPOOL_ERROR_MESSAGES[error.message];
    return message
      ? actionError("conflict", message)
      : actionError("server_error", fallback);
  }

  revalidatePath(carpoolsHref(eventId));
  return { success: true, data };
}

export async function saveCarpoolCarAction(input: {
  eventId: string;
  carId: string | null;
  label: string;
  driverRegistrationId: string | null;
  seats: number;
  leavingFrom: string;
  notes: string;
}): Promise<Result<{ carId: string }>> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("save_event_carpool_car", {
        p_event_id: input.eventId,
        p_car_id: input.carId as string,
        p_label: input.label,
        p_driver_registration_id: input.driverRegistrationId as string,
        p_seats: input.seats,
        p_leaving_from: input.leavingFrom,
        p_notes: input.notes,
      }),
    "Could not save the car. Please try again.",
  );
  return "error" in result
    ? result
    : { success: true, carId: result.data ?? "" };
}

export async function deleteCarpoolCarAction(input: {
  eventId: string;
  carId: string;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("delete_event_carpool_car", { p_car_id: input.carId }),
    "Could not delete the car. Please try again.",
  );
  return "error" in result ? result : { success: true };
}

/** Into a car, between cars, or with `toCarId` null back to Unassigned. */
export async function moveCarpoolPassengerAction(input: {
  eventId: string;
  registrationId: string;
  toCarId: string | null;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("move_carpool_passenger", {
        p_event_id: input.eventId,
        p_registration_id: input.registrationId,
        // The generated types cannot say a uuid argument takes null.
        p_to_car_id: input.toCarId as string,
      }),
    "Could not move that registrant. Please try again.",
  );
  return "error" in result ? result : { success: true };
}

export async function setCarpoolPassengerPaidAction(input: {
  eventId: string;
  carId: string;
  registrationId: string;
  paid: boolean;
}): Promise<Result> {
  const result = await callCarpool(
    input.eventId,
    (supabase) =>
      supabase.rpc("set_carpool_passenger_paid", {
        p_car_id: input.carId,
        p_registration_id: input.registrationId,
        p_paid: input.paid,
      }),
    "Could not update the payment. Please try again.",
  );
  return "error" in result ? result : { success: true };
}

/**
 * "Email carpool assignments" (#1651): each person in a car -- or only those
 * whose car changed since they were last emailed -- gets their card, the
 * cost-split notice and a fresh answers link.
 *
 * Shaped like askForMissingAnswersAction(): who is mailed is resolved here,
 * under the caller's session and by the same function the dialog counted
 * with, so the number shown is the number sent and the browser never names a
 * recipient. The mail goes in after(); each outcome lands in that
 * registrant's message history. Capped like an announcement, and an unsent
 * remainder stays "changed", so sending again picks it up.
 */
export async function emailCarpoolAssignmentsAction(input: {
  eventId: string;
  batchId: string;
  audience: CarpoolAssignmentAudience;
}): Promise<Result<{ recipients: number }>> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) {
    return actionError("unauthenticated", userResult.error);
  }
  const denied = await checkPermission(supabase, "events", "manage");
  if (denied) return fromGuard("forbidden", denied);

  const [event, rows] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, name, tenant_id, timezone, carpools_enabled, carpool_cost_notice",
      )
      .eq("id", input.eventId)
      .maybeSingle<{
        id: string;
        name: string;
        tenant_id: string;
        timezone: string;
        carpools_enabled: boolean;
        carpool_cost_notice: unknown;
      }>(),
    loadCarpoolAssignmentRows(supabase, input.eventId),
  ]);
  if (event.error) {
    return actionError("server_error", CARPOOL_ASSIGNMENT_ERRORS.FAILED);
  }
  if (!event.data) {
    return actionError("conflict", CARPOOL_ERROR_MESSAGES.EVENT_NOT_FOUND);
  }
  if (!event.data.carpools_enabled) {
    return actionError("conflict", CARPOOL_ERROR_MESSAGES.CARPOOLS_DISABLED);
  }
  if (!rows) {
    return actionError("server_error", CARPOOL_ASSIGNMENT_ERRORS.FAILED);
  }

  const recipients = resolveCarpoolAssignmentRecipients(
    rows,
    input.audience,
  ).recipients.slice(0, MAX_ANNOUNCEMENT_RECIPIENTS);
  if (recipients.length === 0) {
    return actionError("conflict", CARPOOL_ASSIGNMENT_ERRORS.NO_RECIPIENTS);
  }
  if (!(await getOrgEmailEnabled(supabase))) {
    return actionError("conflict", RECORD_MESSAGE_ERRORS.EMAIL_OFF);
  }

  const batch = {
    tenantId: event.data.tenant_id,
    eventId: event.data.id,
    eventName: event.data.name,
    timeZone: event.data.timezone,
    eventNotice: toEventCarpoolNotice(event.data.carpool_cost_notice),
    batchId: input.batchId,
    recipients,
    sentBy: userResult.user.id,
    // Read before after(), for the announcement's reason.
    fallbackOrigin: await getRequestOrigin(),
  };
  const admin = createSupabaseAdminClient();
  after(async () => {
    try {
      await sendCarpoolAssignments(admin, batch);
    } catch (error) {
      console.error("[carpool-assignment] the batch threw", error);
    }
  });

  revalidatePath(carpoolsHref(input.eventId));
  return { success: true, recipients: recipients.length };
}
