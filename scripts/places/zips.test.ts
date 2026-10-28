import { describe, expect, test } from "bun:test";
import { parseZctaRelationship, zipRows, type ZctaPart } from "./zips";

const part = (
  zcta: string,
  geoid: string,
  partLand: number,
  zctaLand = 1000,
  otherLand = 10_000,
): ZctaPart => ({ zcta, zctaLand, geoid, otherLand, partLand });

const asPlace = (geoid: string) => `place:${geoid}`;

describe("zipRows", () => {
  test("keeps every place a ZIP meaningfully covers, largest share first", () => {
    const rows = zipRows(
      [
        part("07105", "A", 700),
        part("07105", "B", 260),
        part("07105", "C", 40),
      ],
      asPlace,
      new Set(["place:A", "place:B", "place:C"]),
    );
    // C is 4% of the ZIP and 0.4% of itself: a boundary sliver.
    expect(rows).toEqual([
      { zip: "07105", key: "place:A", share: 0.7 },
      { zip: "07105", key: "place:B", share: 0.26 },
    ]);
  });

  test("keeps a small town that lies mostly inside a large ZIP", () => {
    const rows = zipRows(
      [part("08540", "BORO", 30, 1000, 50), part("08540", "TWP", 970)],
      asPlace,
      new Set(["place:BORO", "place:TWP"]),
    );
    expect(rows.map((row) => row.key)).toEqual(["place:TWP", "place:BORO"]);
  });

  test("names only places the seed has, and drops water-only parts", () => {
    const rows = zipRows(
      [
        part("10001", "A", 500),
        part("10001", "GONE", 500),
        part("10001", "W", 0),
      ],
      asPlace,
      new Set(["place:A", "place:W"]),
    );
    expect(rows.map((row) => row.key)).toEqual(["place:A"]);
  });

  test("sums the tracts that make up one neighborhood", () => {
    const nta = (tract: string) =>
      tract.startsWith("T1") ? "nta:BK0102" : "nta:BK0104";
    const rows = zipRows(
      [
        part("11211", "T1a", 300, 1000, 300),
        part("11211", "T1b", 200, 1000, 200),
        part("11211", "T2", 500, 1000, 600),
      ],
      nta,
      new Set(["nta:BK0102", "nta:BK0104"]),
    );
    expect(rows).toEqual([
      { zip: "11211", key: "nta:BK0102", share: 0.5 },
      { zip: "11211", key: "nta:BK0104", share: 0.5 },
    ]);
  });
});

describe("parseZctaRelationship", () => {
  const file = [
    "﻿OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|FUNCSTAT_ZCTA5_20|OID_PLACE_20|GEOID_PLACE_20|NAMELSAD_PLACE_20|AREALAND_PLACE_20|AREAWATER_PLACE_20|MTFCC_PLACE_20|CLASSFP_PLACE_20|FUNCSTAT_PLACE_20|AREALAND_PART|AREAWATER_PART",
    "||||||||27890103022968|0101852|Anniston city|118685613|180468|G4110|C1|A|9974104|35266",
    "22|07105|ZCTA5 07105|11000000|1|G6350|B5|S|33|3451000|Newark city|62600000|4|G4110|C5|A|10900000|0",
    "",
  ].join("\n");

  test("reads the columns by name and drops parts outside every ZCTA", () => {
    expect(parseZctaRelationship(file, "PLACE_20")).toEqual([
      {
        zcta: "07105",
        zctaLand: 11_000_000,
        geoid: "3451000",
        otherLand: 62_600_000,
        partLand: 10_900_000,
      },
    ]);
  });

  test("filters on the other geography's GEOID", () => {
    expect(
      parseZctaRelationship(file, "PLACE_20", (geoid) =>
        geoid.startsWith("36"),
      ),
    ).toEqual([]);
  });

  test("fails loudly when the file's columns change", () => {
    expect(() => parseZctaRelationship(file, "COUSUB_20")).toThrow(
      "no GEOID_COUSUB_20 column",
    );
  });
});
