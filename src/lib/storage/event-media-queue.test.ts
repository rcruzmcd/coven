import { describe, expect, test } from "bun:test";
import type { EventMediaSlot } from "./event-media-files";
import type { VideoUploadHandlers } from "./event-media";
import {
  createEventMediaQueue,
  type EventMediaQueueDeps,
  type RemoteFile,
} from "./event-media-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function photo(name = "a.jpg") {
  return new File([new Uint8Array(10)], name, { type: "image/jpeg" });
}
function video(name = "a.mp4") {
  return new File([new Uint8Array(10)], name, { type: "video/mp4" });
}

function slotFor(file: { name: string; type: string }): EventMediaSlot {
  const isVideo = file.type.startsWith("video/");
  return {
    path: `t/e/${file.name}`,
    token: "token",
    kind: isVideo ? "video" : "photo",
    contentType: isVideo ? "video/mp4" : "image/jpeg",
  };
}

/** A queue whose uploads are controlled by the test. */
function setup(overrides: Partial<EventMediaQueueDeps> = {}) {
  const photoResolvers: ((r: { ok: true } | { error: string }) => void)[] = [];
  const videos: {
    handlers: VideoUploadHandlers;
    starts: number;
    pauses: number;
  }[] = [];
  const recorded: string[] = [];

  const queue = createEventMediaQueue({
    mintSlots: async (files) => ({ slots: files.map(slotFor) }),
    uploadPhoto: (_file, _slot, onProgress) => {
      onProgress(0.5);
      return new Promise((resolve) => photoResolvers.push(resolve));
    },
    createVideoUpload: (_file, _slot, handlers) => {
      const entry = { handlers, starts: 0, pauses: 0 };
      videos.push(entry);
      return {
        start: () => (entry.starts += 1),
        pause: () => (entry.pauses += 1),
      };
    },
    record: async (slot) => {
      recorded.push(slot.path);
      return { ok: true };
    },
    ...overrides,
  });
  const statuses = () => queue.getSnapshot().map((item) => item.status);
  return { queue, photoResolvers, videos, recorded, statuses };
}

