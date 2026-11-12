import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type {
  DistributionDraft,
  DraftItem,
} from "@/lib/inventory-distribution-draft";
import { focusedName } from "../../../../../test/focused";
import { ScannedDistributionList } from "./scanned-distribution-list";

function piece(id: string, description: string): DraftItem {
  return {
    id,
    description,
    size: null,
    status: "available",
    intendedUse: "gear_library",
    heldBy: null,
    numberedCode: null,
  };
}

function list(items: DraftItem[]) {
  const draft: DistributionDraft = {
    eventId: null,
    eventName: null,
    recipient: null,
    updatedAt: "2026-11-12T00:00:00Z",
    items,
    acknowledgement: null,
  };
  return (
    <ScannedDistributionList
      eventId={null}
      draft={draft}
      recipientId={null}
      availableItems={[]}
      conflictItemId={null}
      onChanged={async () => {}}
    />
  );
}

const jacket = piece("i1", "Jacket");
const helmet = piece("i2", "Helmet");

// Removing a piece takes its row and the button that had focus (#1862).
test("a removed piece hands focus to the next piece's Remove", async () => {
  const { rerender } = render(list([jacket, helmet]));
  act(() => screen.getByRole("button", { name: "Remove Jacket" }).focus());
  rerender(list([helmet]));
  await waitFor(() => expect(focusedName()).toBe("Remove Helmet"));
});

test("the last piece hands focus to the Items heading", async () => {
  const { rerender } = render(list([jacket]));
  act(() => screen.getByRole("button", { name: "Remove Jacket" }).focus());
  rerender(list([]));
  await waitFor(() => expect(focusedName()).toBe("Items (0)"));
});
