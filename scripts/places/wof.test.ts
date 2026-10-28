import { describe, expect, test } from "bun:test";
import { wofPath, wofRows, type WofRecord } from "./wof";

const record = (
  id: number,
  name: string,
  overrides: Partial<WofRecord> = {},
): WofRecord => ({
  "wof:id": id,
  "wof:name": name,
  "wof:placetype": "neighbourhood",
  "mz:is_current": 1,
  "src:geom": "whosonfirst",
  ...overrides,
});

describe("wofRows", () => {
  test("loads current CC0 neighbourhoods and macrohoods", () => {
    const { rows, skipped } = wofRows([
      record(2, "Germantown", { "src:geom": "mz" }),
      record(1, "Center City", { "wof:placetype": "macrohood" }),
    ]);
    expect(rows).toEqual([
      { key: "wof:1", name: "Center City" },
      { key: "wof:2", name: "Germantown" },
    ]);
    expect(skipped).toEqual([]);
  });

  test("leaves out records that are not CC0, and says why", () => {
    const { rows, skipped } = wofRows([
      record(1, "Fishtown", { "src:geom": "azavea" }),
      record(2, "Tabor", { "src:geom": "quattroshapes" }),
      record(3, "Nameless", { "src:geom": undefined }),
    ]);
    expect(rows).toEqual([]);
    expect(skipped.map((skip) => skip.reason)).toEqual([
      "source azavea is not CC0",
      "source quattroshapes is not CC0",
      "source unknown is not CC0",
    ]);
  });

  test("leaves out deprecated, ceased and superseded records", () => {
    const { rows, skipped } = wofRows([
      record(1, "Old", { "mz:is_current": 0 }),
      record(2, "Deprecated", { "edtf:deprecated": "2016-10-17" }),
      record(3, "Ceased", { "edtf:cessation": "2001" }),
      record(4, "Superseded", { "wof:superseded_by": [5] }),
      record(5, "Unknown end", { "edtf:cessation": "uuuu" }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Unknown end"]);
    expect(skipped.every((skip) => skip.reason === "not current")).toBe(true);
  });

  test("leaves out microhoods, nameless records and repeated names", () => {
    const { rows, skipped } = wofRows([
      record(1, "Italian Market", { "wof:placetype": "microhood" }),
      record(2, " "),
      record(4, "Logan", { "wof:placetype": "macrohood" }),
      record(3, "logan"),
    ]);
    expect(rows).toEqual([{ key: "wof:3", name: "logan" }]);
    expect(skipped.map((skip) => skip.reason)).toEqual([
      "placetype microhood",
      "no name",
      "duplicate name",
    ]);
  });
});

test("wofPath splits the id into WOF's directories", () => {
  expect(wofPath(101718083)).toBe("101/718/083/101718083.geojson");
  expect(wofPath(1108723393)).toBe("110/872/339/3/1108723393.geojson");
  expect(wofPath(85977539)).toBe("859/775/39/85977539.geojson");
});
