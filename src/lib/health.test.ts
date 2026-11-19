import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkHealth } from "./health";

/** A client whose `public_tenant` read answers `result`. */
function clientAnswering(result: Promise<{ data: unknown; error: unknown }>) {
  return {
    from: () => ({
      select: () => {
        const query = { maybeSingle: () => result, retry: () => query };
        return query;
      },
    }),
  } as unknown as SupabaseClient;
}

const answer = (data: unknown, error: unknown = null) =>
  clientAnswering(Promise.resolve({ data, error }));

describe("checkHealth", () => {
  // getPublicTenant logs a failed read loudly; keep the test output clean.
  let consoleError: ReturnType<typeof spyOn>;
  beforeEach(() => {
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  test("200 with the slug when the host resolves to a tenant", async () => {
    const result = await checkHealth(
      answer({
        id: "t1",
        name: "Org",
        slug: "org",
        custom_domain: "org.test",
        plan: "white_label",
      }),
    );
    expect(result).toEqual({ status: 200, body: { ok: true, tenant: "org" } });
  });

  test("never leaks tenant fields beyond the slug", async () => {
    const result = await checkHealth(
      answer({ id: "secret-id", name: "Org", slug: "org", plan: "demo" }),
    );
    expect(Object.keys(result.body).sort()).toEqual(["ok", "tenant"]);
  });

  test("503 with PostgREST's code when the read errors (the Nov 2026 outage)", async () => {
    const result = await checkHealth(
      answer(null, {
        code: "PGRST002",
        message: "Could not query the database for the schema cache. Retrying.",
      }),
    );
    expect(result).toEqual({
      status: 503,
      body: { ok: false, code: "PGRST002" },
    });
  });

  test("503 unreachable when the error carries no code (connection failure)", async () => {
    const result = await checkHealth(
      answer(null, { code: "", message: "TypeError: fetch failed" }),
    );
    expect(result).toEqual({
      status: 503,
      body: { ok: false, code: "unreachable" },
    });
  });

  test("503 unreachable when the client throws", async () => {
    const result = await checkHealth(
      clientAnswering(Promise.reject(new Error("socket hang up"))),
    );
    expect(result.body).toEqual({ ok: false, code: "unreachable" });
  });

  test("503 no_tenant when the host resolves to no tenant", async () => {
    const result = await checkHealth(answer(null));
    expect(result).toEqual({
      status: 503,
      body: { ok: false, code: "no_tenant" },
    });
  });

  test("asks for the read without postgrest-js's own retries", async () => {
    const retry = mock();
    const client = {
      from: () => ({
        select: () => {
          const query = {
            maybeSingle: async () => ({ data: null, error: null }),
            retry: (enabled: boolean) => (retry(enabled), query),
          };
          return query;
        },
      }),
    } as unknown as SupabaseClient;
    await checkHealth(client);
    expect(retry).toHaveBeenCalledWith(false);
  });

  test("503 timeout when the read stalls", async () => {
    const result = await checkHealth(
      clientAnswering(new Promise(() => {})),
      10,
    );
    expect(result).toEqual({
      status: 503,
      body: { ok: false, code: "timeout" },
    });
  });
});
