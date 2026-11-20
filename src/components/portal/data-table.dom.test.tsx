import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalDataTable, type PortalDataTableColumn } from "./data-table";

type Gear = { id: string; name: string; qty: number; owner: string | null };

const COLUMNS: PortalDataTableColumn<Gear>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (row) => row.name,
    render: (row) => row.name,
  },
  {
    key: "qty",
    label: "Quantity",
    sortValue: (row) => row.qty,
    render: (row) => row.qty,
  },
  {
    key: "owner",
    label: "Owner",
    sortValue: (row) => row.owner,
    render: (row) => row.owner ?? "—",
  },
  { key: "notes", label: "Notes", render: () => "—" },
  {
    key: "actions",
    label: "Actions",
    srOnlyLabel: true,
    render: (row) => <button type="button">Edit {row.name}</button>,
  },
];

function gear(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `g${index}`,
    // Padded so the alphabetical order and the numeric one agree, which keeps
    // a paging assertion from doubling as a sorting assertion.
    name: `Item ${String(index).padStart(2, "0")}`,
    qty: index,
    owner: `Owner ${index}`,
  }));
}

function renderTable(rows: Gear[], props: Record<string, unknown> = {}) {
  return render(
    <PortalDataTable
      columns={COLUMNS}
      rows={rows}
      getRowKey={(row) => row.id}
      emptyMessage="No gear matches your filters."
      {...props}
    />,
  );
}

/** The names in the body, top to bottom, ignoring the header row. */
function bodyNames() {
  const rows = screen.getAllByRole("row").slice(1);
  return rows.map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function clickHeader(label: string) {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: new RegExp(`^${label},`) }));
}

