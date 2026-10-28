import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { NextRequest } from "next/server";
import { hasAuthCookie, resolveDeviceClass, resolvePortalRoute } from "./proxy";

const PORTAL = "portal.example.org";
const PUBLIC = "www.example.org";

// The apex -> portal redirect now reads PORTAL_REDIRECT_HOSTS rather than a
// literal, so these cases have to declare the DNS promise they are testing
// (#795 Phase 2). Two tenants are configured, because "the redirect goes to
// *a* portal host" and "the redirect goes to *this host's* portal" are
// different claims and only a second tenant tells them apart.
const original = process.env.PORTAL_REDIRECT_HOSTS;

beforeAll(() => {
  process.env.PORTAL_REDIRECT_HOSTS = "example.org, second.org";
});

afterAll(() => {
  if (original === undefined) delete process.env.PORTAL_REDIRECT_HOSTS;
  else process.env.PORTAL_REDIRECT_HOSTS = original;
});

describe("resolvePortalRoute on the portal host", () => {
  test("rewrites a bare page path into the /portal route group", () => {
    expect(resolvePortalRoute(PORTAL, "/home")).toEqual({
      kind: "rewrite",
      pathname: "/portal/home",
    });
  });

  // #1467: answered here rather than by rendering the portal index page, whose
  // only job was to redirect -- after the whole layout tree had run.
  test("redirects the root straight to the unprefixed entry path", () => {
    expect(resolvePortalRoute(PORTAL, "/")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/entry",
      status: 307,
    });
  });

  // The page stays as the fallback for requests a redirect would break.
  test("rewrites an RSC fetch of the root to the portal index", () => {
    expect(resolvePortalRoute(PORTAL, "/", true)).toEqual({
      kind: "rewrite",
      pathname: "/portal/",
    });
  });

  test("strips the internal /portal prefix off a document request", () => {
    expect(resolvePortalRoute(PORTAL, "/portal/home")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/home",
      status: 307,
    });
  });

  test("strips bare /portal down to the root", () => {
    expect(resolvePortalRoute(PORTAL, "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
      status: 307,
    });
  });

  test("serves prefixed RSC and Server Action requests instead of redirecting", () => {
    expect(resolvePortalRoute(PORTAL, "/portal/home", true)).toEqual({
      kind: "pass",
    });
  });

  test("leaves the OAuth callback at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/auth/callback")).toEqual({
      kind: "pass",
    });
  });

  test("leaves the email confirm route at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/auth/confirm")).toEqual({
      kind: "pass",
    });
  });

  test("leaves route handlers under /api at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/api/cron/task-reminders")).toEqual({
      kind: "pass",
    });
  });

  test("leaves public/ assets at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/chatter-logo-transparent.png")).toEqual(
      { kind: "pass" },
    );
  });
});

describe("resolvePortalRoute on a tenant's portal host", () => {
  test("rewrites a bare page path the same way the Chatter Snow portal host does", () => {
    expect(resolvePortalRoute("portal.example-nonprofit.org", "/home")).toEqual(
      { kind: "rewrite", pathname: "/portal/home" },
    );
  });

  test("leaves the auth callback at the app root", () => {
    expect(
      resolvePortalRoute("portal.example-nonprofit.org", "/auth/callback"),
    ).toEqual({ kind: "pass" });
  });

  test("strips the internal /portal prefix without leaving the tenant's own host", () => {
    expect(
      resolvePortalRoute("portal.example-nonprofit.org", "/portal/home"),
    ).toEqual({
      kind: "redirect",
      host: "portal.example-nonprofit.org",
      pathname: "/home",
      status: 307,
    });
  });

  test("does not redirect a tenant apex's /portal path, which has no promised subdomain", () => {
    expect(resolvePortalRoute("example-nonprofit.org", "/portal/home")).toEqual(
      { kind: "pass" },
    );
  });
});

