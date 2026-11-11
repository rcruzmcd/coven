import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as actualNavigation from "next/navigation";

mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

mock.module("./actions", () => ({
  bulkImportCalendarItemsAction: async () => ({ ok: true }),
}));

// Drive itself is covered by google-drive-button.dom.test.tsx and
// google-drive.test.ts (a Sheet's CSV export included); here a pick hands back
// the File a finished one would: a CSV, or a Sheet exported as one.
const driveAccept: (string | undefined)[] = [];
mock.module("@/components/portal/google-drive-button", () => ({
  GoogleDriveButton: (props: {
    accept?: string;
    hint?: React.ReactNode;
    onFiles: (files: File[]) => void;
  }) => {
    driveAccept.push(props.accept);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            props.onFiles([new File([CSV], "Sheet.csv", { type: "text/csv" })])
          }
        >
          From Google Drive
        </button>
        <p>{props.hint}</p>
      </>
    );
  },
}));

const CSV = [
  "title,item_type,starts_at,ends_at,time_zone,recurrence_rule,priority_tier,category,region",
  "Pride brunch,event,2026-12-01T10:00,2026-12-01T12:00,America/New_York,,,,",
].join("\n");

const { CsvImportPanel } = await import("./csv-import-panel");

describe("CsvImportPanel from Google Drive (#1636)", () => {
  test("a CSV or Sheet from Drive previews like a local CSV", async () => {
    render(<CsvImportPanel categoryKeys={[]} />);
    expect(driveAccept.at(-1)).toBe(".csv,text/csv");
    expect(screen.getByText(/first sheet only/)).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Or paste CSV") as HTMLTextAreaElement).value,
      ).toBe(CSV),
    );
    expect(screen.getByText(/\d+ valid rows?/)).toBeTruthy();
  });
});
