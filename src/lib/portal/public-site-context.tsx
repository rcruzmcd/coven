"use client";

import { createContext, useContext } from "react";

/** `undefined` means no provider: not inside the portal layout. */
const PublicSiteOriginContext = createContext<string | null | undefined>(
  undefined,
);

/**
 * The portal layout's `getPublicSiteOrigin()`, for client components that link
 * to a public page (the Website editor's "View on the site", a waiver
 * permalink). Distribution only, like `PortalDeviceProvider`: the server
 * decided, nothing here re-derives it.
 */
export function PublicSiteOriginProvider({
  origin,
  children,
}: {
  origin: string | null;
  children: React.ReactNode;
}) {
  return (
    <PublicSiteOriginContext.Provider value={origin}>
      {children}
    </PublicSiteOriginContext.Provider>
  );
}

/**
 * `path` on the tenant's public site as this page should link to it, or null
 * when the organization has no public site to link to from here. Outside the
 * portal layout (the public site, a unit test) the path is returned as-is.
 */
export function usePublicSiteHref(path: string | undefined): string | null {
  const origin = useContext(PublicSiteOriginContext);
  if (path === undefined) return null;
  if (origin === undefined) return path;
  return origin === null ? null : `${origin}${path}`;
}
