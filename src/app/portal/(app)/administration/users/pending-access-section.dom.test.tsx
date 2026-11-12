import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PendingGrant } from "./users-shared";
import { focusedName } from "../../../../../../test/focused";
import { PendingAccessSection } from "./pending-access-section";

// No action runs here: the revoke dialog's own path is covered by
// confirm-delete-button.dom.test.tsx, and mocking "./actions" wholesale would
// replace users-table.dom.test.tsx's mocks for the whole run. Each test puts
// focus on Revoke and re-renders with what the server returns afterwards.

function grant(overrides: Partial<PendingGrant> = {}): PendingGrant {
  return {
    id: "g1",
    email: "avery@example.test",
    name: "Avery",
    status: "pending",
    expires_at: null,
    created_at: "2026-11-01T00:00:00Z",
    invited_at: null,
    roles: { name: "volunteer" },
    ...overrides,
  };
}

const avery = grant();
const blake = grant({ id: "g2", email: "blake@example.test", name: "Blake" });

// A revoked grant keeps its row but loses its buttons, so the Revoke that
// had focus goes away (#1862).
test("revoking hands focus to the next pending grant's Revoke", async () => {
  const { rerender } = render(
    <PendingAccessSection grants={[avery, blake]} availableRoles={[]} />,
  );
  act(() => screen.getAllByRole("button", { name: "Revoke" })[0].focus());
  rerender(
    <PendingAccessSection
      grants={[{ ...avery, status: "revoked" }, blake]}
      availableRoles={[]}
    />,
  );
  await waitFor(() => expect(focusedName()).toBe("Revoke"));
  expect(document.activeElement?.closest("tr")?.textContent).toContain("Blake");
});

test("revoking the only grant hands focus to the section heading", async () => {
  const { rerender } = render(
    <PendingAccessSection grants={[avery]} availableRoles={[]} />,
  );
  act(() => screen.getByRole("button", { name: "Revoke" }).focus());
  rerender(
    <PendingAccessSection
      grants={[{ ...avery, status: "revoked" }]}
      availableRoles={[]}
    />,
  );
  await waitFor(() => expect(focusedName()).toBe("Pending access"));
});