describe("event media queue", () => {
  test("a photo goes queued -> uploading -> done and is recorded", async () => {
    const { queue, photoResolvers, recorded, statuses } = setup();
    const adding = queue.add([photo()]);
    expect(statuses()).toEqual(["queued"]);
    await adding;
    expect(statuses()).toEqual(["uploading"]);
    expect(queue.getSnapshot()[0].progress).toBe(0.5);

    photoResolvers[0]({ ok: true });
    await tick();
    expect(statuses()).toEqual(["done"]);
    expect(recorded).toEqual(["t/e/a.jpg"]);
  });

  test("a failed photo can be retried", async () => {
    const { queue, photoResolvers, statuses } = setup();
    await queue.add([photo()]);
    photoResolvers[0]({ error: "a.jpg stopped uploading." });
    await tick();
    expect(statuses()).toEqual(["failed"]);
    expect(queue.getSnapshot()[0].error).toBe("a.jpg stopped uploading.");

    queue.retry(queue.getSnapshot()[0].id);
    expect(statuses()).toEqual(["uploading"]);
    photoResolvers[1]({ ok: true });
    await tick();
    expect(statuses()).toEqual(["done"]);
  });

  test("a video pauses and resumes on the same upload", async () => {
    const { queue, videos, statuses } = setup();
    await queue.add([video()]);
    const id = queue.getSnapshot()[0].id;
    expect(statuses()).toEqual(["uploading"]);
    videos[0].handlers.onProgress(0.25);

    queue.pause(id);
    expect(statuses()).toEqual(["paused"]);
    expect(videos[0].pauses).toBe(1);
    // A tick already in flight when the pause landed changes nothing.
    videos[0].handlers.onProgress(0.3);
    expect(queue.getSnapshot()[0]).toMatchObject({
      status: "paused",
      progress: 0.25,
    });

    queue.resume(id);
    expect(statuses()).toEqual(["uploading"]);
    expect(videos).toHaveLength(1);
    expect(videos[0].starts).toBe(2);

    videos[0].handlers.onSuccess();
    await tick();
    expect(statuses()).toEqual(["done"]);
  });

  test("a failed video resumes rather than starting a new upload", async () => {
    const { queue, videos, statuses } = setup();
    await queue.add([video()]);
    videos[0].handlers.onError("a.mp4 stopped uploading.");
    expect(statuses()).toEqual(["failed"]);

    queue.retry(queue.getSnapshot()[0].id);
    expect(videos).toHaveLength(1);
    expect(videos[0].starts).toBe(2);
  });

  test("a mixed batch uploads two at a time", async () => {
    const { queue, photoResolvers, statuses } = setup();
    await queue.add([photo("1.jpg"), video("2.mp4"), photo("3.jpg")]);
    expect(statuses()).toEqual(["uploading", "uploading", "queued"]);

    photoResolvers[0]({ ok: true });
    await tick();
    expect(statuses()).toEqual(["done", "uploading", "uploading"]);
  });

  test("a file that can never be stored fails at once, without a retry", async () => {
    const { queue, statuses } = setup();
    await queue.add([
      new File(["x"], "notes.pdf", { type: "application/pdf" }),
      photo(),
    ]);
    expect(statuses()).toEqual(["failed", "uploading"]);
    expect(queue.getSnapshot()[0]).toMatchObject({
      retryable: false,
      error: "notes.pdf is not a photo or a video.",
    });
  });

  test("a refused token batch fails every file in it, retryably", async () => {
    let calls = 0;
    const { queue, statuses } = setup({
      mintSlots: async (files) => {
        calls += 1;
        return calls === 1
          ? { error: "Event media uploads are turned off." }
          : { slots: files.map(slotFor) };
      },
    });
    await queue.add([photo(), video()]);
    expect(statuses()).toEqual(["failed", "failed"]);

    queue.retry(queue.getSnapshot()[1].id);
    await tick();
    expect(statuses()).toEqual(["failed", "uploading"]);
  });

  test("a failed record is a failure, and dismiss removes finished rows", async () => {
    const { queue, photoResolvers, statuses } = setup({
      record: async () => ({ error: "The upload didn't arrive." }),
    });
    await queue.add([photo()]);
    photoResolvers[0]({ ok: true });
    await tick();
    expect(statuses()).toEqual(["failed"]);

    queue.dismiss(queue.getSnapshot()[0].id);
    expect(queue.getSnapshot()).toEqual([]);
  });
});

