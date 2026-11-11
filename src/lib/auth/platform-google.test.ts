import { afterEach, describe, expect, test } from "bun:test";
import {
  autoPostPage,
  buildGoogleAuthUrl,
  decodePlatformState,
  decodeTenantCookie,
  encodePlatformState,
  encodeTenantCookie,
  hashNonce,
  isAllowedReturnHost,
  parseReturnOrigin,
  platformGoogleStartPath,
} from "./platform-google";

const PLATFORM = "https://coven.rcmlabs.dev";
const TENANT_DOMAINS = new Set([
  "chattersnow.org",
  "demo.rcmlabs.dev",
  "coven.rcmlabs.dev",
]);
const lookup = async (domain: string) => TENANT_DOMAINS.has(domain);

async function allowed(raw: string): Promise<boolean> {
  const url = parseReturnOrigin(raw);
  return url ? isAllowedReturnHost(url, PLATFORM, lookup) : false;
}

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("return-origin allowlist", () => {
  test.each([
    "https://chattersnow.org",
    "https://www.chattersnow.org",
    "https://portal.chattersnow.org",
    "https://demo.rcmlabs.dev",
    "https://coven.rcmlabs.dev",
  ])("accepts %s", async (origin) => {
    expect(await allowed(origin)).toBe(true);
  });

  test.each([
    "https://evil.example",
    "https://evilchattersnow.org",
    "https://chattersnow.org.evil.example",
    "https://uat.chattersnow.org",
    "https://anything.chattersnow.org",
    "http://chattersnow.org",
    "https://chattersnow.org:8443",
    "https://user:pw@chattersnow.org",
    "https://chattersnow.org/path",
    "javascript:alert(1)",
    "",
  ])("rejects %s", async (origin) => {
    expect(await allowed(origin)).toBe(false);
  });

  test("an extra host is accepted only when listed", async () => {
    expect(await allowed("https://uat.chattersnow.org")).toBe(false);
    process.env.GOOGLE_SIGNIN_EXTRA_HOSTS = "uat.chattersnow.org";
    expect(await allowed("https://uat.chattersnow.org")).toBe(true);
  });

  test("loopback http is only the platform itself", async () => {
    const url = parseReturnOrigin("http://localhost:3000")!;
    expect(
      await isAllowedReturnHost(url, "http://localhost:3000", lookup),
    ).toBe(true);
    expect(await isAllowedReturnHost(url, PLATFORM, lookup)).toBe(false);
  });
});

describe("state and cookie round-trips", () => {
  test("platform state", () => {
    const state = {
      returnOrigin: "https://chattersnow.org",
      tenantState: "abc",
    };
    expect(decodePlatformState(encodePlatformState(state))).toEqual(state);
    expect(decodePlatformState("not-base64!")).toBeNull();
    expect(decodePlatformState(null)).toBeNull();
  });

  test("tenant cookie", () => {
    const value = { nonce: "n", state: "s", next: "/portal/home" };
    expect(decodeTenantCookie(encodeTenantCookie(value))).toEqual(value);
    expect(decodeTenantCookie('{"nonce":1}')).toBeNull();
    expect(decodeTenantCookie(undefined)).toBeNull();
  });
});

test("nonce is hashed as lowercase hex SHA-256, as GoTrue compares it", async () => {
  expect(await hashNonce("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("Google URL posts the id_token back to the platform callback", () => {
  const url = new URL(
    buildGoogleAuthUrl({
      config: {
        platformOrigin: PLATFORM,
        clientId: "id.apps.googleusercontent.com",
      },
      hashedNonce: "h",
      state: "s",
      selectAccount: true,
    }),
  );
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${PLATFORM}/auth/google/callback`,
  );
  expect(url.searchParams.get("response_type")).toBe("id_token");
  expect(url.searchParams.get("response_mode")).toBe("form_post");
  expect(url.searchParams.get("prompt")).toBe("select_account");
});

test("auto-post page escapes what it embeds", () => {
  const html = autoPostPage("https://chattersnow.org/auth/google/complete", {
    id_token: '"><script>x</script>',
  });
  expect(html).not.toContain("<script>x");
  expect(html).toContain("&quot;&gt;&lt;script&gt;");
});

test("start path is null unless the platform origin is configured", () => {
  delete process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN;
  expect(platformGoogleStartPath("/portal/home")).toBeNull();
  process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN = PLATFORM;
  expect(platformGoogleStartPath("/my", true)).toBe(
    "/auth/google?next=%2Fmy&prompt=select_account",
  );
});
