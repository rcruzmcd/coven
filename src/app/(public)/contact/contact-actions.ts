"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { getClientIp } from "@/lib/get-client-ip";
import { notifyNewContactMessage } from "@/lib/notifications/submission-notifications";
import { rpcErrorCode } from "@/lib/analytics/error-code";
import { parseContactForm } from "./contact-form-parser";

/** `code` is the RPC's refusal, for the funnel (#1712); absent where the form parser refused. */
export type SubmitContactMessageResult =
  { error: string; code?: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Name is required.",
  INVALID_EMAIL: "A valid email is required.",
  TOPIC_REQUIRED: "Please choose a topic.",
  MESSAGE_REQUIRED: "Message is required.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  // #902. The page is gated too, so reaching this means a stale tab or a
  // direct post -- but the form still has to say something true.
  SECTION_UNAVAILABLE: "This form is not available on this site.",
};

// Public, unauthenticated action: anyone can send a contact message.
// Validation, the honeypot check, and the rate limit are all re-enforced
// authoritatively inside the submit_contact_message() RPC, since anon has
// no direct table access to contact_messages.
export async function submitContactMessageAction(
  formData: FormData,
): Promise<SubmitContactMessageResult> {
  const parsed = parseContactForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("submit_contact_message", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_topic: parsed.data.topic,
    p_message: parsed.data.message,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not send your message. Please try again.",
      code: rpcErrorCode(error.message),
    };
  }

  // After the response, never before it (#742). Telling the ops inbox about a
  // message is the organization's business, not the visitor's: a slow provider
  // or a missing key must not hold up "thanks, we got it", and a failed send
  // must not turn a committed message into an error on screen.
  //
  // The first place the public surface uses the service-role client. Nothing
  // user-controlled reaches it: the only input is the id the RPC just minted,
  // and the notifier treats an id with no row behind it as a filled honeypot
  // and returns silently.
  // Read before after(), which runs once the response is on its way and may
  // no longer have the request's headers. Only a fallback: the tenant's own
  // domain wins where it has one (#860).
  const siteUrl = await getRequestOrigin();

  after(async () => {
    await notifyNewContactMessage(createSupabaseAdminClient(), {
      messageId: data as string,
      siteUrl,
    });
  });

  return { success: true };
}
