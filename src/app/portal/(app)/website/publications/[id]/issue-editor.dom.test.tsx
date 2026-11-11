import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as PublicationFiles from "@/lib/storage/publication-files";
import * as actualNavigation from "next/navigation";
import type { EditorIssue } from "../publication-shared";

mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

// The action module pulls in the server Supabase client.
mock.module("../actions", () => ({
  deletePublicationAction: async () => ({ ok: true }),
  savePublicationAction: async () => ({ ok: true }),
  setPublicationStatusAction: async () => ({ ok: true }),
}));

const image = (path: string) => ({
  path,
  width: 10,
  height: 10,
  renditions: [],
});
const uploadImageMock = mock(async (file: File) => image(`f/${file.name}`));
const uploadPdfMock = mock(async (file: File) => ({
  path: `f/${file.name}`,
  bytes: file.size,
}));
mock.module("@/lib/storage/publication-files", () => ({
  ...PublicationFiles,
  uploadPublicationImage: uploadImageMock,
  uploadPublicationPdf: uploadPdfMock,
  publicationFileUrl: (path: string) => `https://files.test/${path}`,
}));

// Drive itself is covered by google-drive-button.dom.test.tsx; here a pick
// hands back Files as a finished one does, labelled by the field's accept.
const driveProps: { accept?: string; multiple?: boolean; maxBytes?: number }[] =
  [];
mock.module("@/components/portal/google-drive-button", () => ({
  GoogleDriveButton: (props: {
    accept?: string;
    multiple?: boolean;
    maxBytes?: number;
    onFiles: (files: File[]) => void;
  }) => {
    driveProps.push(props);
    const pdf = props.accept === "application/pdf";
    const files = pdf
      ? [new File(["%PDF"], "Issue.pdf", { type: "application/pdf" })]
      : (props.multiple ? ["p2.jpg", "p1.jpg"] : ["cover.jpg"]).map(
          (name) => new File(["x"], name, { type: "image/jpeg" }),
        );
    return (
      <button type="button" onClick={() => props.onFiles(files)}>
        {`From Google Drive (${pdf ? "PDF" : props.multiple ? "pages" : "image"})`}
      </button>
    );
  },
}));

const { IssueEditor } = await import("./issue-editor");

const issue: EditorIssue = {
  id: "issue-1",
  slug: "winter-2026",
  title: "Winter 2026",
  seasonLabel: "Winter 2026",
  publishDate: "",
  blurb: "",
  cover: null,
  readingPdf: null,
  printPdf: null,
  status: "draft",
  publishedAt: null,
  updatedAt: "2026-11-01T00:00:00Z",
};

function renderEditor() {
  render(<IssueEditor issue={issue} pages={[]} folder="t/p" canEdit />);
}

beforeEach(() => {
  uploadImageMock.mockClear();
  uploadPdfMock.mockClear();
  driveProps.length = 0;
});

describe("IssueEditor from Google Drive (#1635)", () => {
  test("page images from Drive upload in filename order", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive (pages)" }),
    );
    await waitFor(() => expect(uploadImageMock).toHaveBeenCalledTimes(2));
    expect(uploadImageMock.mock.calls.map(([file]) => file.name)).toEqual([
      "p1.jpg",
      "p2.jpg",
    ]);
  });

  test("a cover from Drive uploads as the cover", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive (image)" }),
    );
    expect(await screen.findByAltText("The current cover")).toBeTruthy();
    expect(uploadImageMock.mock.calls[0][0].name).toBe("cover.jpg");
  });

  test("a PDF from Drive goes through the PDF upload, with its size cap", async () => {
    renderEditor();
    const [reading] = screen.getAllByRole("button", {
      name: "From Google Drive (PDF)",
    });
    await userEvent.click(reading);
    await waitFor(() => expect(uploadPdfMock).toHaveBeenCalledTimes(1));
    expect(uploadPdfMock.mock.calls[0][0].name).toBe("Issue.pdf");
    const pdfProps = driveProps.filter((p) => p.accept === "application/pdf");
    expect(pdfProps.at(-1)?.maxBytes).toBe(25 * 1024 * 1024);
    expect(pdfProps.at(-1)?.multiple).toBeFalsy();
  });

  test("image fields offer only JPEG and PNG", () => {
    renderEditor();
    const imageProps = driveProps.filter((p) => p.accept !== "application/pdf");
    expect(new Set(imageProps.map((p) => p.accept))).toEqual(
      new Set(["image/jpeg,image/png"]),
    );
  });
});
