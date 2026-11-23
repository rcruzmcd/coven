import { describe, expect, test } from "bun:test";
import { EMPTY_BRANDING, type Branding } from "@/lib/branding";
import { contrastRatio } from "@/lib/color-contrast";
import {
  buildStoryFrame,
  detailTiles,
  displayHost,
  fitText,
  occurrenceLabel,
  parseStoryFrame,
  readableOn,
  storyTheme,
  STORY_CONTENT_WIDTH,
  STORY_TEXT_CONTRAST,
  wrappedLines,
  type DetailsFrame,
  type GetItFrame,
  type SpotlightFrame,
  type StoryInput,
} from "./story-frames";

const CHATTER: Branding = {
  ...EMPTY_BRANDING,
  colors: {
    primary: "#70419a",
    primary_deep: "#32134f",
    primary_soft: "#ede1fb",
    background: "#f7f0ff",
  },
  accentStops: [
    "#e84855",
    "#f59e42",
    "#f4d35e",
    "#50b878",
    "#38a5db",
    "#8f55ba",
  ],
};

// Real extremes, not seed samples: inventory descriptions have no length
// limit, and the post's fields are at their caps (GEAR_DETAIL_LIMITS).
const LONG_DESCRIPTION =
  "Burton Custom Flying V 158 wide all-mountain snowboard with Burton Cartel EST bindings, Channel mounting hardware, a fresh base grind and edge tune, plus a padded board bag";
const LONG_WHY =
  "Forgiving enough for a first season on groomers but stiff enough to hold an edge on hardpack, so it keeps up as you progress into steeper terrain and park laps.";

function input(overrides: Partial<StoryInput> = {}): StoryInput {
  return {
    frame: 1,
    item: {
      description: "Burton Custom snowboard",
      size: "158",
      condition: "like_new",
      category_label: "Boards",
      in_catalog: true,
    },
    details: { brand: "Burton", best_for: "Beginners", why: "Easy to ride." },
    categoryStop: 1,
    photo: "data:image/jpeg;base64,AAAA",
    series: { cadence: "weekly", number: 12 },
    branding: CHATTER,
    headingTracking: "-0.04em",
    orgName: "Chatter",
    host: "chattersnow.org",
    copy: {
      headline: "Gear shouldn't be the barrier.",
      itemLine:
        "{item_name} is free to someone who needs it. No gatekeeping, no fuss.",
      steps: ["Tap the link below", "Tell us your size", "Pick it up"],
      collection: "Gear",
    },
    ...overrides,
  };
}

describe("parseStoryFrame", () => {
  test("accepts 1, 2 and 3 only", () => {
    expect(parseStoryFrame("1")).toBe(1);
    expect(parseStoryFrame("3")).toBe(3);
    expect(parseStoryFrame("0")).toBeNull();
    expect(parseStoryFrame("4")).toBeNull();
    expect(parseStoryFrame("1.5")).toBeNull();
    expect(parseStoryFrame("x")).toBeNull();
  });
});

describe("fitText", () => {
  const options = {
    width: STORY_CONTENT_WIDTH,
    maxSize: 96,
    minSize: 56,
    maxLines: 2,
  };

  test("a short line keeps the largest size", () => {
    expect(fitText("Snowboard", options)).toEqual({
      text: "Snowboard",
      fontSize: 96,
    });
  });

  test("a longer line shrinks until it fits two lines", () => {
    const fitted = fitText(
      "Burton Custom Flying V 158 wide snowboard",
      options,
    );
    expect(fitted.fontSize).toBeLessThan(96);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(56);
    expect(fitted.text).toBe("Burton Custom Flying V 158 wide snowboard");
    expect(wrappedLines(fitted.text, fitted.fontSize, options.width)).toBe(2);
  });

  test("past the smallest size it is cut at a word, with an ellipsis", () => {
    const fitted = fitText(LONG_DESCRIPTION, options);
    expect(fitted.fontSize).toBe(56);
    expect(fitted.text.endsWith("…")).toBe(true);
    expect(LONG_DESCRIPTION.startsWith(fitted.text.slice(0, -1))).toBe(true);
    expect(wrappedLines(fitted.text, 56, options.width)).toBeLessThanOrEqual(2);
  });

  test("a single unbroken word longer than the lines is cut to fit", () => {
    const fitted = fitText("x".repeat(400), options);
    expect(wrappedLines(fitted.text, 56, options.width)).toBeLessThanOrEqual(2);
  });
});

