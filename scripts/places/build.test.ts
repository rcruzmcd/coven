import { describe, expect, test } from "bun:test";
import {
  buildPlaces,
  shortCountyName,
  splitCensusName,
  type BuildInput,
} from "./build";

// A slice of the real Census rows: NJ's repeated municipal names, NYC, a
// consolidated city and a CDP that sits inside a township of its name.
function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    states: [
      { usps: "NJ", fips: "34", name: "New Jersey" },
      { usps: "NY", fips: "36", name: "New York" },
      { usps: "TN", fips: "47", name: "Tennessee" },
    ],
    counties: [
      { usps: "NJ", geoid: "34013", name: "Essex County" },
      { usps: "NJ", geoid: "34027", name: "Morris County" },
      { usps: "NJ", geoid: "34029", name: "Ocean County" },
      { usps: "NJ", geoid: "34041", name: "Warren County" },
      { usps: "NY", geoid: "36047", name: "Kings County" },
      { usps: "TN", geoid: "47037", name: "Davidson County" },
    ],
    cousubs: [
      {
        usps: "NJ",
        geoid: "3401347500",
        name: "Montclair township",
        funcstat: "A",
      },
      {
        usps: "NJ",
        geoid: "3402777240",
        name: "Washington township",
        funcstat: "A",
      },
      {
        usps: "NJ",
        geoid: "3404177300",
        name: "Washington township",
        funcstat: "A",
      },
      {
        usps: "NJ",
        geoid: "3404177270",
        name: "Washington borough",
        funcstat: "F",
      },
      {
        usps: "NJ",
        geoid: "3402973125",
        name: "Toms River township",
        funcstat: "A",
      },
      { usps: "NJ", geoid: "3401351000", name: "Newark city", funcstat: "F" },
      {
        usps: "NY",
        geoid: "3604710022",
        name: "Brooklyn borough",
        funcstat: "G",
      },
      { usps: "TN", geoid: "4703792600", name: "Nashville CCD", funcstat: "S" },
    ],
    places: [
      {
        usps: "NJ",
        geoid: "3477270",
        name: "Washington borough",
        funcstat: "A",
      },
      { usps: "NJ", geoid: "3451000", name: "Newark city", funcstat: "A" },
      { usps: "NJ", geoid: "3473125", name: "Toms River CDP", funcstat: "S" },
      { usps: "NY", geoid: "3651000", name: "New York city", funcstat: "A" },
      {
        usps: "TN",
        geoid: "4752006",
        name: "Nashville-Davidson metropolitan government (balance)",
        funcstat: "F",
      },
    ],
    placeCounties: [
      { placeGeoid: "3477270", countyGeoid: "34041" },
      { placeGeoid: "3451000", countyGeoid: "34013" },
      { placeGeoid: "3473125", countyGeoid: "34029" },
      { placeGeoid: "3651000", countyGeoid: "36047" },
      { placeGeoid: "4752006", countyGeoid: "47037" },
    ],
    ntas: [
      { code: "BK0101", name: "Greenpoint", borough: "Brooklyn", ntaType: "0" },
      {
        code: "BK0102",
        name: "Williamsburg",
        borough: "Brooklyn",
        ntaType: "0",
      },
      {
        code: "BK0261",
        name: "Brooklyn Navy Yard",
        borough: "Brooklyn",
        ntaType: "6",
      },
    ],
    populations: new Map([
      ["county:36047", 2_600_000],
      ["place:3451000", 311_000],
    ]),
    ...overrides,
  };
}

const labels = (rows: ReturnType<typeof buildPlaces>) =>
  rows.filter((row) => row.kind === "locality").map((row) => row.label);

describe("splitCensusName", () => {
  test("turns the suffix into a type", () => {
    expect(splitCensusName("Montclair township")).toEqual({
      name: "Montclair",
      placeType: "township",
    });
    expect(splitCensusName("Clinton charter township")).toEqual({
      name: "Clinton",
      placeType: "charter township",
    });
    expect(splitCensusName("Princeton")).toEqual({
      name: "Princeton",
      placeType: null,
    });
  });

  test("reads a consolidated government as the city", () => {
    expect(
      splitCensusName("Nashville-Davidson metropolitan government (balance)"),
    ).toEqual({ name: "Nashville-Davidson", placeType: "city" });
  });
});

