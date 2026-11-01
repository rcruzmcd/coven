"use client";

import { useEffect } from "react";
import {
  holdFormEvents,
  linkClickEvent,
  setFormCapture,
  trackSite,
} from "@/lib/analytics/form-events";
import { POSTHOG_PROXY_PATH } from "@/lib/analytics/form-analytics";

/**
 * PostHog on the public site, for form funnels only (#1480).
 *
 * Mounted by the public layout and only when `formAnalyticsConfig()` says so,
 * so a tenant without the module, a preview deploy, CI and local runs never
 * render it -- and `posthog-js` is imported here, dynamically, so none of them
 * download it either.
 *
 * Every option below is a promise the privacy policy makes:
 *
 *   - `cookieless_mode: "always"` -- no cookie, localStorage or
 *     sessionStorage, ever. PostHog counts a visitor from a daily hash of IP,
 *     user agent and host instead. The PostHog project must have Cookieless
 *     tracking switched on, or these events are discarded.
 *   - `person_profiles: "never"`, and `identify()` is never called, even for a
 *     visitor signed in to `/my`.
 *   - nothing captured implicitly: no autocapture, replay, heatmaps, dead
 *     clicks, exceptions, page-leave, surveys or flags. Registration forms
 *     hold names, phone numbers and, on some tenants, a minor's contacts; the
 *     only events are page views, the named `form_*` events, the gear
 *     cart's `gear_*` steps and the few site events of #1714 -- a donate
 *     button, a link out by host, a missing page, a catalog filter's name
 *     (`src/lib/analytics/form-events.ts`). The link clicks are read by the
 *     one listener below, not by autocapture, so nothing else about a click
 *     is ever sent.
 *
 * `before_send` drops anything sent from `/portal`. On a host that serves the
 * portal from the same origin (the demo), a client-side navigation out of the
 * public site would otherwise leave this instance counting portal page views.
 */
export function FormAnalytics({
  apiKey,
  tenant,
}: {
  apiKey: string;
  tenant: string;
}) {
  useEffect(() => {
    let cancelled = false;
    holdFormEvents();
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      posthog.init(apiKey, {
        api_host: POSTHOG_PROXY_PATH,
        ui_host: "https://us.posthog.com",
        cookieless_mode: "always",
        persistence: "memory",
        person_profiles: "never",
        autocapture: false,
        rageclick: false,
        capture_pageview: "history_change",
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_performance: false,
        enable_heatmaps: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        advanced_disable_flags: true,
        before_send: (event) =>
          window.location.pathname.startsWith("/portal") ? null : event,
      });
      posthog.register({ tenant });
      setFormCapture((event, properties, options) => {
        posthog.capture(
          event,
          properties,
          options?.leaving
            ? { transport: "sendBeacon", send_instantly: true }
            : undefined,
        );
      });
      document.addEventListener("click", onLinkClick, true);
    });
    return () => {
      cancelled = true;
      document.removeEventListener("click", onLinkClick, true);
      setFormCapture(null);
    };
  }, [apiKey, tenant]);

  return null;
}

/** Capture phase, so a link whose own handler stops propagation still counts. */
function onLinkClick(event: MouseEvent) {
  const link =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return;
  const click = linkClickEvent(
    link.href,
    link.dataset.analyticsPlacement,
    window.location.href,
  );
  if (click) trackSite(click.event, click.properties);
}
