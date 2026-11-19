import { resolvedTypography, type Branding } from "@/lib/branding";
import { snapshotBranding, type OutageSnapshot } from "@/lib/outage/snapshot";

/**
 * The page the proxy serves while the database is down (#1896).
 *
 * A plain HTML string, not a React render: it is answered from the proxy,
 * before the app, so neither the stylesheet nor `next/font` is there to lean
 * on. Everything it draws comes from the snapshot -- name, logo, colours,
 * typeface, contact address -- or, with no snapshot, from nothing at all: the
 * neutral page names no organization, never the platform's placeholder copy
 * and never another tenant's.
 */

/** Seconds a client or crawler is asked to wait before trying again. */
export const OUTAGE_RETRY_AFTER_SECONDS = 120;

export const NEUTRAL_TITLE = "This site is temporarily unavailable";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** An absolute http(s) URL or a root-relative path; anything else is dropped. */
function safeLogoUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function googleFontsHref(branding: Branding): string | null {
  if (!branding.typography) return null;
  const set = resolvedTypography(branding);
  const names = [...new Set([set.sans.name, set.heading.name])];
  const families = names
    .map((name) => `family=${name.replaceAll(" ", "+")}:wght@400;600`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Colours for the branded page. Every value has already passed
 * `brandingFromRows`' hex check, which is what makes interpolating them into
 * the `<style>` below safe -- the same guarantee `brandingCss` relies on.
 */
function brandedStyle(branding: Branding): string {
  const set = resolvedTypography(branding);
  const background = branding.colors.background ?? "#ffffff";
  const text = branding.colors.primary_deep ?? "#1f1f1f";
  const accent = branding.colors.primary ?? text;
  const stops = branding.accentStops ?? [accent, accent];
  return `
    :root { color-scheme: light; }
    body { background: ${background}; color: ${text};
      font-family: "${set.sans.name}", system-ui, sans-serif; }
    h1 { font-family: "${set.heading.name}", system-ui, sans-serif;
      letter-spacing: ${set.headingTracking}; }
    .strip { background: linear-gradient(90deg, ${stops.join(", ")}); }
    a { color: ${accent}; }`;
}

const NEUTRAL_STYLE = `
    :root { color-scheme: light dark; }
    body { background: #ffffff; color: #1f1f1f; font-family: system-ui, sans-serif; }
    .strip { background: #d4d4d4; }
    @media (prefers-color-scheme: dark) {
      body { background: #141414; color: #ededed; }
      .strip { background: #3a3a3a; }
    }`;

const BASE_STYLE = `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body { display: flex; flex-direction: column; min-height: 100vh; }
    .strip { height: 6px; width: 100%; }
    main { flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1rem; padding: 2rem 1rem; text-align: center; }
    img { max-height: 72px; max-width: 200px; object-fit: contain; }
    h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 2.4rem); font-weight: 600; }
    p { margin: 0; max-width: 32rem; line-height: 1.6; opacity: 0.85; }`;

export function outageHtml(snapshot: OutageSnapshot | null): string {
  if (!snapshot) {
    return document({
      title: NEUTRAL_TITLE,
      style: NEUTRAL_STYLE,
      fontsHref: null,
      body: `
    <h1>${NEUTRAL_TITLE}</h1>
    <p>We&#39;re having trouble loading this site right now. Please try again in a few minutes.</p>`,
    });
  }

  const branding = snapshotBranding(snapshot);
  const name = escapeHtml(snapshot.name);
  const logo = safeLogoUrl(branding.logoUrl);
  const email = snapshot.email ? escapeHtml(snapshot.email) : null;
  return document({
    title: `${name} is temporarily unavailable`,
    style: brandedStyle(branding),
    fontsHref: googleFontsHref(branding),
    body: `
    ${logo ? `<img src="${escapeHtml(logo)}" alt="${name}">` : ""}
    <h1>${name} is having trouble right now</h1>
    <p>Our website is temporarily unavailable. We&#39;re working on it &mdash; please try again in a few minutes.</p>
    ${email ? `<p>Need to reach us? Email <a href="mailto:${email}">${email}</a>.</p>` : ""}`,
  });
}

function document({
  title,
  style,
  fontsHref,
  body,
}: {
  title: string;
  style: string;
  fontsHref: string | null;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  ${fontsHref ? `<link rel="stylesheet" href="${escapeHtml(fontsHref)}">` : ""}
  <style>${BASE_STYLE}${style}</style>
</head>
<body>
  <div class="strip"></div>
  <main>${body}
  </main>
</body>
</html>`;
}

/**
 * The 503 itself. `no-store` on both cache headers: an outage page held by
 * the CDN would outlive the outage, which is the failure #1894 was about.
 */
export function outageResponse(
  snapshot: OutageSnapshot | null,
  method: string,
): Response {
  return new Response(method === "HEAD" ? null : outageHtml(snapshot), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(OUTAGE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
