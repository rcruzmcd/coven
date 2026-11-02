"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  mapVolunteerApplicationStatusToLabel,
  parseVolunteerStatusLookupForm,
} from "./volunteer-status-lookup-form";
import { rpcErrorCode } from "@/lib/analytics/error-code";

/** `code` is the refusal, for the funnel (#1713); absent where the form parser refused. */
export type LookupVolunteerApplicationStatusResult =
  { error: string; code?: string } | { statusLabel: string };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND:
    "We couldn't find an application matching that email and reference code.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

// Public, unauthenticated action: anyone can check a status given the email
// + reference code pair. lookup_volunteer_application_status enforces the
// match and the per-IP throttle authoritatively -- anon has no direct table
// access to volunteer_applications.
export async function lookupVolunteerApplicationStatusAction(
  formData: FormData,
): Promise<LookupVolunteerApplicationStatusResult> {
  const parsed = parseVolunteerStatusLookupForm(formData);
  if ("error" in parsed) return parsed;

  const ipAddress = await getClientIp();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc(
    "lookup_volunteer_application_status",
    {
      p_email: parsed.data.email,
      p_reference_code: parsed.data.referenceCode,
      p_ip_address: ipAddress,
    },
  );

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not look up your application. Please try again.",
      code: rpcErrorCode(error.message),
    };
  }

  // A null result (no matching row) is a normal return, not an RPC error --
  // see 20260827020000 for why the RPC can't raise an exception here.
  if (!data) {
    return { error: ERROR_MESSAGES.NOT_FOUND, code: "NOT_FOUND" };
  }

  return { statusLabel: mapVolunteerApplicationStatusToLabel(data as string) };
}
