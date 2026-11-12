import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";

import { AccessGrantsTable } from "./access-grants-table";
import { focusedName } from "../../../../../../../test/focused";

function grant(id: string, name: string): AccessGrantRow {
  return {
    id,
    asset_id: "asset-1",
    person_id: `person-${id}`,
    access_level: "admin",
    account_identifier: null,
    purpose: null,
    granted_at: "2026-01-01",
    status: "revoked",
    expires_at: null,
    last_verified: null,
    revoked_at: null,
    notes: null,
    person: { id: `person-${id}`, name },
  };
}

// Deleting a grant takes its row and the Delete button that had focus
// (#1862). Focus moves to the next row's Delete.
test("a deleted grant hands focus to the next row's Delete", async () => {
  const avery = grant("g1", "Avery");
  const blake = grant("g2", "Blake");
  const { rerender } = render(
    <AccessGrantsTable grants={[avery, blake]} assetId="asset-1" />,
  );
  act(() =>
    screen.getByRole("button", { name: "Delete grant for Avery" }).focus(),
  );
  rerender(<AccessGrantsTable grants={[blake]} assetId="asset-1" />);
  await waitFor(() => expect(focusedName()).toBe("Delete grant for Blake"));
});
