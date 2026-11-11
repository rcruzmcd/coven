import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as actualNavigation from "next/navigation";

mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

mock.module("./actions", () => ({
  importDonationsAction: async () => ({ ok: true }),
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
  "Date,Name,Email,Amount",
  "2026-11-01,Ada,ada@example.com,25.00",
].join("\n");

const { DonationImportPanel } = await import("./donation-import-panel");

describe("DonationImportPanel from Google Drive (#1636)", () => {
  test("a CSV or Sheet from Drive reads its columns like a local CSV", async () => {
    const { container } = render(
      <DonationImportPanel
        timeZone="America/New_York"
        savedMapping={{}}
        savedProcessorLabel=""
      />,
    );
    expect(driveAccept.at(-1)).toBe(".csv,text/csv");
    expect(screen.getByText(/first sheet only/)).toBeTruthy();
    expect(container.querySelector('[id^="import-map-"]')).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Or paste the export") as HTMLTextAreaElement)
          .value,
      ).toBe(CSV),
    );
    // The column-mapping step opened on the Drive file's headers.
    expect(container.querySelector('[id^="import-map-"]')).not.toBeNull();
  });
});
