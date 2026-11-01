"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { getClientIp } from "@/lib/get-client-ip";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import {
  notifyNewVolunteerApplication,
  notifyVolunteerApplicationConfirmation,
} from "@/lib/notifications/submission-notifications";
import { rpcErrorCode } from "@/lib/analytics/error-code";
import { parseVolunteerApplicationForm } from "./volunteer-application-form";

/** `code` is the RPC's refusal, for the funnel (#1713); absent where the form parser refused. */
export type SubmitVolunteerApplicationResult =
  { error: string; code?: string } | { success: true; referenceCode: string };

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Name is required.",
  INVALID_EMAIL: "A valid email is required.",
  ALREADY_SUBMITTED:
    "We already have a recent application from this email — we'll be in touch soon.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  // #902. The volunteer page is gated too, so reaching this means a stale tab
  // or a direct post -- but the form still has to say something true.
  SECTION_UNAVAILABLE: "This form is not available on this site.",
};

// Public, unauthenticated action: anyone can submit a volunteer application.
// Validation, the honeypot check, and the per-email throttle are all
// re-enforced authoritatively inside the submit_volunteer_application() RPC,
// since anon has no direct table access to volunteer_applications.
export async function submitVolunteerApplicationAction(
  formData: FormData,
): Promise<SubmitVolunteerApplicationResult> {
  const parsed = parseVolunteerApplicationForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("submit_volunteer_application", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_role_interest: parsed.data.role_interest,
    p_availability: parsed.data.availability,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_pronouns: parsed.data.pronouns,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not submit your application. Please try again.",
      code: rpcErrorCode(error.message),
    };
  }

  const referenceCode = data as string;

  // After the response, never before it (#742): a slow provider or a failed
  // send must not delay the reference code the applicant is waiting for, nor
  // turn a committed application into an error on screen.
  //
  // The tenant comes from the request host, resolved in Postgres by the same
  // public_tenant_id() the RPC itself used. It has to be carried explicitly,
  // because a reference code is only unique *within* a tenant and the
  // service-role lookup below has no RLS to keep it in one.
  // Read before after(), which runs once the response is on its way and may
  // no longer have the request's headers. Only a fallback: the tenant's own
  // domain wins where it has one (#860).
  const siteUrl = await getRequestOrigin();

  after(async () => {
    const { data: tenantId } = await supabase.rpc("public_tenant_id");
    if (!tenantId) return;

    // Two independent sends (#1069): the volunteers queue hears about the
    // application, and the applicant gets the reference code that is the only
    // key to the status page. Separate dedupe keys and separate outcomes, in
    // parallel, so neither is lost because the other's address bounced.
    const admin = createSupabaseAdminClient();
    await Promise.all([
      notifyNewVolunteerApplication(admin, {
        tenantId: tenantId as string,
        referenceCode,
        siteUrl,
      }),
      notifyVolunteerApplicationConfirmation(admin, {
        tenantId: tenantId as string,
        referenceCode,
        siteUrl,
      }),
    ]);
  });

  return { success: true, referenceCode };
}
