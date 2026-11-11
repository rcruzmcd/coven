/**
 * Google sign-in through the platform's own domain (#1249).
 *
 * `signInWithOAuth({ provider: "google" })` redirects through
 * `<ref>.supabase.co/auth/v1/callback`, so Google's account chooser reads "to
 * continue to <ref>.supabase.co" -- and `supabase.co` can never pass Google's
 * brand verification, because we cannot prove we own it. Instead the Google
 * leg runs on the platform tenant's host (`coven.rcmlabs.dev`), under one
 * OAuth client whose only authorized domain is `rcmlabs.dev`, and the ID token
 * it yields is handed back to the tenant's host to become a session there:
 *
 *   tenant  GET  /auth/google            nonce + state into a cookie on the tenant host
 *   platform GET /auth/google/start      validate `return`, redirect to Google
 *   Google   POST /auth/google/callback  (form_post) re-post the token to `return`
 *   tenant  POST /auth/google/complete   check state, signInWithIdToken, claim grants
 *
 * The platform host never creates a session. The tenant host never talks to
 * Google. The `return` allowlist ({@link isAllowedReturnHost}) is the security
 * boundary: whatever origin it accepts receives a live Google ID token, and an
 * ID token plus the raw nonce is a sign-in as that person on every tenant (the
 * Auth instance is shared).
 *
 * Unset `PLATFORM_AUTH_ORIGIN` / `GOOGLE_SIGNIN_CLIENT_ID` and the forms fall
 * back to the old `signInWithOAuth` button -- local dev and previews keep
 * working without a Google client of their own.
 */

export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

/** Cookie on the tenant host holding the raw nonce, state and destination. */
export const GOOGLE_SIGNIN_COOKIE = "coven-google-signin";

/** Scoped to the routes that read it; ten minutes covers a slow chooser. */
export const GOOGLE_SIGNIN_COOKIE_PATH = "/auth/google";
export const GOOGLE_SIGNIN_COOKIE_MAX_AGE = 600;

export type PlatformGoogleConfig = {
  /** e.g. `https://coven.rcmlabs.dev` -- no trailing slash. */
  platformOrigin: string;
  clientId: string;
};

/**
 * The platform's origin as the browser bundle sees it: whether to send the
 * Google button through this flow at all. The client ID stays server-only;
 * only the platform host ever uses it.
 */
export function platformAuthOriginPublic(): string | null {
  return normalizeOrigin(process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN);
}

/**
 * Where the "Continue with Google" button should send the browser on this
 * host, or null to keep the old `signInWithOAuth` redirect flow.
 */
export function platformGoogleStartPath(
  next: string,
  selectAccount = false,
): string | null {
  if (!platformAuthOriginPublic()) return null;
  const params = new URLSearchParams({ next });
  if (selectAccount) params.set("prompt", "select_account");
  return `${GOOGLE_SIGNIN_COOKIE_PATH}?${params}`;
}

/** Server-side config, or null when the flow is not configured. */
export function platformGoogleConfig(): PlatformGoogleConfig | null {
  const platformOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN,
  );
  const clientId = process.env.GOOGLE_SIGNIN_CLIENT_ID?.trim();
  if (!platformOrigin || !clientId) return null;
  return { platformOrigin, clientId };
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * Google is sent the SHA-256 of the nonce (hex) and puts that in the ID
 * token; `signInWithIdToken` is given the raw value and GoTrue hashes it to
 * compare. Hex, not base64, because that is what GoTrue hashes to.
 */
