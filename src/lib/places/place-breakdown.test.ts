import { describe, expect, test } from "bun:test";
import {
  placeBreakdown,
  placeReach,
  placeReachSummary,
  type PlaceCountRow,
} from "./place-breakdown";

const BROOKLYN = { id: "bk", kind: "borough", label: "Brooklyn, NY" };
const BRONX = { id: "bx", kind: "borough", label: "Bronx, NY" };
const ESSEX = { id: "essex", kind: "county", label: "Essex County, NJ" };
const INDIANA = { id: "in", kind: "state", label: "Indiana" };

function row(
  region: { id: string; kind: string; label: string } | null,
  place: { id: string; label: string } | null,
  registrations: number,
  question_id: string | null = "q1",
): PlaceCountRow {
  return {
    question_id,
    place_id: place?.id ?? null,
    place_kind: place ? "locality" : null,
    place_label: place?.label ?? null,
    region_id: region?.id ?? null,
    region_kind: region?.kind ?? null,
    region_label: region?.label ?? null,
    registrations,
  };
}

const rows: PlaceCountRow[] = [
  row(BROOKLYN, { id: "wburg", label: "Williamsburg, Brooklyn" }, 3),
  row(BROOKLYN, { id: "bushwick", label: "Bushwick, Brooklyn" }, 3),
  row(BROOKLYN, BROOKLYN, 2),
  row(ESSEX, { id: "montclair", label: "Montclair Twp, Essex Co., NJ" }, 1),
  row(null, null, 2),
  row(BRONX, { id: "mott", label: "Mott Haven, Bronx" }, 5, "q2"),
];

describe("placeBreakdown", () => {
  test("groups one question by region, then place, with Other", () => {
    const breakdown = placeBreakdown(rows, "q1");
    expect(breakdown.total).toBe(11);
    expect(breakdown.other).toBe(2);
    expect(breakdown.regions.map((region) => region.label)).toEqual([
      "Brooklyn, NY",
      "Essex County, NJ",
    ]);
    const [brooklyn] = breakdown.regions;
    expect(brooklyn.registrations).toBe(8);
    expect(brooklyn.regionOnly).toBe(2);
    // Ties fall back to the label.
    expect(brooklyn.places.map((place) => place.label)).toEqual([
      "Bushwick, Brooklyn",
      "Williamsburg, Brooklyn",
    ]);
  });

  test("covers every question when none is named", () => {
    expect(placeBreakdown(rows).total).toBe(16);
  });
});

describe("placeReach", () => {
  test("counts distinct places and regions across questions", () => {
    const reach = placeReach(rows)!;
    expect(reach.places).toBe(5);
    expect(reach.regions).toBe(3);
    expect(reach.regionKinds).toEqual({ borough: 2, county: 1, state: 0 });
  });

  test("never names a region a single registration came from", () => {
    const reach = placeReach(rows)!;
    expect(reach.named.map((region) => region.label)).toEqual([
      "Brooklyn, NY",
      "Bronx, NY",
    ]);
    expect(reach.elsewhere).toBe(1);
    expect(placeReachSummary(reach)).toBe(
      "Registrants from 5 places in 2 boroughs and 1 county: 3 in Brooklyn, NY, 1 in Bronx, NY, and 1 elsewhere.",
    );
  });

  test("is totals only when no region has two registrations", () => {
    const reach = placeReach([
      row(ESSEX, { id: "montclair", label: "Montclair" }, 1),
      row(INDIANA, { id: "wb", label: "Williamsburg, IN" }, 1),
    ])!;
    expect(reach.named).toEqual([]);
    expect(placeReachSummary(reach)).toBe(
      "Registrants from 2 places in 1 county and 1 state.",
    );
  });

  test("is null with nothing but Other", () => {
    expect(placeReach([row(null, null, 4)])).toBeNull();
  });
});
