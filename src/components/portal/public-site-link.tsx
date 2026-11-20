"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { usePublicSiteHref } from "@/lib/portal/public-site-context";

/**
 * A portal link to a page on the organization's public site, such as
 * `/privacy` or `/waiver?version=3`. Never a bare `<Link href="/privacy">`
 * from the portal: on a `portal.` host that resolves to `/portal/privacy` and
 * 404s. When there is no public site to link to, renders `fallback` (by
 * default the link text, unlinked).
 */
export function PublicSiteLink({
  path,
  fallback,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  path: string;
  fallback?: ReactNode;
}) {
  const href = usePublicSiteHref(path);
  if (href === null) return fallback === undefined ? children : fallback;
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}
