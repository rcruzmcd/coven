import { describe, expect, test } from "bun:test";
import { summarizeItems, type DonationItemRow } from "./donation-shared";

function item(
  category: string | null,
  face_value: DonationItemRow["face_value"],
  type: string | null = null,
  intended_use = "internal",
) {
  return {
    intended_use,
    category_key: category?.toLowerCase() ?? null,
    category_label: category,
    type,
    face_value,
  };
}

describe("summarizeItems", () => {
  test("is empty for no items", () => {
    expect(summarizeItems([])).toEqual({
      count: 0,
      byCategory: [],
      byIntendedUse: [],
      totalValue: 0,
      unvaluedCount: 0,
    });
  });

  test("groups by category, largest first, with a subtotal each", () => {
    const summary = summarizeItems([
      item("Bag", 30),
      item("Shoes", 50),
      item("Snowboard boots", "120.00"),
      item("Shoes", "50"),
      item("Shoes", 50),
      item("Snowboard boots", 120),
    ]);

    expect(summary.count).toBe(6);
    expect(summary.byCategory).toEqual([
      { label: "Shoes", count: 3, value: 150, unvaluedCount: 0 },
      { label: "Snowboard boots", count: 2, value: 240, unvaluedCount: 0 },
      { label: "Bag", count: 1, value: 30, unvaluedCount: 0 },
    ]);
    expect(summary.totalValue).toBe(420);
  });

  test("counts unvalued items rather than adding them as $0", () => {
    const summary = summarizeItems([
      item("Shoes", 40),
      item("Shoes", null),
      item("Bag", ""),
    ]);

    expect(summary.totalValue).toBe(40);
    expect(summary.unvaluedCount).toBe(2);
    expect(summary.byCategory[0]).toEqual({
      label: "Shoes",
      count: 2,
      value: 40,
      unvaluedCount: 1,
    });
  });

  test("a zero face value is a value, not a missing one", () => {
    expect(summarizeItems([item("Bag", 0)]).unvaluedCount).toBe(0);
  });

  test("sums in cents, so the total has no float drift", () => {
    const summary = summarizeItems(
      Array.from({ length: 12 }, () => item("Shoes", "12.99")),
    );
    expect(summary.totalValue).toBe(155.88);
  });

  test("names categories with categoryLabelFor", () => {
    const summary = summarizeItems([
      item(null, 5),
      { ...item("Other", 5), category_key: "other", type: "Wax kit" },
    ]);
    expect(summary.byCategory.map((group) => group.label).sort()).toEqual([
      "Uncategorized",
      "Wax kit",
    ]);
  });

  test("breaks the same items down by intended use (#1899)", () => {
    const summary = summarizeItems([
      item("Shoes", 50, null, "internal"),
      item("Shoes", 50, null, "giveaway"),
      item("Bag", 30, null, "giveaway"),
      item("Bag", null, null, "giveaway"),
    ]);

    expect(summary.byIntendedUse).toEqual([
      { label: "Giveaway prize", count: 3, value: 80, unvaluedCount: 1 },
      { label: "Internal use", count: 1, value: 50, unvaluedCount: 0 },
    ]);
    // Either breakdown adds up to the same total.
    const sum = (groups: { value: number }[]) =>
      groups.reduce((total, group) => total + group.value, 0);
    expect(sum(summary.byIntendedUse)).toBe(summary.totalValue);
    expect(sum(summary.byCategory)).toBe(summary.totalValue);
  });
});
