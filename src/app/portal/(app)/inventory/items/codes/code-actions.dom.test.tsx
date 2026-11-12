import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { focusedName } from "../../../../../../../test/focused";
import { CodeActions } from "./code-actions";
import type { CodeRow } from "./codes-table";

function code(id: string, value: string): CodeRow {
  return {
    id,
    kind: "numbered",
    codeKind: "numbered",
    state: "retired",
    value,
    number: 1,
    itemId: null,
    itemDescription: null,
    itemSize: null,
    lastPrintedAt: null,
    printCount: 0,
    nfcWrittenAt: null,
    retiredAt: "2026-11-01T00:00:00Z",
    retiredReason: "damaged",
    retiredNote: null,
  };
}

function table(rows: CodeRow[]) {
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.value}</td>
            <td>
              <CodeActions row={row} canManage />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The menu hands focus back to its trigger, and a Restore, Unassign or
// Retire that drops the code out of the current filter takes the trigger
// with the row (#1862). Focus moves to the next row's menu.
test("a row that leaves hands focus to the next row's menu", async () => {
  const first = code("c1", "CS-0001");
  const second = code("c2", "CS-0002");
  const { rerender } = render(table([first, second]));
  act(() =>
    screen.getByRole("button", { name: "More actions for CS-0001" }).focus(),
  );
  rerender(table([second]));
  await waitFor(() => expect(focusedName()).toBe("More actions for CS-0002"));
});
