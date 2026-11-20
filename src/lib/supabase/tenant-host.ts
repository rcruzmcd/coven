/**
 * Kept out of `server.ts` so the proxy can use it: that module imports
 * `next/headers`, which the proxy (and anything a client component pulls in
 * through it) cannot (#1896).
 */

/**
 * The host to resolve the tenant against, given the request's own Host.
 *
 * `tenants.custom_domain` is a single unique column, so a tenant can list one
 * host and no more -- and `vercel.json` deploys both `development` and `main`
 * against the same Supabase project, so a request to
 * `chattersnow-web-git-development-*.vercel.app` matches nothing and the whole
 * public site comes back empty. `TENANT_HOST_OVERRIDE` is set on the Vercel
 * Preview and Development environments to name the tenant those deployments
 * are for; production leaves it unset and uses the real Host.
 *
 * Server-only (no `NEXT_PUBLIC_`) and only ever compared against
 * `custom_domain`, so the worst a wrong value can do is serve the wrong
 * tenant's *public* pages -- exactly what visiting that tenant's site does --
 * and, since #956, send a portal session to the "wrong organization" screen.
 * It cannot widen anyone's access, only narrow it.
 */
export function tenantHost(requestHost: string | null): string | null {
  const override = process.env.TENANT_HOST_OVERRIDE?.trim();
  return override || requestHost || null;
}
