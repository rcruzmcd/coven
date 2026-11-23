/**
 * How much of a maskable icon's width the content may occupy (#1083).
 *
 * A launcher may mask an icon to any shape inside the full square, and the
 * only region guaranteed to survive is the circle of 80% diameter at its
 * centre. Drawing the tenant's mark into that box is what stops Android
 * cropping the top off a wordmark -- and it is why the manifest can list one
 * raster as both `any` and `maskable`.
 */
export const MASKABLE_SAFE_FRACTION = 0.8;

/** Fetched icons larger than this are refused rather than inlined. */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** An unreachable upload must not hold the icon request open. */
const FETCH_TIMEOUT_MS = 3000;

/**
 * The tenant's uploaded icon as a data URL, or null to draw its initials.
 *
 * Fetched here rather than handed to Satori as a remote `<img src>` so that a
 * dead link, a slow host or an HTML error page degrades to the generated icon
 * instead of throwing inside `ImageResponse` -- which would 500 the route and
 * leave the install with no icon at all, the one outcome worse than initials.
 *
 * `base` is the request's own URL, so a root-relative path to a file in
 * `public/` -- which the branding panel accepts, like the logo field above it
 * -- is fetched from the host that asked rather than failing to parse and
 * silently falling back to initials.
 */
export async function loadRemoteIcon(
  url: string | null,
  base: string,
  {
    maxBytes = MAX_ICON_BYTES,
    timeoutMs = FETCH_TIMEOUT_MS,
  }: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  try {
    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    // SVG is excluded on purpose: Satori rasterizes it through a path this
    // does not control, and an uploaded SVG is arbitrary markup from a
    // database row.
    if (!type || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