describe("shortCountyName", () => {
  test("abbreviates County and leaves other county equivalents alone", () => {
    expect(shortCountyName("Essex County")).toBe("Essex Co.");
    expect(shortCountyName("Orleans Parish")).toBe("Orleans Parish");
  });
});

describe("buildPlaces", () => {
  test("tells NJ's repeated names apart by type and county", () => {
    expect(labels(buildPlaces(input()))).toEqual(
      expect.arrayContaining([
        "Montclair Twp, Essex Co., NJ",
        "Washington Twp, Morris Co., NJ",
        "Washington Twp, Warren Co., NJ",
        "Washington Boro, Warren Co., NJ",
        "Newark, Essex Co., NJ",
      ]),
    );
    const all = labels(buildPlaces(input()));
    expect(new Set(all).size).toBe(all.length);
  });

  test("collapses a county subdivision into the place it is", () => {
    const rows = buildPlaces(input());
    const newark = rows.filter((row) => row.name === "Newark");
    expect(newark).toHaveLength(1);
    expect(newark[0].key).toBe("place:3451000");
    expect(
      rows.filter(
        (row) => row.name === "Washington" && row.placeType === "borough",
      ),
    ).toHaveLength(1);
  });

  test("drops a CDP named like the municipality around it", () => {
    const toms = buildPlaces(input()).filter(
      (row) => row.name === "Toms River",
    );
    expect(toms.map((row) => row.placeType)).toEqual(["township"]);
  });

  test("makes NYC's counties boroughs, with NYC's own names as aliases", () => {
    const rows = buildPlaces(input());
    const brooklyn = rows.find((row) => row.key === "county:36047");
    expect(brooklyn).toMatchObject({
      kind: "borough",
      name: "Brooklyn",
      label: "Brooklyn, NY",
    });
    expect(brooklyn?.aliases).toEqual(
      expect.arrayContaining(["Kings County", "New York City", "NYC"]),
    );
    // NYC itself and the borough-coextensive cousub are the borough.
    expect(rows.some((row) => row.key === "place:3651000")).toBe(false);
    expect(rows.some((row) => row.key === "cousub:3604710022")).toBe(false);
  });

  test("hangs residential NTAs off their borough and skips special-use ones", () => {
    const rows = buildPlaces(input());
    const neighborhoods = rows.filter((row) => row.kind === "neighborhood");
    expect(neighborhoods.map((row) => row.label)).toEqual([
      "Greenpoint, Brooklyn",
      "Williamsburg, Brooklyn",
    ]);
    expect(neighborhoods[0].parentKey).toBe("county:36047");
    // The borough's average, so a neighborhood ranks like the place it is.
    expect(neighborhoods[0].population).toBe(1_300_000);
  });

  test("keeps a consolidated city's balance, found by its everyday name", () => {
    const nashville = buildPlaces(input()).find(
      (row) => row.key === "place:4752006",
    );
    expect(nashville).toMatchObject({
      label: "Nashville-Davidson, TN",
      aliases: ["Nashville"],
    });
  });

  test("leaves statistical county subdivisions out", () => {
    expect(
      buildPlaces(input()).some((row) => row.key === "cousub:4703792600"),
    ).toBe(false);
  });

  test("names the county outside NJ only where a name repeats in the state", () => {
    const rows = buildPlaces(
      input({
        states: [{ usps: "IL", fips: "17", name: "Illinois" }],
        counties: [
          { usps: "IL", geoid: "17167", name: "Sangamon County" },
          { usps: "IL", geoid: "17015", name: "Carroll County" },
          { usps: "IL", geoid: "17179", name: "Tazewell County" },
        ],
        cousubs: [
          {
            usps: "IL",
            geoid: "1701579020",
            name: "Washington township",
            funcstat: "A",
          },
          {
            usps: "IL",
            geoid: "1717979046",
            name: "Washington township",
            funcstat: "A",
          },
        ],
        places: [
          {
            usps: "IL",
            geoid: "1772000",
            name: "Springfield city",
            funcstat: "A",
          },
        ],
        placeCounties: [{ placeGeoid: "1772000", countyGeoid: "17167" }],
        ntas: [],
      }),
    );
    expect(labels(rows).sort()).toEqual([
      "Springfield, IL",
      "Washington Twp, Carroll Co., IL",
      "Washington Twp, Tazewell Co., IL",
    ]);
  });
});
