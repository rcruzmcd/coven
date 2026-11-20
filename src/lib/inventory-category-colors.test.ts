import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ACCENT_STOPS,
  EMPTY_BRANDING,
  type Branding,
} from "@/lib/branding";
import { contrastRatio } from "@/lib/color-contrast";
import {
  PILL_TEXT_CONTRAST,
  categoryAccent,
  categoryStop,
  groupStop,
  pillTextColor,
  wrapStop,
  type AccentGroup,
} from "./inventory-category-colors";

const groups: AccentGroup[] = [
  { id: "c", sort_order: 30, accent_stop: null },
  { id: "a", sort_order: 10, accent_stop: null },
  { id: "b", sort_order: 20, accent_stop: null },
];

describe("default colour cycle", () => {
  test("groups with nothing set take their place in sort_order", () => {
    expect(groupStop(groups[1], groups)).toBe(0);
    expect(groupStop(groups[2], groups)).toBe(1);
    expect(groupStop(groups[0], groups)).toBe(2);
  });

  test("the cycle wraps past the last stop", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `g${i}`,
      sort_order: i,
      accent_stop: null,
    }));
    const accent = categoryAccent(
      { group_id: "g7", accent_stop: null },
      many,
      EMPTY_BRANDING,
    );
    expect(accent.stop).toBe(7 % DEFAULT_ACCENT_STOPS.length);
    expect(accent.color).toBe(DEFAULT_ACCENT_STOPS[1]);
  });

  test("equal sort_order breaks on id, so every read agrees", () => {
    const tied = [
      { id: "z", sort_order: 0, accent_stop: null },
      { id: "y", sort_order: 0, accent_stop: null },
    ];
    expect(groupStop(tied[1], tied)).toBe(0);
    expect(groupStop(tied[0], tied)).toBe(1);
  });

  test("a group's own stop beats its position", () => {
    const set = groups.map((g) =>
      g.id === "a" ? { ...g, accent_stop: 4 } : g,
    );
    expect(groupStop(set[1], set)).toBe(4);
    // The others keep their place: setting one colour does not repaint the rest.
    expect(groupStop(set[2], set)).toBe(1);
  });

  test("a category without a colour takes its group's", () => {
    expect(categoryStop({ group_id: "b", accent_stop: null }, groups)).toBe(1);
  });

  test("a category's own colour beats its group's", () => {
    expect(categoryStop({ group_id: "b", accent_stop: 5 }, groups)).toBe(5);
  });

  test("an uncategorized item takes the first stop", () => {
    expect(categoryAccent(null, groups, EMPTY_BRANDING).stop).toBe(0);
  });
});

describe("the tenant's palette", () => {
  const branding: Branding = {
    ...EMPTY_BRANDING,
    accentStops: ["#111111", "#eeeeee"],
    colors: { primary_deep: "#202020" },
  };

  test("colours come from the tenant's stops, not the platform's", () => {
    const accent = categoryAccent(
      { group_id: "b", accent_stop: null },
      groups,
      branding,
    );
    expect(accent.color).toBe("#eeeeee");
  });

  test("a stop past a shrunken palette wraps onto a real colour", () => {
    expect(wrapStop(5, 2)).toBe(1);
    expect(
      categoryAccent({ group_id: "a", accent_stop: 7 }, groups, branding).color,
    ).toBe("#eeeeee");
  });
});

describe("pill text contrast", () => {
  const deep = "#32134f";

  test("white on a dark stop", () => {
    expect(pillTextColor("#8f55ba", deep)).toBe("#ffffff");
  });

  test("the deep colour on a light stop", () => {
    expect(pillTextColor("#f4d35e", deep)).toBe(deep);
  });

  test("whatever it picks reaches 4.5:1 when either candidate can", () => {
    for (const stop of DEFAULT_ACCENT_STOPS) {
      const text = pillTextColor(stop, deep);
      const best = Math.max(
        contrastRatio("#ffffff", stop),
        contrastRatio(deep, stop),
      );
      if (best >= PILL_TEXT_CONTRAST) {
        expect(contrastRatio(text, stop)).toBeGreaterThanOrEqual(
          PILL_TEXT_CONTRAST,
        );
      } else {
        expect(contrastRatio(text, stop)).toBe(best);
      }
    }
  });

  test("the tenant's own deep colour is the dark candidate", () => {
    const accent = categoryAccent({ group_id: "a", accent_stop: 0 }, groups, {
      ...EMPTY_BRANDING,
      accentStops: ["#f4d35e"],
      colors: { primary_deep: "#102030" },
    });
    expect(accent.text).toBe("#102030");
  });
});
