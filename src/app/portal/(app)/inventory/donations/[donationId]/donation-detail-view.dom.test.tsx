import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DonationItemRow, DonationRow } from "../donation-shared";
import { DonationDetailView } from "./donation-detail-view";

function makeItem(
  id: string,
  description: string,
  category: string,
  face_value: DonationItemRow["face_value"],
  overrides: Partial<DonationItemRow> = {},
): DonationItemRow {
  return {
    id,
    description,
    type: null,
    category_id: `category-${category}`,
    category_key: category.toLowerCase(),
    category_label: category,
    size: "9",
    gender: "unisex",
    condition: "new",
    face_value,
    status: "available",
    intended_use: "internal",
    photo_url: null,
    notes: null,
    ...overrides,
  };
}

function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: "donation-1",
    donated_at: "2026-05-01T00:00:00.000Z",
    notes: "Dropped off at HQ",
    event_id: null,
    donor_id: "donor-1",
    donor: {
      id: "donor-1",
      name: "Jane Donor",
      is_anonymous: false,
      source_type: "individual",
    },
    event: { id: "event-1", name: "Winter Gear Drive" },
    inventory_items: [
      makeItem("item-1", "Winter jacket", "Jacket", 40, {
        size: "M",
        condition: "good",
        intended_use: "gear_library",
        notes: "Barely used",
      }),
    ],
    ...overrides,
  };
}

/** Twelve items in three categories, two of them unvalued. */
const VANS_ITEMS = [
  ...Array.from({ length: 7 }, (_, i) =>
    makeItem(`shoe-${i}`, `Vans shoe ${i + 1}`, "Shoes", 50),
  ),
  ...Array.from({ length: 4 }, (_, i) =>
    makeItem(
      `boot-${i}`,
      `Vans boot ${i + 1}`,
      "Snowboard boots",
      i < 2 ? 120 : null,
    ),
  ),
  makeItem("bag", "Vans backpack", "Bag", "35.50"),
];

function summaryFigure(label: string) {
  const term = screen
    .getAllByText(label)
    .find((element) => element.tagName === "DT");
  if (!term) throw new Error(`No summary figure labelled ${label}`);
  return term.parentElement as HTMLElement;
}

describe("DonationDetailView", () => {
  test("shows the donation details as a compact header", () => {
    render(<DonationDetailView donation={makeDonation()} events={[]} />);

    expect(
      screen.getByRole("heading", { name: "Jane Donor" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Individual")).toBeInTheDocument();
    expect(screen.getByText("Winter Gear Drive")).toBeInTheDocument();
    expect(screen.getByText("May 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Dropped off at HQ")).toBeInTheDocument();
  });

  test("lists each item in a table row linking to its item page", () => {
    render(<DonationDetailView donation={makeDonation()} events={[]} />);

    const link = screen.getByRole("link", { name: "Winter jacket" });
    expect(link).toHaveAttribute("href", "/portal/inventory/items/item-1");
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("Jacket")).toBeInTheDocument();
    expect(within(row).getByText("M")).toBeInTheDocument();
    expect(within(row).getByText("Good")).toBeInTheDocument();
    expect(within(row).getByText("Gear library")).toBeInTheDocument();
    expect(within(row).getByText("Available")).toBeInTheDocument();
    // Notes are an icon with a tooltip, not a column.
    expect(
      within(row).getByRole("button", { name: "Notes: Barely used" }),
    ).toBeInTheDocument();
  });

  test("the summary's totals match the table footer (#1898)", () => {
    render(
      <DonationDetailView
        donation={makeDonation({ inventory_items: VANS_ITEMS })}
        events={[]}
      />,
    );

    expect(within(summaryFigure("Items")).getByText("12")).toBeInTheDocument();
    const faceValue = summaryFigure("Face value");
    // 7 x $50 + 2 x $120 + $35.50; the two unvalued boots are flagged.
    expect(within(faceValue).getByText("$625.50")).toBeInTheDocument();
    expect(
      within(faceValue).getByText("2 items not valued"),
    ).toBeInTheDocument();

    expect(
      within(summaryFigure("Shoes")).getByText("7 items"),
    ).toBeInTheDocument();
    expect(
      within(summaryFigure("Snowboard boots")).getByText(
        "$240.00 · 2 items not valued",
      ),
    ).toBeInTheDocument();

    const footer = screen.getByText("Total").closest("tr") as HTMLElement;
    expect(within(footer).getByText("$625.50")).toBeInTheDocument();
    expect(
      within(footer).getByRole("button", { name: "2 items not valued" }),
    ).toBeInTheDocument();
  });

  test("search shows past five items and narrows the rows and total", () => {
    render(
      <DonationDetailView
        donation={makeDonation({ inventory_items: VANS_ITEMS })}
        events={[]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "backpack" },
    });

    expect(
      screen.getByRole("link", { name: "Vans backpack" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Vans shoe 1" }),
    ).not.toBeInTheDocument();
    const footer = screen
      .getByText("Total (matching items)")
      .closest("tr") as HTMLElement;
    expect(within(footer).getByText("$35.50")).toBeInTheDocument();
  });

  test("a donation of five items or fewer has no search", () => {
    render(<DonationDetailView donation={makeDonation()} events={[]} />);

    expect(
      screen.queryByRole("searchbox", { name: "Search items" }),
    ).not.toBeInTheDocument();
  });

  test("a donation with no items keeps its empty state", () => {
    render(
      <DonationDetailView
        donation={makeDonation({ inventory_items: [] })}
        events={[]}
      />,
    );

    expect(
      screen.getByText("No items recorded for this donation"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("shows Anonymous for an anonymous donor", () => {
    render(
      <DonationDetailView
        donation={makeDonation({
          donor: {
            id: "donor-2",
            name: null,
            is_anonymous: true,
            source_type: "individual",
          },
        })}
        events={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Anonymous" }),
    ).toBeInTheDocument();
  });

  test("a donation with no donor is Anonymous, with no source (#1592)", () => {
    render(
      <DonationDetailView
        donation={makeDonation({ donor_id: null, donor: null })}
        events={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Anonymous" }),
    ).toBeInTheDocument();
  });

  test("editing happens through a sheet opened from the page header", () => {
    render(<DonationDetailView donation={makeDonation()} events={[]} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
