// Sharing a ready post to Instagram from a phone (#1828): the support check,
// the order media is handed over in, and the handles left to add by hand.
import { describe, expect, mock, test } from "bun:test";
import {
  canShareFiles,
  instagramShareTarget,
  isShareCancel,
  loadShareFiles,
  ShareMediaError,
  shareFilename,
  shareHandles,
  shareableMedia,
} from "./instagram-share";
import type { SocialPostMedia } from "./post-content-actions";

function media(
  name: string,
  overrides: Partial<SocialPostMedia> = {},
): SocialPostMedia {
  return {
    id: name,
    kind: "photo",
    original_filename: name,
    url: `https://storage.test/${name}`,
    event_media_id: null,
    missing: false,
    ...overrides,
  };
}

describe("canShareFiles", () => {
  test("is false without the Web Share API (most desktops)", () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({})).toBe(false);
    expect(canShareFiles({ share: async () => {} })).toBe(false);
  });

  test("asks canShare about files, with a stand-in rather than real media", () => {
    const canShare = mock((data: ShareData) => (data.files?.length ?? 0) > 0);
    expect(canShareFiles({ share: async () => {}, canShare })).toBe(true);
    const [asked] = canShare.mock.calls[0];
    expect(asked.files?.[0].type).toBe("image/jpeg");
  });

  test("is false when the browser shares links but not files", () => {
    expect(
      canShareFiles({ share: async () => {}, canShare: (data) => !data.files }),
    ).toBe(false);
  });

  test("is false when canShare throws", () => {
    expect(
      canShareFiles({
        share: async () => {},
        canShare: () => {
          throw new TypeError("nope");
        },
      }),
    ).toBe(false);
  });
});

describe("shareableMedia", () => {
  test("keeps post order and counts what can't be shared", () => {
    const { ready, unavailable } = shareableMedia([
      media("1.jpg"),
      media("2.jpg", { url: null, missing: true }),
      media("3.mp4", { kind: "video" }),
    ]);
    expect(ready.map((item) => item.id)).toEqual(["1.jpg", "3.mp4"]);
    expect(unavailable).toBe(1);
  });
});

describe("loadShareFiles", () => {
  test("returns files in post order however the downloads finish", async () => {
    const delays: Record<string, number> = {
      "a.jpg": 20,
      "b.mp4": 0,
      "c.jpg": 5,
    };
    const fetchImpl = (async (url: string) => {
      const name = url.split("/").pop()!;
      await new Promise((resolve) => setTimeout(resolve, delays[name]));
      const type = name.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
      return new Response(new Blob([name], { type }));
    }) as unknown as typeof fetch;
    const files = await loadShareFiles(
      shareableMedia([
        media("a.jpg"),
        media("b.mp4", { kind: "video" }),
        media("c.jpg"),
      ]).ready,
      fetchImpl,
    );
    expect(files.map((file) => file.name)).toEqual(["a.jpg", "b.mp4", "c.jpg"]);
    expect(files.map((file) => file.type)).toEqual([
      "image/jpeg",
      "video/mp4",
      "image/jpeg",
    ]);
  });

  test("falls back to the kind's type when storage sends none", async () => {
    const fetchImpl = (async () =>
      new Response(new Blob(["x"]))) as unknown as typeof fetch;
    const [file] = await loadShareFiles(
      shareableMedia([media("clip", { kind: "video" })]).ready,
      fetchImpl,
    );
    expect(file.type).toBe("video/mp4");
  });

  test("names the file that failed", async () => {
    const fetchImpl = (async () =>
      new Response("gone", { status: 403 })) as unknown as typeof fetch;
    const error = await loadShareFiles(
      shareableMedia([media("a.jpg")]).ready,
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShareMediaError);
    expect((error as ShareMediaError).filename).toBe("a.jpg");
  });

  test("says a file too large for the device is too large", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      blob: async () => {
        throw new RangeError("Array buffer allocation failed");
      },
    })) as unknown as typeof fetch;
    const error = await loadShareFiles(
      shareableMedia([media("long.mp4", { kind: "video" })]).ready,
      fetchImpl,
    ).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain("too large");
  });
});

describe("shareHandles", () => {
  test("lists collaborators and tag handles, naming anyone with no handle", () => {
    const handles = shareHandles(
      ["partner"],
      [
        { personId: "p1" },
        { handle: "friend" },
        { personId: "p2" },
        { handle: "rider" },
      ],
      [
        {
          id: "p1",
          name: "Rider One",
          preferred_name: null,
          instagram_handle: "rider",
          declined_photo_consent: false,
        },
        {
          id: "p2",
          name: "No Handle",
          preferred_name: "Nia",
          instagram_handle: null,
          declined_photo_consent: false,
        },
      ],
    );
    expect(handles).toEqual({
      collaborators: ["partner"],
      tags: ["rider", "friend"],
      tagsWithoutHandle: ["Nia"],
    });
  });
});

test("isShareCancel is true only for AbortError", () => {
  expect(isShareCancel(new DOMException("x", "AbortError"))).toBe(true);
  expect(isShareCancel(new DOMException("x", "NotAllowedError"))).toBe(false);
  expect(isShareCancel(new Error("x"))).toBe(false);
});

describe("shareFilename", () => {
  test("matches the extension to what the file is", () => {
    expect(shareFilename("photo.png", "image/jpeg")).toBe("photo.jpg");
    expect(shareFilename("photo.JPEG", "image/jpeg")).toBe("photo.JPEG");
    expect(shareFilename("clip", "video/mp4")).toBe("clip.mp4");
    expect(shareFilename("clip.mov", "video/quicktime")).toBe("clip.mov");
    expect(shareFilename("odd.bin", "application/x-odd")).toBe("odd.bin");
  });
});

test("instagramShareTarget names where each format is in the share sheet", () => {
  expect(instagramShareTarget("instagram_post")).toBe("Feed");
  expect(instagramShareTarget("instagram_reel")).toBe("Reels");
  expect(instagramShareTarget("instagram_story")).toBe("Stories");
  expect(instagramShareTarget(null)).toBeNull();
});
