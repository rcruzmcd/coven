import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  GOOGLE_SIGNIN_COOKIE,
  GOOGLE_SIGNIN_COOKIE_PATH,
  decodeTenantCookie,
} from "@/lib/auth/platform-google";
import { resolveFailureDestination } from "../../callback/route";

/**
 * Step 4 of #1249, on the tenant's host: the platform host posts the ID token
 * here. Check it belongs to the sign-in this browser started, turn it into a
 * session on this host, and claim pending role grants -- /auth/callback did
 * that for the redirect flow, and this flow never reaches it.
 */
export async function POST(request: Request) {
  const origin = await getRequestOrigin();
  const cookieStore = await cookies();
  const started = decodeTenantCookie(
    cookieStore.get(GOOGLE_SIGNIN_COOKIE)?.value,
  );
  cookieStore.delete({
    name: GOOGLE_SIGNIN_COOKIE,
    path: GOOGLE_SIGNIN_COOKIE_PATH,
  });

  const failure = new URL(
    resolveFailureDestination(started?.next ?? "/portal/home"),
    origin,
  );
  // 303: the browser must GET the destination, not re-POST to it.
  const redirect = (url: URL) => NextResponse.redirect(url, 303);

  const form = await request.formData();
  const idToken = form.get("id_token");
  if (
    !started ||
    form.get("state") !== started.state ||
    typeof idToken !== "string" ||
    !idToken
  ) {
    return redirect(failure);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: started.nonce,
  });
  if (error) return redirect(failure);

  // Same contract as /auth/callback: only throws when a staged grant existed
  // and could not be materialized, so failing closed is safe.
  const { error: claimError } = await supabase.rpc("claim_pending_role_grants");
  if (claimError) return redirect(failure);

  return redirect(new URL(started.next, origin));
}
