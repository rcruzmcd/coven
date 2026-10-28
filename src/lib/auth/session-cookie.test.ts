import { afterEach, describe, expect, test } from "bun:test";
import { sessionCookieDomain, sessionCookieOptions } from "./session-cookie";

const ENV = "NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS";
const original = process.env[ENV];

function listApexes(value: string | undefined) {
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
}

afterEach(() => listApexes(original));

describe("sessionCookieDomain", () => {
  test("shares one cookie across a listed apex's three names", () => {
    listApexes("chattersnow.org");

    // The point of the whole module: sign in on one, be signed in on the
    // others. All three must produce the *same* string, or the browser ends
    // up holding one cookie per host again.
    expect(sessionCookieDomain("chattersnow.org")).toBe(".chattersnow.org");
    expect(sessionCookieDomain("www.chattersnow.org")).toBe(".chattersnow.org");
    expect(sessionCookieDomain("portal.chattersnow.org")).toBe(
      ".chattersnow.org",
    );
  });

  test("covers every listed apex, not just the first", () => {
    listApexes("chattersnow.org, example.org");

    expect(sessionCookieDomain("portal.example.org")).toBe(".example.org");
  });

  // uat.chattersnow.org is a real deployment (the development preview). A
  // .chattersnow.org cookie written there would share a name with production's
  // and overwrite it, in both directions.
  test("refuses a subdomain that is not one of the three names", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieDomain("uat.chattersnow.org")).toBeUndefined();
    expect(sessionCookieDomain("staging.chattersnow.org")).toBeUndefined();
    expect(sessionCookieDomain("a.b.chattersnow.org")).toBeUndefined();
  });

  // A single-host tenant serves both surfaces from one host, so it needs no
  // shared cookie -- and .rcmlabs.dev would carry the demo's session to the
  // platform tenant and back.
  test("gives an unlisted apex no domain", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieDomain("demo.rcmlabs.dev")).toBeUndefined();
    expect(sessionCookieDomain("coven.rcmlabs.dev")).toBeUndefined();
    expect(sessionCookieDomain("rcmlabs.dev")).toBeUndefined();
  });

  test("never matches a host that merely ends with a listed apex", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieDomain("notchattersnow.org")).toBeUndefined();
    expect(sessionCookieDomain("evil-chattersnow.org")).toBeUndefined();
    // The apex as a *suffix* of a longer registrable domain.
    expect(sessionCookieDomain("chattersnow.org.example.com")).toBeUndefined();
  });

  test("ignores the port, case and a trailing dot on the Host header", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieDomain("WWW.ChatterSnow.org:443")).toBe(
      ".chattersnow.org",
    );
    expect(sessionCookieDomain("chattersnow.org.")).toBe(".chattersnow.org");
  });

  test("gives hosts that cannot carry a domain cookie none", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieDomain("localhost")).toBeUndefined();
    expect(sessionCookieDomain("localhost:3000")).toBeUndefined();
    expect(sessionCookieDomain(null)).toBeUndefined();
    expect(sessionCookieDomain(undefined)).toBeUndefined();
    expect(sessionCookieDomain("")).toBeUndefined();
  });

  // The pre-#1161 behaviour, and the direction every unrecognized case falls
  // in: no variable set means no cookie is scoped anywhere.
  test("scopes nothing when no apex is configured", () => {
    listApexes(undefined);

    expect(sessionCookieDomain("www.chattersnow.org")).toBeUndefined();
    expect(sessionCookieDomain("portal.chattersnow.org")).toBeUndefined();
  });

  test("tolerates an empty or comma-padded variable", () => {
    listApexes(" , ,");

    expect(sessionCookieDomain("www.chattersnow.org")).toBeUndefined();
  });
});

describe("sessionCookieOptions", () => {
  test("hands @supabase/ssr no options at all when host-only", () => {
    listApexes(undefined);

    // Not `{ domain: undefined }`: the library merges cookieOptions over its
    // own defaults, so an object with an undefined key is a different thing to
    // reason about than no object.
    expect(sessionCookieOptions("www.chattersnow.org")).toBeUndefined();
  });

  test("carries the domain when one applies", () => {
    listApexes("chattersnow.org");

    expect(sessionCookieOptions("www.chattersnow.org")).toEqual({
      domain: ".chattersnow.org",
    });
  });
});