describe("resolvePortalRoute on the public hosts", () => {
  test("redirects /portal/* to the portal host without the prefix", () => {
    expect(resolvePortalRoute(PUBLIC, "/portal/home")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/home",
      status: 308,
    });
  });

  test("redirects bare /portal to the portal host root", () => {
    expect(resolvePortalRoute("example.org", "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
      status: 308,
    });
  });

  // Each tenant's apex has to reach its own portal. A single PORTAL_HOST
  // constant could not express this at all -- it sent every public host to
  // one tenant's subdomain.
  test("sends each configured host to its own portal subdomain", () => {
    expect(resolvePortalRoute("second.org", "/portal/home")).toEqual({
      kind: "redirect",
      host: "portal.second.org",
      pathname: "/home",
      status: 308,
    });
  });

  test("does not touch public pages", () => {
    expect(resolvePortalRoute(PUBLIC, "/inventory")).toEqual({ kind: "pass" });
  });

  test("does not touch preview or local hosts", () => {
    expect(resolvePortalRoute("localhost:3000", "/portal/home")).toEqual({
      kind: "pass",
    });
  });
});

// #1467. Both index paths were pages that only redirected, and each cost more
// CPU than the page it sent people to, because every layout above them ran
// first. Every host shape has to land where the page used to send it.
describe("the index redirects", () => {
  test("sends the public root to /home on a public host", () => {
    expect(resolvePortalRoute(PUBLIC, "/")).toEqual({
      kind: "redirect",
      host: PUBLIC,
      pathname: "/home",
      status: 307,
    });
  });

  test("sends a tenant apex's root to its own /home", () => {
    expect(resolvePortalRoute("second.org", "/")).toEqual({
      kind: "redirect",
      host: "second.org",
      pathname: "/home",
      status: 307,
    });
  });

  // A preview, a local run and the demo tenant (`demo.rcmlabs.dev/portal`)
  // serve the portal as a path, so `/portal` is its index there.
  test("sends /portal to the portal entry where the portal is a path", () => {
    for (const host of [
      "localhost:3000",
      "chattersnow-web-git-development-x.vercel.app",
      "demo.example.com",
    ]) {
      expect(resolvePortalRoute(host, "/portal")).toEqual({
        kind: "redirect",
        host,
        pathname: "/portal/entry",
        status: 307,
      });
      expect(resolvePortalRoute(host, "/")).toEqual({
        kind: "redirect",
        host,
        pathname: "/home",
        status: 307,
      });
    }
  });

  // Where a portal subdomain is promised, `/portal` still goes there first;
  // that host then answers its own root (above).
  test("leaves a promised portal subdomain's 308 in charge of /portal", () => {
    expect(resolvePortalRoute(PUBLIC, "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
      status: 308,
    });
  });

  test("passes RSC fetches and actions through to the fallback pages", () => {
    expect(resolvePortalRoute(PUBLIC, "/", true)).toEqual({ kind: "pass" });
    expect(resolvePortalRoute("localhost:3000", "/portal", true)).toEqual({
      kind: "pass",
    });
  });

  test("does not redirect deeper portal paths on a path-served host", () => {
    expect(resolvePortalRoute("localhost:3000", "/portal/entry")).toEqual({
      kind: "pass",
    });
  });
});

