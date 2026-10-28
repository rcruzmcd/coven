/**
 * The domain the Supabase auth cookie is written to (#1161).
 *
 * One account works on both of a tenant's surfaces: an administrator signs in
 * at `portal.<apex>` and is already signed in at `www.<apex>/my`, where they
 * can register for an event as themselves (#1160). A cookie with no `Domain`
 * attribute is host-only, so without this the session simply is not sent to
 * the public host and "one account" silently becomes "signed out over there".
 *
 * ## Why the apex list decides it, and not a rule about the hostname
 *
 * Deriving a parent domain by counting labels is wrong on every multi-label
 * suffix -- `.co.uk`, and `.vercel.app`, which is on the public suffix list and
 * would have every preview deployment trying to write a cookie the browser
 * rejects. The operator has already told us which apexes span several hosts:
 * `PORTAL_REDIRECT_HOSTS` exists because only the owner of a domain can
 * promise that `portal.<apex>` resolves here, and that promise is exactly the
 * statement that the apex, `www.` and `portal.` are one tenant's three names.
 * The same fact answers both questions, so it is read once rather than
 * restated in a second list that could disagree with the first.
 *
 * ## Only those three names
 *
 * A host that merely *ends with* a listed apex does not qualify. `uat` is a
 * real deployment on `uat.chattersnow.org`, and a `.chattersnow.org` cookie
 * written there would collide with production's by name -- signing into uat
 * would overwrite the session on `www`, in both directions. Preview hosts stay
 * host-only, which is correct for them anyway: they serve both surfaces from
 * one host, so nothing needs to cross.
 *
 * ## The single-host tenants must not get one
 *
 * The demo and platform tenants serve their portals at
 * `demo.rcmlabs.dev/portal` and `coven.rcmlabs.dev/portal`, on the same host as
 * their public sites, so they need no shared cookie -- and giving either one
 * would put the session on `.rcmlabs.dev`, where it would reach the other
 * tenant. The apex is not listed, so neither gets a domain, which is both the
 * safe answer and the correct one.
 *
 * ## Both bundles must agree
 *
 * The browser client writes this cookie too (`signInWithPassword` on the login
 * form), so if the server scoped it to `.apex` and the browser left it
 * host-only, the browser would hold two cookies of the same name and send both
 * -- the failure this is meant to prevent, in a harder-to-see form. That is why
 * this reads `NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS` and never the server-only
 * `PORTAL_REDIRECT_HOSTS`: a value only one side can see is a value the two
 * sides can disagree about. Unset means `undefined` on both sides, which is
 * exactly the host-only behaviour that shipped before this change.
 */

/**
 * Apexes whose `www.`, `portal.` and bare names share one session.
 *
 * Deliberately the `NEXT_PUBLIC_` variable: see "Both bundles must agree".
 * Next inlines it at build time in both bundles, so changing it on Vercel
 * takes a redeploy rather than a restart -- same as the server-only one.
 */
export function sharedSessionApexes(): string[] {
  return (process.env.NEXT_PUBLIC_PORTAL_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The `Domain` attribute for this request's host, or undefined for host-only.
 *
 * Undefined is the fallback in every unrecognized case -- an unlisted apex, a
 * preview, localhost, an IP, a missing Host header -- and undefined reproduces
 * the pre-#1161 behaviour exactly. There is no input for which this widens a
 * cookie past an apex an operator has named.
 */
export function sessionCookieDomain(
  hostname: string | null | undefined,
): string | undefined {
  if (!hostname) return undefined;

  // Cookie domains have no port, and a Host header usually does. Also drops an
  // IPv6 literal's brackets, which cannot be a cookie domain either way.
  const host = hostname.trim().toLowerCase().split(":")[0]?.replace(/\.$/, "");
  if (!host || !host.includes(".")) return undefined;

  const apex = sharedSessionApexes().find(
    (candidate) =>
      host === candidate ||
      host === `www.${candidate}` ||
      host === `portal.${candidate}`,
  );

  return apex ? `.${apex}` : undefined;
}

/**
 * `cookieOptions` for a Supabase client on this host.
 *
 * Returns undefined rather than `{ domain: undefined }` so that, where no
 * domain applies, @supabase/ssr is handed no options object at all and its own
 * defaults are the only thing in play.
 */
export function sessionCookieOptions(
  hostname: string | null | undefined,
): { domain: string } | undefined {
  const domain = sessionCookieDomain(hostname);
  return domain ? { domain } : undefined;
}
