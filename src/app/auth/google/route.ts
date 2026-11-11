import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  GOOGLE_SIGNIN_COOKIE,
  GOOGLE_SIGNIN_COOKIE_MAX_AGE,
  GOOGLE_SIGNIN_COOKIE_PATH,
  encodeTenantCookie,
  hashNonce,
  platformAuthOriginPublic,
  randomToken,
} from "@/lib/auth/platform-google";
import { resolveDestination } from "../callback/route";

/**
 * Step 1 of #1249, on the tenant's host: mint the nonce and state, keep them
 * here, and send the browser to the platform host to talk to Google.
 *
 * The cookie is `SameSite=None` because it comes back on step 4, a cross-site
 * POST from the platform host, which a Lax cookie would not ride on.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = await getRequestOrigin();
  const platformOrigin = platformAuthOriginPublic();
  const next = resolveDestination(requestUrl.searchParams.get("next"), origin);
  if (!platformOrigin) {
    return NextResponse.redirect(new URL("/portal/login", origin));
  }

  const nonce = randomToken();
  const state = randomToken();
  (await cookies()).set(
    GOOGLE_SIGNIN_COOKIE,
    encodeTenantCookie({ nonce, state, next }),
    {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: GOOGLE_SIGNIN_COOKIE_PATH,
      maxAge: GOOGLE_SIGNIN_COOKIE_MAX_AGE,
    },
  );

  const start = new URL("/auth/google/start", platformOrigin);
  start.searchParams.set("return", origin);
  start.searchParams.set("nonce", await hashNonce(nonce));
  start.searchParams.set("state", state);
  if (requestUrl.searchParams.get("prompt") === "select_account") {
    start.searchParams.set("prompt", "select_account");
  }
  return NextResponse.redirect(start);
}
