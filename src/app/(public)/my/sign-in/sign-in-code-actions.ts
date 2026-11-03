"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { requestSignInCode } from "@/lib/notifications/sign-in-code";
import {
  SIGN_IN_CODE_INVALID_EMAIL,
  SIGN_IN_CODE_RATE_LIMITED,
  SIGN_IN_CODE_SENT,
} from "@/lib/constituent/sign-in-code";

export type SignInCodeActionResult = { sent: string } | { error: string };

/**
 * Ask for a one-time sign-in code (#1765), from the registration form's
 * first step and from `/my/sign-in`.
 *
 * The answer is {@link SIGN_IN_CODE_SENT} for every well-formed address under
 * the throttle, whether or not it has an account or a record: §5.23's silence
 * rule, which an "is this you?" would break as surely as a lookup. The only
 * other answers are about the request itself -- a malformed address, too many
 * asks -- and say nothing about who is in the directory.
 */
export async function sendSignInCodeAction(
  email: string,
): Promise<SignInCodeActionResult> {
  // The tenant, off this request's host: the service-role client below has no
  // host to resolve it from.
  const supabase = await createSupabaseServerClient();
  const { data: tenantId } = await supabase.rpc("public_tenant_id");
  if (!tenantId) return { error: SIGN_IN_CODE_RATE_LIMITED };

  const outcome = await requestSignInCode(
    createSupabaseAdminClient(),
    {
      tenantId,
      email,
      ipAddress: await getClientIp(),
      fallbackOrigin: await getRequestOrigin(),
    },
    after,
  );
  if (outcome === "invalid_email") return { error: SIGN_IN_CODE_INVALID_EMAIL };
  if (outcome === "rate_limited") return { error: SIGN_IN_CODE_RATE_LIMITED };
  return { sent: SIGN_IN_CODE_SENT };
}
