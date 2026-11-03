import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_PAGE_SLOTS,
  REQUIRED_PUBLIC_PAGES,
  getPageVisibility,
  getTenantPageVisibility,
  hiddenSlots,
  moduleBlockedSlots,
  pageVisibilitySettingKey,
  platformOnlySlotKeys,
  slotsForTenant,
} from "./page-visibility";

type Row = { slot: string; value: unknown };
type ModuleRow = { module_key: string; enabled: boolean };

/**
 * Since #902 `getPageVisibility` reads two tables, so the fake dispatches on the
 * name rather than answering everything with the same rows. `modules` defaults
 * to the whole catalog being on, which is every tenant until an operator says
 * otherwise -- so a test that says nothing about modules gets the pre-#902
 * behaviour.
 */
function clientReturning(
  data: Row[] | null,
  modules: ModuleRow[] = [],
  plan: string | null = "white_label",
): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () =>
        selected({
          data: table === "public_tenant_modules" ? modules : data,
          error: null,
        }),
    }),
  } as unknown as SupabaseClient;

  // The host's tenant, which `getPublicTenant` reads with `.maybeSingle()`.
  // A white-label customer by default -- every tenant but the platform's own.
  function selected(result: { data: unknown; error: unknown }) {
    return Object.assign(Promise.resolve(result), {
      maybeSingle: async () => ({
        data: plan === null ? null : { id: "t", name: "T", slug: "t", plan },
        error: null,
      }),
    });
  }
}

/**
 * The shape PostgREST actually returns when the view is missing -- which is how
 * this failed in production, where the migration creating
 * `public_page_visibility` had never been pushed.
 */
function clientFailing(): SupabaseClient {
  const failure = {
    data: null,
    error: {
      code: "PGRST205",
      message:
        "Could not find the table 'public.public_page_visibility' in the schema cache",
      details: null,
      hint: "Perhaps you meant the table 'public.public_site_images'",
    },
  };
  return {
    from: () => ({
      select: () =>
        Object.assign(Promise.resolve(failure), {
          maybeSingle: async () => failure,
        }),
    }),
  } as unknown as SupabaseClient;
}

describe("pageVisibilitySettingKey", () => {
  test("namespaces the slot under the page_visibility prefix", () => {
    expect(pageVisibilitySettingKey("programs")).toBe(
      "page_visibility.programs",
    );
  });
});

