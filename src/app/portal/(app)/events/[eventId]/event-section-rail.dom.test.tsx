import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventSectionRail } from "./event-section-rail";
import type { EventGroup } from "../event-tabs-config";

const GROUPS: EventGroup[] = [
  {
    key: "overview",
    label: "Overview",
    tabs: [
      {
        value: "overview",
        canManage: true,
        canManageSettings: false,
        label: "Event details",
        keywords: [],
      },
      {
        value: "planning",
        canManage: true,
        canManageSettings: false,
        label: "Planning",
        keywords: ["budget", "capacity"],
      },
      {
        value: "checklist",
        canManage: true,
        canManageSettings: false,
        label: "Checklist",
        keywords: [],
      },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    tabs: [
      {
        value: "logistics",
        canManage: true,
        canManageSettings: false,
        label: "Logistics",
        keywords: ["venue"],
      },
      {
        value: "incidents",
        canManage: true,
        canManageSettings: false,
        label: "Incidents",
        keywords: [],
      },
    ],
  },
];

function renderRail(
  overrides: Partial<Parameters<typeof EventSectionRail>[0]> = {},
) {
  const onSelect = mock(() => {});
  render(
    <EventSectionRail
      device="desktop"
      groups={GROUPS}
      current="overview"
      currentTitle="Event details"
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

function sections() {
  return within(screen.getByRole("navigation", { name: "Event sections" }));
}

function results() {
  return within(screen.getByRole("navigation", { name: "Search results" }));
}

function search() {
  return screen.getByRole("searchbox", {
    name: "Search this event's sections",
  });
}

describe("EventSectionRail", () => {
  test("lists every section under its group heading", () => {
    renderRail();

    expect(sections().getAllByRole("button")).toHaveLength(5);
    expect(sections().getByText("Overview")).toBeInTheDocument();
    expect(sections().getByText("Operations")).toBeInTheDocument();
    expect(sections().getByRole("button", { name: /Planning/ })).toBeVisible();
  });

  test("marks the open section, and only it", () => {
    renderRail({ current: "logistics" });

    expect(
      sections().getByRole("button", { name: /^Logistics/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      sections().getByRole("button", { name: /^Checklist/ }),
    ).not.toHaveAttribute("aria-current");
  });

  test("reports the section picked", () => {
    const onSelect = renderRail();

    fireEvent.click(sections().getByRole("button", { name: /^Checklist/ }));

    expect(onSelect).toHaveBeenCalledWith("checklist");
  });

  test("matches a search on the title", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "logi" } });

    expect(results().getAllByRole("button")).toHaveLength(1);
    expect(results().getByRole("button", { name: /Logistics/ })).toBeVisible();
  });

  test("matches a search on a keyword the title does not contain", () => {
    // The lookup the phase tabs could not answer: "budget" is on a card
    // called Planning, in a group called Overview.
    renderRail();

    fireEvent.change(search(), { target: { value: "Budget" } });

    expect(results().getByRole("button", { name: /Planning/ })).toBeVisible();
  });

  test("matches a search on the group heading", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "operations" } });

    expect(results().getAllByRole("button")).toHaveLength(2);
  });

  test("names the group in a result, since the headings are gone", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "venue" } });

    const row = results().getByRole("button", { name: /^Logistics/ });
    expect(within(row).getByText("Operations")).toBeInTheDocument();
  });

  test("says so when nothing matches", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "sponsors" } });

    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
    expect(results().queryAllByRole("button")).toHaveLength(0);
  });

  test("badges a section with outstanding work, and names it", () => {
    renderRail({
      cardTasks: { checklist: ["Return the van", "Send thank-yous"] },
    });

    const row = sections().getByRole("button", { name: /^Checklist/ });
    expect(within(row).getByLabelText("2 outstanding")).toHaveAttribute(
      "title",
      "Return the van, Send thank-yous",
    );
    expect(screen.getAllByLabelText(/outstanding/)).toHaveLength(1);
  });

  test("names the open section on the collapsed rail's button", () => {
    // Below lg the rail is behind a disclosure, and a button reading only
    // "Sections" would leave the reader with nothing saying where they are.
    renderRail({ current: "logistics", currentTitle: "Logistics" });

    const toggle = screen.getByRole("button", { name: "Sections · Logistics" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide sections" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("collapses again once a section is picked", () => {
    // Below lg the rail sits above the card, so a rail left open would push
    // the section the reader just asked for off the screen.
    const onSelect = renderRail();

    fireEvent.click(screen.getByRole("button", { name: /^Sections · / }));
    fireEvent.click(sections().getByRole("button", { name: /^Checklist/ }));

    expect(onSelect).toHaveBeenCalledWith("checklist");
    expect(
      screen.getByRole("button", { name: /^Sections · / }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("EventSectionRail on a phone", () => {
  // The shape #1093 gave the rail below `lg`: the same button, a sheet rather
  // than a list shoved in above the card.
  test("opens the sections in a sheet, with search above them", async () => {
    const user = userEvent.setup();
    render(
      <EventSectionRail
        device="mobile"
        groups={GROUPS}
        current="overview"
        currentTitle="Event details"
        onSelect={() => {}}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Sections · Event details",
    });
    expect(toggle).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(toggle);

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByRole("searchbox")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /Planning/ })).toBeVisible();
  });

  test("closes on a pick, and reports it once it is gone", async () => {
    // The pick runs after the sheet has closed, not beside it: a modal sheet
    // holds the page's scroll and restores it on the way out, so anything that
    // moves the page underneath has to wait.
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <EventSectionRail
        device="mobile"
        groups={GROUPS}
        current="overview"
        currentTitle="Event details"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Sections · / }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /^Checklist/,
      }),
    );

    expect(onSelect).toHaveBeenCalledWith("checklist");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