describe("detailTiles", () => {
  test("all four, in order, two to a row", () => {
    const tiles = detailTiles(input().item, input().details);
    expect(tiles.map((t) => [t.label, t.value.text, t.wide])).toEqual([
      ["Size", "158", false],
      ["Condition", "Like new", false],
      ["Best for", "Beginners", false],
      ["Status", "Available", false],
    ]);
  });

  test("a blank field is left out and the last tile takes its row", () => {
    const tiles = detailTiles(
      { ...input().item, size: "  " },
      { ...input().details, best_for: null },
    );
    expect(tiles.map((t) => [t.label, t.wide])).toEqual([
      ["Condition", false],
      ["Status", false],
    ]);
    const three = detailTiles({ ...input().item, size: null }, input().details);
    expect(three.map((t) => t.wide)).toEqual([false, false, true]);
  });

  test("an item no longer in the catalog says so", () => {
    const [status] = detailTiles(
      { ...input().item, size: null, condition: null, in_catalog: false },
      { brand: null, best_for: null, why: null },
    );
    expect(status.value.text).toBe("No longer available");
  });

  test("Best for at its 40-character cap fits its tile", () => {
    const tiles = detailTiles(input().item, {
      ...input().details,
      best_for: "Confident intermediates moving to powder",
    });
    const best = tiles.find((t) => t.label === "Best for")!;
    expect(best.value.text).toBe("Confident intermediates moving to powder");
    expect(tiles.map((t) => t.wide)).toEqual([false, false, false, false]);
  });

  test("a value too long for half a row takes the whole row", () => {
    const tiles = detailTiles(
      {
        ...input().item,
        size: "Youth extra large, fits roughly ages twelve to fourteen, runs small",
      },
      input().details,
    );
    // Size takes its row; Condition and Best for pair; Status, left alone,
    // takes the last row.
    expect(tiles.map((t) => t.wide)).toEqual([true, false, false, true]);
  });
});

describe("buildStoryFrame", () => {
  test("frame 1: photo, pill, title, brand and the header", () => {
    const model = buildStoryFrame(input());
    const frame = model.frame as SpotlightFrame;
    expect(frame.frame).toBe(1);
    expect(frame.photo).toBe("data:image/jpeg;base64,AAAA");
    expect(frame.categoryLabel).toBe("Boards");
    expect(frame.title.text).toBe("Burton Custom snowboard");
    expect(frame.brand?.text).toBe("Burton");
    expect(model.header).toEqual({
      logoUrl: null,
      orgName: "Chatter",
      occurrenceLabel: "Week 12",
      eyebrow: "Gear Spotlight",
    });
    // Boards is Chatter Snow's orange stop.
    expect(model.theme.category.color).toBe("#f59e42");
  });

  test("frame 1 with no photo, brand or series", () => {
    const model = buildStoryFrame(
      input({
        photo: null,
        series: null,
        details: { brand: " ", best_for: null, why: null },
      }),
    );
    const frame = model.frame as SpotlightFrame;
    expect(frame.photo).toBeNull();
    expect(frame.categoryLabel).toBe("Boards");
    expect(frame.brand).toBeNull();
    expect(model.header.occurrenceLabel).toBeNull();
  });

  test("frame 1 with a real-length description stays within two lines", () => {
    const frame = buildStoryFrame(
      input({ item: { ...input().item, description: LONG_DESCRIPTION } }),
    ).frame as SpotlightFrame;
    expect(
      wrappedLines(frame.title.text, frame.title.fontSize, STORY_CONTENT_WIDTH),
    ).toBeLessThanOrEqual(2);
  });

  test("frame 2: tiles, and why we love it only when there is one", () => {
    const frame = buildStoryFrame(
      input({ frame: 2, details: { ...input().details, why: LONG_WHY } }),
    ).frame as DetailsFrame;
    expect(frame.heading).toBe("The details");
    expect(frame.tiles).toHaveLength(4);
    expect(frame.why?.text).toBe(LONG_WHY);
    expect(frame.script).toBe("why we love it");

    const bare = buildStoryFrame(
      input({ frame: 2, details: { brand: null, best_for: null, why: null } }),
    ).frame as DetailsFrame;
    expect(bare.why).toBeNull();
    expect(bare.script).toBeNull();
    expect(bare.tiles.map((t) => t.label)).toEqual([
      "Size",
      "Condition",
      "Status",
    ]);
  });

  test("frame 2 shows the item's photo, and leaves it out without one", () => {
    const withPhoto = buildStoryFrame(input({ frame: 2 }))
      .frame as DetailsFrame;
    expect(withPhoto.photo).toBe("data:image/jpeg;base64,AAAA");
    const without = buildStoryFrame(input({ frame: 2, photo: null }))
      .frame as DetailsFrame;
    expect(without.photo).toBeNull();
  });

  test("frame 2 never names a donor", () => {
    const frame = buildStoryFrame(input({ frame: 2 })).frame;
    expect(JSON.stringify(frame)).not.toMatch(/donat/i);
  });

  test("frame 3: the tenant's copy with the item named, at most three steps", () => {
    const frame = buildStoryFrame(
      input({
        frame: 3,
        copy: {
          ...input().copy,
          steps: ["One", " ", "Two", "Three", "Four"],
        },
      }),
    ).frame as GetItFrame;
    expect(frame.headline.text).toBe("Gear shouldn't be the barrier.");
    expect(frame.itemLine?.text).toBe(
      "Burton Custom snowboard is free to someone who needs it. No gatekeeping, no fuss.",
    );
    expect(frame.steps.map((s) => s.text)).toEqual(["One", "Two", "Three"]);
    expect(frame.script).toBe("want it?");
    expect(frame.host).toBe("chattersnow.org");
  });

  test("frame 3 drops the script line when the headline already asks", () => {
    const frame = buildStoryFrame(
      input({
        frame: 3,
        copy: { ...input().copy, headline: "Want it? Here's how." },
      }),
    ).frame as GetItFrame;
    expect(frame.script).toBeNull();
  });

  test("the eyebrow uses the tenant's word for its collection", () => {
    const model = buildStoryFrame(
      input({ copy: { ...input().copy, collection: "Tool library" } }),
    );
    expect(model.header.eyebrow).toBe("Tool library Spotlight");
  });
});

