// The pure half of the ZIP shortcut (#1700): Census 2020 ZCTA relationship
// rows in, `place_zips` rows out. No I/O here; `scripts/places-overlays.ts`
// downloads the files and writes the migration.
//
// A ZIP is a mail route, not a place: it crosses municipal lines, and an NYC
// ZIP covers parts of several neighborhoods. So a ZIP maps to every place it
// meaningfully overlaps and the registrant picks one. Overlap is land area,
// the only measure the relationship files give.

/** One row of a Census ZCTA relationship file, by land area. */
export type ZctaPart = {
  zcta: string;
  /** The ZCTA's whole land area, m². */
  zctaLand: number;
  /** The other geography's GEOID: a place, county subdivision, county or tract. */
  geoid: string;
  /** The other geography's whole land area, m². */
  otherLand: number;
  /** The land the two share, m². */
  partLand: number;
};

export type ZipRow = { zip: string; key: string; share: number };

/**
 * A place is suggested for a ZIP when it covers at least this much of the
 * ZIP's land. Below it is a sliver along a boundary.
 */
export const MIN_ZIP_SHARE = 0.05;

/**
 * ...or when the ZIP covers at least this much of the place: a small borough
 * inside a large rural ZIP is a few percent of the ZIP but all of the town.
 */
export const MIN_PLACE_SHARE = 0.5;

/**
 * Collapses relationship rows to (zip, place key) pairs. `keyOf` maps a GEOID
 * to the places row key it belongs to, or null where we have no such place
 * (a statistical county subdivision, a non-residential NTA's tract); several
 * GEOIDs may map to one key, as an NTA's tracts do, and their land is summed.
 * Only keys in `known` are kept, so the migration names no missing place.
 */
export function zipRows(
  parts: ZctaPart[],
  keyOf: (geoid: string) => string | null,
  known: Set<string>,
): ZipRow[] {
  // Land per (zip, key), and each key's whole land, summed over its GEOIDs.
  const pairLand = new Map<string, number>();
  const zipLand = new Map<string, number>();
  const keyLand = new Map<string, number>();
  const seenGeoid = new Set<string>();
  for (const part of parts) {
    const key = keyOf(part.geoid);
    if (!key || !known.has(key) || part.partLand <= 0) continue;
    const pair = `${part.zcta}|${key}`;
    pairLand.set(pair, (pairLand.get(pair) ?? 0) + part.partLand);
    zipLand.set(part.zcta, part.zctaLand);
    if (!seenGeoid.has(part.geoid)) {
      seenGeoid.add(part.geoid);
      keyLand.set(key, (keyLand.get(key) ?? 0) + part.otherLand);
    }
  }

  const rows: ZipRow[] = [];
  for (const [pair, land] of pairLand) {
    const [zip, key] = pair.split("|");
    const ofZip = land / (zipLand.get(zip) || 1);
    const ofPlace = land / (keyLand.get(key) || 1);
    if (ofZip >= MIN_ZIP_SHARE || ofPlace >= MIN_PLACE_SHARE) {
      rows.push({
        zip,
        key,
        share: Math.round(Math.min(ofZip, 1) * 1000) / 1000,
      });
    }
  }
  return rows.sort((a, b) =>
    a.zip === b.zip
      ? b.share - a.share || a.key.localeCompare(b.key)
      : a.zip.localeCompare(b.zip),
  );
}

/**
 * Parses a Census 2020 ZCTA relationship file (`tab20_zcta520_*_natl.txt`):
 * pipe-delimited, a header row naming the columns, and rows with no ZCTA for
 * the parts of the other geography outside every ZCTA, which are dropped.
 * `other` is the column suffix of the other geography: PLACE_20, COUSUB_20,
 * COUNTY_20 or TRACT_20. `keep` filters on its GEOID before anything is held.
 */
export function parseZctaRelationship(
  text: string,
  other: string,
  keep: (geoid: string) => boolean = () => true,
): ZctaPart[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split("|");
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`ZCTA relationship file: no ${name} column`);
    return index;
  };
  const zcta = col("GEOID_ZCTA5_20");
  const zctaLand = col("AREALAND_ZCTA5_20");
  const geoid = col(`GEOID_${other}`);
  const otherLand = col(`AREALAND_${other}`);
  const partLand = col("AREALAND_PART");

  const parts: ZctaPart[] = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const fields = line.split("|");
    if (!fields[zcta] || !fields[geoid] || !keep(fields[geoid])) continue;
    parts.push({
      zcta: fields[zcta],
      zctaLand: Number(fields[zctaLand]),
      geoid: fields[geoid],
      otherLand: Number(fields[otherLand]),
      partLand: Number(fields[partLand]),
    });
  }
  return parts;
}
