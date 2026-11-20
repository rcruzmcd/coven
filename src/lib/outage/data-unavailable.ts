import { queryErrorKind } from "@/lib/observability/query-error";

/**
 * The digest the error boundary recognizes an outage by (#1896). Next keeps a
 * thrown error's own `digest` rather than hashing it, and the digest is the
 * one property that survives production's redaction to the client boundary.
 */
export const DATA_UNAVAILABLE_DIGEST = "DATA_UNAVAILABLE";

/**
 * Thrown by a public loader when its read failed because the database is
 * unreachable -- not because a row is missing (#1896).
 *
 * The backstop behind the proxy's outage gate, for the request that starts
 * rendering in the seconds between an outage beginning and the gate's next
 * probe. Thrown before the layout renders, so the response is a 500 that the
 * CDN will not hold, and `global-error.tsx` shows the neutral outage copy
 * rather than the platform's placeholder page under a 200.
 */
export class DataUnavailableError extends Error {
  readonly digest = DATA_UNAVAILABLE_DIGEST;

  constructor(source: string, code: string) {
    super(`${source}: data unavailable (${code || "connection"})`);
    this.name = "DataUnavailableError";
  }
}

/**
 * Whether an error code means the database itself is unwell: no answer, a
 * `PGRST*` code, or a cancelled statement. Any other SQLSTATE is a bug in one
 * read and keeps the existing fallback.
 */
export function isOutageCode(code: string | null | undefined): boolean {
  return queryErrorKind({ code: code ?? "" }) !== "database";
}
