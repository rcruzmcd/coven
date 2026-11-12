import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as MediaActions from "./media-actions";
import * as EventMedia from "@/lib/storage/event-media";
import type { EventMediaSlot } from "@/lib/storage/event-media-files";
import type { VideoUploadHandlers } from "@/lib/storage/event-media";
import * as GoogleDrive from "@/lib/storage/google-drive";
import type { PickedDriveDoc } from "@/lib/storage/google-drive";

const mintMock = mock(
  async (_eventId: string, files: { name: string; type: string }[]) => ({
    slots: files.map((file): EventMediaSlot => ({
      path: `t/e/${file.name}`,
      token: "token",
      kind: file.type.startsWith("video/") ? "video" : "photo",
      contentType: file.type.startsWith("video/") ? "video/mp4" : "image/jpeg",
    })),
  }),
);
const recordMock = mock(async () => ({ ok: true as const }));

mock.module("./media-actions", () => ({
  ...MediaActions,
  createEventMediaUploadSlotsAction: mintMock,
  recordEventMediaAction: recordMock,
}));

let photoResult: { ok: true } | { error: string } = { ok: true };
let videoHandlers: VideoUploadHandlers | null = null;
const pauseMock = mock(() => {});

mock.module("@/lib/storage/event-media", () => ({
  ...EventMedia,
  uploadEventPhoto: async (
    _file: File,
    _slot: EventMediaSlot,
    onProgress: (fraction: number) => void,
  ) => {
    onProgress(0.4);
    return photoResult;
  },
  createVideoUpload: (
    _file: File,
    _slot: EventMediaSlot,
    handlers: VideoUploadHandlers,
  ) => {
    videoHandlers = handlers;
    return { start: () => handlers.onProgress(0.1), pause: pauseMock };
  },
}));

