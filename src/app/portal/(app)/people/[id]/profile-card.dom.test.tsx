import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult } from "../actions";
import type { PersonRow } from "../people-shared";
import * as PeopleActions from "../actions";
import { labelText } from "../../../../../../test/labels";

const updatePersonActionMock = mock<
  (
    id: string,
    formData: FormData,
    primaryContactPersonId?: string | null,
  ) => Promise<PersonActionResult>
>(async () => ({ success: true }));

mock.module("../actions", () => ({
  ...PeopleActions,
  updatePersonAction: updatePersonActionMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const { ProfileCard } = await import("./profile-card");

const person: PersonRow = {
  id: "1",
  name: "Jane Donor",
  preferred_name: null,
  email: "jane@example.com",
  notification_email: null,
  notification_email_pending: null,
  phone: "555-1234",
  pronouns: null,
  instagram_handle: null,
  notes: "VIP",
  logo_url: null,
  website: null,
  auth_user_id: null,
  has_portal_access: false,
  is_donor: true,
  is_sponsor: false,
  is_volunteer: false,
  is_attendee: false,
  is_staff: false,
  is_partner: false,
  is_recipient: false,
  person_type: "individual",
  primary_contact_person_id: null,
  primary_contact: null,
  address_line1: "12 Ridge Road",
  address_line2: null,
  address_city: "Hunter",
  address_region: "NY",
  address_postal_code: "12442",
  address_country: null,
};

describe("ProfileCard", () => {
  beforeEach(() => {
    updatePersonActionMock.mockClear();
    updatePersonActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("shows the person's details in view mode", () => {
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  // The role badges moved to the page header in #1108: they answer what this
  // record *is*, which is a question about the person rather than about this
  // card, and inside the card they disappeared the moment anyone started
  // editing. The page renders them from `rolesFor`, which people-shared.test.ts
  // covers -- including the role it declines to name.
  test("does not render the role badges, which now sit beside the name", () => {
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    expect(screen.queryByText("Donor")).not.toBeInTheDocument();
  });

  test("hides the edit action when the user cannot manage people", () => {
    render(<ProfileCard person={person} people={[]} canManage={false} />);

    expect(
      screen.queryByRole("button", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  });

  // Merging was a card of its own until #1108. It is gated on the same
  // people:manage the edit action is, and losing that gate in the move would
  // put a destructive, one-way operation in front of a read-only viewer.
  test("offers the merge dialog only to someone who can manage people", () => {
    const { unmount } = render(
      <ProfileCard person={person} people={[]} canManage={true} />,
    );
    expect(
      screen.getByRole("button", { name: "Merge a duplicate" }),
    ).toBeInTheDocument();
    unmount();

    render(<ProfileCard person={person} people={[]} canManage={false} />);
    expect(
      screen.queryByRole("button", { name: "Merge a duplicate" }),
    ).not.toBeInTheDocument();
  });

  test("entering edit mode pre-fills the form from the person", async () => {
    const user = userEvent.setup();
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Edit profile" }));

    expect(screen.getByLabelText(labelText("Name"))).toHaveValue("Jane Donor");
    expect(screen.getByRole("checkbox", { name: "Donor" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("saves changes and returns to view mode", async () => {
    const user = userEvent.setup();
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updatePersonActionMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });

  // The card returns to view mode looking exactly as it did before the edit,
  // so the toast is the only evidence the save reached the server.
  test("confirms the save with a toast", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <ProfileCard person={person} people={[]} canManage={true} />,
    );

    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expectToast("Profile saved.");
  });

  // #1036. logo_url was selected by the page and read by the edit form and
  // rendered nowhere, so a staffer could not tell a good link from a dead one
  // without opening the form -- on the field the public sponsor wall draws.
  // These assert the URL row rather than the <img>: next/image needs a mock to
  // render under happy-dom at all, which public-team-card.dom.test.tsx also
  // declines to set up for its own photo preview.
  test("shows an organization's logo URL on its record", () => {
    render(
      <ProfileCard
        person={{
          ...person,
          person_type: "organization",
          logo_url: "https://example.test/logos/mark.png",
        }}
        people={[]}
        canManage={true}
      />,
    );

    expect(
      screen.getByText("https://example.test/logos/mark.png"),
    ).toBeInTheDocument();
  });

  test("an organization with no logo reads as empty rather than missing", () => {
    render(
      <ProfileCard
        person={{ ...person, person_type: "organization", logo_url: null }}
        people={[]}
        canManage={true}
      />,
    );

    const row = screen.getByText("Logo:").closest("p");
    expect(row).toHaveTextContent("Logo: —");
  });

  test("an individual's record has no logo row", () => {
    render(
      <ProfileCard
        person={{
          ...person,
          person_type: "individual",
          // Set on the row, as it can be: the form keeps a value rather than
          // clearing it when someone switches an organization to an individual
          // by mistake. The view still must not offer it.
          logo_url: "https://example.test/logos/mark.png",
        }}
        people={[]}
        canManage={true}
      />,
    );

    expect(screen.queryByText("Logo:")).toBeNull();
    expect(
      screen.queryByText("https://example.test/logos/mark.png"),
    ).toBeNull();
  });

  // The role checkboxes are seeded from the derived flags on people_with_roles,
  // which carry no tag metadata, so the publication flag reaches the card as
  // its own prop read from person_role_tags (#1024).
  test("seeds the sponsor wall opt-in from the prop", async () => {
    const user = userEvent.setup();
    const sponsorOrg: PersonRow = {
      ...person,
      is_sponsor: true,
      person_type: "organization",
    };
    render(
      <ProfileCard
        person={sponsorOrg}
        people={[]}
        canManage={true}
        sponsorWallPublic={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit profile" }));

    expect(
      screen.getByRole("checkbox", { name: "Show on the public sponsor wall" }),
    ).toBeChecked();
  });

  test("leaves the sponsor wall opt-in clear when the prop is absent", async () => {
    const user = userEvent.setup();
    const sponsorOrg: PersonRow = {
      ...person,
      is_sponsor: true,
      person_type: "organization",
    };
    render(<ProfileCard person={sponsorOrg} people={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Edit profile" }));

    expect(
      screen.getByRole("checkbox", { name: "Show on the public sponsor wall" }),
    ).not.toBeChecked();
  });

  test("announces a failed save instead of claiming success", async () => {
    const user = userEvent.setup();
    updatePersonActionMock.mockImplementation(async () => ({
      error: "You do not have permission to edit people.",
    }));
    renderWithToaster(
      <ProfileCard person={person} people={[]} canManage={true} />,
    );

    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("You do not have permission to edit people."),
    ).toBeInTheDocument();
    expect(hasToast("Profile saved.")).toBe(false);
  });
});
