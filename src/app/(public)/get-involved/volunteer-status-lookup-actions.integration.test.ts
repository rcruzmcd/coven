// Integration test: exercises the real lookupVolunteerApplicationStatusAction
// against a real local Supabase stack (lookup_volunteer_application_status
// RPC, per-IP rate limiting). anon has no direct access to
// volunteer_applications, so the RPC is the only observable enforcement
// point -- and a no-match returns null rather than raising (see
// 20260827020000), a distinction only a real DB round-trip can prove.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  anonClient,
  createVolunteerApplication,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { lookupVolunteerApplicationStatusAction } =
  await import("./volunteer-status-lookup-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const NOT_FOUND = {
  error:
    "We couldn't find an application matching that email and reference code.",
  code: "NOT_FOUND",
};

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
});

async function application(
  overrides?: Parameters<typeof createVolunteerApplication>[0],
) {
  const fixture = await createVolunteerApplication(overrides);
  cleanups.push(fixture.cleanup);
  return fixture;
}

describe("lookupVolunteerApplicationStatusAction (integration)", () => {
  test("returns the applicant-facing label for a matching email and code", async () => {
    currentIp = uniqueIp();
    const { email, referenceCode } = await application();

    const result = await lookupVolunteerApplicationStatusAction(
      formData({ email, referenceCode }),
    );

    expect(result).toEqual({ statusLabel: "Received" });
  });

  test("reflects a status the portal has since changed", async () => {
    currentIp = uniqueIp();
    const { email, referenceCode } = await application({ status: "placed" });

    const result = await lookupVolunteerApplicationStatusAction(
      formData({ email, referenceCode }),
    );

    expect(result).toEqual({ statusLabel: "Placed" });
  });

  test("matches an email and code the applicant retyped loosely", async () => {
    currentIp = uniqueIp();
    const { email, referenceCode } = await application();

    // The RPC lowercases the email and uppercase/trims the code, so a code
    // pasted with stray whitespace or in lowercase still resolves.
    const result = await lookupVolunteerApplicationStatusAction(
      formData({
        email: email.toUpperCase(),
        referenceCode: `  ${referenceCode.toLowerCase()}  `,
      }),
    );

    expect(result).toEqual({ statusLabel: "Received" });
  });

  test("reports not-found for a code that belongs to no application", async () => {
    currentIp = uniqueIp();
    const { email } = await application();

    // A miss returns null data, not an RPC error (20260827020000) -- so
    // this also proves the action's null branch, not its error branch, is
    // what produces the not-found message.
    const result = await lookupVolunteerApplicationStatusAction(
      formData({ email, referenceCode: "ZZZZZZZZ" }),
    );

    expect(result).toEqual(NOT_FOUND);
  });

  test("reports not-found when the code is right but the email is not", async () => {
    currentIp = uniqueIp();
    const { referenceCode } = await application();

    const result = await lookupVolunteerApplicationStatusAction(
      formData({ email: uniqueEmail("wrong-applicant"), referenceCode }),
    );

    expect(result).toEqual(NOT_FOUND);
  });

  test("rate-limits repeated lookups from the same IP", async () => {
    currentIp = uniqueIp();
    const { email, referenceCode } = await application();

    // The throttle exists to stop reference-code guessing, so walk the
    // window (10 per 15 minutes) with misses, the way an enumeration
    // attempt would.
    for (let i = 0; i < 10; i++) {
      const result = await lookupVolunteerApplicationStatusAction(
        formData({ email, referenceCode: "ZZZZZZZZ" }),
      );
      expect(result).toEqual(NOT_FOUND);
    }

    // Even the correct code is refused once the window is spent.
    const limited = await lookupVolunteerApplicationStatusAction(
      formData({ email, referenceCode }),
    );

    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
      code: "RATE_LIMITED",
    });
  });
});
