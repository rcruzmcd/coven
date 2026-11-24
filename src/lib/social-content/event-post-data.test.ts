import { describe, expect, mock, test } from "bun:test";
import sharp from "sharp";
import { EMPTY_BRANDING } from "@/lib/branding";

mock.module("server-only", () => ({}));

const {
  chosenEventPhoto,
  chosenRecapPhotos,
  eventPostFrames,
  eventPhotoChoice,
  eventPostFingerprint,
  eventPostSource,
} = await import("./event-post-data");
const { prepareImage, colorHex } = await import("./event-media-image");
import type { EventPhoto, EventTemplateRecord } from "./event-post-data";

const flyer: EventPhoto = {
  id: "11111111-1111-4111-8111-111111111111",
  path: "t/e/flyer.jpg",
  isFlyer: true,
  color: "#f2f1ec",
};
const crowd: EventPhoto = {
  id: "22222222-2222-4222-8222-222222222222",
  path: "t/e/crowd.jpg",
  isFlyer: false,
  color: null,
};

describe("chosenEventPhoto (#1926)", () => {
  test("unset, the flyer; else the first public photo", () => {
    expect(chosenEventPhoto([flyer, crowd], undefined)).toBe(flyer);
    expect(chosenEventPhoto([crowd], undefined)).toBe(crowd);
    expect(chosenEventPhoto([], undefined)).toBeNull();
  });

  test("a chosen photo, or none", () => {
    expect(chosenEventPhoto([flyer, crowd], eventPhotoChoice(crowd))).toBe(
      crowd,
    );
    expect(chosenEventPhoto([flyer, crowd], "none")).toBeNull();
  });

  test("a photo no longer offered falls back to the default", () => {
    expect(
      chosenEventPhoto(
        [flyer],
        "event_media:33333333-3333-4333-8333-333333333333",
      ),
    ).toBe(flyer);
  });
});

describe("eventPostFingerprint (#1926)", () => {
  const loaded: EventTemplateRecord = {
    record: {
      name: "Meet us at Big Snow",
      starts_at: "2026-12-12T15:00:00Z",
      timezone: "America/New_York",
      location: "Big Snow American Dream",
      registration_enabled: true,
      has_flyer: true,
      host: "chattersnow.org",
    },
    orgName: "Chatter Snow",
    photos: [flyer, crowd],
  };
  const source = (
    templateKey: "event_reminder" | "event_announcement",
    now: string,
  ) =>
    eventPostSource({
      templateKey,
      format: "post",
      loaded,
      text: {},
      branding: EMPTY_BRANDING,
      now: new Date(now),
    });

  test("a reminder goes out of date when its day does", () => {
    const friday = source("event_reminder", "2026-12-11T15:00:00Z");
    const fridayLater = source("event_reminder", "2026-12-11T22:00:00Z");
    const saturday = source("event_reminder", "2026-12-12T15:00:00Z");
    expect(eventPostFingerprint(fridayLater)).toBe(
      eventPostFingerprint(friday),
    );
    expect(eventPostFingerprint(saturday)).not.toBe(
      eventPostFingerprint(friday),
    );
  });

  test("an announcement doesn't change with the day", () => {
    expect(
      eventPostFingerprint(
        source("event_announcement", "2026-12-01T15:00:00Z"),
      ),
    ).toBe(
      eventPostFingerprint(
        source("event_announcement", "2026-12-11T15:00:00Z"),
      ),
    );
  });
});

describe("prepareImage (#1926)", () => {
  test("reads a flyer's dominant colour", async () => {
    // A cream page with a dark block of text, as most flyers are.
    const bytes = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: "#f2f1ec" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 600,
              height: 200,
              channels: 3,
              background: "#1b1340",
            },
          })
            .png()
            .toBuffer(),
          top: 400,
          left: 100,
        },
      ])
      .png()
      .toBuffer();
    const image = await prepareImage(bytes);
    expect(image.width).toBe(800);
    expect(image.height).toBe(1000);
    expect(image.src.startsWith("data:image/jpeg;base64,")).toBe(true);
    // sharp's histogram bins colours, so it is near the page, not exact.
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(image.color.slice(i, i + 2), 16),
    );
    expect(Math.abs(r - 0xf2)).toBeLessThan(16);
    expect(Math.abs(g - 0xf1)).toBeLessThan(16);
    expect(Math.abs(b - 0xec)).toBeLessThan(16);
  });

  test("cuts a large photo down, keeping its shape", async () => {
    const bytes = await sharp({
      create: { width: 4000, height: 2250, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer();
    const image = await prepareImage(bytes);
    expect(image.width).toBe(1600);
    expect(image.height).toBe(900);
  });

  test("colorHex", () => {
    expect(colorHex({ r: 255, g: 0, b: 16 })).toBe("#ff0010");
  });
});

describe("recap photos (#1927)", () => {
  const gallery: EventPhoto[] = Array.from({ length: 24 }, (_, i) => ({
    id: `${String(i).padStart(8, "0")}-2222-4222-8222-222222222222`,
    path: `t/e/${i}.jpg`,
    isFlyer: false,
    color: null,
  }));
  const photos = [flyer, ...gallery];

  test("unset, the gallery's first four; never the flyer", () => {
    expect(chosenRecapPhotos(photos, undefined, "post")).toEqual(
      gallery.slice(0, 4),
    );
    expect(chosenRecapPhotos([flyer], undefined, "story")).toEqual([]);
  });

  test("the picks in order, dropping any no longer offered or the flyer", () => {
    const choice = [gallery[5], flyer, gallery[1]]
      .map(eventPhotoChoice)
      .concat("event_media:99999999-9999-4999-8999-999999999999")
      .join(",");
    expect(chosenRecapPhotos(photos, choice, "post")).toEqual([
      gallery[5],
      gallery[1],
    ]);
    expect(chosenRecapPhotos(photos, "none", "post")).toEqual([]);
  });

  test("a story holds four, a post's carousel twenty", () => {
    const all = gallery.map(eventPhotoChoice).join(",");
    expect(chosenRecapPhotos(photos, all, "story")).toHaveLength(4);
    expect(chosenRecapPhotos(photos, all, "post")).toHaveLength(20);
  });

  const loaded: EventTemplateRecord = {
    record: {
      name: "Season opener",
      starts_at: "2026-12-12T15:00:00Z",
      timezone: "America/New_York",
      location: null,
      registration_enabled: false,
      has_flyer: true,
      host: "example.org",
      attended: 30,
    },
    orgName: "Example",
    photos,
  };
  const recap = (format: "story" | "post", photosChoice?: string) =>
    eventPostSource({
      templateKey: "event_recap",
      format,
      loaded,
      text: photosChoice ? { photos: photosChoice } : {},
      branding: EMPTY_BRANDING,
      now: new Date("2026-12-13T12:00:00Z"),
    });

  test("a post is a frame a photo; a story one collage", () => {
    const six = gallery.slice(0, 6).map(eventPhotoChoice).join(",");
    expect(eventPostFrames(recap("post", six))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(eventPostFrames(recap("story", six))).toEqual([1]);
    expect(eventPostFrames(recap("post", "none"))).toEqual([1]);
  });

  test("goes out of date when the photos or their order change", () => {
    const ab = [gallery[0], gallery[1]].map(eventPhotoChoice).join(",");
    const ba = [gallery[1], gallery[0]].map(eventPhotoChoice).join(",");
    expect(eventPostFingerprint(recap("post", ab))).not.toBe(
      eventPostFingerprint(recap("post", ba)),
    );
  });
});