describe("occurrenceLabel", () => {
  test("names the period by cadence", () => {
    expect(occurrenceLabel({ cadence: "weekly", number: 3 })).toBe("Week 3");
    expect(occurrenceLabel({ cadence: "monthly", number: 3 })).toBe("Month 3");
    expect(occurrenceLabel({ cadence: "biweekly", number: 3 })).toBe("No. 3");
    expect(occurrenceLabel(null)).toBeNull();
  });
});

describe("contrast", () => {
  const palettes: Branding[] = [
    EMPTY_BRANDING,
    CHATTER,
    // A tenant whose accent is too light for its own tint.
    {
      ...EMPTY_BRANDING,
      colors: {
        primary: "#f4d35e",
        primary_deep: "#888888",
        primary_soft: "#fff7d6",
        background: "#ffffff",
      },
    },
    // A dark palette.
    {
      ...EMPTY_BRANDING,
      colors: {
        primary: "#38a5db",
        primary_deep: "#0b1d2a",
        primary_soft: "#102030",
        background: "#1a2a3a",
      },
    },
  ];

  test.each(palettes.map((p, i) => [i, p] as const))(
    "palette %d: every text colour reads at 4.5:1",
    (_, branding) => {
      const theme = storyTheme(branding, 0, "-0.02em");
      for (const [fg, bg] of [
        [theme.text, theme.page],
        [theme.accent, theme.page],
        [theme.panelText, theme.panel],
        [theme.panelAccent, theme.panel],
        [theme.category.text, theme.category.color],
      ]) {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(
          STORY_TEXT_CONTRAST,
        );
      }
    },
  );

  test("readableOn keeps a preferred colour that passes", () => {
    expect(readableOn("#ede1fb", ["#32134f"])).toBe("#32134f");
    expect(readableOn("#ffffff", ["#ffff00"])).toBe("#000000");
  });
});

describe("displayHost", () => {
  test("drops the scheme and www.", () => {
    expect(displayHost("https://www.chattersnow.org")).toBe("chattersnow.org");
    expect(displayHost("https://demo.rcmlabs.dev/")).toBe("demo.rcmlabs.dev");
    expect(displayHost("http://localhost:3000")).toBe("localhost:3000");
  });
});
