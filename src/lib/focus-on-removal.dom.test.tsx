import { expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { keepFocusOnRemoval } from "./focus-on-removal";
import { focusedName } from "../../test/focused";

// A row action that removes its own row unmounts the button the keyboard user
// pressed; focus must land on the next row's equivalent control, else the
// heading, rather than falling to <body> (#1862).

function List({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  return (
    <section>
      <h2>Fruit</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <a href={`#${item}`}>{item}</a>
            <button
              type="button"
              ref={keepFocusOnRemoval}
              onClick={() => setItems((all) => all.filter((x) => x !== item))}
            >
              Remove {item}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

test("focus moves to the next row's equivalent control", async () => {
  const user = userEvent.setup();
  render(<List initial={["apple", "pear", "plum"]} />);
  await user.click(screen.getByRole("button", { name: "Remove pear" }));
  await waitFor(() => expect(focusedName()).toBe("Remove plum"));
});

test("the last row hands focus to the previous row", async () => {
  const user = userEvent.setup();
  render(<List initial={["apple", "pear"]} />);
  await user.click(screen.getByRole("button", { name: "Remove pear" }));
  await waitFor(() => expect(focusedName()).toBe("Remove apple"));
});

test("the only row hands focus to the list's heading", async () => {
  const user = userEvent.setup();
  render(<List initial={["apple"]} />);
  await user.click(screen.getByRole("button", { name: "Remove apple" }));
  await waitFor(() => expect(focusedName()).toBe("Fruit"));
});

function Table() {
  const [rows, setRows] = useState([
    { id: "a", active: true },
    { id: "b", active: true },
  ]);
  const toggle = (id: string) =>
    setRows((all) =>
      all.map((row) => (row.id === id ? { ...row, active: !row.active } : row)),
    );
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td>
            <td>
              {row.active ? (
                <button
                  type="button"
                  ref={keepFocusOnRemoval}
                  onClick={() => toggle(row.id)}
                >
                  Deactivate {row.id}
                </button>
              ) : (
                <button type="button" onClick={() => toggle(row.id)}>
                  Reactivate {row.id}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

test("a button replaced in its cell hands focus to its replacement", async () => {
  const user = userEvent.setup();
  render(<Table />);
  await user.click(screen.getByRole("button", { name: "Deactivate a" }));
  await waitFor(() => expect(focusedName()).toBe("Reactivate a"));
});

test("focus the user moved elsewhere is left alone", async () => {
  const user = userEvent.setup();
  function Delayed() {
    const [shown, setShown] = useState(true);
    return (
      <div>
        <a href="#elsewhere">Elsewhere</a>
        <ul>
          <li>
            {shown && (
              <button type="button" ref={keepFocusOnRemoval}>
                Remove
              </button>
            )}
          </li>
          <li>
            <button type="button" onClick={() => setShown(false)}>
              Next
            </button>
          </li>
        </ul>
      </div>
    );
  }
  render(<Delayed />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(focusedName()).toBe("Next");
});
