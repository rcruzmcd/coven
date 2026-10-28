import { afterEach, describe, expect, test } from "bun:test";
import {
  isPortalHost,
  isPortalPathname,
  portalRedirectHosts,
  portalRedirectTarget,
  publicSiteHref,
  publicSiteLink,
  stripPortalPrefix,
  toPortalPathname,
} from "./paths";

describe("portal host recognition", () => {
  test("matches Chatter Snow's own portal host", () => {
    expect(isPortalHost("portal.chattersnow.org")).toBe(true);
  });

  test("matches a tenant's portal subdomain on its own domain", () => {
    expect(isPortalHost("portal.example-nonprofit.org")).toBe(true);
  });

  test("does not match public or lookalike hosts", () => {
    expect(isPortalHost("chattersnow.org")).toBe(false);
    expect(isPortalHost("www.chattersnow.org")).toBe(false);
    expect(isPortalHost("portalx.example.org")).toBe(false);
    expect(isPortalHost("localhost")).toBe(false);
  });
});

describe("portalRedirectTarget", () => {
  const original = process.env.PORTAL_REDIRECT_HOSTS;

  afterEach(() => {
    if (original === undefined) delete process.env.PORTAL_REDIRECT_HOSTS;
    else process.env.PORTAL_REDIRECT_HOSTS = original;
  });

  test("sends a configured apex to its own portal subdomain", () => {
    process.env.PORTAL_REDIRECT_HOSTS = "example.org";

    expect(portalRedirectTarget("example.org")).toBe("portal.example.org");
  });

  // One entry covers a tenant's three names: the www alias is derived rather
  // than listed, which is what the old PUBLIC_HOSTS set spelled out by hand.
  test("matches the www alias without it being listed", () => {
    process.env.PORTAL_REDIRECT_HOSTS = "example.org";

    expect(portalRedirectTarget("www.example.org")).toBe("portal.example.org");
  });

  test("does not redirect a host that has not been configured", () => {
    process.env.PORTAL_REDIRECT_HOSTS = "example.org";

    expect(portalRedirectTarget("other.org")).toBeNull();
    expect(portalRedirectTarget("localhost:3000")).toBeNull();
  });

  // demo.example.org is its own tenant, not the apex's www alias. Redirecting
  // it would send a visitor to a portal belonging to somebody else.
  test("does not treat an unrelated subdomain as the apex", () => {
    process.env.PORTAL_REDIRECT_HOSTS = "example.org";

    expect(portalRedirectTarget("demo.example.org")).toBeNull();
    expect(portalRedirectTarget("uat.example.org")).toBeNull();
  });

  test("reads several tenants from one comma-separated list", () => {
    process.env.PORTAL_REDIRECT_HOSTS = " example.org , second.org ";

    expect(portalRedirectHosts()).toEqual(["example.org", "second.org"]);
    expect(portalRedirectTarget("second.org")).toBe("portal.second.org");
  });

  // Unset is the preview and local case. The redirect is cosmetic, so nothing
  // is gated by its absence -- /portal/... still resolves as a path.
  test("redirects nothing when unset or empty", () => {
    delete process.env.PORTAL_REDIRECT_HOSTS;
    expect(portalRedirectHosts()).toEqual([]);
    expect(portalRedirectTarget("example.org")).toBeNull();

    process.env.PORTAL_REDIRECT_HOSTS = "  ,  ";
    expect(portalRedirectHosts()).toEqual([]);
  });

  test("is case-insensitive on both sides", () => {
    process.env.PORTAL_REDIRECT_HOSTS = "Example.ORG";

    expect(portalRedirectTarget("WWW.example.org")).toBe("portal.example.org");
  });
});

describe("portal path translation", () => {
  test("recognizes canonical portal paths without matching lookalikes", () => {
    expect(isPortalPathname("/portal")).toBe(true);
    expect(isPortalPathname("/portal/home")).toBe(true);
    expect(isPortalPathname("/portals")).toBe(false);
    expect(isPortalPathname("/home")).toBe(false);
  });

  test("adds the prefix to a visible portal-host path", () => {
    expect(toPortalPathname("/home")).toBe("/portal/home");
    expect(toPortalPathname("/")).toBe("/portal");
  });

  test("leaves an already-canonical path untouched", () => {
    expect(toPortalPathname("/portal/events/new")).toBe("/portal/events/new");
  });

  test("strips the prefix back off", () => {
    expect(stripPortalPrefix("/portal/home")).toBe("/home");
    expect(stripPortalPrefix("/portal")).toBe("/");
    expect(stripPortalPrefix("/inventory")).toBe("/inventory");
  });

  test("round-trips every canonical path", () => {
    for (const path of [
      "/portal",
      "/portal/home",
      "/portal/finance/donations",
    ]) {
      expect(toPortalPathname(stripPortalPrefix(path))).toBe(path);
    }
  });
});

