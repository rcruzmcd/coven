import { describe, expect, test } from "bun:test";
import { DEFAULT_ACCENT_STOPS } from "@/lib/branding";
import { isOutageGated } from "@/proxy";
import {
  NEUTRAL_TITLE,
  OUTAGE_RETRY_AFTER_SECONDS,
  outageHtml,
  outageResponse,
} from "./page";
import { PROBE_TTL_MS, classifyProbe, createHealthGate } from "./probe";
import {
  candidateDomains,
  parseSnapshot,
  snapshotKey,
  type OutageSnapshot,
} from "./snapshot";
import { buildSnapshots } from "./sync";

const CHATTER: OutageSnapshot = {
  name: "Chatter Snow",
  brand: [
    { token: "primary", value: "#123456" },
    { token: "background", value: "#fafafa" },
    { token: "logo_url", value: "https://cdn.example.org/logo.png" },
    { token: "typography", value: "editorial" },
  ],
  email: "hello@chattersnow.org",
};

describe("snapshot keys", () => {
  test("a domain maps to a Global Config-safe key", () => {
    expect(snapshotKey("www.ChatterSnow.org")).toBe(
      "outage_www_chattersnow_org",
    );
    expect(snapshotKey("a-b.org")).not.toBe(snapshotKey("a.b.org"));
  });

  test("a host tries itself, then each parent, like the database", () => {
    expect(candidateDomains("portal.chattersnow.org:443")).toEqual([
      "portal.chattersnow.org",
      "chattersnow.org",
    ]);
    expect(candidateDomains("localhost:3000")).toEqual([]);
  });
});

describe("parseSnapshot", () => {
  test("keeps only the outage page's tokens", () => {
    const parsed = parseSnapshot({
      ...CHATTER,
      brand: [...CHATTER.brand, { token: "app_icon_url", value: "x" }],
    });
    expect(parsed?.brand.map((row) => row.token)).not.toContain("app_icon_url");
  });

  test("anything malformed is no snapshot", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ name: "", brand: [] })).toBeNull();
    expect(parseSnapshot({ name: "X", brand: "nope" })).toBeNull();
  });
});

describe("outageHtml", () => {
  test("a snapshot draws the tenant's name, logo, colours and contact", () => {
    const html = outageHtml(CHATTER);
    expect(html).toContain("Chatter Snow is having trouble right now");
    expect(html).toContain('src="https://cdn.example.org/logo.png"');
    expect(html).toContain("#123456");
    expect(html).toContain("#fafafa");
    expect(html).toContain("Source+Serif+4");
    expect(html).toContain("mailto:hello@chattersnow.org");
  });

  test("no snapshot is the neutral page: nobody's name, no placeholder", () => {
    const html = outageHtml(null);
    expect(html).toContain(NEUTRAL_TITLE);
    expect(html).not.toMatch(/chatter|example\.org|headline goes here/i);
    for (const stop of DEFAULT_ACCENT_STOPS) {
      expect(html.toLowerCase()).not.toContain(stop.toLowerCase());
    }
  });

  test("escapes the name and drops unsafe colours and logos", () => {
    const html = outageHtml({
      name: "<script>alert(1)</script>",
      brand: [
        { token: "primary", value: "red;}</style><script>" },
        { token: "logo_url", value: "javascript:alert(1)" },
      ],
      email: null,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
  });
});

describe("outageResponse", () => {
  test("is a 503 nothing caches, with Retry-After", async () => {
    const response = outageResponse(CHATTER, "GET");
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe(
      String(OUTAGE_RETRY_AFTER_SECONDS),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(await response.text()).toContain("Chatter Snow");
  });

  test("HEAD gets the status without a body", async () => {
    expect(await outageResponse(null, "HEAD").text()).toBe("");
  });
});

describe("the health gate", () => {
  test("only infrastructure failures are down", () => {
    expect(classifyProbe(null)).toEqual({ up: true });
    expect(classifyProbe({ code: "42501" })).toEqual({ up: true });
    expect(classifyProbe({ code: "PGRST002" })).toEqual({
      up: false,
      code: "PGRST002",
    });
    expect(classifyProbe({ message: "fetch failed" })).toEqual({
      up: false,
      code: "connection",
    });
  });

  test("probes once per window and shares an in-flight probe", async () => {
    let calls = 0;
    let clock = 0;
    const gate = createHealthGate(
      async () => {
        calls += 1;
        return { code: "PGRST002" };
      },
      () => clock,
    );
    const [a, b] = await Promise.all([gate(), gate()]);
    expect(a.up).toBe(false);
    expect(b.up).toBe(false);
    expect(calls).toBe(1);

    clock += PROBE_TTL_MS - 1;
    await gate();
    expect(calls).toBe(1);

    clock += 1;
    await gate();
    expect(calls).toBe(2);
  });
});

describe("isOutageGated", () => {
  test("gates page reads on either surface", () => {
    expect(isOutageGated("GET", "/home")).toBe(true);
    expect(isOutageGated("HEAD", "/portal/home")).toBe(true);
  });

  test("leaves route handlers, auth, static files and writes alone", () => {
    expect(isOutageGated("GET", "/api/health")).toBe(false);
    expect(isOutageGated("GET", "/auth/callback")).toBe(false);
    expect(isOutageGated("GET", "/logo.png")).toBe(false);
    expect(isOutageGated("POST", "/home")).toBe(false);
  });
});

describe("buildSnapshots", () => {
  test("one snapshot per claimed domain, with only stored values", () => {
    const snapshots = buildSnapshots(
      [
        { id: "t1", name: "Chatter Snow", custom_domain: "chattersnow.org" },
        { id: "t2", name: "No Domain", custom_domain: null },
      ],
      [
        { tenant_id: "t1", key: "brand.primary", value: "#123456" },
        { tenant_id: "t2", key: "brand.primary", value: "#654321" },
      ],
      [{ tenant_id: "t1", key: "org.email_general", value: " hi@cs.org " }],
    );
    expect([...snapshots.keys()]).toEqual(["outage_chattersnow_org"]);
    expect(snapshots.get("outage_chattersnow_org")).toEqual({
      name: "Chatter Snow",
      brand: [{ token: "primary", value: "#123456" }],
      email: "hi@cs.org",
    });
  });

  test("an unset contact address stays unset, never the default", () => {
    const snapshots = buildSnapshots(
      [{ id: "t1", name: "New Org", custom_domain: "new.org" }],
      [],
      [],
    );
    expect(snapshots.get("outage_new_org")?.email).toBeNull();
  });
});
