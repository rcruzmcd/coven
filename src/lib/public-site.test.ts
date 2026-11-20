import { describe, expect, spyOn, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DATA_UNAVAILABLE_DIGEST,
  DataUnavailableError,
} from "@/lib/outage/data-unavailable";
import { NOT_FOUND_TITLE, getPublicSite, publicTitle } from "./public-site";

type Result = { data: unknown; error: unknown };

/**
 * Enough of a PostgREST builder for the three reads `getPublicSite` makes.
 * It is both thenable (the site-content and branding reads await `select()`
 * directly) and carries `maybeSingle()` (the tenant read does not).
 */
function fakeClient(responses: Record<string, Result>): SupabaseClient {
  return {
    from(table: string) {
      const result = responses[table] ?? { data: null, error: null };
      const builder = {
        select: () => builder,
        maybeSingle: async () => result,
        then: (resolve: (value: Result) => unknown) => resolve(result),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const NO_ROWS = { data: null, error: null };
/** A failed read that is a bug, not an outage: an RLS denial. */
const DENIED = { code: "42501", message: "permission denied" };
const TENANT = {
  data: { id: "t1", name: "Example Nonprofit", slug: "example" },
  error: null,
};

describe("getPublicSite host resolution", () => {
  test("a host a tenant owns resolves to it", async () => {
    const site = await getPublicSite(
      fakeClient({ public_tenant: TENANT, public_site_content: NO_ROWS }),
    );
    expect(site.status).toBe("resolved");
    expect(site.tenant?.slug).toBe("example");
    expect(site.name).toBe("Example Nonprofit");
  });

  test("a host no tenant owns is unresolved", async () => {
    const site = await getPublicSite(
      fakeClient({ public_tenant: NO_ROWS, public_site_content: NO_ROWS }),
    );
    expect(site.status).toBe("unresolved");
    expect(site.tenant).toBeNull();
  });

  // The distinction this whole shape exists for (#795 Phase 4). Both of these
  // used to be a bare `null`, and the caller 404s on one of them: collapsing
  // them again would mean a database blip 404s every tenant's public site at
  // once, rather than one misconfigured host serving nothing.
  test("a failed read is unavailable, not unresolved", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const site = await getPublicSite(
        fakeClient({
          public_tenant: { data: null, error: DENIED },
          public_site_content: NO_ROWS,
        }),
      );
      expect(site.status).toBe("unavailable");
      expect(site.status).not.toBe("unresolved");
      expect(site.tenant).toBeNull();
      // Loudly, so it is not mistaken for a correctly-refused unknown host.
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  // #1896: an outage is not a blip to render through. The placeholder copy
  // under a 200 is what every host served for two days.
  for (const [label, error] of [
    ["PostgREST down", { code: "PGRST002", message: "schema cache" }],
    ["no answer at all", { message: "fetch failed" }],
    ["statement timeout", { code: "57014", message: "canceling statement" }],
  ] as const) {
    test(`an outage (${label}) throws DataUnavailableError`, async () => {
      const log = spyOn(console, "error").mockImplementation(() => {});
      try {
        const read = getPublicSite(
          fakeClient({
            public_tenant: { data: null, error },
            public_site_content: NO_ROWS,
          }),
        );
        await expect(read).rejects.toBeInstanceOf(DataUnavailableError);
        await expect(read).rejects.toMatchObject({
          digest: DATA_UNAVAILABLE_DIGEST,
        });
      } finally {
        log.mockRestore();
      }
    });
  }

  // The acceptance criterion's other half: a new tenant with no Site Content
  // and no branding is healthy, and renders the defaults as before.
  test("an empty but healthy tenant renders the defaults", async () => {
    const site = await getPublicSite(
      fakeClient({ public_tenant: TENANT, public_site_content: NO_ROWS }),
    );
    expect(site.status).toBe("resolved");
    expect(site.content.text("org.email_general")).toBeTruthy();
  });

  test("an unresolved host names no organization", async () => {
    // It never reaches a browser -- the public layout 404s first -- but the
    // metadata read runs either way and must not blow up on a null tenant.
    // The name used to fall back to Chatter Snow's; since #795 Phase 3 there
    // is no platform name to fall back to, and nothing is named.
    const site = await getPublicSite(
      fakeClient({ public_tenant: NO_ROWS, public_site_content: NO_ROWS }),
    );
    expect(site.name).toBeNull();
  });
});

describe("publicTitle", () => {
  test("names the organization on a resolved host", async () => {
    const site = await getPublicSite(
      fakeClient({ public_tenant: TENANT, public_site_content: NO_ROWS }),
    );
    expect(publicTitle(site, "Gear")).toBe("Gear | Example Nonprofit");
  });

  // A page's own generateMetadata overrides the layout's, so the layout
  // returning a neutral title is not enough on its own -- every public page
  // builds its title through here. Missing this shipped a 404 on someone
  // else's domain titled "Gear | <the default organization>", which
  // e2e/unresolved-host.spec.ts caught and this pins down.
  test("names no organization on a host that resolves to none", async () => {
    const site = await getPublicSite(
      fakeClient({ public_tenant: NO_ROWS, public_site_content: NO_ROWS }),
    );
    expect(publicTitle(site, "Gear")).toBe(NOT_FOUND_TITLE);
    expect(publicTitle(site, "Gear")).not.toMatch(/chatter/i);
  });

  // A blip is not an unknown host: the page still belongs to whoever the
  // request was for, and it still renders.
  test("still names the fallback when the read merely failed", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const site = await getPublicSite(
        fakeClient({
          public_tenant: { data: null, error: DENIED },
          public_site_content: NO_ROWS,
        }),
      );
      // No organization to name, so the page names itself and nobody else --
      // not "Gear | " and not another tenant's name (#795 Phase 3).
      expect(publicTitle(site, "Gear")).toBe("Gear");
    } finally {
      error.mockRestore();
    }
  });
});
