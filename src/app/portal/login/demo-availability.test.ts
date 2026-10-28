// The demo button was offered on every tenant's login page, because the only
// condition was DEMO_EMAIL/DEMO_PASSWORD -- environment, not tenant. These
// pin the tenant half of the condition.
import { afterEach, describe, expect, test } from "bun:test";
import type { PublicTenantResult } from "@/lib/branding";
import { isDemoLoginOffered } from "./demo-availability";

const DEMO: PublicTenantResult = {
  status: "resolved",
  tenant: {
    id: "t-demo",
    name: "Demo Nonprofit",
    slug: "demo",
    custom_domain: "demo.rcmlabs.dev",
    plan: "demo",
  },
};

const WHITE_LABEL: PublicTenantResult = {
  status: "resolved",
  tenant: {
    id: "t-customer",
    name: "Somebody Else",
    slug: "somebody-else",
    custom_domain: "somebodyelse.org",
    plan: "white_label",
  },
};

function withCredentials() {
  process.env.DEMO_EMAIL = "demo@example.test";
  process.env.DEMO_PASSWORD = "password123";
}

afterEach(() => {
  delete process.env.DEMO_EMAIL;
  delete process.env.DEMO_PASSWORD;
});

describe("isDemoLoginOffered", () => {
  test("the demo tenant's host with credentials set", () => {
    withCredentials();
    expect(isDemoLoginOffered(DEMO)).toBe(true);
  });

  test("a paying tenant's host is not offered somebody else's demo", () => {
    withCredentials();
    expect(isDemoLoginOffered(WHITE_LABEL)).toBe(false);
  });

  test("the platform's own tenant is not the demo either", () => {
    withCredentials();
    expect(
      isDemoLoginOffered({
        status: "resolved",
        tenant: {
          id: "t-platform",
          name: "Chatter Snow",
          slug: "chatter-snow",
          custom_domain: "chattersnow.org",
          plan: "internal",
        },
      }),
    ).toBe(false);
  });

  // A host nobody claims is not the demo's, and a failed read is no evidence
  // that it is -- showing the button on a blip would put it back on every host
  // at once, which is the bug.
  test("an unresolved host gets nothing", () => {
    withCredentials();
    expect(isDemoLoginOffered({ status: "unresolved" })).toBe(false);
  });

  test("a failed tenant read gets nothing", () => {
    withCredentials();
    expect(isDemoLoginOffered({ status: "unavailable" })).toBe(false);
  });

  // Unchanged from #604: no credentials, no button, whatever the host.
  test("the demo host without credentials", () => {
    expect(isDemoLoginOffered(DEMO)).toBe(false);
  });

  test("half the credentials is not enough", () => {
    process.env.DEMO_EMAIL = "demo@example.test";
    expect(isDemoLoginOffered(DEMO)).toBe(false);
  });
});
