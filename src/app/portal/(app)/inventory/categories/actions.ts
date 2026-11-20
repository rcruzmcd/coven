"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { toInventoryCategories, type InventoryCategory } from "@/lib/inventory";
import {
  isAccentStop,
  parseCategoryForm,
  parseCategoryGroupForm,
  slugifyCategoryKey,
} from "./category-form";

export type CategoryActionResult = { error: string } | { success: true };

/**
 * The vocabulary as every picker wants it: active leaves only, already ordered
 * by group then category so `groupInventoryCategories` can preserve the order
 * instead of re-sorting.
 *
 * No permission check beyond being signed in: RLS answers this one, and it
 * cannot be restated here without getting it wrong. The roles that need the
 * vocabulary are not the ones holding `inventory` — an intake volunteer holds
 * `inventory_intake:manage` with `inventory:none`, finance holds
 * `inventory_reports:view` with `inventory:none` — so gating this on
 * `inventory:view` would show an empty category picker to exactly the people
 * who record donations. The `inventory_categories select` policy accepts any
 * of the three, and since #1191 it accepts nothing less: it used to be keyed
 * on the tenant alone, which made a bare membership enough.
 */
export async function listInventoryCategoriesAction(): Promise<
  { data: InventoryCategory[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to load item categories.",
  );
  if ("error" in userResult) return userResult;

  const { data, error } = await supabase
    .from("inventory_categories")
    .select(
      "id, key, label, is_active, sort_order, inventory_category_groups(key, label, sort_order)",
    )
    .eq("is_active", true);

  if (error) {
    return { error: "Could not load item categories. Please try again." };
  }

  return { data: toInventoryCategories(data) };
}

async function requireManage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to manage item categories.",
  );
  if ("error" in userResult) return userResult;
  return checkPermission(supabase, "inventory", "manage");
}

export async function createInventoryCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCategoryForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("inventory_categories")
    .insert({ ...parsed.data, key: slugifyCategoryKey(parsed.data.label) });

  if (error) {
    return {
      error: friendlyError(
        error,
        "A category with this name already exists.",
        "Could not create the category. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/inventory/categories");
  revalidatePath("/portal/inventory/items");
  return { success: true };
}

export async function updateInventoryCategoryAction(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCategoryForm(formData);
  if ("error" in parsed) return parsed;

  // `key` is deliberately absent from the update: renaming a category must not
  // change the token that filters, URLs and the backfill aliases join on.
  const { error } = await supabase
    .from("inventory_categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A category with this name already exists.",
        "Could not update the category. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/inventory/categories");
  revalidatePath("/portal/inventory/items");
  return { success: true };
}

export async function deleteInventoryCategoryAction(
  id: string,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const { error } = await supabase
    .from("inventory_categories")
    .delete()
    .eq("id", id);

  if (error) {
    // 23503: the on delete restrict FK from inventory_items. Retiring is the
    // intended way to withdraw a category that history still references.
    if (error.code === "23503") {
      return {
        error:
          "This category is in use by existing items. Deactivate it instead — it will stay on those items but disappear from the pickers.",
      };
    }
    return { error: "Could not delete the category. Please try again." };
  }

  revalidatePath("/portal/inventory/categories");
  revalidatePath("/portal/inventory/items");
  return { success: true };
}

export async function createInventoryCategoryGroupAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCategoryGroupForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("inventory_category_groups")
    .insert({ ...parsed.data, key: slugifyCategoryKey(parsed.data.label) });

  if (error) {
    return {
      error: friendlyError(
        error,
        "A group with this name already exists.",
        "Could not create the group. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/inventory/categories");
  return { success: true };
}

export async function updateInventoryCategoryGroupAction(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCategoryGroupForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("inventory_category_groups")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A group with this name already exists.",
        "Could not update the group. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/inventory/categories");
  revalidatePath("/portal/inventory/items");
  return { success: true };
}

/**
 * Sets (or clears, with null) a group's or a category's colour: an index into
 * the tenant's accent stops (#1907). Its own action rather than a field on the
 * category forms, because it is picked from the table in one click.
 */
export async function setInventoryCategoryAccentAction(
  kind: "group" | "category",
  id: string,
  stop: number | null,
): Promise<CategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  if (!isAccentStop(stop)) return { error: "Choose one of the brand colors." };

  const { data, error } = await supabase
    .from(
      kind === "group" ? "inventory_category_groups" : "inventory_categories",
    )
    .update({ accent_stop: stop })
    .eq("id", id)
    .select("id");

  // RLS filters rather than errors, so another tenant's id updates nothing.
  if (error || !data?.length) {
    return { error: "Could not change the color. Please try again." };
  }

  revalidatePath("/portal/inventory/categories");
  return { success: true };
}
