import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// deliver.ts is server-only; stub the guard so plain `bun test` can import it.
mock.module("server-only", () => ({}));
const { listUnsubscribeHeaders } = await import("./deliver");

const BASE = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  kind: "task_digest",
  identity: { from: "x@example.test", origin: "https://chattersnow.org" },
};

const original = process.env.EMAIL_UNSUBSCRIBE_SECRET;
beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "secret";
});
afterEach(() => {
  if (original === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = original;
});

describe("listUnsubscribeHeaders (#1921)", () => {
  test("adds the one-click pair to a switchable kind sent to a person", () => {
    const headers = listUnsubscribeHeaders(BASE);
    expect(headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(headers?.["List-Unsubscribe"]).toStartWith(
      "<https://chattersnow.org/api/email/unsubscribe?t=",
    );
  });

  test("leaves out mail nobody can switch off", () => {
    // Not in the registry: a sign-in code, a staff message.
    expect(
      listUnsubscribeHeaders({ ...BASE, kind: "sign_in_code" }),
    ).toBeNull();
    // Addressed to an inbox, not a person: the ops report.
    expect(listUnsubscribeHeaders({ ...BASE, personId: null })).toBeNull();
  });

  test("is off until the secret is configured", () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(listUnsubscribeHeaders(BASE)).toBeNull();
  });
});
