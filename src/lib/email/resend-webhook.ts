import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend's webhook, read without its SDK (#1921) -- the same choice send.ts
 * makes: verifying is one HMAC, and a dependency would earn a single call.
 *
 * Resend signs with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed
 * by the base64 half of the `whsec_...` secret, sent as space-separated
 * `v1,<base64>` entries (more than one while a secret is being rotated).
 */

/** How far a delivery's timestamp may drift from now, as Svix recommends. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function verifyResendWebhook(
  body: string,
  headers: SvixHeaders,
  secret: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(now.getTime() / 1000 - sentAt) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/**
 * What the ledger records about a message after it left (#1921). Only the two
 * outcomes that say the address should not be mailed again: a permanent bounce
 * and a spam complaint. A temporary bounce is the provider still trying.
 */
export type DeliveryEvent = {
  event: "bounced" | "complained";
  emailId: string;
  occurredAt: string;
  detail: string | null;
};

const MAX_DETAIL = 500;

export function parseDeliveryEvent(body: unknown): DeliveryEvent | null {
  if (!body || typeof body !== "object") return null;
  const { type, created_at, data } = body as {
    type?: unknown;
    created_at?: unknown;
    data?: {
      email_id?: unknown;
      bounce?: { type?: unknown; subType?: unknown; message?: unknown };
    };
  };
  const emailId = data?.email_id;
  if (typeof emailId !== "string" || !emailId) return null;
  const occurredAt =
    typeof created_at === "string" ? created_at : new Date().toISOString();

  if (type === "email.complained") {
    return { event: "complained", emailId, occurredAt, detail: null };
  }
  if (type === "email.bounced" && data?.bounce?.type === "Permanent") {
    const { subType, message } = data.bounce;
    const detail = [subType, message]
      .filter((part): part is string => typeof part === "string" && !!part)
      .join(": ")
      .slice(0, MAX_DETAIL);
    return { event: "bounced", emailId, occurredAt, detail: detail || null };
  }
  return null;
}
