/**
 * An RPC refusal as a funnel `error_code`: the database's own SCREAMING_CASE
 * code, or `UNKNOWN` for anything else -- a Postgres message can quote what
 * somebody typed, so it is never sent as it is.
 */
export function rpcErrorCode(message: string): string {
  return /^[A-Z][A-Z0-9_]*$/.test(message) ? message : "UNKNOWN";
}
