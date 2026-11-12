import { expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusedName } from "../../../test/focused";
import { ConfirmDeleteButton } from "./confirm-delete-button";

// The confirm dialog hands focus back to its trigger, and the trigger goes
// with the row it deleted (#1862). Focus lands on the next row's delete.
function Rows({ immediate = false }: { immediate?: boolean }) {
  const [rows, setRows] = useState(["Avery", "Blake"]);
  const remove = (name: string) =>
    setRows((all) => all.filter((row) => row !== name));
  return (
    <section>
      <h2>Sponsors</h2>
      <ul>
        {rows.map((name) => (
          <li key={name}>
            {name}
            <ConfirmDeleteButton
              label={`Remove ${name}`}
              title={`Remove ${name}?`}
              description="This can't be undone."
              confirmLabel="Remove"
              onConfirm={() =>
                immediate
                  ? remove(name)
                  : // The server action and refresh, compressed into a tick.
                    setTimeout(() => remove(name), 0)
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

test("deleting a row hands focus to the next row's delete", async () => {
  const user = userEvent.setup();
  render(<Rows />);
  await user.click(screen.getByRole("button", { name: "Remove Avery" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Remove",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove Avery" })).toBeNull(),
  );
  await waitFor(() => expect(focusedName()).toBe("Remove Blake"));
});

test("deleting the last row hands focus to the heading", async () => {
  const user = userEvent.setup();
  render(<Rows />);
  for (const name of ["Avery", "Blake"]) {
    await user.click(screen.getByRole("button", { name: `Remove ${name}` }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Remove",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: `Remove ${name}` }),
      ).toBeNull(),
    );
  }
  await waitFor(() => expect(focusedName()).toBe("Sponsors"));
});

// The refresh can land while the dialog still holds focus, so the dialog has
// nothing to hand it back to.
test("a row that goes while its dialog is open still hands focus on", async () => {
  const user = userEvent.setup();
  render(<Rows immediate />);
  await user.click(screen.getByRole("button", { name: "Remove Avery" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Remove",
    }),
  );
  await waitFor(() => expect(focusedName()).toBe("Remove Blake"));
});
