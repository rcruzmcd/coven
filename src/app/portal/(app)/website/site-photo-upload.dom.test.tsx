import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const UPLOADED =
  "http://127.0.0.1:54321/storage/v1/object/public/site-photos/tenant-1/photo-1.jpg";

const uploadSitePhotoMock = mock<
  (file: File, path: string) => Promise<{ url: string; path: string }>
>(async (_file, path) => ({ url: UPLOADED, path }));

mock.module("@/lib/storage/site-photos", () => ({
  SITE_PHOTOS_BUCKET: "site-photos",
  sitePhotoPathFromUrl: () => null,
  uploadSitePhoto: uploadSitePhotoMock,
  sitePictureFormat: () => ({
    type: "image/jpeg",
    extension: "jpg",
    maxEdge: 2400,
  }),
  deleteSitePhoto: async () => {},
}));

mock.module("./site-photo-actions", () => ({
  createSitePhotoPathAction: async () => ({ path: "tenant-1/photo-1.jpg" }),
}));

// Drive itself is covered by google-drive-button.dom.test.tsx; here it only
// has to hand back a File, as a finished pick does.
const driveAccept: (string | undefined)[] = [];
mock.module("@/components/portal/google-drive-button", () => ({
  GoogleDriveButton: (props: {
    accept?: string;
    onFiles: (files: File[]) => void;
  }) => {
    driveAccept.push(props.accept);
    return (
      <button
        type="button"
        onClick={() =>
          props.onFiles([
            new File([new Uint8Array([255, 216])], "drive.jpg", {
              type: "image/jpeg",
            }),
          ])
        }
      >
        From Google Drive
      </button>
    );
  },
}));

const { SitePhotoFileInput, useSitePhotoUpload } =
  await import("./site-photo-upload");

// Every site-photo field (logo, image slot, list photo, team card, flier) is
// this pair, so the Drive path is asserted once here.
function Harness({
  initial = "",
  accept,
}: {
  initial?: string;
  accept?: string;
}) {
  const [value, setValue] = useState(initial);
  const upload = useSitePhotoUpload({ value, onChange: setValue });
  return (
    <>
      <label htmlFor="photo">Photo</label>
      <SitePhotoFileInput
        id="photo"
        uploading={upload.uploading}
        onFile={upload.uploadFile}
        accept={accept}
      />
      <output aria-label="Stored">{value}</output>
    </>
  );
}

describe("SitePhotoFileInput from Google Drive (#1633)", () => {
  beforeEach(() => {
    uploadSitePhotoMock.mockClear();
    driveAccept.length = 0;
  });

  test("a Drive image uploads and is stored like a local pick", async () => {
    render(<Harness />);

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Stored")).toHaveTextContent(UPLOADED),
    );
    expect(uploadSitePhotoMock.mock.calls[0][0].name).toBe("drive.jpg");
    expect(driveAccept.at(-1)).toBe("image/*");
  });

  test("a new picture from Drive drops the old one's crop", async () => {
    render(<Harness initial="https://example.com/old.jpg#crop=10,10,50,50" />);

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Stored").textContent).toBe(UPLOADED),
    );
  });

  test("Drive is narrowed to the input's own accept", () => {
    render(<Harness accept="image/png,image/webp" />);
    expect(driveAccept.at(-1)).toBe("image/png,image/webp");
  });

  test("a local pick still uploads", async () => {
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText("Photo"),
      new File([new Uint8Array([255, 216])], "local.jpg", {
        type: "image/jpeg",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Stored")).toHaveTextContent(UPLOADED),
    );
    expect(uploadSitePhotoMock.mock.calls[0][0].name).toBe("local.jpg");
  });
});