// Drive itself is covered by google-drive-button.dom.test.tsx and
// google-drive.test.ts; here a pick hands back docs, and each download is
// answered from `driveFiles` by name.
let pickedDocs: PickedDriveDoc[] = [];
mock.module("@/components/portal/google-drive-button", () => ({
  GoogleDriveButton: (props: {
    onPick: (pick: { docs: PickedDriveDoc[]; accessToken: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onPick({ docs: pickedDocs, accessToken: "tok" })}
    >
      From Google Drive
    </button>
  ),
}));
const downloadMock = mock(
  async (plan: { name: string; type: string }) =>
    new File(["x"], plan.name, { type: plan.type }),
);
mock.module("@/lib/storage/google-drive", () => ({
  ...GoogleDrive,
  downloadDriveFile: downloadMock,
}));

const { EventMediaUploader } = await import("./event-media-uploader");
const { CLEAR_DONE_DELAY_MS, DRIVE_MEDIA_MAX_BYTES } =
  await import("@/components/event-media/media-uploader");

function pick(files: File[]) {
  return userEvent.upload(
    screen.getByLabelText("Choose photos and videos to upload"),
    files,
  );
}

function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

beforeEach(() => {
  photoResult = { ok: true };
  videoHandlers = null;
  mintMock.mockClear();
  recordMock.mockClear();
  pauseMock.mockClear();
  downloadMock.mockClear();
  pickedDocs = [];
});

describe("EventMediaUploader", () => {
  test("a photo uploads and is recorded", async () => {
    const onUploaded = mock(() => {});
    render(<EventMediaUploader eventId="event-1" onUploaded={onUploaded} />);
    await pick([new File(["x"], "beach.jpg", { type: "image/jpeg" })]);

    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("done"),
    );
    expect(within(row("beach.jpg")).getByText("Uploaded")).toBeTruthy();
    expect(mintMock.mock.calls[0][0]).toBe("event-1");
    expect(recordMock).toHaveBeenCalledWith("t/e/beach.jpg", "beach.jpg");
    // Once the burst settles, not straight away (#1653).
    expect(onUploaded).not.toHaveBeenCalled();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });

  test("a batch of photos reloads the list once, not once each", async () => {
    const onUploaded = mock(() => {});
    render(<EventMediaUploader eventId="event-1" onUploaded={onUploaded} />);
    await pick(
      ["a.jpg", "b.jpg", "c.jpg"].map(
        (name) => new File(["x"], name, { type: "image/jpeg" }),
      ),
    );
    await waitFor(() =>
      expect(row("c.jpg").getAttribute("data-status")).toBe("done"),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  test("a failed photo shows why and offers a retry", async () => {
    photoResult = { error: "beach.jpg stopped uploading." };
    render(<EventMediaUploader eventId="event-1" />);
    await pick([new File(["x"], "beach.jpg", { type: "image/jpeg" })]);

    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("failed"),
    );
    expect(screen.getByText("beach.jpg stopped uploading.")).toBeTruthy();

    photoResult = { ok: true };
    await userEvent.click(
      screen.getByRole("button", { name: "Retry beach.jpg" }),
    );
    await waitFor(() =>
      expect(row("beach.jpg").getAttribute("data-status")).toBe("done"),
    );
  });

  test("a video shows progress, pauses, resumes and finishes", async () => {
    render(<EventMediaUploader eventId="event-1" />);
    await pick([new File(["x"], "run.mp4", { type: "video/mp4" })]);

    const bar = await screen.findByRole("progressbar", {
      name: "Uploading run.mp4",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("10");

    await userEvent.click(
      screen.getByRole("button", { name: "Pause run.mp4" }),
    );
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(row("run.mp4").getAttribute("data-status")).toBe("paused");

    await userEvent.click(
      screen.getByRole("button", { name: "Resume run.mp4" }),
    );
    expect(row("run.mp4").getAttribute("data-status")).toBe("uploading");

    videoHandlers?.onSuccess();
    await waitFor(() =>
      expect(row("run.mp4").getAttribute("data-status")).toBe("done"),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("a file that can't be stored is refused without a retry", async () => {
    render(<EventMediaUploader eventId="event-1" />);
    await userEvent.upload(
      screen.getByLabelText("Choose photos and videos to upload"),
      [new File(["x"], "notes.pdf", { type: "application/pdf" })],
      { applyAccept: false },
    );

    expect(
      screen.getByText("notes.pdf is not a photo or a video."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry notes.pdf" }),
    ).toBeNull();
    expect(mintMock).not.toHaveBeenCalled();
  });

  test("a big batch folds into one summary line, and clears once it is all in", async () => {
    render(<EventMediaUploader eventId="event-1" />);
    await pick(
      ["a.jpg", "b.jpg", "c.jpg", "d.jpg"].map(
        (name) => new File(["x"], name, { type: "image/jpeg" }),
      ),
    );
    await screen.findByText("4 uploaded");
    // Folded: the rows wait behind Show files.
    expect(screen.queryByText("a.jpg")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Show files (4)" }),
    );
    expect(row("d.jpg").getAttribute("data-status")).toBe("done");
    await waitFor(() => expect(screen.queryByText("4 uploaded")).toBeNull(), {
      timeout: CLEAR_DONE_DELAY_MS + 1000,
    });
  });

  test("a failure stays on screen when the batch is folded", async () => {
    photoResult = { error: "b.jpg stopped uploading." };
    render(<EventMediaUploader eventId="event-1" />);
    await pick(
      ["a.jpg", "b.jpg", "c.jpg", "d.jpg"].map(
        (name) => new File(["x"], name, { type: "image/jpeg" }),
      ),
    );
    await screen.findByText("0 uploaded, 4 failed");
    expect(row("b.jpg").getAttribute("data-status")).toBe("failed");
    await userEvent.click(
      screen.getByRole("button", { name: "Clear finished" }),
    );
    expect(screen.queryByText("b.jpg")).toBeNull();
  });

  describe("from Google Drive (#1634)", () => {
    function pickFromDrive(docs: PickedDriveDoc[]) {
      pickedDocs = docs;
      return userEvent.click(
        screen.getByRole("button", { name: "From Google Drive" }),
      );
    }

    test("a photo and a video from Drive upload like a local pick", async () => {
      render(<EventMediaUploader eventId="event-1" />);
      await pickFromDrive([
        { id: "1", name: "drive.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
        { id: "2", name: "drive.mp4", mimeType: "video/mp4", sizeBytes: 9 },
      ]);

      await waitFor(() =>
        expect(row("drive.jpg").getAttribute("data-status")).toBe("done"),
      );
      expect(recordMock).toHaveBeenCalledWith("t/e/drive.jpg", "drive.jpg");
      await screen.findByRole("progressbar", { name: "Uploading drive.mp4" });
      expect(downloadMock.mock.calls.map(([plan]) => plan.name)).toEqual([
        "drive.jpg",
        "drive.mp4",
      ]);
    });

    test("a video over the Drive cap is refused before download", async () => {
      render(<EventMediaUploader eventId="event-1" />);
      await pickFromDrive([
        {
          id: "1",
          name: "long.mp4",
          mimeType: "video/mp4",
          sizeBytes: DRIVE_MEDIA_MAX_BYTES + 1,
        },
      ]);

      expect(row("long.mp4").getAttribute("data-status")).toBe("failed");
      expect(
        screen.getByText(
          /long\.mp4 is larger than 500 MB.*Download it from Drive/,
        ),
      ).toBeTruthy();
      expect(downloadMock).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Retry long.mp4" }),
      ).toBeNull();
    });

    test("a row shows Downloading from Drive while it is fetched", async () => {
      let release!: (file: File) => void;
      downloadMock.mockImplementationOnce(
        () => new Promise<File>((resolve) => (release = resolve)),
      );
      render(<EventMediaUploader eventId="event-1" />);
      await pickFromDrive([
        { id: "1", name: "slow.jpg", mimeType: "image/jpeg", sizeBytes: 5 },
      ]);

      expect(row("slow.jpg").getAttribute("data-status")).toBe("downloading");
      expect(
        within(row("slow.jpg")).getByText(/Downloading from Drive/),
      ).toBeTruthy();
      release(new File(["x"], "slow.jpg", { type: "image/jpeg" }));
      await waitFor(() =>
        expect(row("slow.jpg").getAttribute("data-status")).toBe("done"),
      );
    });
  });
});
