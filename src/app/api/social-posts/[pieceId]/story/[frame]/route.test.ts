// The route's answers before anything is drawn: a bad frame, a signed-out
// request and a post that is not there. What each frame shows is
// `story-frames.test.ts`; the loader's own checks are `story-data.test.ts`.
import { describe, expect, mock, test } from "bun:test";

let user: { id: string } | null = null;
let post: Record<string, unknown> | null = null;

const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: post, error: null }),
};

mock.module("server-only", () => ({}));
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => query,
  }),
}));
mock.module("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      throw new Error("the service role was read before the post was checked");
    },
  }),
}));

const { GET } = await import("./route");

function get(frame: string, search = "") {
  return GET(
    new Request(
      `https://portal.example.org/api/social-posts/p/story/${frame}${search}`,
    ),
    { params: Promise.resolve({ pieceId: "p", frame }) },
  );
}

describe("GET /api/social-posts/[pieceId]/story/[frame]", () => {
  test("404s a frame other than 1, 2 or 3", async () => {
    user = { id: "u" };
    expect((await get("4")).status).toBe(404);
    expect((await get("0")).status).toBe(404);
    expect((await get("one")).status).toBe(404);
  });

  test("401s a signed-out request", async () => {
    user = null;
    post = { id: "p", tenant_id: "t", featured_inventory_item_id: "i" };
    expect((await get("1")).status).toBe(401);
  });

  test("404s a post the user cannot see", async () => {
    user = { id: "u" };
    post = null;
    expect((await get("1")).status).toBe(404);
  });

  test("404s a post with no featured item", async () => {
    user = { id: "u" };
    post = { id: "p", tenant_id: "t", featured_inventory_item_id: null };
    expect((await get("3")).status).toBe(404);
  });

  test("404s a post without a story template", async () => {
    user = { id: "u" };
    post = {
      id: "p",
      tenant_id: "t",
      featured_inventory_item_id: "i",
      template_key: "flyer",
    };
    expect((await get("1")).status).toBe(404);
  });

  test("400s preview text that isn't a JSON object, before reading the post (#1925)", async () => {
    user = { id: "u" };
    post = null;
    for (const text of ["nope", "[1]", "null", "1", "x".repeat(4001)]) {
      expect((await get("1", `?text=${encodeURIComponent(text)}`)).status).toBe(
        400,
      );
    }
  });

  test("400s preview text over a field's cap (#1925)", async () => {
    user = { id: "u" };
    post = {
      id: "p",
      tenant_id: "t",
      featured_inventory_item_id: "i",
      template_key: "gear_spotlight",
    };
    const text = JSON.stringify({ brand: "x".repeat(200) });
    const response = await get("1", `?text=${encodeURIComponent(text)}`);
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/at most/);
  });
});
