// Integration test for issue #421: audit_log.table_name is now FK-constrained
// against the `audited_tables` registry instead of a hand-retyped check
// constraint, and audit_log_row() resolves record_id via each table's
// registered pk_column instead of a hardcoded id/user_id coalesce. Exercises
// the two scenarios that previously shipped as production bugs --
// insert/update/delete on a plain `id`-keyed table (the common case every
// earlier check-constraint retype had to preserve) and on `deactivated_users`
// (`user_id`-keyed, per 20260826120000) -- plus the registry's own
// enforcement: an unregistered table_name is rejected by the FK, not
// silently accepted. Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  uniqueEmail,
  unprivilegedActors,
} from "../../../../../../test/integration-setup";
import { fetchAuditLogEntries } from "./audit-log-query";
import type { AuditLogParams } from "./audit-log-params";

// admin.ts imports "server-only", which throws outside Next's bundler.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

async function auditRows(table_name: string, record_id: string) {
  const { data, error } = await adminClient
    .from("audit_log")
    .select("action, record_id, old_data, new_data")
    .eq("table_name", table_name)
    .eq("record_id", record_id)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return data;
}

describe("audit_log_row() via audited_tables registry", () => {
  test("logs insert/update/delete for a plain id-keyed table (app_settings)", async () => {
    const key = `it-audit-${crypto.randomUUID()}`;
    const { data: inserted, error: insertError } = await serviceRoleClient
      .from("app_settings")
      .insert({ key, value: { n: 1 } })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const id = inserted!.id as string;

    await serviceRoleClient
      .from("app_settings")
      .update({ value: { n: 2 } })
      .eq("id", id);
    await serviceRoleClient.from("app_settings").delete().eq("id", id);

    const rows = await auditRows("app_settings", id);
    expect(rows?.map((r) => r.action)).toEqual(["insert", "update", "delete"]);
    expect(rows?.[0].record_id).toBe(id);
    expect((rows?.[1].new_data as { value: { n: number } }).value.n).toBe(2);
    expect((rows?.[2].old_data as { value: { n: number } }).value.n).toBe(2);
  });

  test("resolves record_id via user_id for deactivated_users, not id", async () => {
    const { data: user, error: createError } =
      await serviceRoleClient.auth.admin.createUser({
        email: uniqueEmail("audit-deactivate"),
        password: "password123",
        email_confirm: true,
      });
    expect(createError).toBeNull();
    const userId = user!.user!.id;

    try {
      const { error: insertError } = await serviceRoleClient
        .from("deactivated_users")
        .insert({ user_id: userId });
      expect(insertError).toBeNull();

      await serviceRoleClient
        .from("deactivated_users")
        .delete()
        .eq("user_id", userId);

      const rows = await auditRows("deactivated_users", userId);
      expect(rows?.map((r) => r.action)).toEqual(["insert", "delete"]);
      expect((rows?.[0].new_data as { user_id: string }).user_id).toBe(userId);
      expect((rows?.[1].old_data as { user_id: string }).user_id).toBe(userId);
    } finally {
      await serviceRoleClient.auth.admin.deleteUser(userId);
    }
  });

  // #721: inventory_movements.notes carries a public gear requester's own
  // words, on a published 3-year clock. audit_log has no clock, so a column
  // registered in audited_tables.redacted_columns must never reach it -- or
  // moving the text off people.notes would only have relocated the leak.
  test("strips a registered redacted column from old_data and new_data", async () => {
    const gear = await createAvailableGearItems(1);
    try {
      const { data: inserted, error: insertError } = await serviceRoleClient
        .from("inventory_movements")
        .insert({
          inventory_item_id: gear.itemIds[0],
          movement_type: "reserved",
          quantity: 1,
          reason: "Public gear library request",
          notes: "Only for the requester and the staff who fill the request.",
        })
        .select("id")
        .single();
      expect(insertError).toBeNull();
      const id = inserted!.id as string;

      // The shape the retention purge writes.
      await serviceRoleClient
        .from("inventory_movements")
        .update({ notes: null })
        .eq("id", id);

      const rows = await auditRows("inventory_movements", id);
      expect(rows?.map((r) => r.action)).toEqual(["insert", "update"]);
      for (const row of rows ?? []) {
        expect(row.new_data ?? {}).not.toHaveProperty("notes");
        expect(row.old_data ?? {}).not.toHaveProperty("notes");
      }
      // Everything the audit trail exists for is still there.
      expect((rows?.[0].new_data as { reason: string }).reason).toBe(
        "Public gear library request",
      );

      await serviceRoleClient.from("inventory_movements").delete().eq("id", id);
    } finally {
      await gear.cleanup();
    }
  });

  test("rejects an audit_log row for a table_name not in audited_tables", async () => {
    const { error } = await serviceRoleClient.from("audit_log").insert({
      table_name: "not_a_registered_table",
      record_id: crypto.randomUUID(),
      action: "insert",
      new_data: {},
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503");
  });
});

// The audit log is the most sensitive read in the portal: every row carries
// the before/after payload of a change to donations, inventory, user roles or
// access grants, so a session that can read it can reconstruct data it was
// never granted directly. The page redirects on administration:view and
// fetchAuditLogEntries adds no check of its own, leaving `audit_log` RLS as
// the whole defense -- and every case above writes rows through the
// service-role client and reads them back as admin (#746).
const ALL_ENTRIES: AuditLogParams = {
  sort: "occurred_at",
  dir: "desc",
  table: "app_settings",
  action: "all",
  related: "all",
  actor: "all",
  from: "",
  to: "",
  page: 1,
  perPage: 25,
};

function fetchAs(client: SupabaseClient) {
  return fetchAuditLogEntries(
    client as unknown as Parameters<typeof fetchAuditLogEntries>[0],
    ALL_ENTRIES,
  );
}

describe("fetchAuditLogEntries for unprivileged actors (integration)", () => {
  test("returns no entries and no total for any unprivileged session", async () => {
    // A change of its own, so the privileged read is provably non-empty.
    const key = `it-audit-rls-${crypto.randomUUID()}`;
    const { data: inserted } = await serviceRoleClient
      .from("app_settings")
      .insert({ key, value: { n: 1 } })
      .select("id")
      .single();
    const id = inserted!.id as string;

    const privileged = await fetchAs(adminClient);
    expect(privileged.error).toBeNull();
    expect(privileged.count ?? 0).toBeGreaterThan(0);
    expect(privileged.entries?.length ?? 0).toBeGreaterThan(0);

    for (const { name, client } of await unprivilegedActors()) {
      const { entries, count, error } = await fetchAs(client);
      // Anonymous is rejected outright by the API (42501) and never gets a
      // count; a signed-in session without administration access is filtered
      // to zero rows by the policy. Either way nothing comes back.
      expect({
        actor: name,
        entries: entries ?? [],
        count: count ?? 0,
        leaked: (entries ?? []).length > 0,
      }).toEqual({ actor: name, entries: [], count: 0, leaked: false });
      if (name === "anonymous") expect(error?.code).toBe("42501");
      else expect(error).toBeNull();
    }

    await serviceRoleClient.from("app_settings").delete().eq("id", id);
  });
});

describe("fetchAuditLogEntries Related to filter (#1797)", () => {
  const SEEDED_EVENT_ID = "cccccccc-0000-4000-8000-000000000001";

  async function recordIdsFor(related: AuditLogParams["related"]) {
    const { entries, error } = await fetchAuditLogEntries(
      adminClient as unknown as Parameters<typeof fetchAuditLogEntries>[0],
      { ...ALL_ENTRIES, table: "all", related, perPage: 100 },
    );
    expect(error).toBeNull();
    return entries ?? [];
  }

  test("narrows social post entries by what they were related to", async () => {
    const { data: inserted, error } = await adminClient
      .from("content_opportunities")
      .insert({ title: `it-audit-related-${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    const id = inserted!.id as string;

    // Standalone, then related to the event, then deleted while related.
    await adminClient
      .from("content_opportunities")
      .update({ event_id: SEEDED_EVENT_ID })
      .eq("id", id);
    await adminClient.from("content_opportunities").delete().eq("id", id);

    const actions = async (related: AuditLogParams["related"]) =>
      (await recordIdsFor(related))
        .filter((entry) => entry.record_id === id)
        .map((entry) => entry.action)
        .sort();

    expect(await actions("none")).toEqual(["insert"]);
    expect(await actions("event")).toEqual(["delete", "update"]);
    expect(await actions("calendar_item")).toEqual([]);

    const tables = new Set(
      (await recordIdsFor("event")).map((entry) => entry.table_name),
    );
    expect([...tables]).toEqual(["content_opportunities"]);
  });
});
