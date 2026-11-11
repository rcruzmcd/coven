import { cn } from "@/lib/utils";

/** Coven's own marketing site, on the platform tenant's host. */
export const COVEN_SITE_URL = "https://coven.rcmlabs.dev";

/**
 * "Powered by Coven" under the sign-in card (#1813).
 *
 * An exception to the white-label rule (#795 Phase 4: root metadata, the PWA
 * manifests and the app icon never name the product), on these screens only.
 * Since #1249 Google's account chooser says "to continue to Coven" on every
 * tenant, so a tenant's staff or members meet the name there whether or not
 * the page has shown it. This line means they have already seen it before
 * Google shows it.
 *
 * It sits under the card, not inside it: the tenant's logo and heading are the
 * page's brand, and this is one quiet line beside them. It shows on every host
 * and plan, with or without the platform Google flow configured. It describes
 * the product, not the sign-in method. It names the product only, not a
 * company.
 */
export function PlatformAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("app-muted text-xs", className)}>
      Powered by{" "}
      <a
        href={COVEN_SITE_URL}
        target="_blank"
        rel="noopener"
        aria-label="Coven (opens in a new tab)"
        className="font-medium underline-offset-4 hover:underline"
      >
        Coven
      </a>
    </p>
  );
}
