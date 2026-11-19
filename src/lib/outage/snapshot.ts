import { createClient } from "@vercel/global-config";
import {
  BRAND_COLOR_TOKENS,
  brandingFromRows,
  type Branding,
  type BrandingRow,
} from "@/lib/branding";

/**
 * A tenant's identity, kept outside Supabase so an outage page can still say
 * whose site it is (#1896).
 *
 * During the 2026-11-16 PostgREST outage every host rendered the platform's
 * placeholder ("Your headline goes here", `hello@example.org`), because the
 * branding it needed lived in the database that was down. This copy lives in
 * Vercel Global Config (formerly Edge Config): it is read on every request
 * without touching Supabase, and is written by `syncOutageSnapshots` when
 * branding is saved and by a daily cron.
 *
 * Only what the outage page shows. `brand` holds raw `brand.*` rows rather
 * than resolved values, so the read goes back through `brandingFromRows` and
 * gets the same hex and typography checks as a database read -- the result
 * reaches a `<style>` block.
 */
export type OutageSnapshot = {
  name: string;
  brand: BrandingRow[];
  /** `org.email_general` only when the tenant set it; never the default. */
  email: string | null;
};

/** The tokens the outage page draws with. The app icon is not one. */
export const SNAPSHOT_BRAND_TOKENS: readonly string[] = [
  ...BRAND_COLOR_TOKENS.map((token) => token.key),
  "accent_stops",
  "logo_url",
  "typography",
];

const KEY_PREFIX = "outage_";

/**
 * The Global Config key for a tenant's `custom_domain`. Keys may only hold
 * `[A-Za-z0-9_-]`; a hostname's only other character is the dot, and no
 * hostname contains an underscore, so mapping one to the other is lossless.
 */
export function snapshotKey(domain: string): string {
  return KEY_PREFIX + domain.toLowerCase().replace(/[^a-z0-9-]/g, "_");
}

export function isSnapshotKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX);
}

/**
 * The domains a host could be claimed through, longest first.
 *
 * Mirrors `resolve_tenant_id_from_host()`: a tenant's `custom_domain` matches
 * the host itself or any parent of it, longest match wins. So
 * `portal.chattersnow.org` tries itself, then `chattersnow.org`. Stops at two
 * labels -- a bare TLD is nobody's domain.
 */
export function candidateDomains(host: string): string[] {
  const bare = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const labels = bare.split(".").filter(Boolean);
  const domains: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) {
    domains.push(labels.slice(i).join("."));
  }
  return domains;
}

/**
 * Validates a stored value. Anything malformed is treated as no snapshot,
 * which renders the neutral page -- never a partly-branded one.
 */
export function parseSnapshot(value: unknown): OutageSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const { name, brand, email } = value as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) return null;
  if (!Array.isArray(brand)) return null;
  const rows = brand.filter(
    (row): row is BrandingRow =>
      !!row &&
      typeof row === "object" &&
      typeof (row as BrandingRow).token === "string" &&
      SNAPSHOT_BRAND_TOKENS.includes((row as BrandingRow).token),
  );
  return {
    name: name.trim(),
    brand: rows,
    email: typeof email === "string" && email.includes("@") ? email : null,
  };
}

/** The branding to draw the outage page with, checked like a database read. */
export function snapshotBranding(snapshot: OutageSnapshot): Branding {
  return brandingFromRows(snapshot.brand);
}

/**
 * The snapshot for the tenant claiming `host`, or null: no Global Config
 * connected (local, CI), no tenant claims the host, or the read failed. Null
 * renders the neutral page. Never throws -- it runs while something else is
 * already broken.
 */
export async function readOutageSnapshot(
  host: string | null,
): Promise<OutageSnapshot | null> {
  const connection = process.env.EDGE_CONFIG;
  if (!host || !connection) return null;
  const keys = candidateDomains(host).map(snapshotKey);
  if (keys.length === 0) return null;
  try {
    const items =
      await createClient(connection).getAll<Record<string, unknown>>(keys);
    // Longest domain first, as the database resolves it.
    for (const key of keys) {
      const snapshot = parseSnapshot(items[key]);
      if (snapshot) return snapshot;
    }
    return null;
  } catch (error) {
    console.error("[outage.snapshot] could not read Global Config", error);
    return null;
  }
}
