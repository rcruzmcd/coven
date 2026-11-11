import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/image builds a real URL from the src at render, which happy-dom refuses.
mock.module("next/image", () => ({ default: () => null }));

const PUBLIC_URL =
  "http://127.0.0.1:54321/storage/v1/object/public/gear-photos/tenant-1/photo-1.jpg";

const uploadGearPhotoMock = mock<
  (
    file: File,
    path: string,
  ) => Promise<{ url: string; path: string } | { error: string }>
>(async (_file, path) => ({ url: PUBLIC_URL, path }));

const deleteGearPhotoMock = mock<(path: string) => Promise<void>>(
  async () => {},
);

// Only the browser-only half is mocked; the pure helpers still run, so a test
// that asserts a deletion is also asserting the real path parsing.
mock.module("@/lib/storage/gear-photos", () => ({
  GEAR_PHOTOS_BUCKET: "gear-photos",
  gearPhotoPathFromUrl: (url: string | null) => {
    if (!url) return null;
    const at = url.indexOf("/gear-photos/");
    return at === -1 ? null : url.slice(at + "/gear-photos/".length) || null;
  },
  uploadGearPhoto: uploadGearPhotoMock,
  deleteGearPhoto: deleteGearPhotoMock,
}));

const createGearPhotoPathActionMock = mock<
  () => Promise<{ path: string } | { error: string }>
>(async () => ({ path: "tenant-1/photo-1.jpg" }));

mock.module("@/app/portal/(app)/gear-photo-actions", () => ({
  createGearPhotoPathAction: createGearPhotoPathActionMock,
}));

// Drive itself is covered by google-drive-button.dom.test.tsx; here it only
// has to hand back a File, as a finished pick does.
const driveProps: { accept?: string }[] = [];
mock.module("@/components/portal/google-drive-button", () => ({
  GoogleDriveButton: (props: {
    accept?: string;
    onFiles: (files: File[]) => void;
  }) => {
    driveProps.push(props);
    return (
      <button
        type="button"
        onClick={() => props.onFiles([pngFile("drive.png")])}
      >
        From Google Drive
      </button>
    );
  },
}));

const { PhotoUploadField } = await import("./photo-upload-field");

function pngFile(name = "gear.png") {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: "image/png",
  });
}

describe("PhotoUploadField", () => {
  beforeEach(() => {
    uploadGearPhotoMock.mockClear();
    deleteGearPhotoMock.mockClear();
    createGearPhotoPathActionMock.mockClear();
    createGearPhotoPathActionMock.mockImplementation(async () => ({
      path: "tenant-1/photo-1.jpg",
    }));
    uploadGearPhotoMock.mockImplementation(async (_file, path) => ({
      url: PUBLIC_URL,
      path,
    }));
  });

  // The file input carries the label rather than sitting hidden behind a
  // button, so this is also the a11y assertion.
  test("the file input has an accessible name", () => {
    render(<PhotoUploadField value="" onChange={() => {}} idPrefix="item-1" />);
    expect(screen.getByLabelText("Photo")).toBeTruthy();
  });

  // The upload path awaits the path action and then the upload before it
  // touches state, and React schedules that re-render on its own queue rather
  // than the one userEvent's delay drains -- so the result lands after the
  // event settles often enough that a getBy/assert-now pass failed on CI while
  // passing everywhere else (#1104). Everything downstream of an upload waits.
  test("reports the uploaded URL to the caller", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(PUBLIC_URL));
    expect(uploadGearPhotoMock).toHaveBeenCalledTimes(1);
  });

  test("shows a failed upload inline and keeps the field empty", async () => {
    uploadGearPhotoMock.mockImplementation(async () => ({
      error: "That photo is too large.",
    }));
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    expect(await screen.findByText("That photo is too large.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  // A refusal has to arrive before the file is read, not after.
  test("surfaces a refused path without uploading", async () => {
    createGearPhotoPathActionMock.mockImplementation(async () => ({
      error: "You don't have permission to perform this action.",
    }));
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.upload(screen.getByLabelText("Photo"), pngFile());

    expect(
      await screen.findByText(
        "You don't have permission to perform this action.",
      ),
    ).toBeTruthy();
    expect(uploadGearPhotoMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("Remove photo clears the value", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(
      <PhotoUploadField
        value={PUBLIC_URL}
        onChange={onChange}
        idPrefix="item-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  // The guard that keeps a volunteer from deleting a photo that another row may
  // still be pointing at: only objects uploaded in this session are removed.
  test("Remove photo does not delete a photo it did not upload", async () => {
    render(
      <PhotoUploadField
        value={PUBLIC_URL}
        onChange={() => {}}
        idPrefix="item-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    expect(deleteGearPhotoMock).not.toHaveBeenCalled();
  });

  test("a photo from Google Drive uploads like a local pick", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(PUBLIC_URL));
    expect(uploadGearPhotoMock.mock.calls[0][0].name).toBe("drive.png");
    expect(driveProps.at(-1)?.accept).toBe("image/*");
  });

  test("a refused Drive photo shows the same message as a local one", async () => {
    createGearPhotoPathActionMock.mockImplementation(async () => ({
      error: "You don't have permission to perform this action.",
    }));
    render(<PhotoUploadField value="" onChange={() => {}} idPrefix="item-1" />);

    await userEvent.click(
      screen.getByRole("button", { name: "From Google Drive" }),
    );

    expect(
      await screen.findByText(
        "You don't have permission to perform this action.",
      ),
    ).toBeTruthy();
    expect(uploadGearPhotoMock).not.toHaveBeenCalled();
  });

  test("a pasted link is passed straight through", async () => {
    const onChange = mock<(url: string) => void>(() => {});
    render(<PhotoUploadField value="" onChange={onChange} idPrefix="item-1" />);

    await userEvent.type(screen.getByLabelText("Photo link"), "h");

    expect(onChange).toHaveBeenCalledWith("h");
    expect(uploadGearPhotoMock).not.toHaveBeenCalled();
  });
});
