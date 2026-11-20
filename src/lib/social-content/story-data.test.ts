import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

mock.module("server-only", () => ({}));

const { loadStoryFrame } = await import("./story-data");

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
