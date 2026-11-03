import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailAddress, tenantMailContext } from "@/lib/email/identity";
import { deliverEmail } from "@/lib/notifications/deliver";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderSignInCodeEmail } from "@/lib/notifications/sign-in-code-email";

/**
 * Email-first registration's one-time code (#1765).
 *
 * The code is Supabase Auth's own email OTP, minted with admin
 * `generateLink()` so Auth sends nothing and this application mails it in the
 * tenant's name instead. The visitor redeems it with `verifyOtp({ type:
 * "email" })` in the browser, which is what signs them in.
 *
 * **`shouldCreateUser` is effectively true.** `generateLink()` creates the
 * auth user when the address has none, so every address that asks gets a
 * code. That is what makes the answer honest and uniform at once: the screen,
 * the timing and the mailbox all behave the same for an address we know and
 * one we do not. The cost is an unconfirmed auth user per address that asks
 * and never verifies, which is an account with no claim -- the population the
 * `constituent_accounts` retention rule already reaches (spec §7.11). A
 * verified address with no record lands on the signed-in, unlinked path
 * (#1257): its own name and address prefilled, and the claim offer.
 *
 * Not in NOTIFICATION_KINDS, for #1164's reason: a switch to stop the message
 * that proves you hold an address would only hide sign-in from its owner. The
 * org-wide kill switch does govern it; with email off the page never offers a
 * code ({@link isSignInCodeAvailable}).
 */

export const SIGN_IN_CODE_KIND = "sign_in_code";

export type SignInCodeOutcome = "requested" | "rate_limited" | "invalid_email";

/** Whether this tenant can send a code at all: its email is on. */
export async function isSignInCodeAvailable(
  admin: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  return isOrgEmailEnabled(admin, tenantId);
}

/**
 * Throttles, then hands the mint and the send to `defer` (the action's
 * `after()`), so the response neither waits on Auth or the mail provider nor
 * says by its timing whether the address already had an account.
 *
 * The outcome depends only on the address's shape and the throttle, never on
 * what the address matches.
 */
export async function requestSignInCode(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    email: string;
    ipAddress: string | null;
    fallbackOrigin: string;
  },
  defer: (task: () => Promise<void>) => void,
): Promise<SignInCodeOutcome> {
  const email = input.email.trim().toLowerCase();
  if (!isEmailAddress(email)) return "invalid_email";

  const { data: allowed, error } = await admin.rpc(
    "check_sign_in_code_rate_limit",
    { p_email: email, p_ip_address: input.ipAddress },
  );
  if (error) {
    // Fails closed: a throttle whose state is unknown is no throttle.
    console.error("[sign-in-code] could not check the rate limit", error);
    return "rate_limited";
  }
  if (!allowed) return "rate_limited";

  defer(async () => {
    try {
      await mintAndMail(admin, { ...input, email });
    } catch (mailError) {
      console.error("[sign-in-code] the send threw", mailError);
    }
  });
  return "requested";
}

async function mintAndMail(
  admin: SupabaseClient,
  input: { tenantId: string; email: string; fallbackOrigin: string },
): Promise<void> {
  if (!(await isOrgEmailEnabled(admin, input.tenantId))) return;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
  });
  const code = data?.properties?.email_otp;
  const hashedToken = data?.properties?.hashed_token;
  if (error || !code || !hashedToken) {
    console.error("[sign-in-code] could not mint a code", error);
    return;
  }

  const mail = await tenantMailContext(admin, input.tenantId, {
    fallbackOrigin: input.fallbackOrigin,
  });

  await deliverEmail(admin, {
    tenantId: input.tenantId,
    // Never looked up by the address: who it belongs to is the question the
    // code exists to answer.
    personId: null,
    identity: mail.identity,
    kind: SIGN_IN_CODE_KIND,
    // Unique per mint, so asking again is a new delivery; the code itself is
    // never written down.
    dedupeKey: `sign-in-code:${hashedToken}`,
    to: input.email,
    render: () =>
      renderSignInCodeEmail({
        orgName: mail.displayName,
        code,
        siteUrl: mail.origin,
        branding: mail.branding,
      }),
    logPrefix: "[sign-in-code]",
  });
}

/**
 * Whether the public site on this request's host offers a code (#1765), for
 * a server component: its tenant off the host, then {@link
 * isSignInCodeAvailable}. False when the host resolves no tenant.
 */
export async function signInCodeOffered(
  publicClient: SupabaseClient,
  admin: SupabaseClient,
): Promise<boolean> {
  const { data: tenantId } = await publicClient.rpc("public_tenant_id");
  return typeof tenantId === "string" && tenantId
    ? isSignInCodeAvailable(admin, tenantId)
    : false;
}
