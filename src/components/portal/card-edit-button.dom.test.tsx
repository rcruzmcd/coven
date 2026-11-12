import { expect, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardEditButton } from "./card-edit-button";

// An inline edit form that closes itself unmounts the button the keyboard
// user pressed; focus must come back to the Edit button rather than falling
// to <body> (#1859).

function EditableThing() {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <a href="#elsewhere">Elsewhere</a>
      <CardEditButton
        label="Edit details"
        editing={editing}
        onEdit={() => setEditing(true)}
      />
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEditing(false);
          }}
        >
          <input aria-label="Name" />
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </form>
      )}
    </div>
  );
}

test("focus returns to the Edit button after Save closes the form", async () => {
  const user = userEvent.setup();
  render(<EditableThing />);
  await user.click(screen.getByRole("button", { name: "Edit details" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Edit details" }),
  );
});

test("focus returns to the Edit button after Cancel", async () => {
  const user = userEvent.setup();
  render(<EditableThing />);
  await user.click(screen.getByRole("button", { name: "Edit details" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Edit details" }),
  );
});

test("focus the user moved elsewhere is left alone", async () => {
  function ClosesFromOutside() {
    const [editing, setEditing] = useState(true);
    return (
      <div>
        <CardEditButton
          label="Edit details"
          editing={editing}
          onEdit={() => setEditing(true)}
        />
        <button type="button" onClick={() => setEditing(false)}>
          Close from outside
        </button>
      </div>
    );
  }
  const user = userEvent.setup();
  render(<ClosesFromOutside />);
  const outside = screen.getByRole("button", { name: "Close from outside" });
  await user.click(outside);
  expect(document.activeElement).toBe(outside);
});
