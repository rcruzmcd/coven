import { CardSummary, Figure } from "../../../events/summary-figures";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  summarizeItems,
  unvaluedLabel,
  type DonationItemRow,
  type ItemGroupSummary,
} from "../donation-shared";

function plural(count: number, one: string, many = `${one}s`) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** "$240.00", or "$240.00 · 1 item not valued" when some were never valued. */
function valueCaption(
  group: Pick<ItemGroupSummary, "value" | "unvaluedCount" | "count">,
) {
  if (group.unvaluedCount === group.count) return "Not valued";
  const value = formatCurrency(group.value);
  return group.unvaluedCount > 0
    ? `${value} · ${unvaluedLabel(group.unvaluedCount)}`
    : value;
}

/** One figure per group: its item count, with its face value underneath. */
export function GroupFigures({ groups }: { groups: ItemGroupSummary[] }) {
  return groups.map((group) => (
    <Figure
      key={group.label}
      label={group.label}
      value={plural(group.count, "item")}
      caption={valueCaption(group)}
    />
  ));
}

function Breakdown({
  title,
  groups,
}: {
  title: string;
  groups: ItemGroupSummary[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="app-muted text-sm font-semibold">{title}</h2>
      <CardSummary label={`Items ${title.toLowerCase()}`}>
        <GroupFigures groups={groups} />
      </CardSummary>
    </section>
  );
}

/**
 * The donation's items at a glance, above the table (#1898): how many, what
 * they are worth, and how they break down by category and by intended use. Built on
 * `summarizeItems`, the same helper the donations list totals with.
 */
export function DonationItemsSummary({ items }: { items: DonationItemRow[] }) {
  const summary = summarizeItems(items);
  const allUnvalued = summary.unvaluedCount === summary.count;

  return (
    <div className="flex flex-col gap-4">
      <CardSummary label="Donation summary">
        <Figure
          label="Items"
          value={formatNumber(summary.count)}
          caption={plural(summary.byCategory.length, "category", "categories")}
        />
        <Figure
          label="Face value"
          value={allUnvalued ? "—" : formatCurrency(summary.totalValue)}
          caption={
            summary.unvaluedCount > 0
              ? unvaluedLabel(summary.unvaluedCount)
              : undefined
          }
        />
      </CardSummary>
      <Breakdown title="By category" groups={summary.byCategory} />
      {/* Internal use vs. giveaway is what decides where the items go next
          (#1899). */}
      <Breakdown title="By intended use" groups={summary.byIntendedUse} />
    </div>
  );
}
