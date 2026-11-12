import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as PeopleActions from "../actions";
import type { PersonAccount } from "./person-account";
import { focusedName } from "../../../../../../test/focused";

const unlinkMock = mock<
  (personId: string) => Promise<{ error: string } | { success: true }>
>(async () => ({ success: true }));

mock.module("../actions", () => ({
  ...PeopleActions,
  unlinkPersonAccountAction: unlinkMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const { AccountCard } = await import("./account-card");

const websiteAccount: PersonAccount = {
  user_id: "auth-1",
  email: "robin.ashford@gmail.example",
  roles: [],
  created_at: null,
  deactivated_at: null,
  source: "directory",
};

const staffAccount: PersonAccount = {
  user_id: "auth-2",
  email: "robin@example.test",
  roles: ["admin"],
  created_at: "2026-01-04T10:00:00.000Z",
  deactivated_at: null,
  source: "administration",
};

function renderCard({
  account,
  hasPortalAccess = false,
  canUnlinkAccount = true,
}: {
  account: PersonAccount | null;
  hasPortalAccess?: boolean;
  canUnlinkAccount?: boolean;
}) {
  return render(
    <AccountCard
      personId="p1"
      personName="Robin Ashford"
      account={account}
      hasPortalAccess={hasPortalAccess}
      linkable={[]}
      roleLabels={{}}
      notificationEmail={null}
      notificationEmailPending={null}
      canManagePerson={false}
      canUnlinkAccount={canUnlinkAccount}
    />,
  );
}

/**
 * #1193. Unlinking is the one write this card gained, and the one act in the
 * whole constituent area with a consequence a person will notice: they stop
 * seeing their own history at /my. So what it is offered for, and what it is
 * not, is the thing worth pinning.
 */
describe("AccountCard unlink", () => {
  beforeEach(() => {
    unlinkMock.mockClear();
    unlinkMock.mockImplementation(async () => ({ success: true }));
  });

  test("is offered for a website account, and says what the person loses", async () => {
    renderCard({ account: websiteAccount });

    expect(screen.getByText("Website account")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink account" }),
    );

    expect(
      screen.getByText(/Unlink this account from Robin Ashford\?/),
    ).toBeInTheDocument();
    expect(screen.getByText(/at \/my/)).toBeInTheDocument();
    // The account survives; only the link goes.
    expect(screen.getByText(/is not\s+deleted/)).toBeInTheDocument();
  });

  test("runs only once the reader confirms", async () => {
    renderCard({ account: websiteAccount });

    await userEvent.click(
      screen.getByRole("button", { name: "Unlink account" }),
    );
    expect(unlinkMock).not.toHaveBeenCalled();

    const confirm = screen
      .getAllByRole("button", { name: "Unlink account" })
      .at(-1)!;
    await userEvent.click(confirm);
    expect(unlinkMock).toHaveBeenCalledWith("p1");
  });

  // The RPC refuses this outright, so the button is absent rather than present
  // and failing: a staffer's link is what the portal identifies them by, and
  // removing it belongs to Administration > Users.
  test("is not offered for an account that can open the portal", () => {
    renderCard({ account: staffAccount, hasPortalAccess: true });

    expect(screen.getByText("Portal access")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unlink account" }),
    ).not.toBeInTheDocument();
  });

  test("is not offered to a reader who cannot review claims", () => {
    renderCard({ account: websiteAccount, canUnlinkAccount: false });

    expect(
      screen.queryByRole("button", { name: "Unlink account" }),
    ).not.toBeInTheDocument();
  });

  // Administration's read knows whether an account is suspended; the
  // directory's read does not, and says nothing rather than claiming "Active".
  test("claims no account status it did not read", () => {
    const { rerender } = renderCard({ account: websiteAccount });
    expect(screen.queryByText("Active")).not.toBeInTheDocument();

    rerender(
      <AccountCard
        personId="p1"
        personName="Robin Ashford"
        account={staffAccount}
        hasPortalAccess
        linkable={[]}
        roleLabels={{}}
        notificationEmail={null}
        notificationEmailPending={null}
        canManagePerson={false}
        canUnlinkAccount={false}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

// Save, Cancel and Escape all unmount the control that had focus; the pencil
// that opened the editor takes it back (#1863).
describe("AccountCard notification email editor", () => {
  function renderEditable() {
    return render(
      <AccountCard
        personId="p1"
        personName="Robin Ashford"
        account={websiteAccount}
        hasPortalAccess={false}
        linkable={[]}
        roleLabels={{}}
        notificationEmail={null}
        notificationEmailPending={null}
        canManagePerson
        canUnlinkAccount={false}
      />,
    );
  }

  test("Cancel hands focus back to the pencil", async () => {
    const user = userEvent.setup();
    renderEditable();
    await user.click(
      screen.getByRole("button", { name: "Edit notification email" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel editing notification email" }),
    );
    expect(focusedName()).toBe("Edit notification email");
  });

  test("Escape hands focus back to the pencil", async () => {
    const user = userEvent.setup();
    renderEditable();
    await user.click(
      screen.getByRole("button", { name: "Edit notification email" }),
    );
    await user.keyboard("{Escape}");
    expect(focusedName()).toBe("Edit notification email");
  });
});