describe("PUBLIC_PAGE_SLOTS", () => {
  test("has no duplicate keys", () => {
    const keys = PUBLIC_PAGE_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Production is deployed with no page_visibility rows at all, so these
  // defaults are what actually keeps the unapproved sections dark.
  test("keeps the sections awaiting board approval hidden by default", () => {
    for (const key of ["programs", "learn", "support"]) {
      const slot = PUBLIC_PAGE_SLOTS.find((entry) => entry.key === key);
      expect(slot?.defaultVisible).toBe(false);
    }
  });

  // Registering a slot only filters it out of the nav and footer. Without a
  // gate in the section's own layout its URLs stay live and indexable, so the
  // board hides the link and believes it has hidden the section -- which is
  // exactly what had happened to about/events/gears/get-involved/contact:
  // five of the eight slots were registered but never gated.
  test("every registered slot has a route gate in its section layout", () => {
    // Resolved from `src/app`, not from `(public)`: a gated route need not be
    // inside that route group. `/links` is not, because the group's layout is
    // the site header and footer it deliberately does without (#937).
    const appDir = join(import.meta.dirname, "..", "app");

    for (const slot of PUBLIC_PAGE_SLOTS) {
      // A slot may name more than one gate: `audiences` covers /nonprofits and
      // /business, sibling routes with no shared layout, and each has to call
      // it or the ungated one stays live (#1328).
      const gates = slot.gate
        ? [slot.gate].flat()
        : [join("(public)", slot.key, "layout.tsx")];

      for (const gate of gates) {
        let source: string;
        try {
          source = readFileSync(join(appDir, gate), "utf8");
        } catch {
          throw new Error(
            `${slot.key} is registered in PUBLIC_PAGE_SLOTS but has no ${gate} to gate it.`,
          );
        }

        // Up to the key's closing quote, not the call's closing paren: a gate
        // may pass a preview exception after the slot (#1472).
        expect(
          source.includes(`requireVisiblePage("${slot.key}"`),
          `${gate} must call requireVisiblePage("${slot.key}")`,
        ).toBe(true);
      }
    }
  });

  /**
   * The three routes that exist for the platform's own marketing (#1328, #1329,
   * #1330). They are off for the same reason as each other -- a customer
   * publishing the product's pitch under their brand would be introducing their
   * visitors to their software vendor -- and `pricing` is off for a second
   * reason on top: it stays dark even on the site it was written for until
   * somebody has agreed to the numbers on it (#998, open question 4).
   */
  test("keeps the product's own marketing routes dark by default", () => {
    for (const key of ["audiences", "modules", "pricing"]) {
      const slot = PUBLIC_PAGE_SLOTS.find((entry) => entry.key === key);
      expect(slot, key).toBeDefined();
      expect(slot?.defaultVisible, key).toBe(false);
      // No module either: these describe what the platform does, and what a
      // tenant has been sold does not change whether that is true.
      expect(slot?.module, key).toBeUndefined();
    }
  });

  // The sizing guide is not awaiting board approval -- it is one tenant's
  // snow-sports content sitting under a section every tenant gets. Provisioning
  // copies no site content, so this default is the only thing standing between
  // a new customer and a ski-length chart on their own domain (#795 Phase 3).
  test("keeps the sizing guide hidden until a tenant claims it", () => {
    const slot = PUBLIC_PAGE_SLOTS.find(
      (entry) => entry.key === "gears-sizing",
    );

    expect(slot?.defaultVisible).toBe(false);
    // Its parent stays on: a gear library is chrome, the charts are content.
    expect(
      PUBLIC_PAGE_SLOTS.find((entry) => entry.key === "gears")?.defaultVisible,
    ).toBe(true);
  });
});

/**
 * Every directory under `src/app/(public)` holding a `page.tsx`, relative to
 * that group and with `/` separators -- `""` is the group root.
 */
function publicPageDirs(): string[] {
  const root = join(import.meta.dirname, "..", "app", "(public)");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === "page.tsx") {
        found.push(relative(root, dir).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return found.sort();
}

const under = (dir: string, base: string) =>
  dir === base || dir.startsWith(`${base}/`);

/**
 * Whether a slot's gate covers a page directory: a gating layout covers its
 * own directory and everything beneath it, a gating page only itself.
 */
function gatedBySlot(dir: string): boolean {
  return PUBLIC_PAGE_SLOTS.some((slot) => {
    const gates = slot.gate
      ? [slot.gate].flat()
      : [`(public)/${slot.key}/layout.tsx`];
    return gates.some((gate) => {
      if (!gate.startsWith("(public)/")) return false;
      const gateDir = dirname(gate.slice("(public)/".length));
      return gate.endsWith("/layout.tsx")
        ? under(dir, gateDir)
        : dir === gateDir;
    });
  });
}

function requiredBy(dir: string): boolean {
  return REQUIRED_PUBLIC_PAGES.some((page) =>
    page.routes.some((route) =>
      route === "" ? dir === "" : under(dir, route),
    ),
  );
}

describe("REQUIRED_PUBLIC_PAGES", () => {
  // #1726: a new public page has to be a slot or listed as always on, so
  // nobody ships one without deciding whether the board can hide it.
  test("every (public) route is gated by a slot or listed as required", () => {
    const undecided = publicPageDirs().filter(
      (dir) => !gatedBySlot(dir) && !requiredBy(dir),
    );
    expect(
      undecided,
      "Add a PUBLIC_PAGE_SLOTS entry (and gate it) or a REQUIRED_PUBLIC_PAGES entry for each",
    ).toEqual([]);
  });

  test("every required route exists, and none is also behind a slot", () => {
    const dirs = publicPageDirs();
    for (const page of REQUIRED_PUBLIC_PAGES) {
      for (const route of page.routes) {
        const covered = dirs.filter((dir) =>
          route === "" ? dir === "" : under(dir, route),
        );
        expect(covered.length, `${page.key}: ${route || "/"}`).toBeGreaterThan(
          0,
        );
        for (const dir of covered) {
          expect(gatedBySlot(dir), `${dir} is both required and gated`).toBe(
            false,
          );
        }
      }
    }
  });

  test("has no duplicate keys", () => {
    const keys = REQUIRED_PUBLIC_PAGES.map((page) => page.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getPageVisibility", () => {
  test("falls back to the registry default when a slot has no row", async () => {
    const visibility = await getPageVisibility(clientReturning([]));

    for (const slot of PUBLIC_PAGE_SLOTS) {
      expect(visibility[slot.key]).toBe(slot.defaultVisible);
    }
  });

  test("a stored value overrides the registry default in both directions", async () => {
    const visibility = await getPageVisibility(
      clientReturning([
        { slot: "programs", value: true },
        { slot: "contact", value: false },
      ]),
    );

    expect(visibility.programs).toBe(true);
    expect(visibility.contact).toBe(false);
  });

  // A null, a string, or a hand-edited row must not be read as "publish it".
  test("treats a non-boolean value as unset rather than as visible", async () => {
    const visibility = await getPageVisibility(
      clientReturning([
        { slot: "programs", value: null },
        { slot: "learn", value: "true" },
      ]),
    );

    expect(visibility.programs).toBe(false);
    expect(visibility.learn).toBe(false);
  });

  test("a failed query leaves every slot on its default", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const visibility = await getPageVisibility(clientFailing());

      expect(visibility.programs).toBe(false);
      expect(visibility.contact).toBe(true);
    } finally {
      error.mockRestore();
    }
  });

  // The fallback above is safe but indistinguishable from "not configured yet",
  // so the failure itself has to reach the server logs -- otherwise a broken
  // read shows up only as admin toggles that appear not to save.
  test("logs the failure rather than falling back silently", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      await getPageVisibility(clientFailing());

      // Three times: the visibility read, the module read (#902) and the
      // host's tenant (the platform-only slots) are separate queries against
      // the same broken client, and each has to say so.
      expect(error).toHaveBeenCalledTimes(3);
      expect(error.mock.calls[0]?.[1]).toMatchObject({ code: "PGRST205" });
    } finally {
      error.mockRestore();
    }
  });

  test("ignores rows for slots that aren't in the registry", async () => {
    const visibility = await getPageVisibility(
      clientReturning([{ slot: "not-a-section", value: true }]),
    );

    expect(visibility["not-a-section"]).toBeUndefined();
  });
});

// #902. The entitlement is the platform's and the visibility flag is the
// board's, and when they disagree the entitlement wins -- so these assert the
// override in both directions, and that nothing changes for a tenant that has
// every module, which is every tenant today.
describe("module gating", () => {
  const MODULE_KEYS = [
    "events",
    "artwork",
    "calendar",
    "programs",
    "inventory",
    "volunteers",
    "communications",
    "finance",
    "reimbursements",
    "people",
    "governance",
    "access_management",
    "administration",
    // Added after the catalog above (#1471).
    "publications",
  ];

  test("every slot's module, where it has one, is a real module", () => {
    // The registry is TypeScript and the catalog is SQL, so nothing but this
    // stops a typo mapping a section to a module that will never be off.
    for (const slot of PUBLIC_PAGE_SLOTS) {
      if (slot.module === undefined) continue;
      expect(MODULE_KEYS, `${slot.key} -> ${slot.module}`).toContain(
        slot.module,
      );
    }
  });

  test("a slot with its module off is hidden whatever the board stored", async () => {
    const visibility = await getPageVisibility(
      clientReturning(
        [
          { slot: "events", value: true },
          { slot: "gears", value: true },
          { slot: "contact", value: true },
        ],
        [{ module_key: "inventory", enabled: false }],
      ),
    );

    expect(visibility.gears).toBe(false);
    // Both slots the Inventory module owns, including the single-route one.
    expect(visibility["gears-sizing"]).toBe(false);
    // And nothing else moves.
    expect(visibility.events).toBe(true);
    expect(visibility.contact).toBe(true);
  });

  test("a slot whose module is on behaves exactly as before", async () => {
    const withModules = await getPageVisibility(
      clientReturning(
        [{ slot: "programs", value: true }],
        MODULE_KEYS.map((key) => ({ module_key: key, enabled: true })),
      ),
    );
    const withoutModules = await getPageVisibility(
      clientReturning([{ slot: "programs", value: true }]),
    );

    expect(withModules).toEqual(withoutModules);
    expect(withModules.programs).toBe(true);
  });

  test("an off module cannot publish a section the board has hidden", async () => {
    // The override is one-way. `support` defaults to hidden, so Finance being
    // *on* must not turn it on.
    const visibility = await getPageVisibility(
      clientReturning([], [{ module_key: "finance", enabled: true }]),
    );
    expect(visibility.support).toBe(false);
  });

  test("an unmapped slot ignores modules entirely", async () => {
    // About, Learn and Brand are the organization's own pages; no entitlement
    // reaches them.
    const visibility = await getPageVisibility(
      clientReturning(
        [
          { slot: "about", value: true },
          { slot: "learn", value: true },
        ],
        MODULE_KEYS.map((key) => ({ module_key: key, enabled: false })),
      ),
    );
    expect(visibility.about).toBe(true);
    expect(visibility.learn).toBe(true);
  });

  test("Get Involved survives Volunteers being off; the volunteer page does not", async () => {
    // The decision #902 left for review. Attend is about events and the partner
    // page funnels to /contact, so only the volunteer routes go.
    const visibility = await getPageVisibility(
      clientReturning([], [{ module_key: "volunteers", enabled: false }]),
    );

    expect(visibility["get-involved"]).toBe(true);
    expect(visibility["get-involved-volunteer"]).toBe(false);
  });

  test("an unreadable module answer leaves every section as the board set it", async () => {
    // Fail open, the opposite of the visibility read directly above -- a
    // missing module row means "this tenant predates the table", not "nobody
    // has approved this".
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const visibility = await getPageVisibility({
        from: (table: string) => ({
          select: () =>
            Object.assign(
              Promise.resolve(
                table === "public_tenant_modules"
                  ? { data: null, error: { code: "PGRST205", message: "gone" } }
                  : { data: [{ slot: "gears", value: true }], error: null },
              ),
              { maybeSingle: async () => ({ data: null, error: null }) },
            ),
        }),
      } as unknown as SupabaseClient);

      expect(visibility.gears).toBe(true);
    } finally {
      error.mockRestore();
    }
  });

  describe("moduleBlockedSlots", () => {
    test("names the module withholding each slot, for the panel to explain", () => {
      expect(moduleBlockedSlots({ inventory: false, finance: false })).toEqual({
        gears: "inventory",
        "gears-sizing": "inventory",
        support: "finance",
      });
    });

    test("is empty for a tenant with everything", () => {
      expect(moduleBlockedSlots({ inventory: true })).toEqual({});
      expect(moduleBlockedSlots({})).toEqual({});
    });
  });
});

// The product's own marketing pages belong to the platform tenant's site
// alone. Anywhere else they stay dark whatever a stored row says, and the
// administration panels do not offer them.
describe("platform-only slots", () => {
  const PLATFORM_ONLY = ["audiences", "modules", "pricing"];
  const switchedOn = PLATFORM_ONLY.map((slot) => ({ slot, value: true }));

  test("are exactly the audience paths, the module tour and the price list", () => {
    expect(
      PUBLIC_PAGE_SLOTS.filter((slot) => slot.platformOnly).map(
        (slot) => slot.key,
      ),
    ).toEqual(PLATFORM_ONLY);
  });

  test("can be switched on for the platform tenant's host", async () => {
    const visibility = await getPageVisibility(
      clientReturning(switchedOn, [], "internal"),
    );
    for (const slot of PLATFORM_ONLY) expect(visibility[slot]).toBe(true);
  });

  test("stay hidden on any other tenant's host whatever is stored", async () => {
    for (const plan of ["white_label", "demo", null]) {
      const visibility = await getPageVisibility(
        clientReturning(switchedOn, [], plan),
      );
      for (const slot of PLATFORM_ONLY) {
        expect(visibility[slot], `${slot} on ${plan}`).toBe(false);
      }
    }
  });

  test("leave every other slot alone", async () => {
    const platform = await getPageVisibility(
      clientReturning([], [], "internal"),
    );
    const customer = await getPageVisibility(clientReturning([], []));
    for (const slot of PUBLIC_PAGE_SLOTS) {
      if (slot.platformOnly) continue;
      expect(customer[slot.key]).toBe(platform[slot.key]);
    }
  });

  test("are left out of the panels for every tenant but the platform's", () => {
    const keys = (plan: string | null) =>
      slotsForTenant(PUBLIC_PAGE_SLOTS, plan ? { plan } : null).map(
        (slot) => slot.key,
      );

    expect(keys("internal")).toEqual(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));
    for (const plan of ["white_label", "demo", null]) {
      for (const slot of PLATFORM_ONLY) expect(keys(plan)).not.toContain(slot);
    }
    expect([...platformOnlySlotKeys({ plan: "white_label" })]).toEqual(
      PLATFORM_ONLY,
    );
    expect(platformOnlySlotKeys({ plan: "internal" }).size).toBe(0);
  });
});

