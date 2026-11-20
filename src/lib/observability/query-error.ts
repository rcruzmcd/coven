import * as Sentry from "@sentry/nextjs";

/**
 * The fields of a Supabase/PostgREST error this module reads. Structural so a
 * `PostgrestError`, a `StorageError` or a hand-built test double all fit.
 */
export type QueryErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * What kind of failure a query error is, as a Sentry tag the alert rules key
 * on (`docs/tenants.md`, "Swallowed query errors are reported"):
 *
 * - `postgrest`: a `PGRST*` code -- PostgREST itself is unwell (#1894's
 *   `PGRST002` outage was this).
 * - `connection`: no code at all. postgrest-js returns a codeless error when
 *   the request never got an answer (DNS, refused, reset, fetch timeout).
 * - `timeout`: Postgres cancelled the statement (`57014`).
 * - `database`: any other SQLSTATE -- an RLS denial, a missing column. Usually
 *   a bug rather than an outage.
 */
export type QueryErrorKind =
  "postgrest" | "connection" | "timeout" | "database";

export function queryErrorKind(error: QueryErrorLike): QueryErrorKind {
  const code = error.code ?? "";
  if (code === "") return "connection";
  if (code.startsWith("PGRST")) return "postgrest";
  if (code === "57014") return "timeout";
  return "database";
}

/**
 * Reports a Supabase error that a loader is about to swallow (#1895).
 *
 * Falling back to defaults is the right thing for a visitor, but during the
 * 2026-11-16 PostgREST outage every read failed and Sentry recorded nothing.
 * This keeps the fallback and makes it visible: a server log line, as the
 * loaders already wrote, plus a Sentry event.
 *
 * Events are fingerprinted on `source + code`, so an outage is one Sentry
 * issue with a high event count rather than thousands of separate ones, and
 * each `source` is its own issue so the count says which reads are failing.
 *
 * `source` is a stable, low-cardinality name for the read -- `module.read`,
 * e.g. `branding.public_branding` -- never anything per-request.
 */
export function reportQueryError(
  error: QueryErrorLike,
  { source, message }: { source: string; message?: string },
): void {
  const code = error.code ?? "";
  const kind = queryErrorKind(error);
  const text = error.message ?? "unknown error";

  console.error(`[${source}] ${message ?? "query failed"}`, error);

  const exception = new Error(`${source}: ${code || kind} ${text}`);
  exception.name = "SupabaseQueryError";

  Sentry.captureException(exception, {
    level: "error",
    fingerprint: ["supabase-query-error", source, code || kind],
    tags: {
      query_source: source,
      query_code: code || kind,
      query_kind: kind,
    },
    extra: {
      code,
      message: text,
      details: error.details ?? null,
      hint: error.hint ?? null,
    },
  });
}

/**
 * `reportQueryError` for a loader that reads `data ?? []` and never looked at
 * `error`: a no-op on success, so it can sit after a `Promise.all` of reads.
 */
export function reportIfQueryFailed(
  result: { error: QueryErrorLike | null },
  source: string,
  message?: string,
): void {
  if (result.error) reportQueryError(result.error, { source, message });
}
