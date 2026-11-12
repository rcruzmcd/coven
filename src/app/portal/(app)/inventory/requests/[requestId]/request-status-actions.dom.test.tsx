import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusedName } from "../../../../../../../test/focused";
import { GearRequestStatusActions } from "./request-status-actions";

// Every button in this panel gives way to another once pressed (#1863).
function panel(status: string, open = true) {
  return (
    <main>
      <h1>Request for Avery</h1>
      {open && (
        <GearRequestStatusActions
          requestId="r1"
          status={status}
          deliveryMethod="shipping"
          heldCount={2}
        />
      )}
    </main>
  );
}

test("Mark paid hands focus to the step that replaces it", async () => {
  const { rerender } = render(panel("quoted"));
  act(() => screen.getByRole("button", { name: "Mark paid" }).focus());
  rerender(panel("paid"));
  await waitFor(() => expect(focusedName()).toBe("Mark fulfilled"));
});

test("a closing step hands focus to the request's heading", async () => {
  const { rerender } = render(panel("paid"));
  act(() => screen.getByRole("button", { name: "Mark fulfilled" }).focus());
  rerender(panel("fulfilled", false));
  await waitFor(() => expect(focusedName()).toBe("Request for Avery"));
});

test("Cancel request and Keep hand focus to each other", async () => {
  const user = userEvent.setup();
  render(panel("new"));
  await user.click(screen.getByRole("button", { name: "Cancel request" }));
  expect(focusedName()).toBe("Keep");
  await user.click(screen.getByRole("button", { name: "Keep" }));
  expect(focusedName()).toBe("Cancel request");
});
