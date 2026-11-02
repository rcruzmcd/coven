"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { notifyNewPersonClaim } from "@/lib/notifications/person-claim-notifications";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

/**
 * `code` is the failure, for the funnel (#1713): the request's own, never
 * anything about who is in the directory.
 */
export type ClaimActionResult =
  { error: string; code?: string } | { submitted: true };

/**
 * Ask to be linked to a directory record (#1162).
 *
 * The result is the same object whatever happened underneath: matched a donor,
 * matched nobody, already had a claim open, or the tenant has the module off.
 * `submit_person_claim()` is silent by design for that reason, and this must
 * not undo it by reporting anything the RPC declined to say -- "we already
 * have a record for this address" answers "is this person a donor here?" for
 * anyone who asks, and a form is a comfortable place to ask it repeatedly.
 *
 * The only failure this reports is a failure of the request itself: not signed
 * in, or the database refused to talk to us. Neither says anything about who
 * is in the directory.
 */
export async function submitClaimAction(
  formData: FormData,
): Promise<ClaimActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Tell us the name we would have you under." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in again.", code: "NOT_SIGNED_IN" };
  }

  // The form no longer prefills the Email field with the verified address
  // (#1182) -- prefilling implied that typing an address is what matches you,
  // when `person_claim_candidates()` reads the address from `auth.users` and
  // never looks at this one. But `stated_email` is also the only address that
  // lands on a record `review_person_claim()` creates from scratch, so a blank
  // field must not leave a newly enrolled person with no way to be reached.
  // Falling back to the verified address keeps exactly what was stored before.
  const statedEmail =
    String(formData.get("email") ?? "").trim() || user.email || undefined;

  const { error } = await supabase.rpc("submit_person_claim", {
    p_ip_address: await getClientIp(),
    p_name: name,
    p_email: statedEmail,
    p_phone: String(formData.get("phone") ?? "").trim() || undefined,
    p_instagram_handle:
      String(formData.get("instagram") ?? "").trim() || undefined,
    p_note: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) {
    // The one thing the RPC says out loud, and the only thing it safely can:
    // that this caller is going too fast. Every other branch is silent, so
    // there is exactly one message to translate here.
    if (error.message.includes("RATE_LIMITED")) {
      return {
        error: "Too many requests just now. Try again in a little while.",
        code: "RATE_LIMITED",
      };
    }
    return {
      error: "We could not send that just now. Please try again.",
      code: "UNKNOWN",
    };
  }

  await announceClaim(supabase);
  return { submitted: true };
}

/**
 * Tells the reviewers, where a claim was in fact opened.
 *
 * The RPCs return void on purpose -- every branch has to look the same from
 * out here -- so the id comes from reading the claim back through the
 * claimant's own select policy, which is pinned to auth.uid(). No row means
 * nothing was created (the module is off, they are already linked, or a claim
 * was already open), and so nothing to tell anyone about.
 */
async function announceClaim(supabase: SupabaseClient) {
  const { data: claim } = await supabase
    .from("person_claims")
    .select("id")
    .eq("status", "pending")
    .maybeSingle();

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers. Only a fallback: a tenant's own domain
  // wins where it has one (#860).
  const siteUrl = await getRequestOrigin();

  if (claim) {
    // After the response, never before it (#742): telling the reviewers is the
    // organization's business, and a slow mail provider must not hold up
    // "thanks, we have your request".
    after(async () => {
      await notifyNewPersonClaim(createSupabaseAdminClient(), {
        claimId: claim.id,
        siteUrl,
      });
    });
  }

  revalidatePath(MY_PATH_PREFIX);
}

/**
 * The same claim, made from a registration instead of from a form (#1258).
 *
 * Somebody who has just registered for an event has already told the
 * organization who they are, and the row that write created holds what they
 * typed. So the offer that follows a registration asks for a click rather than
 * for the form again: `submit_claim_from_registration()` copies the
 * registration's own fields onto the claim and notes which event it came from.
 *
 * Nothing here can undo or delay the registration, which was saved before this
 * was ever on screen. And the result says nothing about the directory: the RPC
 * is silent in every branch -- no such registration, module off, already
 * linked, a claim already open -- exactly as `submit_person_claim()` is, and
 * for the same reason.
 */
export async function claimFromRegistrationAction(
  registrationId: string,
): Promise<ClaimActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in again." };
  }

  const { error } = await supabase.rpc("submit_claim_from_registration", {
    p_registration_id: registrationId,
    p_ip_address: await getClientIp(),
  });

  if (error) {
    // The one thing the RPC says out loud, as above.
    if (error.message.includes("RATE_LIMITED")) {
      return {
        error: "Too many requests just now. Try again in a little while.",
      };
    }
    return { error: "We could not send that just now. Please try again." };
  }

  await announceClaim(supabase);
  return { submitted: true };
}

/**
 * The same claim again, made from a public gear request (#1359).
 *
 * The twin of `claimFromRegistrationAction` above, and deliberately identical
 * from out here: the RPC is silent in every branch -- no such request, a
 * request from last month, the module off, already linked, a claim already
 * open -- so there is nothing to translate but the rate limit, and the caller
 * learns the same thing either way.
 *
 * What the reviewer sees differs, and only there: `gear_requests` stores no
 * typed contact fields, so `submit_claim_from_gear_request()` takes the
 * evidence off the `people` row the request attached to. That is a decision
 * about the claim's contents, not about what this returns.
 */
export async function claimFromGearRequestAction(
  requestId: string,
): Promise<ClaimActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in again." };
  }

  const { error } = await supabase.rpc("submit_claim_from_gear_request", {
    p_request_id: requestId,
    p_ip_address: await getClientIp(),
  });

  if (error) {
    // The one thing the RPC says out loud, as above.
    if (error.message.includes("RATE_LIMITED")) {
      return {
        error: "Too many requests just now. Try again in a little while.",
      };
    }
    return { error: "We could not send that just now. Please try again." };
  }

  await announceClaim(supabase);
  return { submitted: true };
}
