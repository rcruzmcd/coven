import { afterEach, describe, expect, test } from "bun:test";
import { servesPublicApp, surfaceAtRoot } from "@/lib/pwa/host";

const ORIGINAL = process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS;

function redirectHosts(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS;
  else process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS = value;
}

afterEach(() => redirectHosts(ORIGINAL));

describe("surfaceAtRoot", () => {
  test("the portal owns the root on a portal host, and nowhere else", () => {
    expect(surfaceAtRoot("portal", "portal.chattersnow.org")).toBe(true);
    expect(surfaceAtRoot("portal", "portal.example.test")).toBe(true);
    expect(surfaceAtRoot("portal", "www.chattersnow.org")).toBe(false);
    expect(surfaceAtRoot("portal", "demo.rcmlabs.dev")).toBe(false);
    expect(surfaceAtRoot("portal", "localhost")).toBe(false);
  });

  test("the public site owns the root where the portal redirects away", () => {
    redirectHosts("chattersnow.org");
    // `/portal/*` 308s to portal.chattersnow.org from both of these, so `/`
    // is the whole of what this host serves.
    expect(surfaceAtRoot("public", "www.chattersnow.org")).toBe(true);
    expect(surfaceAtRoot("public", "chattersnow.org")).toBe(true);
  });

  test("neither owns the root where one origin serves both", () => {
    redirectHosts("chattersnow.org");
    // The demo tenant, a preview and a local run all serve the portal as a
    // path, so the public app narrows to /my and the scopes stay disjoint.
    for (const host of ["demo.rcmlabs.dev", "localhost:3000"]) {
      expect(surfaceAtRoot("portal", host)).toBe(false);
      expect(surfaceAtRoot("public", host)).toBe(false);
    }
  });

  test("a preview with no redirect hosts configured shares its origin", () => {
    redirectHosts(undefined);
    expect(surfaceAtRoot("public", "chattersnow-web-abc123.vercel.app")).toBe(
      false,
    );
  });
});

describe("servesPublicApp", () => {
  test("no public app on a host that serves no public page", () => {
    // The proxy rewrites the whole marketing tree into /portal/* there, so a
    // public manifest would describe an app with nothing in it -- and claim
    // the same `id` as the portal's.
    expect(servesPublicApp("portal.chattersnow.org")).toBe(false);
    expect(servesPublicApp("www.chattersnow.org")).toBe(true);
    expect(servesPublicApp("demo.rcmlabs.dev")).toBe(true);
  });
});
