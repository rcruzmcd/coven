import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { Mock } from "bun:test";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSite } from "@/lib/public-site";
import { queryErrorKind, reportQueryError } from "./query-error";

let capture: Mock<typeof Sentry.captureException>;
let log: Mock<typeof console.error>;

beforeEach(() => {
  capture = spyOn(Sentry, "captureException").mockImplementation(() => "");
  log = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  capture.mockRestore();
  log.mockRestore();
});

describe("queryErrorKind", () => {
  test("classifies by code", () => {
    expect(queryErrorKind({ code: "PGRST002" })).toBe("postgrest");
    expect(queryErrorKind({ code: "" })).toBe("connection");
    expect(queryErrorKind({})).toBe("connection");
    expect(queryErrorKind({ code: "57014" })).toBe("timeout");
    expect(queryErrorKind({ code: "42501" })).toBe("database");
  });
});

describe("reportQueryError", () => {
  test("captures with code, source and a source+code fingerprint", () => {
    reportQueryError(
      { code: "PGRST002", message: "Could not query the database" },
      { source: "branding.public_branding" },
    );

    expect(capture).toHaveBeenCalledTimes(1);
    const [exception, context] = capture.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(exception.name).toBe("SupabaseQueryError");
    expect(context).toMatchObject({
      fingerprint: [
        "supabase-query-error",
        "branding.public_branding",
        "PGRST002",
      ],
      tags: {
        query_source: "branding.public_branding",
        query_code: "PGRST002",
        query_kind: "postgrest",
      },
      extra: { code: "PGRST002" },
    });
    expect(log).toHaveBeenCalledTimes(1);
  });

  test("a codeless error is fingerprinted as a connection error", () => {
    reportQueryError({ message: "fetch failed" }, { source: "x.y" });
    const context = capture.mock.calls[0][1] as Record<string, unknown>;
    expect(context.fingerprint).toEqual([
      "supabase-query-error",
      "x.y",
      "connection",
    ]);
  });
});

/** Every read fails the way #1894's outage did. */
function failingClient(): SupabaseClient {
  const result = {
    data: null,
    error: { code: "PGRST002", message: "Could not query the database" },
  };
  const builder = {
    select: () => builder,
    retry: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("the public site's shared loaders", () => {
  test("report every read they swallow", async () => {
    const site = await getPublicSite(failingClient());
    expect(site.status).toBe("unavailable");

    const sources = capture.mock.calls
      .map(
        ([, context]) =>
          (context as { tags: Record<string, string> }).tags.query_source,
      )
      .sort();
    expect(sources).toEqual([
      "branding.public_branding",
      "branding.public_tenant",
      "lexicon.public_lexicon",
      "public-site.public_site_content",
    ]);
    for (const [, context] of capture.mock.calls) {
      expect(
        (context as { tags: Record<string, string> }).tags.query_code,
      ).toBe("PGRST002");
    }
  });
});