describe("upload link options (#1620)", () => {
  test("keepOriginals plans a PNG as an original photo", async () => {
    const minted: string[] = [];
    const { queue } = setup({
      keepOriginals: true,
      mintSlots: async (files) => {
        minted.push(...files.map((file) => file.name));
        return { slots: files.map(slotFor) };
      },
    });
    await queue.add([
      new File([new Uint8Array(10)], "a.png", { type: "image/png" }),
    ]);
    expect(minted).toEqual(["a.png"]);
    expect(queue.getSnapshot()[0].kind).toBe("photo");
  });

  test("a recorded file with a ref can be removed, and leaves the list", async () => {
    const removed: string[] = [];
    const { queue, photoResolvers } = setup({
      record: async () => ({ ok: true, ref: "media-1.receipt" }),
      remove: async (ref) => {
        removed.push(ref);
        return { ok: true };
      },
    });
    await queue.add([photo()]);
    photoResolvers[0]({ ok: true });
    await tick();
    const [item] = queue.getSnapshot();
    expect(item.removable).toBe(true);

    await queue.remove(item.id);
    expect(removed).toEqual(["media-1.receipt"]);
    expect(queue.getSnapshot()).toEqual([]);
  });

  test("a refused removal keeps the row with the reason", async () => {
    const { queue, photoResolvers } = setup({
      record: async () => ({ ok: true, ref: "r" }),
      remove: async () => ({ error: "Not from here." }),
    });
    await queue.add([photo()]);
    photoResolvers[0]({ ok: true });
    await tick();
    const id = queue.getSnapshot()[0].id;

    await queue.remove(id);
    expect(queue.getSnapshot()[0]).toMatchObject({
      status: "done",
      removable: true,
      error: "Not from here.",
    });
  });

  test("without remove, nothing is removable", async () => {
    const { queue, photoResolvers } = setup({
      record: async () => ({ ok: true, ref: "r" }),
    });
    await queue.add([photo()]);
    photoResolvers[0]({ ok: true });
    await tick();
    expect(queue.getSnapshot()[0].removable).toBe(false);
  });

  describe("remote files (#1634)", () => {
    /** A remote file whose fetch the test resolves. */
    function remote(name: string) {
      let resolve!: (file: File | { error: string }) => void;
      let progress!: (fraction: number | null) => void;
      const calls = { count: 0 };
      const file: RemoteFile = {
        name,
        size: 10,
        kind: name.endsWith(".mp4") ? "video" : "photo",
        fetch: (onProgress) => {
          calls.count += 1;
          progress = onProgress;
          return new Promise((r) => (resolve = r));
        },
      };
      return {
        file,
        calls,
        arrive: (body = name.endsWith(".mp4") ? video(name) : photo(name)) =>
          resolve(body),
        failWith: (error: string) => resolve({ error }),
        progress: (fraction: number) => progress(fraction),
      };
    }

    test("fetches two ahead, not the whole pick", async () => {
      const { queue, statuses } = setup();
      const files = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"].map(remote);
      queue.addRemote(files.map((f) => f.file));
      expect(statuses()).toEqual([
        "downloading",
        "downloading",
        "queued",
        "queued",
      ]);
      expect(files.map((f) => f.calls.count)).toEqual([1, 1, 0, 0]);
    });

    test("a fetched file shows progress, then uploads and is recorded", async () => {
      const { queue, photoResolvers, recorded, statuses } = setup();
      const a = remote("a.jpg");
      queue.addRemote([a.file]);
      a.progress(0.25);
      expect(queue.getSnapshot()[0].progress).toBe(0.25);

      a.arrive();
      await tick();
      expect(statuses()).toEqual(["uploading"]);
      photoResolvers[0]({ ok: true });
      await tick();
      expect(statuses()).toEqual(["done"]);
      expect(recorded).toEqual(["t/e/a.jpg"]);
    });

    test("the next fetch starts once an upload frees a place", async () => {
      const { queue } = setup({ concurrency: 1 });
      const files = ["a.jpg", "b.jpg", "c.jpg"].map(remote);
      queue.addRemote(files.map((f) => f.file));
      expect(files.map((f) => f.calls.count)).toEqual([1, 0, 0]);

      files[0].arrive();
      await tick();
      // a is uploading, so b may be fetched; c waits behind it.
      expect(files.map((f) => f.calls.count)).toEqual([1, 1, 0]);
    });

    test("a refusal made before fetching fails without a retry", () => {
      const { queue } = setup();
      queue.addRemote([
        { name: "big.mp4", size: 1, kind: "video", error: "Too large." },
      ]);
      expect(queue.getSnapshot()[0]).toMatchObject({
        status: "failed",
        error: "Too large.",
        retryable: false,
      });
    });

    test("a failed fetch is retried by fetching again", async () => {
      const { queue, statuses } = setup();
      const a = remote("a.jpg");
      queue.addRemote([a.file]);
      a.failWith("Drive access expired.");
      await tick();
      expect(statuses()).toEqual(["failed"]);
      expect(queue.getSnapshot()[0].retryable).toBe(true);

      queue.retry(queue.getSnapshot()[0].id);
      expect(statuses()).toEqual(["downloading"]);
      expect(a.calls.count).toBe(2);
    });

    test("a fetched file that isn't media is refused", async () => {
      const { queue } = setup();
      const a = remote("a.jpg");
      queue.addRemote([a.file]);
      a.arrive(new File(["x"], "a.pdf", { type: "application/pdf" }));
      await tick();
      expect(queue.getSnapshot()[0]).toMatchObject({
        status: "failed",
        retryable: false,
      });
    });
  });
});
