import { describe, expect, test } from "bun:test";
import {
  mintUnsubscribeToken,
  unsubscribeHeaders,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const SECRET = "test-unsubscribe-secret";
const CLAIM = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  kind: "task_digest",
};

describe("unsubscribe token", () => {
  test("round-trips the claim it was minted for", () => {
    const token = mintUnsubscribeToken(CLAIM, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual(CLAIM);
  });

  test("refuses a token minted with another secret", () => {
    const token = mintUnsubscribeToken(CLAIM, "someone-else");
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  test("refuses a payload swapped under a valid signature", () => {
    const [, signature] = mintUnsubscribeToken(CLAIM, SECRET).split(".");
    const [otherPayload] = mintUnsubscribeToken(
      { ...CLAIM, kind: "event_registration_confirmation" },
      SECRET,
    ).split(".");
    expect(
      verifyUnsubscribeToken(`${otherPayload}.${signature}`, SECRET),
    ).toBeNull();
  });

  test("refuses missing and malformed values", () => {
    for (const value of [null, "", "abc", "a.b.c", "x".repeat(600)]) {
      expect(verifyUnsubscribeToken(value, SECRET)).toBeNull();
    }
  });

  test("refuses a signed payload that is not a well-formed claim", () => {
    const bad = mintUnsubscribeToken(
      { ...CLAIM, personId: "not-a-uuid" },
      SECRET,
    );
    expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
  });
});

describe("unsubscribeHeaders", () => {
  test("composes the RFC 8058 pair on the tenant's origin", () => {
    const headers = unsubscribeHeaders(CLAIM, {
      origin: "https://chattersnow.org",
      secret: SECRET,
    });
    expect(headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const link = headers?.["List-Unsubscribe"] ?? "";
    expect(link).toMatch(
      /^<https:\/\/chattersnow\.org\/api\/email\/unsubscribe\?t=[^>]+>$/,
    );
    const token = new URL(link.slice(1, -1)).searchParams.get("t");
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual(CLAIM);
  });

  test("is absent without a secret or an origin", () => {
    expect(
      unsubscribeHeaders(CLAIM, {
        origin: "https://x.test",
        secret: undefined,
      }),
    ).toBeNull();
    expect(
      unsubscribeHeaders(CLAIM, { origin: null, secret: SECRET }),
    ).toBeNull();
  });
});
