import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { DonationItemRow, DonationRow } from "./donation-shared";
import { DonationsTable } from "./donations-table";

function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: "donation-1",
    donated_at: "2026-05-01T00:00:00.000Z",
    notes: null,
    event_id: null,
    donor_id: "donor-1",
    donor: {
      id: "donor-1",
      name: "Jane Donor",
      is_anonymous: false,
      source_type: "individual",
    },
    event: null,
    inventory_items: [
      {
        id: "item-1",
        description: "Winter jacket",
        type: null,
        category_id: "category-jacket",
        category_key: "jacket",
        category_label: "Jacket",
        size: "M",
        gender: "unisex",
        condition: "good",
        face_value: null,
        status: "available",
        intended_use: "gear_library",
        photo_url: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

function makeItem(
  id: string,
  description: string,
  category: string,
  face_value: DonationItemRow["face_value"] = null,
): DonationItemRow {
  return {
    id,
    description,
    type: null,
    category_id: `category-${category}`,
    category_key: category.toLowerCase(),
    category_label: category,
    size: null,
    gender: null,
    condition: "good",
    face_value,
    status: "available",
    intended_use: "gear_library",
    photo_url: null,
    notes: null,
  };
}

/** Date is the only sortable column; the rest read through embeds. */
const SORT = { dir: "desc", sortHref: "?dir=asc" } as const;

describe("DonationsTable", () => {
  test("shows an empty state when there are no donations", () => {
    render(
      <DonationsTable donations={[]} hasActiveFilters={false} {...SORT} />,
    );
    expect(screen.getByText("No donations recorded yet")).toBeInTheDocument();
  });

  test("shows a filtered empty state when filters are active", () => {
    render(<DonationsTable donations={[]} hasActiveFilters={true} {...SORT} />);
    expect(
      screen.getByText("No donations match your filters"),
    ).toBeInTheDocument();
  });

  test("renders a row per donation with donor, items, and source event", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            event: { id: "event-1", name: "Winter Gear Drive" },
          }),
        ]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
    expect(screen.getByText("Winter jacket")).toBeInTheDocument();
    expect(screen.getByText("Jacket")).toBeInTheDocument();
    expect(screen.getByText("Winter Gear Drive")).toBeInTheDocument();
    // Since #469 the row's action is a link to the donation's detail page
    // rather than a sheet trigger.
    expect(screen.getByRole("link", { name: "View donation" })).toHaveAttribute(
      "href",
      "/portal/inventory/donations/donation-1",
    );
  });

  test("shows Anonymous for an anonymous donor and a dash with no source event", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            donor: {
              id: "donor-2",
              name: null,
              is_anonymous: true,
              source_type: "individual",
            },
          }),
        ]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  test("a donation with no donor is Anonymous (#1592)", () => {
    render(
      <DonationsTable
        donations={[makeDonation({ donor_id: null, donor: null })]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  test("a donor the reader cannot see is not Anonymous", () => {
    render(
      <DonationsTable
        donations={[makeDonation({ donor: null })]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.queryByText("Anonymous")).not.toBeInTheDocument();
  });

  test("a donation in several categories is a count and its top three categories (#1897)", () => {
    const items = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeItem(`shoe-${i}`, `Vans pair ${i}`, "Shoes", 50),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeItem(`boot-${i}`, `Boots ${i}`, "Snowboard boots", 100),
      ),
      makeItem("bag", "Backpack", "Bag", 30),
      makeItem("hat", "Beanie", "Hat", 10),
    ];
    render(
      <DonationsTable
        donations={[makeDonation({ inventory_items: items })]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("13 items")).toBeInTheDocument();
    expect(
      screen.getByText("7 Shoes · 4 Snowboard boots · 1 Bag · +1 more"),
    ).toBeInTheDocument();
    // No description is listed in the cell, but the title keeps them all.
    expect(screen.queryByText("Vans pair 0")).not.toBeInTheDocument();
    expect(screen.getByTitle(/Vans pair 0, .*Beanie/)).toBeInTheDocument();
    expect(screen.getByText("$790.00")).toBeInTheDocument();
  });

  test("a donation all in one category names the first item and how many more", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            inventory_items: [
              makeItem("a", "Vans Old Skool", "Shoes", 50),
              makeItem("b", "Vans Sk8-Hi", "Shoes", 60),
              makeItem("c", "Vans Era", "Shoes", 40),
            ],
          }),
        ]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("Vans Old Skool")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByText("Shoes")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  test("flags unvalued items instead of counting them as $0", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            inventory_items: [
              makeItem("a", "Vans Old Skool", "Shoes", 50),
              makeItem("b", "Vans Sk8-Hi", "Shoes", null),
              makeItem("c", "Vans Era", "Shoes", null),
            ],
          }),
        ]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2 items not valued" }),
    ).toBeInTheDocument();
  });

  test("face value is a dash when no item has one", () => {
    render(
      <DonationsTable
        donations={[makeDonation()]}
        hasActiveFilters={false}
        {...SORT}
      />,
    );

    // One for the face value, one for the missing source event.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
