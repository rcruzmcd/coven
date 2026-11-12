import { beforeEach, describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult, PersonListItem } from "./actions";
import * as PeopleActions from "./actions";
import { labelText } from "../../../../../test/labels";

const createPersonActionMock = mock(async (): Promise<PersonActionResult> => ({
  success: true,
  person: { id: "new-1", name: "New Person", email: null, phone: null },
}));

mock.module("./actions", () => ({
  ...PeopleActions,
  createPersonAction: createPersonActionMock,
}));

const { PersonPicker } = await import("./person-picker");
const { Dialog, DialogContent } = await import("@/components/ui/dialog");
type PickedPerson = Parameters<typeof PersonPicker>[0]["selected"] & object;

const people: PersonListItem[] = [
  {
    id: "1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    // Holds an account with a role behind it -- the staff case (#1192).
    auth_user_id: "auth-1",
    has_portal_access: true,
  },
  {
    id: "2",
    name: "John Smith",
    preferred_name: "Johnny",
    email: "john@acme.com",
    phone: null,
    auth_user_id: null,
  },
  {
    id: "3",
    name: "Nadia Okonkwo",
    email: "nadia@example.com",
    phone: null,
    // An approved constituent claim (#1162): an account, no role, no portal.
    auth_user_id: "auth-3",
    has_portal_access: false,
  },
];

function noop() {}