// #1145. The public site's legacy event URL and the portal's own event URL are
// the same string, `/events/<uuid>`, and which one it is depends entirely on
// the host -- which is why this redirect cannot live in next.config.ts, where
// it 404'd every event in the portal. The two halves of that claim are the
// first two cases here; the rest fence the rule off from paths that merely
// look like it.
describe("the legacy public event redirect", () => {
  const EVENT = "0520fa8e-6c21-47bc-98d8-bb3b39f2accb";

  test("308s the old public event URL a segment down", () => {
    expect(resolvePortalRoute(PUBLIC, `/events/${EVENT}`)).toEqual({
      kind: "redirect",
      host: PUBLIC,
      pathname: `/events/e/${EVENT}`,
      status: 308,
    });
  });

  test("leaves the portal's identical event URL to the portal", () => {
    expect(resolvePortalRoute(PORTAL, `/events/${EVENT}`)).toEqual({
      kind: "rewrite",
      pathname: `/portal/events/${EVENT}`,
    });
  });

  test("redirects on the tenant's own domain too", () => {
    expect(resolvePortalRoute("second.org", `/events/${EVENT}`)).toEqual({
      kind: "redirect",
      host: "second.org",
      pathname: `/events/e/${EVENT}`,
      status: 308,
    });
  });

  // The constraint that stops this swallowing /events/community, which is the
  // static page the move existed to rescue in the first place.
  test("does not touch a non-uuid segment under /events", () => {
    expect(resolvePortalRoute(PUBLIC, "/events/community")).toEqual({
      kind: "pass",
    });
  });

  test("does not touch the listing or an already-moved event", () => {
    expect(resolvePortalRoute(PUBLIC, "/events")).toEqual({ kind: "pass" });
    expect(resolvePortalRoute(PUBLIC, `/events/e/${EVENT}`)).toEqual({
      kind: "pass",
    });
  });

  // The 308 went out as permanent, so a browser that followed it once keeps
  // asking the portal for the moved URL with no request reaching us to correct.
  // A rewrite, never a redirect back: that would meet the cached 308 head-on.
  test("serves the portal a cached /events/e/<uuid> instead of 404ing it", () => {
    expect(resolvePortalRoute(PORTAL, `/events/e/${EVENT}`)).toEqual({
      kind: "rewrite",
      pathname: `/portal/events/${EVENT}`,
    });
  });

  test("still rewrites an unrelated bare path on the portal host", () => {
    expect(resolvePortalRoute(PORTAL, "/events")).toEqual({
      kind: "rewrite",
      pathname: "/portal/events",
    });
  });
});

describe("resolveDeviceClass", () => {
  test("a phone user-agent gets the mobile shell", () => {
    expect(resolveDeviceClass("mobile", undefined)).toBe("mobile");
  });

  test("a desktop user-agent reports no device type at all", () => {
    expect(resolveDeviceClass(undefined, undefined)).toBe("desktop");
  });

  // A 10" screen has room for the sidebar, and the bottom tab bar is a
  // thumb-reach affordance it does not want.
  test("a tablet gets the desktop shell", () => {
    expect(resolveDeviceClass("tablet", undefined)).toBe("desktop");
  });

  // The whole point of the cookie: UA sniffing cannot see a viewport, so a
  // phone in desktop mode -- and a Playwright run -- says so explicitly.
  test("the override cookie beats the user-agent in both directions", () => {
    expect(resolveDeviceClass(undefined, "mobile")).toBe("mobile");
    expect(resolveDeviceClass("mobile", "desktop")).toBe("desktop");
  });

  // The cookie is client-writable, so a junk value must fall through to the
  // user-agent rather than decide anything.
  test("ignores an override it does not recognise", () => {
    expect(resolveDeviceClass("mobile", "phablet")).toBe("mobile");
    expect(resolveDeviceClass(undefined, "")).toBe("desktop");
  });
});

/**
 * Since #1175 the public site can be signed in on any page, so the session
 * refresh is decided by whether a request carries an auth cookie rather than by
 * where it is going. Getting the name test wrong in either direction is quiet:
 * too narrow and a constituent's header goes stale mid-visit, too broad and
 * every anonymous page view builds a Supabase client for nothing.
 */
describe("hasAuthCookie", () => {
  const withCookies = (names: string[]) =>
    ({
      cookies: { getAll: () => names.map((name) => ({ name, value: "x" })) },
    }) as unknown as NextRequest;

  test("sees the cookie @supabase/ssr writes", () => {
    expect(hasAuthCookie(withCookies(["sb-abcdefgh-auth-token"]))).toBe(true);
  });

  // The token outgrows a single cookie once the JWT carries any real metadata,
  // and @supabase/ssr then writes it as `.0`, `.1` and so on -- the shape the
  // unchunked name test would have missed.
  test("sees a chunked token", () => {
    expect(
      hasAuthCookie(
        withCookies(["sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1"]),
      ),
    ).toBe(true);
  });

  test("is false for a browser carrying nothing", () => {
    expect(hasAuthCookie(withCookies([]))).toBe(false);
  });

  // Both halves of the name are required: an unrelated cookie that happens to
  // start with `sb-` must not put every anonymous request through a refresh.
  test("ignores an unrelated cookie", () => {
    expect(
      hasAuthCookie(withCookies(["device_override", "sb-analytics-id"])),
    ).toBe(false);
  });
});
