import { describe, expect, test } from "bun:test";
import {
  buildPublicGalleryPage,
  publicGalleryCountLabel,
  publicGalleryHref,
  publicGalleryPathsToSign,
  type PublicGalleryRow,
} from "./public-gallery";

const row = (overrides: Partial<PublicGalleryRow> = {}): PublicGalleryRow => ({
  event_id: "e1",
  name: "Rail Jam",
  starts_at: "2026-03-14T18:00:00Z",
  timezone: "America/Denver",
  photo_count: 3,
  video_count: 1,
  thumb_paths: ["t/a.jpg", "t/b.jpg"],
  total_events: 14,
  ...overrides,
});

describe("public gallery page", () => {
  test("signs every row's thumbnails", () => {
    expect(
      publicGalleryPathsToSign([
        row(),
        row({ event_id: "e2", thumb_paths: null }),
        row({ event_id: "e3", thumb_paths: ["t/c.jpg"] }),
      ]),
    ).toEqual(["t/a.jpg", "t/b.jpg", "t/c.jpg"]);
  });

  test("leaves out a thumbnail that did not sign, keeping the counts", () => {
    const page = buildPublicGalleryPage(
      [row()],
      new Map([["t/b.jpg", "https://signed/b"]]),
    );
    expect(page.totalEvents).toBe(14);
    expect(page.events[0]).toEqual({
      id: "e1",
      name: "Rail Jam",
      startsAt: "2026-03-14T18:00:00Z",
      timezone: "America/Denver",
      photoCount: 3,
      videoCount: 1,
      thumbs: ["https://signed/b"],
    });
  });

  test("an empty page has no events and no total", () => {
    expect(buildPublicGalleryPage([], new Map())).toEqual({
      events: [],
      totalEvents: 0,
    });
  });

  test("labels counts, leaving out a kind there is none of", () => {
    expect(publicGalleryCountLabel(12, 2)).toBe("12 photos · 2 videos");
    expect(publicGalleryCountLabel(1, 0)).toBe("1 photo");
    expect(publicGalleryCountLabel(0, 1)).toBe("1 video");
  });

  test("keeps page one off the URL", () => {
    expect(publicGalleryHref(1)).toBe("/gallery");
    expect(publicGalleryHref(3)).toBe("/gallery?page=3");
  });
});
