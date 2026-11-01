"use client";

import { useEffect } from "react";
import { notFoundPath, trackSite } from "@/lib/analytics/form-events";

/**
 * Counts a public page-not-found (#1714), to catch broken links. The path is
 * cut by `notFoundPath()` before it leaves, since a missing page's address can
 * hold a token or a code.
 */
export function NotFoundEvent() {
  useEffect(() => {
    trackSite("not_found", { path: notFoundPath(window.location.pathname) });
  }, []);
  return null;
}
