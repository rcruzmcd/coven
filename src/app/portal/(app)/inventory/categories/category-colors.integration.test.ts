// Integration test: category colours (#1907) are a per-tenant setting under
// the real `inventory_category_groups` / `inventory_categories` RLS.
//
// The colour is a column on rows that already carry tenant_id, so "per tenant"
// is the same promise as every other row in those tables. This holds it to
// that: one tenant's admin can set its own colours and cannot reach another
// tenant's, by id, through the action.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  serviceRoleClient,
  signInAs,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { setInventoryCategoryAccentAction } = await import("./actions");

const run = crypto.randomUUID().slice(0, 8);

async function ownRow(
  table: "inventory_category_groups" | "inventory_categories",
  key: string,
) {
  const { data, error } = await adminClient
    .from(table)
    .select("id, accent_stop")
    .eq("key", key)
    .single();
  if (error) throw error;
  return data as { id: string; accent_stop: number | null };
}

describe("setInventoryCategoryAccentAction (integration)", () => {
  test("an admin sets and clears a group's and a category's colour", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const group = await ownRow("inventory_category_groups", "outerwear");
    const category = await ownRow("inventory_categories", "jacket");

    try {
      expect(
        await setInventoryCategoryAccentAction("group", group.id, 3),
      ).toEqual({ success: true });
      expect(
        await setInventoryCategoryAccentAction("category", category.id, 5),
      ).toEqual({ success: true });
      expect(
        (await ownRow("inventory_category_groups", "outerwear")).accent_stop,
      ).toBe(3);
      expect((await ownRow("inventory_categories", "jacket")).accent_stop).toBe(
        5,
      );

      expect(
        await setInventoryCategoryAccentAction("category", category.id, null),
      ).toEqual({ success: true });
      expect(
        (await ownRow("inventory_categories", "jacket")).accent_stop,
      ).toBeNull();
    } finally {
      await adminClient
        .from("inventory_category_groups")
        .update({ accent_stop: group.accent_stop })
        .eq("id", group.id);
      await adminClient
        .from("inventory_categories")
        .update({ accent_stop: category.accent_stop })
        .eq("id", category.id);
    }
  });

  test("a stop outside the palette's bounds is refused", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const group = await ownRow("inventory_category_groups", "outerwear");
    for (const stop of [-1, 8, 1.5]) {
      expect(
        await setInventoryCategoryAccentAction("group", group.id, stop),
      ).toEqual({ error: "Choose one of the brand colors." });
    }
  });

  test("a volunteer without inventory:manage cannot set a colour", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const group = await ownRow("inventory_category_groups", "outerwear");
    expect(
      await setInventoryCategoryAccentAction("group", group.id, 1),
    ).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });
});

describe("category colours are tenant-scoped (integration)", () => {
  const service = serviceRoleClient();
  let otherTenantId: string | null = null;

  afterAll(async () => {
    if (otherTenantId) {
      await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
    }
  });

  test("an admin cannot read or set another tenant's colours", async () => {
    // Archived at once: a second active tenant would change
    // public_tenant_id() for every other file. provision_tenant copies the
    // category vocabulary, so the other tenant has its own Outerwear.
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Category Colors Other ${run}`,
      p_slug: `category-colors-other-${run}`,
      p_custom_domain: `category-colors-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);

    const { data: foreign, error } = await service
      .from("inventory_category_groups")
      .update({ accent_stop: 2 })
      .eq("tenant_id", otherTenantId)
      .eq("key", "outerwear")
      .select("id")
      .single();
    if (error) throw error;
    const { data: foreignCategory } = await service
      .from("inventory_categories")
      .select("id")
      .eq("tenant_id", otherTenantId)
      .eq("key", "jacket")
      .single();

    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Not visible...
    const read = await currentSupabase
      .from("inventory_category_groups")
      .select("accent_stop")
      .eq("id", foreign.id);
    expect(read.data).toEqual([]);

    // ...and not writable, by id, through the action.
    expect(
      await setInventoryCategoryAccentAction("group", foreign.id, 5),
    ).toEqual({ error: "Could not change the color. Please try again." });
    expect(
      await setInventoryCategoryAccentAction(
        "category",
        (foreignCategory as { id: string }).id,
        5,
      ),
    ).toEqual({ error: "Could not change the color. Please try again." });

    const { data: untouched } = await service
      .from("inventory_category_groups")
      .select("accent_stop")
      .eq("id", foreign.id)
      .single();
    expect(untouched).toEqual({ accent_stop: 2 });

    // And the seeded tenant's own Outerwear is a different row, unaffected.
    const own = await ownRow("inventory_category_groups", "outerwear");
    expect(own.id).not.toBe(foreign.id);
  });
});
