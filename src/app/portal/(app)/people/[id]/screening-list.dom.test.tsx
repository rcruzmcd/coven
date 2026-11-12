import { describe, expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PersonScreeningRow } from "@/lib/portal/person-screenings";
import { focusedName } from "../../../../../../test/focused";

// Spread the real module: the action this list imports reaches
// `@/lib/auth/permissions`, which imports `redirect`, and replacing
// next/navigation wholesale breaks the import rather than the test.
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: () => {} }),
}));

const { ScreeningList } = await import("./screening-list");

const TODAY = "2026-09-22";

function screening(
  overrides: Partial<PersonScreeningRow> = {},
): PersonScreeningRow {
  return {
    id: "s1",
    cleared_on: "2026-03-14",
    expires_on: null,
    tier: { id: "t1", name: "Tier 1" },
    ...overrides,
  };
}

describe("ScreeningList", () => {
  test("names the level and the date", () => {
    render(
      <ScreeningList
        personId="p1"
        screenings={[screening()]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(screen.getByText("Cleared for Tier 1")).toBeTruthy();
    expect(screen.getByText(/Mar 14, 2026/)).toBeTruthy();
  });

  test("shows a live clearance as running to its date, not expired", () => {
    render(
      <ScreeningList
        personId="p1"
        screenings={[screening({ expires_on: "2029-03-14" })]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(screen.getByText(/runs to Mar 14, 2029/)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  test("marks a clearance whose date has passed", () => {
    render(
      <ScreeningList
        personId="p1"
        screenings={[screening({ expires_on: "2026-09-21" })]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText(/ran to Sep 21, 2026/)).toBeTruthy();
  });

  // The boundary the tenant's own day exists to get right.
  test("is not expired on its last day", () => {
    render(
      <ScreeningList
        personId="p1"
        screenings={[screening({ expires_on: TODAY })]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(screen.queryByText("Expired")).toBeNull();
  });

  test("offers removal only to somebody who can manage screening", () => {
    const { unmount } = render(
      <ScreeningList
        personId="p1"
        screenings={[screening()]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(screen.queryByLabelText("Remove the Tier 1 outcome")).toBeNull();
    unmount();

    render(
      <ScreeningList
        personId="p1"
        screenings={[screening()]}
        today={TODAY}
        canManage
      />,
    );
    expect(screen.getByLabelText("Remove the Tier 1 outcome")).toBeTruthy();
  });

  // The whole record is a level and two dates. If a note ever appears here,
  // something upstream grew a column it should not have.
  test("renders nothing but the level and its dates", () => {
    const { container } = render(
      <ScreeningList
        personId="p1"
        screenings={[screening({ expires_on: "2029-03-14" })]}
        today={TODAY}
        canManage={false}
      />,
    );
    expect(container.textContent).toBe(
      "Cleared for Tier 1Mar 14, 2026 · runs to Mar 14, 2029",
    );
  });
});

// Removing an outcome takes its row, and the button that had focus, away
// (#1862). Focus goes to the next row's Remove, else the previous one's.
describe("ScreeningList keeps focus when a removed row goes", () => {
  const tier1 = screening();
  const tier2 = screening({ id: "s2", tier: { id: "t2", name: "Tier 2" } });

  function list(screenings: PersonScreeningRow[]) {
    return (
      <ScreeningList
        personId="p1"
        screenings={screenings}
        today={TODAY}
        canManage
      />
    );
  }

  test("focus moves to the next outcome's Remove", async () => {
    const { rerender } = render(list([tier1, tier2]));
    act(() => screen.getByLabelText("Remove the Tier 1 outcome").focus());
    rerender(list([tier2]));
    await waitFor(() =>
      expect(focusedName()).toBe("Remove the Tier 2 outcome"),
    );
  });

  test("the last outcome hands focus to the one above it", async () => {
    const { rerender } = render(list([tier1, tier2]));
    act(() => screen.getByLabelText("Remove the Tier 2 outcome").focus());
    rerender(list([tier1]));
    await waitFor(() =>
      expect(focusedName()).toBe("Remove the Tier 1 outcome"),
    );
  });
});
