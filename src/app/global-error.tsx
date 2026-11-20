"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { DATA_UNAVAILABLE_DIGEST } from "@/lib/outage/data-unavailable";
import "./globals.css";

/**
 * Last-resort boundary: the only thing that catches a throw in the root or
 * portal layout, both of which run Supabase queries. It replaces the whole
 * document, so it can't use the app's fonts or providers -- keep it to plain
 * markup and the design tokens from globals.css.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // React error boundaries stop a thrown render from ever reaching
    // window.onerror, so without this call a client-side crash here is
    // invisible to Sentry. Server-side throws are already reported by
    // `onRequestError` in `src/instrumentation.ts`; in production those arrive
    // here redacted to a digest, so the copy Sentry gets from this line is a
    // thin duplicate that groups on its own -- an acceptable trade for not
    // losing client render errors entirely.
    //
    // `error_digest` is what makes the "Reference for support" digest on
    // screen worth showing: Sentry does not index non-standard Error
    // properties, so without a tag the digest a staffer reads out matches
    // nothing searchable (#1195, #1210). The tag lands on this boundary's
    // copy; the full server event for the same failure shares its trace.
    Sentry.captureException(error, {
      tags: error.digest ? { error_digest: error.digest } : undefined,
    });
  }, [error]);

  // The database is down (#1896). Neutral like the rest of this boundary:
  // the tenant's branding is in the database that failed. The proxy serves the
  // branded page; this is only the request that started rendering before its
  // probe noticed.
  const outage = error.digest === DATA_UNAVAILABLE_DIGEST;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--background)] p-8 text-center text-[var(--foreground)]">
        {/* Names no organization (#795 Phase 3). This boundary replaces the
            whole document and is a client component, so it cannot read the
            tenant -- and it fires on exactly the failure where a tenant read
            is what went wrong. One client's name here reached every tenant. */}
        <h1 className="text-3xl font-semibold tracking-brand">
          {outage
            ? "This site is temporarily unavailable"
            : "This page is having a moment"}
        </h1>
        <p className="max-w-md text-sm leading-relaxed opacity-80">
          {outage
            ? "We're having trouble loading this site right now. Please try again in a few minutes."
            : "Something went wrong while loading the page. Try again — if it keeps happening, let an administrator know."}
        </p>
        {error.digest && !outage && (
          <p className="text-xs opacity-60">
            Reference for support: <code>{error.digest}</code>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-2 rounded-full bg-[var(--purple)] px-5 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
