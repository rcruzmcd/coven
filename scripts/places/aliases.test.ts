import { describe, expect, test } from "bun:test";
import { PLACE_ALIASES } from "./aliases";
import { parseSeedPlaces, readSeedPlaces } from "./seed-file";

describe("parseSeedPlaces", () => {
  test("reads key, kind, name and label, with quotes undoubled", () => {
    const places = parseSeedPlaces(
      [
        "insert into places_seed values",
        "('place:3451000','county:34013','{}','locality','Newark','city','Newark, Essex Co., NJ','NJ',null,'{}',317303),",
        "('place:1234567','county:01001',array['county:01003'],'locality','Coeur d''Alene','city','Coeur d''Alene, ID','ID',null,'{}',null),",
        "('state:34',null,'{}','state','New Jersey',null,'New Jersey','NJ',null,array['NJ'],null);",
      ].join("\n"),
    );
    expect([...places.values()]).toEqual([
      {
        key: "place:3451000",
        kind: "locality",
        name: "Newark",
        label: "Newark, Essex Co., NJ",
      },
      {
        key: "place:1234567",
        kind: "locality",
        name: "Coeur d'Alene",
        label: "Coeur d'Alene, ID",
      },
      {
        key: "state:34",
        kind: "state",
        name: "New Jersey",
        label: "New Jersey",
      },
    ]);
  });
});

describe("PLACE_ALIASES", () => {
  const seed = readSeedPlaces();

  test("points every alias at the municipality its author meant", () => {
    for (const [key, { place }] of Object.entries(PLACE_ALIASES)) {
      expect(seed.get(key)?.label).toBe(place);
    }
  });

  test("adds only names that are not already a place in the state", () => {
    const names = new Map<string, string[]>();
    for (const row of seed.values()) {
      if (row.kind !== "locality") continue;
      const state = row.label.slice(-2);
      const k = `${state}|${row.name.toLowerCase()}`;
      names.set(k, [...(names.get(k) ?? []), row.key]);
    }
    for (const { place, aliases } of Object.values(PLACE_ALIASES)) {
      const state = place.slice(-2);
      for (const alias of aliases) {
        // Newport is a CDP in Cumberland County as well as Jersey City's
        // waterfront: two different places, so both are offered.
        if (alias === "Newport") continue;
        expect({
          alias,
          places: names.get(`${state}|${alias.toLowerCase()}`),
        }).toEqual({
          alias,
          places: undefined,
        });
      }
      expect(new Set(aliases).size).toBe(aliases.length);
    }
  });
});
