import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionMap } from "@/lib/auth/permissions";

const pushMock = mock((_href: string) => {});
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ push: pushMock, refresh: () => {} }),
}));

// The action module pulls in the server Supabase client, which throws when
// dragged into a client-component module graph.
const searchPeopleMock = mock(async (_query: string) => ({
  people: [
    { id: "person-1", label: "Ada Lovelace", detail: "ada@example.test" },
  ],
}));
mock.module("./command-palette-actions", () => ({
  searchPeopleAction: searchPeopleMock,
}));

// The palette now mounts the quick-action dialogs so it can open one in
// place (#979), and each loads its own option data on open through a Server
// Action -- spread the real modules so the create actions they also import
// stay in place, the same way the sidebar's test does.
const EventActions = await import("./events/actions");
const PeopleActions = await import("./people/actions");
const ProgramActions = await import("./programs/actions");
mock.module("./events/actions", () => ({
  ...EventActions,
  listEventOptionsAction: async () => ({ data: [] }),
}));
mock.module("./people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: async () => ({ data: [] }),
}));
mock.module("./programs/actions", () => ({
  ...ProgramActions,
  listProgramsAction: async () => ({ data: [] }),
}));

const { CommandPalette } = await import("./command-palette");

const ADMIN: PermissionMap = {
  people: "manage",
  finance: "manage",
  reimbursements: "manage",
  volunteers: "manage",
  administration: "manage",
  governance: "manage",
};

const BOARD: PermissionMap = { finance_reports: "view" };

async function openPalette(permissions: PermissionMap = ADMIN) {
  const user = userEvent.setup();
  render(<CommandPalette permissions={permissions} />);
  await user.click(screen.getByRole("button", { name: "Search the portal" }));
  return user;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    pushMock.mockClear();
    searchPeopleMock.mockClear();
  });

  test("lists reachable pages and navigates to the one picked", async () => {
    const user = await openPalette();
    const option = await screen.findByRole("option", {
      name: /Reimbursements/,
    });
    await user.click(option);
    expect(pushMock).toHaveBeenCalledWith("/portal/finance/reimbursements");
  });

  test("offers only pages the permissions actually reach", async () => {
    await openPalette(BOARD);
    expect(
      await screen.findByRole("option", { name: /Financial Reports/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Expenses/ }),
    ).not.toBeInTheDocument();
  });

  test("offers a work list's settings page only to who can change them (#1547)", async () => {
    const user = await openPalette({ ...ADMIN, inventory: "manage" });
    await user.click(
      await screen.findByRole("option", { name: /request settings/ }),
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/portal/inventory/requests/settings",
    );
  });

  test("offers People settings to who can edit profile questions (#1743, #1760)", async () => {
    const user = await openPalette({ ...ADMIN, person_answers: "manage" });
    await user.click(
      await screen.findByRole("option", { name: /People settings/ }),
    );
    expect(pushMock).toHaveBeenCalledWith("/portal/people/settings");
  });

  test("leaves People settings out for a viewer of the answers", async () => {
    await openPalette({ ...ADMIN, person_answers: "view" });
    await screen.findAllByRole("option");
    expect(
      screen.queryByRole("option", { name: /People settings/ }),
    ).not.toBeInTheDocument();
  });

  test("leaves the settings page out for an inventory viewer", async () => {
    await openPalette({ ...ADMIN, inventory: "view" });
    await screen.findByRole("option", { name: /Requests/ });
    expect(
      screen.queryByRole("option", { name: /request settings/ }),
    ).not.toBeInTheDocument();
  });

  test("names the owning section, since two page titles are ambiguous alone", async () => {
    await openPalette();
    const roles = await screen.findAllByRole("option", { name: /Roles/ });
    const sections = roles.map((option) => option.textContent);
    expect(sections.some((text) => text?.includes("Volunteers"))).toBe(true);
    expect(sections.some((text) => text?.includes("Administration"))).toBe(
      true,
    );
  });

  test("finds a person without knowing which section files them", async () => {
    const user = await openPalette();
    await user.type(
      screen.getByRole("combobox", { name: "Search pages and people" }),
      "ada",
    );
    await waitFor(() => expect(searchPeopleMock).toHaveBeenCalled());
    const hit = await screen.findByRole("option", { name: /Ada Lovelace/ });
    await user.click(hit);
    expect(pushMock).toHaveBeenCalledWith("/portal/people/person-1");
  });

  test("doesn't search people without people:view", async () => {
    const user = await openPalette(BOARD);
    await user.type(
      screen.getByRole("combobox", { name: "Search pages and people" }),
      "ada",
    );
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });

  // Issue #979. The sidebar group these six live in now starts collapsed, so
  // the palette is the surface that keeps them reachable without a click into
  // a disclosure -- which only works if it can open one where the reader is.
  test("opens a quick action in place rather than navigating", async () => {
    const user = await openPalette();
    await user.type(
      screen.getByRole("combobox", { name: "Search pages and people" }),
      "log donation",
    );

    const option = await screen.findByRole("option", { name: /Log donation/ });
    await user.click(option);

    expect(
      await screen.findByRole("heading", { name: "Add donation" }),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  test("offers only the actions the permissions allow", async () => {
    await openPalette({ volunteers: "manage" });
    expect(
      await screen.findByRole("option", { name: /Log volunteer hours/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Log donation/ }),
    ).not.toBeInTheDocument();
  });

  // Issue #567. Every assertion above drives the palette with the mouse, so
  // nothing held the keyboard path in place: navigation hangs off onClick on
  // the item, and whether Enter ever reaches that is the primitive's business.
  test("arrow keys move the highlight without moving focus", async () => {
    const user = await openPalette();
    const input = screen.getByRole("combobox", {
      name: "Search pages and people",
    });
    await user.type(input, "reimburse");
    await waitFor(() => expect(searchPeopleMock).toHaveBeenCalled());

    // The Finance page, then the person the search action turned up.
    const [page, person] = await screen.findAllByRole("option");

    // autoHighlight="always" means Enter works before any arrow key.
    expect(input.getAttribute("aria-activedescendant")).toBe(page.id);

    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(person.id);
    // Virtual focus: the highlight walks the list while focus stays in the
    // input, which is what lets a screen reader follow it.
    expect(document.activeElement).toBe(input);

    await user.keyboard("{ArrowUp}");
    expect(input.getAttribute("aria-activedescendant")).toBe(page.id);

    await user.keyboard("{Enter}");
    expect(pushMock).toHaveBeenCalledWith("/portal/finance/reimbursements");
  });

  // Issue #703. The highlight used to be a `--muted` tint and nothing else --
  // 1.25:1 against the popover, so a keyboard user had no 3:1 indicator of
  // where they were (WCAG 1.4.11). axe misses it: the text keeps its contrast
  // against the tint, and no scan here measures a highlight state at all. So
  // the guard is the class contract itself -- a tint-only highlight is the
  // regression.
  test("the highlighted option is marked by more than a background tint", async () => {
    await openPalette();
    const [option] = await screen.findAllByRole("option");
    expect(option.className).toContain("data-highlighted:inset-ring-2");
    expect(option.className).toContain("data-highlighted:inset-ring-ring");
  });
});
