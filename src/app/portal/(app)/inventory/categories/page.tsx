import type { Metadata } from "next";
import { Fragment } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { getTenantBranding } from "@/lib/tenant-branding";
import { groupStop, tenantAccentStops } from "@/lib/inventory-category-colors";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewCategoryDialog } from "./new-category-dialog";
import { CategoryColorPicker } from "./category-color-picker";
import {
  CategoryDetailsSheet,
  type CategoryRow,
} from "./category-details-sheet";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: `${(await getTenantLexicon(supabase)).collection} Categories`,
  };
}

type GroupRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  accent_stop: number | null;
  inventory_categories: {
    id: string;
    key: string;
    label: string;
    sort_order: number;
    is_active: boolean;
    accent_stop: number | null;
  }[];
};

export default async function InventoryCategoriesPage() {
  const supabase = await createSupabaseServerClient();
  const lexicon = await getTenantLexicon(supabase);
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "inventory", "manage");

  const [{ data: groupRows, error }, { data: itemRows }, branding] =
    await Promise.all([
      supabase
        .from("inventory_category_groups")
        .select(
          "id, key, label, sort_order, is_active, accent_stop, inventory_categories(id, key, label, sort_order, is_active, accent_stop)",
        )
        .order("sort_order", { ascending: true }),
      // How many items each category holds, so the sheet can explain why a
      // delete is refused before the staffer tries it.
      supabase.from("inventory_items").select("category_id"),
      getTenantBranding(supabase),
    ]);
  const stops = tenantAccentStops(branding);

  const itemCounts = new Map<string, number>();
  for (const row of (itemRows ?? []) as { category_id: string | null }[]) {
    if (!row.category_id) continue;
    itemCounts.set(row.category_id, (itemCounts.get(row.category_id) ?? 0) + 1);
  }

  const groups = (groupRows ?? []) as unknown as GroupRow[];
  const groupOptions = groups.map((group) => ({
    id: group.id,
    label: group.label,
  }));

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {lexicon.collection} categories
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        The controlled vocabulary staff tag donated items with, in two levels: a
        group (e.g. Outerwear) and the categories inside it (Jacket, Pants).
        Retiring a category keeps it on the items that already carry it while
        removing it from the pickers.
      </p>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Category names feed the giveaway tier keyword hints, so avoid names that
        contain a keyword by accident — &ldquo;Snowboard boots&rdquo; would
        match the <em>snowboard</em> hint and suggest a gold ticket for a pair
        of boots.
      </p>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Each color is one of your brand&rsquo;s accent colors, used for the
        category label on Gear Spotlight story images. Groups take the accent
        colors in turn unless you pick one, and a category uses its
        group&rsquo;s color unless you pick its own.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewCategoryDialog groups={groupOptions} />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load item categories. Please try again.
            </p>
          ) : groups.length === 0 ? (
            <EmptyState
              title="No item categories"
              description="Add a group and its categories to start classifying donated gear."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead hideBelow="sm">Key</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const groupColor = groupStop(
                    { ...group, accent_stop: null },
                    groups,
                  );
                  const groupResolved = group.accent_stop ?? groupColor;
                  return (
                    <Fragment key={group.id}>
                      <TableRow className="bg-muted/40">
                        <TableCell colSpan={4} className="font-medium">
                          {group.label}
                          {group.is_active ? null : " (retired)"}
                        </TableCell>
                        <TableCell>
                          <CategoryColorPicker
                            kind="group"
                            id={group.id}
                            name={group.label}
                            stop={group.accent_stop}
                            inheritedStop={groupColor}
                            stops={stops}
                            canManage={canManage}
                          />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      {[...group.inventory_categories]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((category) => {
                          const row: CategoryRow = {
                            ...category,
                            group_id: group.id,
                            group_label: group.label,
                            item_count: itemCounts.get(category.id) ?? 0,
                          };
                          return (
                            <TableRow key={category.id}>
                              <TableCell className="pl-8">
                                {category.label}
                              </TableCell>
                              <TableCell hideBelow="sm" className="app-muted">
                                {category.key}
                              </TableCell>
                              <TableCell>{row.item_count}</TableCell>
                              <TableCell>
                                {category.is_active ? "Yes" : "No"}
                              </TableCell>
                              <TableCell>
                                <CategoryColorPicker
                                  kind="category"
                                  id={category.id}
                                  name={category.label}
                                  stop={category.accent_stop}
                                  inheritedStop={groupResolved}
                                  stops={stops}
                                  canManage={canManage}
                                />
                              </TableCell>
                              <TableCell>
                                <CategoryDetailsSheet
                                  category={row}
                                  groups={groupOptions}
                                  canManage={canManage}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
