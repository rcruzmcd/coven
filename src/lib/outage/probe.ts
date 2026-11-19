import { createClient } from "@supabase/supabase-js";
import {
  queryErrorKind,
  type QueryErrorLike,
} from "@/lib/observability/query-error";

/**
 * Whether the database is answering, as the proxy's outage gate asks it on
 * every page request (#1896).
 *
 * Remembered per server instance for `PROBE_TTL_MS`, so a warm instance makes
 * at most one extra read in that window however much traffic it serves, and
 * concurrent requests share one in-flight probe rather than each starting one.
 *
 * Only an infrastructure failure counts as down: no answer at all, a
 * `PGRST*` code, or a cancelled statement -- the `kind`s of
 * `queryErrorKind` other than `database`. A `database` error (an RLS denial, a
 * missing column) is a bug in one read, not an outage, and taking every
 * page down for it would be far worse than the bug.
 */
export const PROBE_TTL_MS = 10_000;

/**
 * Well under the platform's function timeout, and long enough that a slow
 * but healthy database is not called down. A stalled pool is exactly what
 * this has to catch, and without a bound the gate would hang with it.
 */
export const PROBE_TIMEOUT_MS = 3_000;

export type ProbeResult = { up: true } | { up: false; code: string };

type Probe = () => Promise<QueryErrorLike | null>;

/**
 * Reads one row of `public_tenant` with the publishable key and no retries.
 * The rows do not matter -- with no host header there may be none -- only
 * whether PostgREST answered. Never throws: a thrown fetch is an outage too.
 */
const probeDatabase: Probe = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const { error } = await createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
      .from("public_tenant")
      .select("id")
      .limit(1)
      .retry(false)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    return error;
  } catch (error) {
    return { code: "", message: String(error) };
  }
};

export function classifyProbe(error: QueryErrorLike | null): ProbeResult {
  if (!error || queryErrorKind(error) === "database") return { up: true };
  return { up: false, code: error.code || queryErrorKind(error) };
}

/**
 * A memoized probe. Exported as a factory so tests get their own cache and
 * clock; the proxy uses the shared `databaseHealth` below.
 */
export function createHealthGate(
  probe: Probe = probeDatabase,
  now: () => number = Date.now,
) {
  let last: { at: number; result: ProbeResult } | null = null;
  let inFlight: Promise<ProbeResult> | null = null;

  return async function health(): Promise<ProbeResult> {
    if (last && now() - last.at < PROBE_TTL_MS) return last.result;
    inFlight ??= probe()
      .then(classifyProbe)
      .then((result) => {
        last = { at: now(), result };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

export const databaseHealth = createHealthGate();