export async function hashNonce(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(nonce),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** What the tenant host keeps in {@link GOOGLE_SIGNIN_COOKIE}. */
export type TenantSignInCookie = { nonce: string; state: string; next: string };

export function encodeTenantCookie(value: TenantSignInCookie): string {
  return JSON.stringify(value);
}

export function decodeTenantCookie(
  raw: string | undefined,
): TenantSignInCookie | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TenantSignInCookie).nonce === "string" &&
      typeof (parsed as TenantSignInCookie).state === "string" &&
      typeof (parsed as TenantSignInCookie).next === "string"
    ) {
      return parsed as TenantSignInCookie;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * The `state` the platform sends Google: the return origin plus the tenant's
 * own state, so the callback knows where to post without a cookie of its own
 * (Google's form_post is a cross-site POST, which would not carry a Lax one).
 * Not signed: the callback re-validates the origin against the same allowlist
 * as the start route, so a tampered value can only name an origin that was
 * acceptable anyway.
 */
export type PlatformState = { returnOrigin: string; tenantState: string };

export function encodePlatformState(value: PlatformState): string {
  return base64Url(
    new TextEncoder().encode(
      JSON.stringify({ r: value.returnOrigin, s: value.tenantState }),
    ),
  );
}

export function decodePlatformState(
  raw: string | null | undefined,
): PlatformState | null {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
    );
    const parsed: unknown = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { r: unknown }).r === "string" &&
      typeof (parsed as { s: unknown }).s === "string"
    ) {
      const { r, s } = parsed as { r: string; s: string };
      return { returnOrigin: r, tenantState: s };
    }
  } catch {
    // fall through
  }
  return null;
}

export function buildGoogleAuthUrl(input: {
  config: PlatformGoogleConfig;
  hashedNonce: string;
  state: string;
  selectAccount: boolean;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set(
    "redirect_uri",
    `${input.config.platformOrigin}/auth/google/callback`,
  );
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", input.hashedNonce);
  url.searchParams.set("state", input.state);
  if (input.selectAccount) url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Parses a `return` value into an origin, or null. `https:` only, except a
 * loopback host in development. No path, query or credentials: an origin is
 * all the callback needs and all it is allowed to choose.
 */
export function parseReturnOrigin(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.origin !== raw.replace(/\/$/, "")) return null;
  const loopback = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && loopback) return url;
  return null;
}

/**
 * The three names a tenant's domain may be served on, from its
 * `custom_domain`. Deliberately not "any subdomain": `resolve_tenant_id_from_host`
 * matches every `*.example.org`, and a subdomain the customer has pointed
 * somewhere else would receive ID tokens for accounts that are not theirs.
 */
export function candidateTenantDomains(host: string): string[] {
  const domains = [host];
  for (const prefix of ["www.", "portal."]) {
    if (host.startsWith(prefix)) domains.push(host.slice(prefix.length));
  }
  return domains;
}

/**
 * Whether `returnUrl` may receive an ID token.
 *
 * - the platform's own origin (it signs in on itself, and local dev);
 * - a host listed in `GOOGLE_SIGNIN_EXTRA_HOSTS` (e.g. `uat.chattersnow.org`,
 *   which is not one of the three canonical names);
 * - `<custom_domain>`, `www.<custom_domain>` or `portal.<custom_domain>` of an
 *   active tenant -- `isActiveTenantDomain` answers exact matches only.
 */
export async function isAllowedReturnHost(
  returnUrl: URL,
  platformOrigin: string,
  isActiveTenantDomain: (domain: string) => Promise<boolean>,
): Promise<boolean> {
  if (returnUrl.origin === platformOrigin) return true;
  if (returnUrl.protocol !== "https:" || returnUrl.port) return false;

  const host = returnUrl.hostname.toLowerCase();
  const extra = (process.env.GOOGLE_SIGNIN_EXTRA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(host)) return true;

  for (const domain of candidateTenantDomains(host)) {
    if (await isActiveTenantDomain(domain)) return true;
  }
  return false;
}

/** The page that carries the ID token from the platform host to the tenant's. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function autoPostPage(
  action: string,
  fields: Record<string, string>,
): string {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signing in…</title></head><body><form method="post" action="${escapeHtml(action)}">${inputs}<noscript><button type="submit">Continue</button></noscript></form><script>document.forms[0].submit()</script></body></html>`;
}
