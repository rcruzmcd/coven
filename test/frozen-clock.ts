import { onTestFinished, setSystemTime } from "bun:test";

/**
 * Stop `Date` at this instant until the current test finishes (#1733).
 *
 * The portal's resend actions dedupe on the clock minute
 * (`resendDedupeSuffix()` in `src/lib/outbound-messages.ts`), and their tests
 * resend twice and expect the second call to be refused. Two calls ~200ms
 * apart that straddle `hh:mm:59` -> `hh:mm+1:00` get different keys and both
 * send, which is how one of them failed on an unrelated PR. Frozen at the real
 * time rather than a fixed date, so a session minted against the real auth
 * server is not read as expired. `setTimeout` and the database's own `now()`
 * are untouched -- Bun's fake clock moves only `Date` and `Intl`.
 *
 * Call it at the top of the test. The real clock comes back when the test
 * finishes, pass or fail.
 */
export function freezeClock(): void {
  setSystemTime(new Date());
  onTestFinished(() => {
    setSystemTime();
  });
}
