import "server-only";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient, parseConnectionString } from "@vercel/global-config";
import {
  SNAPSHOT_BRAND_TOKENS,
  isSnapshotKey,
  snapshotKey,
  type OutageSnapshot,
} from "@/lib/outage/snapshot";

/**
 * Writes the outage snapshots to Global Config (#1896).
 *
 * Called with the service-role client from two places: after branding or
 * identity is saved (one tenant, so the page is current within seconds), and
 * from the daily cron (every tenant, deleting keys whose domain no tenant
 * claims any more, so drift and removed domains do not linger).
 *
 * A no-op unless `EDGE_CONFIG` (the store's read connection string) and
 * `VERCEL_API_TOKEN` (a token allowed to write it) are both set -- local, CI
 * and preview deployments have neither, and the outage page there is the
 * neutral one. `VERCEL_TEAM_ID` is needed when the store belongs to a team.
 */

type TenantRow = { id: string; name: string; custom_domain: string | null };
type SettingRow = { tenant_id: string; key: string; value: unknown };

export type SyncResult =
  { skipped: "not_configured" } | { written: number; deleted: number };

const BRAND_KEYS = SNAPSHOT_BRAND_TOKENS.map((token) => `brand.${token}`);
/** The one Site Content slot the outage page shows. */
export const OUTAGE_EMAIL_KEY = "org.email_general";
const EMAIL_KEY = OUTAGE_EMAIL_KEY;

function writeConfig(): { id: string; token: string; teamId?: string } | null {
  const connection = process.env.EDGE_CONFIG;
  const token = process.env.VERCEL_API_TOKEN;
  if (!connection || !token) return null;
  const parsed = parseConnectionString(connection);
  if (!parsed) return null;
  return { id: parsed.id, token, teamId: process.env.VERCEL_TEAM_ID };
}

/** Builds each tenant's snapshot from its rows. Pure, for the tests. */
export function buildSnapshots(
  tenants: readonly TenantRow[],
  settings: readonly SettingRow[],
  content: readonly SettingRow[],
): Map<string, OutageSnapshot> {
  const snapshots = new Map<string, OutageSnapshot>();
  for (const tenant of tenants) {
    if (!tenant.custom_domain) continue;
    const email = content.find(
      (row) => row.tenant_id === tenant.id && row.key === EMAIL_KEY,
    )?.value;
    snapshots.set(snapshotKey(tenant.custom_domain), {
      name: tenant.name,
      brand: settings
        .filter((row) => row.tenant_id === tenant.id)
        .map((row) => ({
          token: row.key.slice("brand.".length),
          value: row.value,
        })),
      email: typeof email === "string" && email.trim() ? email.trim() : null,
    });
  }
  return snapshots;
}

async function readSnapshots(
  admin: SupabaseClient,
  tenantId: string | null,
): Promise<Map<string, OutageSnapshot>> {
  let tenantsQuery = admin
    .from("tenants")
    .select("id, name, custom_domain")
    .eq("status", "active")
    .not("custom_domain", "is", null);
  let settingsQuery = admin
    .from("app_settings")
    .select("tenant_id, key, value")
    .in("key", BRAND_KEYS);
  let contentQuery = admin
    .from("site_content")
    .select("tenant_id, key, value")
    .eq("key", EMAIL_KEY);
  if (tenantId) {
    tenantsQuery = tenantsQuery.eq("id", tenantId);
    settingsQuery = settingsQuery.eq("tenant_id", tenantId);
    contentQuery = contentQuery.eq("tenant_id", tenantId);
  }
  const [tenants, settings, content] = await Promise.all([
    tenantsQuery,
    settingsQuery,
    contentQuery,
  ]);
  // Thrown, not swallowed: a partial read would write a snapshot missing its
  // logo, or -- in the cron -- delete every key it failed to read.
  const error = tenants.error ?? settings.error ?? content.error;
  if (error) throw new Error(`outage snapshot read failed: ${error.message}`);
  return buildSnapshots(
    (tenants.data ?? []) as TenantRow[],
    (settings.data ?? []) as SettingRow[],
    (content.data ?? []) as SettingRow[],
  );
}

type ItemOperation =
  | { operation: "upsert"; key: string; value: OutageSnapshot }
  | { operation: "delete"; key: string };

async function patchItems(
  config: NonNullable<ReturnType<typeof writeConfig>>,
  items: ItemOperation[],
): Promise<void> {
  if (items.length === 0) return;
  const url = new URL(
    `https://api.vercel.com/v1/global-config/${config.id}/items`,
  );
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    throw new Error(
      `outage snapshot write failed: ${response.status} ${await response.text()}`,
    );
  }
}

/** One tenant's snapshot, after it saves its branding or identity. */
export async function syncTenantOutageSnapshot(
  admin: SupabaseClient,
  tenantId: string,
): Promise<SyncResult> {
  const config = writeConfig();
  if (!config) return { skipped: "not_configured" };
  const snapshots = await readSnapshots(admin, tenantId);
  await patchItems(
    config,
    [...snapshots].map(([key, value]) => ({ operation: "upsert", key, value })),
  );
  return { written: snapshots.size, deleted: 0 };
}

/** Every tenant's, plus removal of keys no active tenant claims. */
export async function syncAllOutageSnapshots(
  admin: SupabaseClient,
): Promise<SyncResult> {
  const config = writeConfig();
  if (!config) return { skipped: "not_configured" };
  const snapshots = await readSnapshots(admin, null);
  const existing = Object.keys(
    await createClient(process.env.EDGE_CONFIG!).getAll(),
  ).filter(isSnapshotKey);
  const stale = existing.filter((key) => !snapshots.has(key));
  await patchItems(config, [
    ...[...snapshots].map(([key, value]): ItemOperation => ({
      operation: "upsert",
      key,
      value,
    })),
    ...stale.map((key): ItemOperation => ({ operation: "delete", key })),
  ]);
  return { written: snapshots.size, deleted: stale.length };
}

/**
 * Schedules a sync to run after the Server Action has answered, so a save is
 * never slower or failed because Global Config was. `"all"` is for changes
 * that move a tenant between keys -- a domain or a status -- where only the
 * full sync deletes the key left behind. A failure is reported and otherwise
 * ignored: the daily cron repairs it.
 */
export function scheduleOutageSnapshotSync(target: string | "all"): void {
  after(async () => {
    try {
      const admin = createSupabaseAdminClient();
      if (target === "all") await syncAllOutageSnapshots(admin);
      else await syncTenantOutageSnapshot(admin, target);
    } catch (error) {
      console.error("[outage.sync] could not write the snapshot", error);
      Sentry.captureException(error, { tags: { outage_sync: target } });
    }
  });
}
