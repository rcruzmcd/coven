import { NextResponse } from "next/server";
import {
  autoPostPage,
  decodePlatformState,
  platformGoogleConfig,
} from "@/lib/auth/platform-google";
import { allowedReturnOrigin } from "@/lib/auth/platform-google-server";

/**
 * Step 3 of #1249, on the platform host: Google form_posts the ID token here;
 * re-post it to the tenant's `/auth/google/complete`. POST, not a redirect, so
 * the token never appears in a URL, history entry or Referer.
 *
 * The return origin is re-validated: `state` came back through the browser
 * and is unsigned.
 */
export async function POST(request: Request) {
  const config = platformGoogleConfig();
  if (!config) return plain("Google sign-in is not configured.", 400);

  const form = await request.formData();
  const state = decodePlatformState(stringField(form, "state"));
  const returnOrigin = state
    ? await allowedReturnOrigin(state.returnOrigin, config.platformOrigin)
    : null;
  if (!state || !returnOrigin) {
    return plain("This sign-in response is not valid.", 400);
  }

  const fields: Record<string, string> = { state: state.tenantState };
  const idToken = stringField(form, "id_token");
  if (idToken) fields.id_token = idToken;
  else fields.error = stringField(form, "error") ?? "missing_token";

  return new NextResponse(
    autoPostPage(`${returnOrigin}/auth/google/complete`, fields),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

function stringField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value ? value : null;
}

function plain(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
