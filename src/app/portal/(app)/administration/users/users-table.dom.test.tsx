import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import type { PortalUser } from "./users-shared";
import { focusedName } from "../../../../../../test/focused";

const updatePreferredNameMock = mock(
  async (
    _userId: string,
    _preferredName: string,
  ): Promise<{ error: string } | { success: true }> => ({
    success: true,
  }),
);

// Mocked wholesale rather than spread over the real module: actions.ts
// imports the server-only Supabase admin client, which throws when pulled
// into a client-component module graph.
const ok = async () => ({ success: true }) as const;

const revokeRoleMock = mock(
  async (
    _userId: string,
    _role: string,
  ): Promise<{ error: string } | { success: true }> => ({ success: true }),
);

mock.module("./actions", () => ({
  assignRoleAction: ok,
  deactivateUserAction: ok,
  reactivateUserAction: ok,
  removeTenantMemberAction: ok,
  revokeRoleAction: revokeRoleMock,
  updateUserPreferredNameAction: updatePreferredNameMock,
}));

const { UsersTable } = await import("./users-table");

function portalUser(overrides: Partial<PortalUser> = {}): PortalUser {
  return {
    user_id: "auth-1",
    email: "avery@example.test",
    full_name: "Avery Morgan",
    person_id: "person-1",
    preferred_name: null,
    person_name: "Avery Morgan",
    roles: ["admin"],
    created_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    shared_account: false,
    ...overrides,
  };
}

describe("UsersTable preferred name", () => {
  beforeEach(() => {
    updatePreferredNameMock.mockClear();
    updatePreferredNameMock.mockImplementation(async () => ({ success: true }));
  });

  test("the Name column prefers the preferred name over the account name", () => {
    render(
      <UsersTable
        users={[portalUser({ preferred_name: "Ave" })]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );
    // Twice over: once resolved in the Name column, once raw in the
    // Preferred name column.
    expect(screen.getAllByText("Ave")).toHaveLength(2);
    expect(screen.queryByText("Avery Morgan")).not.toBeInTheDocument();
  });

  test("falls back to the account name, then the email", () => {
    render(
      <UsersTable
        users={[
          portalUser(),
          portalUser({
            user_id: "auth-2",
            email: "nobody@example.test",
            full_name: null,
            person_id: null,
            person_name: null,
            roles: [],
          }),
        ]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );
    expect(screen.getAllByText("Avery Morgan").length).toBeGreaterThan(0);
    expect(screen.getByText("nobody@example.test")).toBeInTheDocument();
  });

  test("editing a preferred name saves it for that user", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.type(
      screen.getByLabelText("Preferred name for Avery Morgan"),
      "Ave",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save preferred name for Avery Morgan",
      }),
    );

    await waitFor(() =>
      expect(updatePreferredNameMock).toHaveBeenCalledTimes(1),
    );
    expect(updatePreferredNameMock.mock.calls[0]).toEqual(["auth-1", "Ave"]);
  });

  test("Cancel discards the draft without calling the action", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.type(
      screen.getByLabelText("Preferred name for Avery Morgan"),
      "Discarded",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Cancel editing preferred name for Avery Morgan",
      }),
    );

    expect(updatePreferredNameMock).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Preferred name for Avery Morgan"),
    ).not.toBeInTheDocument();
  });

  test("a server error is surfaced", async () => {
    const user = userEvent.setup();
    updatePreferredNameMock.mockImplementation(async () => ({
      error: "Could not save the preferred name. Please try again.",
    }));
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save preferred name for Avery Morgan",
      }),
    );

    expect(
      await screen.findByText(
        "Could not save the preferred name. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});

describe("UsersTable role revoke", () => {
  beforeEach(() => {
    revokeRoleMock.mockClear();
    revokeRoleMock.mockImplementation(async () => ({ success: true }));
  });

  test("asks before revoking, and names what the user loses", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser({ roles: ["admin", "treasurer"] })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Treasurer" }));
    expect(revokeRoleMock).not.toHaveBeenCalled();
    expect(screen.getByText("Remove the Treasurer role?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove role" }));
    await waitFor(() =>
      expect(revokeRoleMock).toHaveBeenCalledWith("auth-1", "treasurer"),
    );
  });

  // The row just loses a badge, which is easy to miss in a dense table, so
  // the toast names the role and the person it came off.
  test("confirms the revoke with a toast naming the role and the person", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <UsersTable
        users={[portalUser({ roles: ["admin", "treasurer"] })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Treasurer" }));
    await user.click(screen.getByRole("button", { name: "Remove role" }));

    await expectToast("Treasurer removed from Avery Morgan.");
  });

  test("a failed revoke is announced and claims nothing", async () => {
    const user = userEvent.setup();
    revokeRoleMock.mockImplementation(async () => ({
      error: "You cannot revoke your own last admin role.",
    }));
    renderWithToaster(
      <UsersTable
        users={[portalUser({ roles: ["admin", "treasurer"] })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Treasurer" }));
    await user.click(screen.getByRole("button", { name: "Remove role" }));

    expect(
      await screen.findByText("You cannot revoke your own last admin role."),
    ).toBeInTheDocument();
    expect(hasToast("Treasurer removed from Avery Morgan.")).toBe(false);
  });

  test("cancelling leaves the role in place", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser({ roles: ["admin"] })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Admin" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(revokeRoleMock).not.toHaveBeenCalled();
  });
});

// A row action that takes its own button away on success must not drop
// keyboard focus to <body> (#1862, #1863). The refresh is mocked, so each
// test re-renders with what the server would now return.
describe("UsersTable keeps focus after a row action succeeds", () => {
  test("revoking a role hands focus to the chip that remains", async () => {
    const user = userEvent.setup();
    const before = [portalUser({ roles: ["admin", "treasurer"] })];
    const { rerender } = render(
      <UsersTable
        users={before}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Treasurer" }));
    await user.click(screen.getByRole("button", { name: "Remove role" }));
    await waitFor(() => expect(revokeRoleMock).toHaveBeenCalled());
    await waitFor(() => expect(focusedName()).toBe("Remove Treasurer"));

    rerender(
      <UsersTable
        users={[portalUser({ roles: ["admin"] })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );
    await waitFor(() => expect(focusedName()).toBe("Remove Admin"));
  });

  test("deactivating hands focus to Reactivate", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <UsersTable
        users={[portalUser()]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Deactivate",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    rerender(
      <UsersTable
        users={[portalUser({ deactivated_at: "2026-11-12T00:00:00Z" })]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );
    await waitFor(() => expect(focusedName()).toBe("Reactivate"));
  });

  test("removing a shared account hands focus to the next row's control", async () => {
    const user = userEvent.setup();
    const avery = portalUser({ shared_account: true });
    const blake = portalUser({
      user_id: "auth-2",
      email: "blake@example.test",
      full_name: "Blake Ngata",
      person_name: "Blake Ngata",
      person_id: "person-2",
      shared_account: true,
    });
    const { rerender } = render(
      <UsersTable
        users={[avery, blake]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );

    const [averyRemove] = screen.getAllByRole("button", { name: "Remove" });
    await user.click(averyRemove);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Remove",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    rerender(
      <UsersTable
        users={[blake]}
        currentUserId="someone-else"
        availableRoles={[]}
      />,
    );
    await waitFor(() => expect(focusedName()).toBe("Remove"));
  });
});
