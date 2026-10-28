import { afterEach, describe, expect, test } from "bun:test";
import { tenantHost } from "./server";

const original = process.env.TENANT_HOST_OVERRIDE;

afterEach(() => {
  if (original === undefined) delete process.env.TENANT_HOST_OVERRIDE;
  else process.env.TENANT_HOST_OVERRIDE = original;
});

describe("tenantHost", () => {
  test("uses the request Host when nothing is set", () => {
    delete process.env.TENANT_HOST_OVERRIDE;
    expect(tenantHost("portal.chattersnow.org")).toBe("portal.chattersnow.org");
  });

  // The case this exists for: a preview deployment's host
  // (chattersnow-web-git-development-*.vercel.app) matches no custom_domain,
  // and custom_domain is a single unique column so a second host cannot be
  // listed against the tenant.
  test("prefers the override over the request Host", () => {
    process.env.TENANT_HOST_OVERRIDE = "chattersnow.org";
    expect(tenantHost("chattersnow-web-git-development-x.vercel.app")).toBe(
      "chattersnow.org",
    );
  });

  test("ignores an override set to whitespace", () => {
    process.env.TENANT_HOST_OVERRIDE = "   ";
    expect(tenantHost("chattersnow.org")).toBe("chattersnow.org");
  });

  test("is null when there is neither", () => {
    delete process.env.TENANT_HOST_OVERRIDE;
    expect(tenantHost(null)).toBeNull();
  });

  test("answers even with no request Host at all", () => {
    process.env.TENANT_HOST_OVERRIDE = "demo.rcmlabs.dev";
    expect(tenantHost(null)).toBe("demo.rcmlabs.dev");
  });
});
