import { donorDisplayName } from "@/lib/donor-label";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  formatFaceValue,
  labelFor,
} from "../items/inventory-shared";

export { CONDITIONS, GENDERS, INTENDED_USES, formatFaceValue, labelFor };

export const SOURCE_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "brand", label: "Brand" },
  { value: "organization", label: "Organization" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

export type DonationItemRow = {
  id: string;
  description: string;
  /** Legacy free text / the "Other" category's detail -- see categoryLabelFor. */
  type: string | null;
  category_id: string | null;
  category_key: string | null;
  category_label: string | null;
  /**
   * Present only on the raw query result, before withFlatItemCategories folds
   * it into category_key/category_label.
   */
  inventory_categories?: { key: string; label: string } | null;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | string | null;
  status: string;
  intended_use: string;
  photo_url: string | null;
  notes: string | null;
};

export type DonationRow = {
  id: string;
  donated_at: string;
  notes: string | null;
  event_id: string | null;
  /** Null for an anonymous donation (#1592). */
  donor_id: string | null;
  /** Null when there is no donor, or the reader cannot see the person. */
  donor: {
    id: string;
    name: string | null;
    is_anonymous: boolean;
    source_type: string;
  } | null;
  event: { id: string; name: string } | null;
  inventory_items: DonationItemRow[];
};

export type EventOption = { id: string; name: string };

export function donorLabel(donation: Pick<DonationRow, "donor_id" | "donor">) {
  return donorDisplayName(donation.donor_id, donation.donor);
}

/**
 * Normalizes the embedded `inventory_categories` on each of a donation's items
 * into the flat `category_key` / `category_label` fields every render site
 * expects (issue #667).
 */
export function withFlatItemCategories(donation: DonationRow): DonationRow {
  return {
    ...donation,
    inventory_items: (donation.inventory_items ?? []).map((item) =>
      flattenCategory(item),
    ) as DonationItemRow[],
  };
}

/** How many items share one value -- a category -- and what they are worth. */
export type ItemGroupSummary = {
  label: string;
  count: number;
  /** The valued items' face value; the unvalued ones add nothing. */
  value: number;
  /** Items in this group with no face value, which are not counted as $0. */
  unvaluedCount: number;
};

export type ItemsSummary = {
  count: number;
  /** Largest first, by item count then by value. */
  byCategory: ItemGroupSummary[];
  totalValue: number;
  /** Items with no face value, flagged rather than counted as $0. */
  unvaluedCount: number;
};

type SummarizableItem = Pick<
  DonationItemRow,
  "face_value" | "type" | "category_key" | "category_label"
>;

/** A face value as a number, or null for one that was never set. */
export function faceValueOf(item: Pick<DonationItemRow, "face_value">) {
  const value = item.face_value;
  if (value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Items grouped by `labelOf`, largest group first. Sums in cents so twelve
 * items at $12.99 total $155.88 rather than $155.87999.
 */
export function groupItems<I extends Pick<DonationItemRow, "face_value">>(
  items: readonly I[],
  labelOf: (item: I) => string,
): ItemGroupSummary[] {
  const groups = new Map<
    string,
    { count: number; cents: number; unvaluedCount: number }
  >();
  for (const item of items) {
    const label = labelOf(item);
    const group = groups.get(label) ?? { count: 0, cents: 0, unvaluedCount: 0 };
    const value = faceValueOf(item);
    group.count += 1;
    if (value === null) group.unvaluedCount += 1;
    else group.cents += Math.round(value * 100);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.count,
      value: group.cents / 100,
      unvaluedCount: group.unvaluedCount,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.value - a.value ||
        a.label.localeCompare(b.label),
    );
}

/**
 * A donation's items at a glance: how many, what kinds, and what they are
 * worth. Shared by the donations list's Items and Face value cells and the
 * donation detail's summary, so the two can never disagree.
 */
export function summarizeItems(
  items: readonly SummarizableItem[],
): ItemsSummary {
  const byCategory = groupItems(items, categoryLabelFor);
  return {
    count: items.length,
    byCategory,
    totalValue:
      byCategory.reduce(
        (cents, group) => cents + Math.round(group.value * 100),
        0,
      ) / 100,
    unvaluedCount: byCategory.reduce(
      (sum, group) => sum + group.unvaluedCount,
      0,
    ),
  };
}

/** "2 items not valued", for the marker beside a face-value total. */
export function unvaluedLabel(count: number) {
  return `${count} item${count === 1 ? "" : "s"} not valued`;
}