describe("hiddenSlots", () => {
  test("lists only the slots that are switched off", async () => {
    const visibility = await getPageVisibility(
      clientReturning([{ slot: "learn", value: true }]),
    );

    expect(hiddenSlots(visibility).sort()).toEqual([
      "audiences",
      "brand",
      "gears-sizing",
      "links",
      "modules",
      "pricing",
      "programs",
      "publications",
      "support",
    ]);
  });
});

describe("getTenantPageVisibility", () => {
  /**
   * `app_settings` as the panel reads it: whole keys, filtered with `.like()`,
   * scoped to the signed-in admin's tenant by RLS rather than to the request
   * host by the view.
   */
  function settingsClientReturning(
    data: { key: string; value: unknown }[] | null,
  ): SupabaseClient {
    return {
      from: () => ({
        select: () => ({ like: async () => ({ data, error: null }) }),
      }),
    } as unknown as SupabaseClient;
  }

  test("reads the admin's own tenant rows, and falls back to the registry default", async () => {
    const slot = PUBLIC_PAGE_SLOTS[0];
    const visibility = await getTenantPageVisibility(
      settingsClientReturning([
        {
          key: pageVisibilitySettingKey(slot.key),
          value: !slot.defaultVisible,
        },
      ]),
    );

    expect(visibility[slot.key]).toBe(!slot.defaultVisible);
    for (const other of PUBLIC_PAGE_SLOTS.slice(1)) {
      expect(visibility[other.key]).toBe(other.defaultVisible);
    }
  });
});
