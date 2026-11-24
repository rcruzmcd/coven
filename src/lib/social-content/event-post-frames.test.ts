import { describe, expect, test } from "bun:test";
import { EMPTY_BRANDING } from "@/lib/branding";
import { contrastRatio } from "@/lib/color-contrast";
import {
  buildEventPostFrame,
  eventWhenLine,
  fitWhole,
  frameBox,
  relativeDay,
  type EventPostInput,
} from "./event-post-frames";
import { STORY_TEXT_CONTRAST } from "./story-frames";

// Saturday 2026-12-12, 10:00 in New York (15:00 UTC).
const SATURDAY = "2026-12-12T15:00:00Z";
const NY = "America/New_York";

/** Noon in New York on 2026-12-<day>. */
const nyNoon = (day: number) =>
  new Date(`2026-12-${String(day).padStart(2, "0")}T17:00:00Z`);

describe("relativeDay (#1926)", () => {
  test("reads the event's day from now, in the event's zone", () => {
    expect(relativeDay(SATURDAY, NY, nyNoon(12))).toBe("Today");
    expect(relativeDay(SATURDAY, NY, nyNoon(11))).toBe("Tomorrow");
    expect(relativeDay(SATURDAY, NY, nyNoon(10))).toBe("This Saturday");
    expect(relativeDay(SATURDAY, NY, nyNoon(6))).toBe("This Saturday");
    expect(relativeDay(SATURDAY, NY, nyNoon(5))).toBe("Next Saturday");
    expect(relativeDay(SATURDAY, NY, nyNoon(1))).toBe("Next Saturday");
    expect(relativeDay(SATURDAY, NY, new Date("2026-11-20T17:00:00Z"))).toBe(
      "Saturday, December 12",
    );
  });

  test("a past event is its date, never 'Yesterday'", () => {
    expect(relativeDay(SATURDAY, NY, nyNoon(14))).toBe("Saturday, December 12");
  });

  test("late evening in the zone is still that day, whatever UTC says", () => {
    // 23:30 Friday in New York is already Saturday in UTC.
    const fridayNight = new Date("2026-12-12T04:30:00Z");
    expect(relativeDay(SATURDAY, NY, fridayNight)).toBe("Tomorrow");
  });

  test("a bad zone falls back to UTC rather than throwing", () => {
    expect(relativeDay(SATURDAY, "Not/AZone", nyNoon(11))).toBe("Tomorrow");
  });
});

test("eventWhenLine is in the event's zone and labels it", () => {
  expect(eventWhenLine(SATURDAY, NY)).toBe("Sat, Dec 12 · 10:00 AM EST");
});

describe("fitWhole", () => {
  test.each([
    ["portrait", 810, 1013],
    ["square", 1000, 1000],
    ["landscape", 1600, 900],
  ])("a %s flyer fits whole, never cropped", (_shape, width, height) => {
    const fitted = fitWhole({ src: "x", width, height }, 1032, 900);
    expect(fitted.width).toBeLessThanOrEqual(1032);
    expect(fitted.height).toBeLessThanOrEqual(900);
    // Its shape is kept to the pixel.
    expect(
      Math.abs(fitted.width / fitted.height - width / height),
    ).toBeLessThan(0.01);
    // And one side reaches the box.
    expect(fitted.width === 1032 || fitted.height === 900).toBe(true);
  });
});

function input(overrides: Partial<EventPostInput> = {}): EventPostInput {
  return {
    kind: "reminder",
    format: "story",
    event: {
      name: "Meet us at Big Snow",
      starts_at: SATURDAY,
      timezone: NY,
      location: "Big Snow American Dream, Rooftop Parking Deck A",
      registration_enabled: true,
      has_flyer: true,
      host: "chattersnow.org",
    },
    text: {
      line: "Meet us at Big Snow",
      cta: null,
      details: false,
      logo: true,
    },
    flyer: { src: "flyer", width: 810, height: 1013, color: "#f2f1ec" },
    photo: null,
    now: nyNoon(11),
    branding: { ...EMPTY_BRANDING, logoUrl: "data:image/png;base64,AA" },
    headingTracking: "-0.02em",
    orgName: "Chatter Snow",
    ...overrides,
  };
}

