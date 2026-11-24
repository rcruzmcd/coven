import { describe, expect, test } from "bun:test";
import { EMPTY_BRANDING } from "@/lib/branding";
import {
  GEAR_SPOTLIGHT,
  gearPostDetails,
  isPostTemplateKey,
  normalizeTemplateText,
  parsePostTemplatesOff,
  parseTemplateText,
  postTemplate,
  templateFieldValue,
  templateFormat,
  templatesFor,
  type TemplateField,
} from "./post-templates";
import { GEAR_DETAIL_LIMITS } from "./series-gear";
import type { DetailsFrame, SpotlightFrame, StoryInput } from "./story-frames";

// Real extremes at each cap, in real words (GEAR_DETAIL_LIMITS).
const BRAND_AT_CAP =
  "Burton Snowboards x Volcom Mountain Collective Pro Model Kit";
const BEST_FOR_AT_CAP = "Confident intermediates moving to powder";
const WHY_AT_CAP =
  "Forgiving enough for a first season on groomers but stiff enough to hold an edge on hardpack, so it keeps up as you progress into steeper terrain and park laps.";

function input(frame: 1 | 2, details: StoryInput["details"]): StoryInput {
  return {
    frame,
    item: {
      description: "Burton Custom snowboard",
      size: "158",
      condition: "like_new",
      category_label: "Boards",
      in_catalog: true,
    },
    details,
    categoryStop: 1,
    photo: null,
    series: null,
    branding: EMPTY_BRANDING,
    headingTracking: "0",
    orgName: "Chatter",
    host: "chattersnow.org",
    copy: { headline: "Want it?", itemLine: "", steps: [], collection: "" },
  };
}

describe("registry", () => {
  test("Gear Spotlight is registered under its key", () => {
    expect(isPostTemplateKey("gear_spotlight")).toBe(true);
    expect(postTemplate("gear_spotlight")).toBe(GEAR_SPOTLIGHT);
  });

  test("an unknown or inherited key is no template", () => {
    expect(postTemplate("flyer")).toBeNull();
    expect(postTemplate("toString")).toBeNull();
    expect(postTemplate(null)).toBeNull();
  });

  test("Gear Spotlight's fields keep the post's caps", () => {
    expect(
      Object.fromEntries(
        GEAR_SPOTLIGHT.fields
          .filter((f) => f.kind !== "photo")
          .map((f) => [f.key, f.max]),
      ),
    ).toEqual(GEAR_DETAIL_LIMITS);
  });
});

describe("parseTemplateText", () => {
  test("keeps non-blank strings, cleaned", () => {
    expect(
      parseTemplateText({ brand: "  Burton  ", why: "", n: 3, best_for: null }),
    ).toEqual({ brand: "Burton" });
  });

  test("anything but an object is empty", () => {
    expect(parseTemplateText(null)).toEqual({});
    expect(parseTemplateText(["x"])).toEqual({});
    expect(parseTemplateText("x")).toEqual({});
  });
});

describe("normalizeTemplateText", () => {
  const field: TemplateField<{ name: string }> = {
    key: "title",
    label: "Title",
    kind: "line",
    max: 20,
    start: (record) => record.name,
  };
  const template = { fields: [field] };

  test("keeps only what was typed over", () => {
    expect(
      normalizeTemplateText(
        template,
        { name: "Snow Day" },
        { title: "Snow Day" },
      ),
    ).toEqual({ text: {} });
    expect(
      normalizeTemplateText(
        template,
        { name: "Snow Day" },
        { title: " Ski  Day " },
      ),
    ).toEqual({ text: { title: "Ski Day" } });
    expect(
      normalizeTemplateText(template, { name: "x" }, { title: "", other: "y" }),
    ).toEqual({ text: {} });
  });

  test("a field shows its typed text, else its starting value", () => {
    expect(templateFieldValue(field, { name: "Snow Day" }, {})).toBe(
      "Snow Day",
    );
    expect(
      templateFieldValue(field, { name: "Snow Day" }, { title: "Ski Day" }),
    ).toBe("Ski Day");
  });

  test("accepts a field at its cap and refuses one over it", () => {
    for (const [key, value] of [
      ["brand", BRAND_AT_CAP],
      ["best_for", BEST_FOR_AT_CAP],
      ["why", WHY_AT_CAP],
    ] as const) {
      expect(value.length).toBe(GEAR_DETAIL_LIMITS[key]);
      expect(
        normalizeTemplateText(GEAR_SPOTLIGHT, null, { [key]: value }),
      ).toEqual({ text: { [key]: value } });
      expect(
        normalizeTemplateText(GEAR_SPOTLIGHT, null, { [key]: `${value}s` }),
      ).toEqual({
        error: `${GEAR_SPOTLIGHT.fields.find((f) => f.key === key)!.label} can be at most ${GEAR_DETAIL_LIMITS[key]} characters.`,
      });
    }
  });
});

