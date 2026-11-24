import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { parseDeliveryEvent, verifyResendWebhook } from "./resend-webhook";

const KEY = Buffer.from("a-webhook-signing-key-for-tests");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = new Date("2026-11-23T12:00:00Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const BODY = JSON.stringify({ type: "email.complained", data: {} });

function sign(body: string, id = "msg_1", timestamp = TIMESTAMP) {
  return createHmac("sha256", KEY)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

describe("verifyResendWebhook", () => {
  const headers = {
    id: "msg_1",
    timestamp: TIMESTAMP,
    signature: `v1,${sign(BODY)}`,
  };

  test("accepts a correctly signed delivery", () => {
    expect(verifyResendWebhook(BODY, headers, SECRET, NOW)).toBe(true);
  });

  test("accepts when any one of several signatures matches (rotation)", () => {
    const signature = `v1,${sign("other")} v1,${sign(BODY)}`;
    expect(
      verifyResendWebhook(BODY, { ...headers, signature }, SECRET, NOW),
    ).toBe(true);
  });

  test("refuses a tampered body", () => {
    expect(verifyResendWebhook(`${BODY} `, headers, SECRET, NOW)).toBe(false);
  });

  test("refuses a stale timestamp, even correctly signed", () => {
    const old = String(Number(TIMESTAMP) - 600);
    const signature = `v1,${sign(BODY, "msg_1", old)}`;
    expect(
      verifyResendWebhook(
        BODY,
        { ...headers, timestamp: old, signature },
        SECRET,
        NOW,
      ),
    ).toBe(false);
  });

  test("refuses missing headers and the wrong secret", () => {
    expect(
      verifyResendWebhook(BODY, { ...headers, signature: null }, SECRET, NOW),
    ).toBe(false);
    expect(
      verifyResendWebhook(
        BODY,
        headers,
        `whsec_${Buffer.from("x").toString("base64")}`,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("parseDeliveryEvent", () => {
  test("reads a complaint", () => {
    expect(
      parseDeliveryEvent({
        type: "email.complained",
        created_at: "2026-11-23T12:00:00Z",
        data: { email_id: "e1" },
      }),
    ).toEqual({
      event: "complained",
      emailId: "e1",
      occurredAt: "2026-11-23T12:00:00Z",
      detail: null,
    });
  });

  test("reads a permanent bounce with its reason", () => {
    const event = parseDeliveryEvent({
      type: "email.bounced",
      created_at: "2026-11-23T12:00:00Z",
      data: {
        email_id: "e2",
        bounce: {
          type: "Permanent",
          subType: "General",
          message: "No such user",
        },
      },
    });
    expect(event?.event).toBe("bounced");
    expect(event?.detail).toBe("General: No such user");
  });

  test("ignores a temporary bounce and every other event", () => {
    expect(
      parseDeliveryEvent({
        type: "email.bounced",
        data: { email_id: "e3", bounce: { type: "Temporary" } },
      }),
    ).toBeNull();
    expect(
      parseDeliveryEvent({ type: "email.delivered", data: { email_id: "e4" } }),
    ).toBeNull();
    expect(
      parseDeliveryEvent({ type: "email.complained", data: {} }),
    ).toBeNull();
  });
});