describe("buildEventPostFrame: with a flyer", () => {
  test.each(["story", "post"] as const)(
    "%s: the flyer on its own colour, with readable words",
    (format) => {
      const model = buildEventPostFrame(input({ format }));
      const box = frameBox(format);
      expect(model.box).toEqual(box);
      if (model.frame.layout !== "flyer") throw new Error("expected flyer");
      expect(model.frame.band).toBe("#f2f1ec");
      expect(
        contrastRatio(model.frame.bandText, model.frame.band),
      ).toBeGreaterThanOrEqual(STORY_TEXT_CONTRAST);
      expect(model.frame.when?.text).toBe("Tomorrow");
      // The flyer stays inside the area Instagram leaves clear.
      expect(model.frame.flyer.height).toBeLessThan(
        box.height - box.padTop - box.padBottom,
      );
      expect(model.frame.flyer.width).toBeLessThanOrEqual(box.width);
    },
  );

  test("a dark flyer gets white words", () => {
    const model = buildEventPostFrame(
      input({ flyer: { src: "f", width: 1, height: 1, color: "#1b1340" } }),
    );
    if (model.frame.layout !== "flyer") throw new Error("expected flyer");
    expect(model.frame.bandText).toBe("#ffffff");
  });

  test("date, time and place show only when switched on", () => {
    const off = buildEventPostFrame(input());
    const on = buildEventPostFrame(
      input({ text: { ...input().text, details: true } }),
    );
    expect(off.frame.details).toEqual([]);
    expect(on.frame.details).toEqual([
      "Sat, Dec 12 · 10:00 AM EST",
      "Big Snow American Dream, Rooftop Parking Deck A",
    ]);
  });

  test("the logo can be switched off", () => {
    const model = buildEventPostFrame(
      input({ text: { ...input().text, logo: false } }),
    );
    expect(model.frame.logoUrl).toBeNull();
  });

  test("an announcement has no day, and carries its call to action", () => {
    const model = buildEventPostFrame(
      input({
        kind: "announcement",
        text: { ...input().text, cta: "Register at chattersnow.org" },
      }),
    );
    if (model.frame.layout !== "flyer") throw new Error("expected flyer");
    expect(model.frame.when).toBeNull();
    expect(model.frame.cta?.text).toBe("Register at chattersnow.org");
  });

  test("more words leave the flyer less room, but never none", () => {
    const bare = buildEventPostFrame(
      input({
        format: "post",
        text: { line: "", cta: null, details: false, logo: false },
      }),
    );
    const full = buildEventPostFrame(
      input({
        format: "post",
        kind: "announcement",
        text: {
          line: "x".repeat(30) + " " + "y".repeat(29),
          cta: "Register at chattersnow.org today please",
          details: true,
          logo: true,
        },
      }),
    );
    if (bare.frame.layout !== "flyer" || full.frame.layout !== "flyer") {
      throw new Error("expected flyer");
    }
    expect(full.frame.flyer.height).toBeLessThan(bare.frame.flyer.height);
    expect(full.frame.flyer.height).toBeGreaterThan(400);
  });
});

describe("buildEventPostFrame: without a flyer", () => {
  test("the brand layout: title, date, place and the photo", () => {
    const model = buildEventPostFrame(
      input({
        flyer: null,
        photo: { src: "photo", width: 1600, height: 1067 },
        text: {
          line: "Meet us at Big Snow",
          cta: null,
          details: true,
          logo: true,
        },
      }),
    );
    if (model.frame.layout !== "brand") throw new Error("expected brand");
    expect(model.frame.title.text).toBe("Meet us at Big Snow");
    expect(model.frame.eyebrow).toBe("Tomorrow");
    expect(model.frame.photo?.src).toBe("photo");
    expect(model.frame.details).toHaveLength(2);
    // The line repeats the title, so it is left out.
    expect(model.frame.line).toBeNull();
  });

  test("an announcement says Coming up, and keeps a line that adds something", () => {
    const model = buildEventPostFrame(
      input({
        kind: "announcement",
        flyer: null,
        text: {
          line: "Gear drive, yoga and riding",
          cta: "More at chattersnow.org",
          details: true,
          logo: true,
        },
      }),
    );
    if (model.frame.layout !== "brand") throw new Error("expected brand");
    expect(model.frame.eyebrow).toBe("Coming up");
    expect(model.frame.line?.text).toBe("Gear drive, yoga and riding");
    expect(model.frame.photo).toBeNull();
  });
});