describe("Gear Spotlight at its caps", () => {
  const details = {
    brand: BRAND_AT_CAP,
    best_for: BEST_FOR_AT_CAP,
    why: WHY_AT_CAP,
  };

  test("frame 1 shows the whole brand", () => {
    const frame = GEAR_SPOTLIGHT.build(input(1, details))
      .frame as SpotlightFrame;
    expect(frame.brand?.text).toBe(BRAND_AT_CAP);
  });

  test("frame 2 shows the whole Best for and Why", () => {
    const frame = GEAR_SPOTLIGHT.build(input(2, details)).frame as DetailsFrame;
    expect(frame.why?.text).toBe(WHY_AT_CAP);
    expect(frame.tiles.find((t) => t.label === "Best for")?.value.text).toBe(
      BEST_FOR_AT_CAP,
    );
  });
});

describe("gearPostDetails", () => {
  test("reads template_text first", () => {
    expect(
      gearPostDetails({
        template_text: { brand: "Burton", why: "Warm." },
        gear_brand: "Old",
        gear_best_for: "Beginners",
        gear_why: null,
      }),
    ).toEqual({ brand: "Burton", best_for: "Beginners", why: "Warm." });
  });

  test("falls back to the old columns", () => {
    expect(
      gearPostDetails({ gear_brand: "Burton", gear_best_for: null }),
    ).toEqual({ brand: "Burton", best_for: null, why: null });
  });
});

describe("photo choice (#1925)", () => {
  test("keeps a choice of the record's media and drops the default", () => {
    expect(
      normalizeTemplateText(GEAR_SPOTLIGHT, null, { photo: "none" }),
    ).toEqual({ text: { photo: "none" } });
    expect(
      normalizeTemplateText(GEAR_SPOTLIGHT, null, {
        photo: "event_media:0b6f6a8e-3c1d-4b8e-9a51-2f3c4d5e6f70",
      }),
    ).toEqual({
      text: { photo: "event_media:0b6f6a8e-3c1d-4b8e-9a51-2f3c4d5e6f70" },
    });
    expect(normalizeTemplateText(GEAR_SPOTLIGHT, null, { photo: "" })).toEqual({
      text: {},
    });
  });

  test("refuses anything that isn't a media choice", () => {
    expect(
      normalizeTemplateText(GEAR_SPOTLIGHT, null, {
        photo: "https://example.org/x.jpg",
      }),
    ).toEqual({ error: "Choose a photo from the list." });
  });
});

describe("templatesFor (#1925)", () => {
  test("offers a template for the post's record and format", () => {
    expect(
      templatesFor({
        recordKinds: ["inventory_item"],
        postFormat: "instagram_story",
        off: [],
      }),
    ).toEqual(["gear_spotlight"]);
  });

  test("not for another format, another record, or once switched off", () => {
    const fits = (patch: Partial<Parameters<typeof templatesFor>[0]>) =>
      templatesFor({
        recordKinds: ["inventory_item"],
        postFormat: "instagram_story",
        off: [],
        ...patch,
      });
    expect(fits({ postFormat: "instagram_post" })).toEqual([]);
    expect(fits({ postFormat: "instagram_reel" })).toEqual([]);
    expect(fits({ postFormat: null })).toEqual([]);
    expect(fits({ recordKinds: ["event"] })).toEqual([]);
    expect(fits({ off: ["gear_spotlight"] })).toEqual([]);
  });

  test("maps post formats to template formats", () => {
    expect(templateFormat("instagram_story")).toBe("story");
    expect(templateFormat("instagram_post")).toBe("post");
    expect(templateFormat("instagram_reel")).toBeNull();
  });
});

describe("parsePostTemplatesOff (#1925)", () => {
  test("keeps known template keys only", () => {
    expect(parsePostTemplatesOff(["gear_spotlight", "nope", 3])).toEqual([
      "gear_spotlight",
    ]);
    expect(parsePostTemplatesOff(null)).toEqual([]);
    expect(parsePostTemplatesOff({ gear_spotlight: true })).toEqual([]);
  });
});