describe("PersonPicker", () => {
  beforeEach(() => {
    createPersonActionMock.mockClear();
    createPersonActionMock.mockImplementation(async () => ({
      success: true,
      person: { id: "new-1", name: "New Person", email: null, phone: null },
    }));
  });

  test("shows the selected person and clears the selection on Change", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={{
          id: "1",
          name: "Jane Doe",
          email: "jane@example.com",
          phone: null,
        }}
        onSelect={onSelect}
        onPersonCreated={noop}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test("filters people by search and selects a match", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={onSelect}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/search by name or email/i),
      "jane",
    );
    const match = await screen.findByText("Jane Doe");
    await user.click(match);

    expect(onSelect).toHaveBeenCalledWith(people[0]);
  });

  test("shows a no-matches message when the search has no results", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/search by name or email/i),
      "nomatch",
    );

    expect(
      await screen.findByText('No matches for "nomatch".'),
    ).toBeInTheDocument();
  });

  test("pre-checks no role when no newPersonRole is given", async () => {
    // Regression for #569: this used to fall back to is_sponsor, so every
    // picker in the app pre-checked Sponsor regardless of context.
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={mock(() => {})}
        onPersonCreated={mock(() => {})}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    for (const role of ["Donor", "Sponsor", "Volunteer", "Attendee"]) {
      expect(screen.getByRole("checkbox", { name: role })).not.toBeChecked();
    }
  });

  test("pre-checks the role it is given", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={mock(() => {})}
        onPersonCreated={mock(() => {})}
        newPersonRole="is_attendee"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    expect(screen.getByRole("checkbox", { name: "Attendee" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("creates and selects a new person", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    const onPersonCreated = mock(() => {});
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={onSelect}
        onPersonCreated={onPersonCreated}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );
    await user.type(screen.getByLabelText(labelText("Name")), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(createPersonActionMock).toHaveBeenCalledTimes(1);
    const created = {
      id: "new-1",
      name: "New Person",
      email: null,
      phone: null,
    };
    expect(onPersonCreated).toHaveBeenCalledWith(created);
    expect(onSelect).toHaveBeenCalledWith(created);
  });

  test("shows the server error when creation fails", async () => {
    createPersonActionMock.mockImplementation(async () => ({
      error: "Could not save this person. Please try again.",
    }));
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );
    await user.type(screen.getByLabelText(labelText("Name")), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    expect(
      await screen.findByText("Could not save this person. Please try again."),
    ).toBeInTheDocument();
  });
});

describe("PersonPicker portal accounts and preferred names", () => {
  test("badges only the people who hold a portal login", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "example.com",
    );
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Portal access")).toBeInTheDocument();
    // The same search reaches the constituent, labelled by the door the
    // account opens rather than by the column it shares with Jane's.
    expect(screen.getByText("Nadia Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("Website account")).toBeInTheDocument();
  });

  test("a directory-only person gets no badge", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "acme",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
    expect(screen.queryByText("Portal access")).not.toBeInTheDocument();
    expect(screen.queryByText("Website account")).not.toBeInTheDocument();
  });

  test("results show the preferred name in place of the legal name", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "John Smith",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
  });

  test("matches a search on the preferred name", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "johnny",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
  });

  test("the selected chip badges the account and uses the preferred name", () => {
    render(
      <PersonPicker
        aria-label="Person"
        people={people}
        selected={{
          id: "2",
          name: "John Smith",
          preferred_name: "Johnny",
          email: "john@acme.com",
          phone: null,
          auth_user_id: "auth-2",
          has_portal_access: true,
        }}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    expect(screen.getByText("Johnny")).toBeInTheDocument();
    expect(screen.getByText("Portal access")).toBeInTheDocument();
  });

  // #1854. The input used to name itself after its placeholder whenever a
  // caller passed no id, so "Walk-in", "Mover" and "Seconder" were all read
  // as "Search by name or email...".
  describe("accessible name", () => {
    test("takes its name from the label pointed at its id", () => {
      render(
        <>
          <label htmlFor="walk-in">Walk-in</label>
          <PersonPicker
            id="walk-in"
            people={people}
            selected={null}
            onSelect={noop}
            onPersonCreated={noop}
          />
        </>,
      );

      expect(
        screen.getByRole("combobox", { name: "Walk-in" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Search by name or email..." }),
      ).toBeNull();
    });

    test("two pickers in one form are told apart by their labels", () => {
      render(
        <>
          <label htmlFor="mover">Mover</label>
          <PersonPicker
            id="mover"
            people={people}
            selected={null}
            onSelect={noop}
            onPersonCreated={noop}
          />
          <label htmlFor="seconder">Seconder</label>
          <PersonPicker
            id="seconder"
            people={people}
            selected={null}
            onSelect={noop}
            onPersonCreated={noop}
          />
        </>,
      );

      expect(
        screen.getByRole("combobox", { name: "Mover" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: "Seconder" }),
      ).toBeInTheDocument();
    });

    test("takes an aria-label where there is no visible label", () => {
      render(
        <PersonPicker
          aria-label="Duplicate record"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      expect(
        screen.getByRole("combobox", { name: "Duplicate record" }),
      ).toBeInTheDocument();
    });
  });

  // Issue #567. The picker used to be an input followed by a flat list of
  // <button>s: no combobox or listbox roles, no arrow keys, no Escape, and
  // focus simply dropped to <body> whenever the field swapped for the chip.
  describe("keyboard", () => {
    test("is a combobox that owns its result listbox", async () => {
      const user = userEvent.setup();
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      const input = screen.getByRole("combobox", { name: "Person" });
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(input.getAttribute("aria-haspopup")).toBe("listbox");

      await user.type(input, "j");

      expect(input.getAttribute("aria-expanded")).toBe("true");
      const listbox = await screen.findByRole("listbox");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
      expect(await screen.findAllByRole("option")).toHaveLength(2);
    });

    test("arrow keys move the highlight while focus stays in the input", async () => {
      const user = userEvent.setup();
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      const input = screen.getByRole("combobox");
      await user.type(input, "j");
      const [first, second] = await screen.findAllByRole("option");

      await user.keyboard("{ArrowDown}");
      expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
      expect(document.activeElement).toBe(input);

      await user.keyboard("{ArrowDown}");
      expect(input.getAttribute("aria-activedescendant")).toBe(second.id);
      expect(document.activeElement).toBe(input);

      await user.keyboard("{ArrowUp}");
      expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
      expect(document.activeElement).toBe(input);
    });

    // Issue #703, the same tint-only highlight as the command palette: at
    // 1.25:1 the background was the whole signal, and `outline-none` removed
    // the other one. Guarded here as a class contract because no scan in this
    // repo measures a highlight state.
    test("the highlighted person is marked by more than a background tint", async () => {
      const user = userEvent.setup();
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      await user.type(screen.getByRole("combobox"), "j");
      const [first] = await screen.findAllByRole("option");
      expect(first.className).toContain("data-highlighted:inset-ring-2");
      expect(first.className).toContain("data-highlighted:inset-ring-ring");
    });

    test("Enter picks the highlighted person", async () => {
      const user = userEvent.setup();
      const onSelect = mock((_person: unknown) => {});
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={onSelect}
          onPersonCreated={noop}
        />,
      );

      await user.type(screen.getByRole("combobox"), "j");
      await screen.findAllByRole("option");
      await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect((onSelect.mock.calls[0][0] as { id: string }).id).toBe("2");
    });

    test("Escape closes the list but keeps what was typed", async () => {
      const user = userEvent.setup();
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      const input = screen.getByRole("combobox");
      await user.type(input, "jane");
      await screen.findAllByRole("option");

      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryAllByRole("option")).toHaveLength(0),
      );
      // Clearing the query on Escape would make the key destructive; it only
      // dismisses the list.
      expect((input as HTMLInputElement).value).toBe("jane");
      expect(document.activeElement).toBe(input);
    });

    test("focus follows the control that replaces the one it was on", async () => {
      const user = userEvent.setup();

      function Harness() {
        const [selected, setSelected] = useState<PickedPerson | null>(null);
        return (
          <PersonPicker
            aria-label="Person"
            people={people}
            selected={selected}
            onSelect={setSelected}
            onPersonCreated={noop}
          />
        );
      }
      render(<Harness />);

      await user.type(screen.getByRole("combobox"), "jane");
      await screen.findAllByRole("option");
      await user.keyboard("{ArrowDown}{Enter}");

      const change = await screen.findByRole("button", { name: "Change" });
      expect(document.activeElement).toBe(change);

      await user.click(change);
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("combobox")),
      );
    });

    test("announces the person that was picked", async () => {
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={people[0] as PickedPerson}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      expect(screen.getByRole("status").textContent).toContain(
        "Jane Doe selected.",
      );
    });

    // Most call sites put the picker in a Dialog or Sheet. Base UI hangs the
    // combobox's Escape handler and the dialog's off `document`, and the two
    // are not in one floating tree, so without the handler on the input a
    // single Escape would take the whole dialog with it.
    test("inside a dialog, Escape closes the list and not the dialog", async () => {
      const user = userEvent.setup();
      render(
        <Dialog open>
          <DialogContent title="Add person">
            <PersonPicker
              aria-label="Person"
              people={people}
              selected={null}
              onSelect={noop}
              onPersonCreated={noop}
            />
          </DialogContent>
        </Dialog>,
      );

      await user.type(screen.getByRole("combobox"), "jane");
      await screen.findAllByRole("option");

      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryAllByRole("option")).toHaveLength(0),
      );
      expect(screen.queryByRole("dialog")).not.toBeNull();
    });

    test("Tab leaves the list rather than trapping in it", async () => {
      const user = userEvent.setup();
      render(
        <PersonPicker
          aria-label="Person"
          people={people}
          selected={null}
          onSelect={noop}
          onPersonCreated={noop}
        />,
      );

      await user.type(screen.getByRole("combobox"), "j");
      await screen.findAllByRole("option");

      await user.tab();

      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "+ Create new person" }),
      );
    });
  });
});