describe("PortalDataTable", () => {
  test("starts on the sort the page asked for", () => {
    renderTable(gear(3), { defaultSort: { key: "name", dir: "desc" } });
    expect(bodyNames()).toEqual(["Item 02", "Item 01", "Item 00"]);
  });

  test("leaves the rows in the order they arrived when nothing is sorted", () => {
    // The server's own ordering is the meaningful one until a reader
    // overrides it, so an unsorted table must not impose one of its own.
    renderTable([...gear(3)].reverse());
    expect(bodyNames()).toEqual(["Item 02", "Item 01", "Item 00"]);
  });

  test("sorting a new column starts ascending, and clicking it again flips", async () => {
    renderTable(gear(3), { defaultSort: { key: "name", dir: "desc" } });
    await clickHeader("Quantity");
    expect(bodyNames()).toEqual(["Item 00", "Item 01", "Item 02"]);
    await clickHeader("Quantity");
    expect(bodyNames()).toEqual(["Item 02", "Item 01", "Item 00"]);
  });

  test("sorts numbers as numbers", async () => {
    // Every amount and count in the portal is a number that would otherwise
    // sort as text, putting 10 before 2.
    const rows: Gear[] = [
      { id: "a", name: "A", qty: 10, owner: null },
      { id: "b", name: "B", qty: 2, owner: null },
    ];
    renderTable(rows);
    await clickHeader("Quantity");
    expect(bodyNames()).toEqual(["B", "A"]);
  });

  test("sorts blanks to the end whichever way the column points", async () => {
    const rows: Gear[] = [
      { id: "a", name: "A", qty: 1, owner: null },
      { id: "b", name: "B", qty: 2, owner: "Zoe" },
    ];
    renderTable(rows);
    await clickHeader("Owner");
    expect(bodyNames()).toEqual(["B", "A"]);
    await clickHeader("Owner");
    expect(bodyNames()).toEqual(["B", "A"]);
  });

  test("only the sorted column announces a direction", () => {
    renderTable(gear(2), { defaultSort: { key: "name", dir: "asc" } });
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveAttribute("aria-sort", "ascending");
    expect(headers[1]).toHaveAttribute("aria-sort", "none");
    // A column with no sortValue is not merely unsorted, it is unsortable,
    // and saying "none" would advertise a control that isn't there.
    expect(headers[3]).not.toHaveAttribute("aria-sort");
  });

  test("a column with no sortValue offers no sort control", () => {
    renderTable(gear(2));
    expect(screen.queryByRole("button", { name: /^Notes,/ })).toBeNull();
  });

  test("shows one page of rows and holds the rest back", () => {
    renderTable(gear(11));
    expect(bodyNames()).toHaveLength(10);
  });

  test("asking for more rows per page reveals the rest", async () => {
    renderTable(gear(11));
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));
    expect(bodyNames()).toHaveLength(11);
  });

  test("hides the whole footer when the rows fit the smallest page size", () => {
    renderTable(gear(10));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Rows per page" }),
    ).toBeNull();
  });

  test("keeps the footer for a list that only fits because of the larger size", async () => {
    // The rule keys on the smallest option, not the current one: twenty rows
    // fit a twenty-five-row page, and hiding the footer for them would take
    // away the only control that could put the reader back on ten.
    renderTable(gear(20));
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));
    expect(bodyNames()).toHaveLength(20);
    expect(
      screen.getByRole("combobox", { name: "Rows per page" }),
    ).toBeInTheDocument();
  });

  test("pages forward and back", async () => {
    renderTable(gear(11));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(bodyNames()).toEqual(["Item 10"]);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(bodyNames()).toHaveLength(10);
  });

  test("cannot strand the reader on a page the rows no longer reach", async () => {
    const { rerender } = renderTable(gear(11));
    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
    expect(bodyNames()).toEqual(["Item 10"]);

    rerender(
      <PortalDataTable
        columns={COLUMNS}
        rows={gear(3)}
        getRowKey={(row) => row.id}
        emptyMessage="No gear matches your filters."
      />,
    );
    expect(bodyNames()).toHaveLength(3);
  });

  test("re-rendering with an equal list leaves the page alone", async () => {
    // Pages build their filtered list inline, so a brand-new array on every
    // render is the normal case. Keying the page on the array's identity
    // would snap the reader back to the first page on every keystroke.
    const rows = gear(11);
    const { rerender } = renderTable(rows);
    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
    expect(bodyNames()).toEqual(["Item 10"]);

    rerender(
      <PortalDataTable
        columns={COLUMNS}
        rows={[...rows]}
        getRowKey={(row) => row.id}
        emptyMessage="No gear matches your filters."
      />,
    );
    expect(bodyNames()).toEqual(["Item 10"]);
  });

  test("changing the sort returns to the first page", async () => {
    renderTable(gear(11));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(bodyNames()).toEqual(["Item 10"]);
    await clickHeader("Name");
    expect(bodyNames()).toHaveLength(10);
    expect(bodyNames()[0]).toBe("Item 00");
  });

  test("says so across the full width when nothing is left", () => {
    renderTable([]);
    const cell = screen.getByRole("cell", {
      name: "No gear matches your filters.",
    });
    expect(cell).toHaveAttribute("colspan", String(COLUMNS.length));
  });

  test("names an actions column for a screen reader and leaves it blank on screen", () => {
    renderTable(gear(1));
    const header = screen.getByRole("columnheader", { name: "Actions" });
    expect(header.querySelector(".sr-only")).not.toBeNull();
  });

  test("announces the visible range as it changes", async () => {
    renderTable(gear(11));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Showing 1–10 of 11");
    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
    expect(status).toHaveTextContent("Showing 11–11 of 11");
  });

  test("brings its own card unless the caller has one", () => {
    const { container, rerender } = renderTable(gear(1));
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
    rerender(
      <PortalDataTable
        columns={COLUMNS}
        rows={gear(1)}
        getRowKey={(row) => row.id}
        emptyMessage="No gear matches your filters."
        shell="bare"
      />,
    );
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  describe("row detail disclosure", () => {
    // What makes hiding a column honest: the value it dropped is one tap
    // away at exactly the width that dropped it (#1090).
    const HIDING_COLUMNS: PortalDataTableColumn<Gear>[] = [
      COLUMNS[0],
      { ...COLUMNS[1], hideBelow: "sm" },
      { ...COLUMNS[2], hideBelow: "lg" },
      COLUMNS[4],
    ];

    function renderHiding(props: Record<string, unknown> = {}) {
      return render(
        <PortalDataTable
          columns={HIDING_COLUMNS}
          rows={gear(2)}
          getRowKey={(row) => row.id}
          emptyMessage="No gear matches your filters."
          {...props}
        />,
      );
    }

    test("stays away from a table that hides nothing", () => {
      renderTable(gear(2));
      expect(
        screen.queryByRole("button", { name: "Show more columns" }),
      ).toBeNull();
    });

    test("opens one row at a time without touching its neighbours", async () => {
      renderHiding();
      const user = userEvent.setup();
      const [first] = screen.getAllByRole("button", {
        name: "Show more columns",
      });
      await user.click(first);
      expect(
        screen.getAllByRole("button", { name: "Show more columns" }),
      ).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "Hide more columns" }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    test("shows every dropped column and nothing else", async () => {
      const { container } = renderHiding();
      await userEvent
        .setup()
        .click(screen.getAllByRole("button", { name: "Show more columns" })[0]);
      const detail = container.querySelector("tr[data-row-detail]")!;
      const terms = [...detail.querySelectorAll("dt")].map(
        (term) => term.textContent,
      );
      expect(terms).toEqual(["Quantity", "Owner"]);
    });

    test("each pair leaves with the column it stands in for", async () => {
      // Between `sm` and `lg` the quantity column is back on screen, so
      // repeating it under the row would be noise.
      const { container } = renderHiding();
      await userEvent
        .setup()
        .click(screen.getAllByRole("button", { name: "Show more columns" })[0]);
      const detail = container.querySelector("tr[data-row-detail]")!;
      const pairs = [...detail.querySelectorAll("dl > div")];
      expect(pairs[0].className).toContain("sm:hidden");
      expect(pairs[1].className).toContain("lg:hidden");
      // The row itself goes at the widest of them, where the last hidden
      // column comes back.
      expect(detail.className).toContain("lg:hidden");
    });

    test("closes again", async () => {
      const { container } = renderHiding();
      const user = userEvent.setup();
      await user.click(
        screen.getAllByRole("button", { name: "Show more columns" })[0],
      );
      await user.click(
        screen.getByRole("button", { name: "Hide more columns" }),
      );
      expect(container.querySelector("tr[data-row-detail]")).toBeNull();
    });

    test("can be turned off for a row that already opens the record", () => {
      renderHiding({ rowDetail: "none" });
      expect(
        screen.queryByRole("button", { name: "Show more columns" }),
      ).toBeNull();
    });
  });

  describe("footer (#1898)", () => {
    test("renders a totals row under the body, one cell per column", () => {
      renderTable(gear(3), {
        footer: { name: "Total", qty: "3" },
      });

      const footer = screen.getByText("Total").closest("tfoot") as HTMLElement;
      const cells = within(footer).getAllByRole("cell");
      expect(cells).toHaveLength(COLUMNS.length);
      expect(cells[1]).toHaveTextContent("3");
    });

    test("has no footer when no row survived the filters", () => {
      renderTable([], { footer: { name: "Total" } });

      expect(screen.queryByText("Total")).toBeNull();
    });
  });
});
