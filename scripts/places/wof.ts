// The pure half of the neighborhood loader (#1700): Who's On First records
// for one city in, `places` neighborhood rows out. No I/O here;
// `scripts/places-neighborhoods.ts` fetches the records and writes the
// migration.
//
// Loaded on demand, one city at a time, for the cities tenants' service areas
// include -- never the whole US. NYC has the 2020 NTAs instead, and NJ is
// county -> municipality by design (#1698), with its sections as aliases.

/** The properties of a WOF record the loader reads. */
export type WofRecord = {
  "wof:id": number;
  "wof:name"?: string;
  "wof:placetype"?: string;
  "wof:superseded_by"?: number[];
  "mz:is_current"?: number;
  "edtf:deprecated"?: string;
  "edtf:cessation"?: string;
  /** Where the record's data came from; what its license follows. */
  "src:geom"?: string;
};

/**
 * WOF sources whose data is CC0 or public domain, by `src:geom`. WOF is mostly
 * CC0, but a record built on Quattroshapes, Zetashapes, GeoPlanet, GeoNames
 * (CC-BY) or a city's own data (each with its own terms) is not, and is left
 * out. Add a source here only after reading its entry in
 * https://github.com/whosonfirst/whosonfirst-sources; a CC-BY one also needs
 * a credit wherever the platform lists data credits.
 */
export const OPEN_WOF_SOURCES = new Set([
  "whosonfirst",
  "mz",
  "meso",
  "wikidata",
  "uscensus",
  "naturalearth",
]);

/** Neighbourhoods and the macrohoods that group them ("Center City"). */
export const WOF_PLACETYPES = ["neighbourhood", "macrohood"] as const;

export type WofRow = { key: string; name: string };
export type WofSkip = { id: number; name: string; reason: string };

function isCurrent(record: WofRecord): boolean {
  if (record["mz:is_current"] === 0) return false;
  const deprecated = record["edtf:deprecated"];
  if (deprecated && deprecated !== "uuuu") return false;
  const cessation = record["edtf:cessation"];
  if (cessation && cessation !== "uuuu") return false;
  return (record["wof:superseded_by"] ?? []).length === 0;
}

/**
 * The rows to load for one city, and why each other record was left out. A
 * name that repeats (WOF can hold a neighbourhood and a macrohood of one name)
 * is loaded once, from the lowest id.
 */
export function wofRows(records: WofRecord[]): {
  rows: WofRow[];
  skipped: WofSkip[];
} {
  const rows: WofRow[] = [];
  const skipped: WofSkip[] = [];
  const names = new Set<string>();
  const sorted = [...records].sort((a, b) => a["wof:id"] - b["wof:id"]);
  for (const record of sorted) {
    const id = record["wof:id"];
    const name = (record["wof:name"] ?? "").trim();
    const skip = (reason: string) => skipped.push({ id, name, reason });
    if (!name) skip("no name");
    else if (
      !(WOF_PLACETYPES as readonly string[]).includes(
        record["wof:placetype"] ?? "",
      )
    )
      skip(`placetype ${record["wof:placetype"]}`);
    else if (!isCurrent(record)) skip("not current");
    else if (!OPEN_WOF_SOURCES.has(record["src:geom"] ?? ""))
      skip(`source ${record["src:geom"] ?? "unknown"} is not CC0`);
    else if (names.has(name.toLowerCase())) skip("duplicate name");
    else {
      names.add(name.toLowerCase());
      rows.push({ key: `wof:${id}`, name });
    }
  }
  return { rows, skipped };
}

/** "101718083" -> "101/718/083/101718083.geojson", WOF's own layout. */
export function wofPath(id: number): string {
  const digits = String(id);
  const parts = digits.match(/.{1,3}/g) ?? [digits];
  return `${parts.join("/")}/${digits}.geojson`;
}
