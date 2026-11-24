import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The token behind a message's one-click unsubscribe link (#1921).
 *
 * Stateless: an HMAC over (tenant, person, kind), so minting one is free at
 * send time and there is no table of outstanding links to grow or purge. It
 * does not expire on purpose -- RFC 8058 expects the link in an old message to
 * keep working, and what it can do is narrow: switch off one kind of email for
 * one person, which they could do themselves from their preferences screen.
 *
 * Keyed by EMAIL_UNSUBSCRIBE_SECRET. Unset, nothing is minted and no message
 * carries the header -- the same "absent means off" shape as RESEND_API_KEY.
 * Rotating it invalidates every link already sent, which is the only way to
 * revoke them.
 */

export type UnsubscribeClaim = {
  tenantId: string;
  personId: string;
  kind: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND = /^[a-z0-9_]+$/;

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(`unsubscribe.v1.${payload}`, "utf8")
    .digest();
}

export function mintUnsubscribeToken(
  claim: UnsubscribeClaim,
  secret: string,
): string {
  const payload = Buffer.from(
    [claim.tenantId, claim.personId, claim.kind].join(":"),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

/** The claim a token carries, or null for anything not minted with `secret`. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): UnsubscribeClaim | null {
  if (!token || token.length > 512) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  const [tenantId, personId, kind, ...extra] = Buffer.from(payload, "base64url")
    .toString("utf8")
    .split(":");
  if (
    extra.length ||
    !UUID.test(tenantId ?? "") ||
    !UUID.test(personId ?? "")
  ) {
    return null;
  }
  if (!KIND.test(kind ?? "")) return null;
  return { tenantId, personId, kind };
}

export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

/**
 * The RFC 8058 header pair for one message: a link mail clients POST to with
 * `List-Unsubscribe=One-Click`. Null when there is no secret or no origin to
 * link to -- a message without the header is what every send looked like
 * before this, so there is nothing to fail over.
 */
export function unsubscribeHeaders(
  claim: UnsubscribeClaim,
  options: { origin: string | null | undefined; secret: string | undefined },
): Record<string, string> | null {
  if (!options.secret || !options.origin) return null;
  const url = new URL(UNSUBSCRIBE_PATH, options.origin);
  url.searchParams.set("t", mintUnsubscribeToken(claim, options.secret));
  return {
    "List-Unsubscribe": `<${url.toString()}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
