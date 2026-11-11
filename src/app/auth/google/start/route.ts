import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  encodePlatformState,
  platformGoogleConfig,
} from "@/lib/auth/platform-google";
import { allowedReturnOrigin } from "@/lib/auth/platform-google-server";

/**
 * Step 2 of #1249, on the platform host: refuse any `return` that is not a
 * tenant's, then hand the browser to Google. Never a redirect on refusal --
 * the whole point is to not send anyone anywhere we did not choose.
 */
export async function GET(request: Request) {
  const config = platformGoogleConfig();
  if (!config) return refuse("Google sign-in is not configured.");

  const params = new URL(request.url).searchParams;
  const nonce = params.get("nonce");
  const tenantState = params.get("state");
  if (!nonce || !/^[0-9a-f]{64}$/.test(nonce) || !tenantState) {
    return refuse("This sign-in link is incomplete.");
  }

  const returnOrigin = await allowedReturnOrigin(
    params.get("return"),
    config.platformOrigin,
  );
  if (!returnOrigin) return refuse("This sign-in link is not valid.");

  return NextResponse.redirect(
    buildGoogleAuthUrl({
      config,
      hashedNonce: nonce,
      state: encodePlatformState({ returnOrigin, tenantState }),
      selectAccount: params.get("prompt") === "select_account",
    }),
  );
}

function refuse(message: string) {
  return new NextResponse(message, {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
