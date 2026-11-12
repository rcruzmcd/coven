import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PendingVolunteerHours } from "./actions";
import { focusedName } from "../../../../../../test/focused";
import { PendingHours } from "./pending-hours";

function entry(id: string, name: string): PendingVolunteerHours {
  return {
    id,
    hours: 3,
    logged_date: "2026-11-01",
    notes: null,
    created_at: "2026-11-01T00:00:00Z",
    person: { id: `person-${id}`, name },
    event: null,
    volunteer_role_type: null,
    claimant: null,
  };
}

function queue(entries: PendingVolunteerHours[]) {
  return (
    <PendingHours
      entries={entries}
      canManage={false}
      myPersonId={null}
      staff={[]}
    />
  );
}

// A decision takes the entry out of the queue, and Confirm or Decline with
// it (#1863). Focus goes to the same button on the next entry.
test("a decided entry hands focus to the next entry's same button", async () => {
  const avery = entry("h1", "Avery");
  const blake = entry("h2", "Blake");
  const { rerender } = render(queue([avery, blake]));

  const [averyDecline] = screen.getAllByRole("button", { name: "Decline" });
  act(() => averyDecline.focus());
  rerender(queue([blake]));

  await waitFor(() => expect(focusedName()).toBe("Decline"));
  expect(document.activeElement?.closest("li")?.textContent).toContain("Blake");
});