describe("the login page's link back to the public site", () => {
  const chatterSnow = {
    name: "Chatter Snow",
    custom_domain: "chattersnow.org",
  };
  const platform = {
    name: "Platform",
    custom_domain: "coven.rcmlabs.dev",
  };
  const portalOnly = {
    name: "Portal Only",
    custom_domain: "portal.example.test",
  };

  test("leaves the deployment for the tenant's own domain, from a portal host", () => {
    expect(publicSiteLink("portal.chattersnow.org", chatterSnow)).toEqual({
      href: "https://chattersnow.org/home",
      label: "chattersnow.org",
    });
  });

  test("is not offered at all when the tenant has no public site", () => {
    // The tenant's domain is the portal host itself, so there is nowhere to
    // go back to.
    expect(publicSiteLink("portal.example.test", portalOnly)).toBeNull();
  });

  test("stays relative on a single-host tenant, whose site is on the same host", () => {
    // The platform tenant serves its marketing site and its portal from
    // coven.rcmlabs.dev, so the login links back to its own /home.
    expect(publicSiteLink("coven.rcmlabs.dev", platform)).toEqual({
      href: "/home",
      label: "coven.rcmlabs.dev",
    });
  });

  test("stays relative off a portal host, so a preview stays on the preview", () => {
    expect(publicSiteLink("uat.chattersnow.org", chatterSnow)).toEqual({
      href: "/home",
      label: "chattersnow.org",
    });
  });

  test("falls back to the organization's name when no domain is set", () => {
    // The local stack and preview, where the tenant resolves through
    // TENANT_HOST_OVERRIDE rather than by domain.
    expect(
      publicSiteLink("127.0.0.1:3000", {
        name: "Chatter Snow",
        custom_domain: null,
      }),
    ).toEqual({ href: "/home", label: "Chatter Snow" });
  });

  test("is not offered on a portal host with no domain to link to", () => {
    expect(
      publicSiteLink("portal.example.test", {
        name: "Example",
        custom_domain: null,
      }),
    ).toBeNull();
  });

  test("is not offered when no tenant resolved", () => {
    expect(publicSiteLink("portal.chattersnow.org", null)).toBeNull();
    expect(publicSiteLink("someone-elses-domain.test", null)).toBeNull();
  });
});

// #1161 made NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS canonical, because the same
// list now also scopes the session cookie and the browser has to be able to
// read it. The server-only name keeps working so an operator who has set only
// that one still gets the redirect.
describe("portalRedirectHosts reads either variable", () => {
  const originalPublic = process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS;
  const originalServer = process.env.PORTAL_REDIRECT_HOSTS;

  afterEach(() => {
    if (originalPublic === undefined)
      delete process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS;
    else process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS = originalPublic;
    if (originalServer === undefined) delete process.env.PORTAL_REDIRECT_HOSTS;
    else process.env.PORTAL_REDIRECT_HOSTS = originalServer;
  });

  test("prefers the public name when both are set", () => {
    process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS = "new.org";
    process.env.PORTAL_REDIRECT_HOSTS = "old.org";

    expect(portalRedirectHosts()).toEqual(["new.org"]);
  });

  test("falls back to the server-only name", () => {
    delete process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS;
    process.env.PORTAL_REDIRECT_HOSTS = "old.org";

    expect(portalRedirectTarget("old.org")).toBe("portal.old.org");
  });
});

describe("a path on the tenant's public site (#1654)", () => {
  test("is absolute on the tenant's domain from a portal host", () => {
    expect(
      publicSiteHref(
        "portal.chattersnow.org",
        "chattersnow.org",
        "/events/e/1/photos",
      ),
    ).toBe("https://chattersnow.org/events/e/1/photos");
  });

  test("stays relative off a portal host", () => {
    expect(
      publicSiteHref(
        "uat.chattersnow.org",
        "chattersnow.org",
        "/events/e/1/photos",
      ),
    ).toBe("/events/e/1/photos");
  });

  test("is null from a portal host when the tenant has no public site", () => {
    expect(
      publicSiteHref("portal.example.test", "portal.example.test", "/x"),
    ).toBeNull();
    expect(publicSiteHref("portal.example.test", null, "/x")).toBeNull();
  });
});
