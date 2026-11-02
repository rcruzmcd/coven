import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { labelText } from "../../../../../test/labels";
import {
  PersonFormFields,
  emptyPersonForm,
  type PersonFormState,
} from "./person-form-fields";

function ControlledForm({
  onChange,
}: {
  onChange?: (form: PersonFormState) => void;
}) {
  const [form, setForm] = useState<PersonFormState>(() => emptyPersonForm());
  return (
    <PersonFormFields
      form={form}
      idPrefix="test"
      update={(key, value) => {
        setForm((prev) => {
          const next = { ...prev, [key]: value };
          onChange?.(next);
          return next;
        });
      }}
    />
  );
}

describe("PersonFormFields", () => {
  test("typing in the name field updates the form state", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    const nameInput = screen.getByLabelText(labelText("Name"));
    await user.type(nameInput, "Jane Donor");

    expect(nameInput).toHaveValue("Jane Donor");
  });

  test("toggling a role checkbox flips only that role", async () => {
    const user = userEvent.setup();
    let latest: PersonFormState | undefined;
    render(<ControlledForm onChange={(form) => (latest = form)} />);

    await user.click(screen.getByRole("checkbox", { name: "Sponsor" }));

    expect(latest?.roles).toEqual({
      is_donor: false,
      is_sponsor: true,
      is_volunteer: false,
      is_attendee: false,
      is_staff: false,
      is_partner: false,
      is_recipient: false,
    });
  });

  test("renders all four role checkboxes unchecked by default", () => {
    render(<ControlledForm />);

    expect(screen.getByRole("checkbox", { name: "Donor" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Volunteer" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Attendee" }),
    ).not.toBeChecked();
  });

  test("choosing Organization updates personType", async () => {
    const user = userEvent.setup();
    let latest: PersonFormState | undefined;
    render(<ControlledForm onChange={(form) => (latest = form)} />);

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));

    expect(latest?.personType).toBe("organization");
  });

  test("the sponsor wall opt-in needs both an organization and the sponsor role", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);
    const label = "Show on the public sponsor wall";

    // Neither condition met.
    expect(screen.queryByRole("checkbox", { name: label })).toBeNull();

    // Sponsor, but still an individual: the wall shows a mark, so this stays
    // hidden rather than offering to publish a person's name.
    await user.click(screen.getByRole("checkbox", { name: "Sponsor" }));
    expect(screen.queryByRole("checkbox", { name: label })).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));
    expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();

    // And it goes again with the role it hangs off.
    await user.click(screen.getByRole("checkbox", { name: "Sponsor" }));
    expect(screen.queryByRole("checkbox", { name: label })).toBeNull();
  });

  test("ticking the sponsor wall opt-in updates the form state", async () => {
    const user = userEvent.setup();
    let latest: PersonFormState | undefined;
    render(<ControlledForm onChange={(form) => (latest = form)} />);

    await user.click(screen.getByRole("checkbox", { name: "Sponsor" }));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Show on the public sponsor wall" }),
    );

    expect(latest?.sponsorWallPublic).toBe(true);
  });

  test("the logo and website are for organizations", async () => {
    const user = userEvent.setup();
    render(<ControlledForm />);

    expect(screen.queryByLabelText("Logo URL")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));

    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
  });

  // #1746. What a person rides is a profile question, on the Profile card.
  test("asks nothing about riding", () => {
    render(<ControlledForm />);
    expect(screen.queryByLabelText("Rides")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Home mountain")).not.toBeInTheDocument();
  });
});

/**
 * #1028. The field was a bare input, so a logo that could not load was
 * invisible in the portal -- and invisible on the public wall too, which falls
 * back to the sponsor's name rather than a broken image (#914).
 */
describe("the sponsor logo field", () => {
  async function asOrganization(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Organization" }));
    return screen.getByLabelText("Logo URL");
  }

  test("draws nothing while the box is empty", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledForm />);

    await asOrganization(user);

    expect(container.querySelector("img")).toBeNull();
  });

  // The same rewrite every other picture field applies: a Drive share link
  // points at Drive's HTML viewer rather than the image (#1027).
  test("previews a Google Drive share link as the picture it points at", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledForm />);

    const input = await asOrganization(user);
    fireEvent.change(input, {
      target: { value: "https://drive.google.com/file/d/ABC123/view" },
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1000",
    );
  });

  // A half-typed URL is not a URL, and next/image throws the page away on one.
  test("draws nothing for a value that is not yet a URL", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledForm />);

    const input = await asOrganization(user);
    fireEvent.change(input, { target: { value: "htt" } });

    expect(container.querySelector("img")).toBeNull();
  });

  // What Chatter Snow's own logo did: the link is well-formed, and the Drive
  // file behind it was never shared, so the endpoint serves a sign-in page.
  test("says so in words when the picture fails to load", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledForm />);

    const input = await asOrganization(user);
    fireEvent.change(input, {
      target: { value: "https://drive.google.com/file/d/ABC123/view" },
    });
    fireEvent.error(container.querySelector("img")!);

    expect(screen.getByText(/did not load as a picture/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
