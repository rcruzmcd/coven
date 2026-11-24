import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

mock.module("server-only", () => ({}));

const { loadStoryFrame, storyFingerprint } = await import("./story-data");
import type { GearStorySource } from "./story-data";

type Client = SupabaseClient<Database>;

/**
 * Just enough of a client for the checks that run before any tenant data is
 * read: who is signed in, and which post their own RLS lets them see.
 */
function userClient(
  user: { id: string } | null,
  post: Record<string, unknown> | null,
): Client {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: post, error: null }),
  };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => query,
  } as unknown as Client;
}

/** Fails the test if anything reaches for the service role. */
const untouchedAdmin = {
  from: () => {
    throw new Error("the service role was read before the post was checked");
  },
} as unknown as Client;

const URL = "https://portal.example.org/api/social-posts/p/story/1";

describe("loadStoryFrame", () => {
  test("refuses a signed-out request", async () => {
    const result = await loadStoryFrame(
      userClient(null, { id: "p", featured_inventory_item_id: "i" }),
      untouchedAdmin,
      "p",
      1,
      URL,
    );
    expect(result).toEqual({ status: "unauthenticated" });
  });

  test("404s a post the user's RLS does not return", async () => {
    const result = await loadStoryFrame(
      userClient({ id: "u" }, null),
      untouchedAdmin,
      "p",
      1,
      URL,
    );
    expect(result).toEqual({ status: "not_found" });
  });

  test("404s a post with no featured item", async () => {
    const result = await loadStoryFrame(
      userClient(
        { id: "u" },
        { id: "p", tenant_id: "t", featured_inventory_item_id: null },
      ),
      untouchedAdmin,
      "p",
      2,
      URL,
    );
    expect(result).toEqual({ status: "not_found" });
  });

  test("404s an item that is not in the post's tenant", async () => {
    const empty = {
      select: () => empty,
      eq: () => empty,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const admin = { from: () => empty } as unknown as Client;
    const result = await loadStoryFrame(
      userClient(
        { id: "u" },
        { id: "p", tenant_id: "t", featured_inventory_item_id: "i" },
      ),
      admin,
      "p",
      3,
      URL,
    );
    expect(result).toEqual({ status: "not_found" });
  });
});

describe("storyFingerprint (#1909)", () => {
  const source = {
    input: {
      item: {
        description: "Burton jacket",
        size: "M",
        condition: "like_new",
        category_label: "Jackets",
        in_catalog: true,
      },
      details: { brand: "Burton", best_for: null, why: null },
      categoryStop: 1,
      series: null,
      branding: { logoUrl: "https://example.org/logo.png" },
      orgName: "Org",
      host: "example.org",
      copy: { headline: "Want it?", itemLine: "", steps: [], collection: "" },
    },
    photoSource: "items/jacket.jpg",
    typography: { headingTracking: "-0.02em" },
  } as unknown as GearStorySource;

  test("is unchanged by a post with no crop (#1925)", () => {
    const withNull = { ...source, photoCrop: null, itemHasPhoto: true };
    expect(storyFingerprint(withNull)).toBe(storyFingerprint(source));
  });

  test("is stable for the same inputs", () => {
    expect(storyFingerprint(source)).toBe(
      storyFingerprint(structuredClone(source)),
    );
  });

  test("changes with a post field, the item, its photo or the branding", () => {
    const base = storyFingerprint(source);
    const changed = (patch: (copy: typeof source) => void) => {
      const copy = structuredClone(source);
      patch(copy);
      return storyFingerprint(copy);
    };
    expect(changed((c) => (c.input.details.why = "Warm"))).not.toBe(base);
    expect(changed((c) => (c.input.item.in_catalog = false))).not.toBe(base);
    expect(changed((c) => (c.photoSource = "items/other.jpg"))).not.toBe(base);
    expect(
      changed((c) => (c.photoCrop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })),
    ).not.toBe(base);
    expect(
      changed(
        (c) => (c.input.branding.logoUrl = "https://example.org/new.png"),
      ),
    ).not.toBe(base);
  });
});
