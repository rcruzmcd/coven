/**
 * Where registrants come from (#1701): breakdowns of `place` answers (#1699),
 * every count derived from the answers, never typed.
 *
 * The rows are `place_answer_counts()`'s, read through
 * get_event_place_breakdown() or get_program_place_reach(): registrations per
 * question and place, each place with its region -- the county or NYC
 * borough it lies in, else its state (`place_regions()`). A row with no
 * `place_id` is Other: "Not listed" text, or a place the dataset no longer
 * has.
 */

export type PlaceRegionKind = "borough" | "county" | "state";

export type PlaceCountRow = {
  question_id: string | null;
  place_id: string | null;
  place_kind: string | null;
  place_label: string | null;
  region_id: string | null;
  region_kind: string | null;
  region_label: string | null;
  registrations: number;
};

export type PlaceBreakdownPlace = {
  id: string;
  label: string;
  registrations: number;
};

export type PlaceBreakdownRegion = {
  id: string;
  label: string;
  kind: PlaceRegionKind;
  registrations: number;
  /**
   * The localities and neighborhoods under it, most registrations first.
   * Answers naming the region itself (a borough picked at city/town
   * granularity) are counted in `registrations` and as `regionOnly`.
   */
  places: PlaceBreakdownPlace[];
  regionOnly: number;
};

export type PlaceBreakdown = {
  /** Registrations that answered: every region plus Other. */
  total: number;
  regions: PlaceBreakdownRegion[];
  other: number;
};

function regionKind(kind: string | null): PlaceRegionKind {
  return kind === "borough" || kind === "state" ? kind : "county";
}

function byCountThenLabel<T extends { registrations: number; label: string }>(
  a: T,
  b: T,
): number {
  return b.registrations - a.registrations || a.label.localeCompare(b.label);
}

/**
 * One question's breakdown, or every row's when `questionId` is omitted:
 * registrations by region, then by place within it, plus Other.
 */
export function placeBreakdown(
  rows: readonly PlaceCountRow[],
  questionId?: string,
): PlaceBreakdown {
  const regions = new Map<string, PlaceBreakdownRegion>();
  const places = new Map<string, Map<string, PlaceBreakdownPlace>>();
  let other = 0;

  for (const row of rows) {
    if (questionId !== undefined && row.question_id !== questionId) continue;
    const count = Number(row.registrations) || 0;
    if (!row.place_id || !row.region_id) {
      other += count;
      continue;
    }
    let region = regions.get(row.region_id);
    if (!region) {
      region = {
        id: row.region_id,
        label: row.region_label ?? "",
        kind: regionKind(row.region_kind),
        registrations: 0,
        places: [],
        regionOnly: 0,
      };
      regions.set(row.region_id, region);
      places.set(row.region_id, new Map());
    }
    region.registrations += count;
    if (row.place_id === row.region_id) {
      region.regionOnly += count;
      continue;
    }
    const inRegion = places.get(row.region_id)!;
    const place = inRegion.get(row.place_id);
    if (place) place.registrations += count;
    else
      inRegion.set(row.place_id, {
        id: row.place_id,
        label: row.place_label ?? "",
        registrations: count,
      });
  }

  const list = [...regions.values()].map((region) => ({
    ...region,
    places: [...places.get(region.id)!.values()].sort(byCountThenLabel),
  }));
  list.sort(byCountThenLabel);
  const total = list.reduce((sum, region) => sum + region.registrations, other);
  return { total, regions: list, other };
}

/**
 * The fewest registrations a region needs before a summary meant for outside
 * eyes names it. One registrant in a region is one person's town.
 */
export const PUBLIC_MIN_REGISTRATIONS = 2;

/** How many regions a summary names before the rest are "elsewhere". */
const SUMMARY_REGIONS = 3;

export type PlaceReach = {
  /** Distinct places named, across every question. */
  places: number;
  /** Distinct regions those places lie in. */
  regions: number;
  regionKinds: Record<PlaceRegionKind, number>;
  /**
   * The regions a summary may name, with the distinct places in each: only
   * those with at least PUBLIC_MIN_REGISTRATIONS registrations.
   */
  named: { label: string; places: number }[];
  /** Distinct places in regions the summary does not name. */
  elsewhere: number;
};

/**
 * Distinct places reached (#1701), for the Results card and the Program
 * Impact Report: totals only, and a region named only when more than one
 * registration came from it.
 */
export function placeReach(rows: readonly PlaceCountRow[]): PlaceReach | null {
  const regions = new Map<
    string,
    {
      label: string;
      kind: PlaceRegionKind;
      registrations: number;
      places: Set<string>;
    }
  >();
  for (const row of rows) {
    if (!row.place_id || !row.region_id) continue;
    let region = regions.get(row.region_id);
    if (!region) {
      region = {
        label: row.region_label ?? "",
        kind: regionKind(row.region_kind),
        registrations: 0,
        places: new Set(),
      };
      regions.set(row.region_id, region);
    }
    region.registrations += Number(row.registrations) || 0;
    region.places.add(row.place_id);
  }
  if (regions.size === 0) return null;

  const regionKinds: Record<PlaceRegionKind, number> = {
    borough: 0,
    county: 0,
    state: 0,
  };
  let places = 0;
  for (const region of regions.values()) {
    regionKinds[region.kind] += 1;
    places += region.places.size;
  }

  const ranked = [...regions.values()]
    .filter((region) => region.registrations >= PUBLIC_MIN_REGISTRATIONS)
    .map((region) => ({
      label: region.label,
      places: region.places.size,
      registrations: region.registrations,
    }))
    .sort(
      (a, b) =>
        b.places - a.places ||
        b.registrations - a.registrations ||
        a.label.localeCompare(b.label),
    )
    .slice(0, SUMMARY_REGIONS);
  const named = ranked.map(({ label, places: count }) => ({
    label,
    places: count,
  }));
  const elsewhere = places - named.reduce((sum, row) => sum + row.places, 0);

  return { places, regions: regions.size, regionKinds, named, elsewhere };
}

function counted(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
}

function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "2 boroughs and 1 county". */
export function regionCountText(
  kinds: Record<PlaceRegionKind, number>,
): string {
  const nouns = [
    ["borough", "boroughs"],
    ["county", "counties"],
    ["state", "states"],
  ] as const;
  return joinWithAnd(
    nouns.flatMap(([kind, many]) =>
      kinds[kind] > 0 ? [counted(kinds[kind], kind, many)] : [],
    ),
  );
}

/**
 * The sentence a report can quote: "Registrants from 23 places in 2 boroughs
 * and 1 county: 14 in Bronx, NY, 6 in Essex County, NJ, and 3 elsewhere."
 */
export function placeReachSummary(reach: PlaceReach): string {
  const head = `Registrants from ${counted(reach.places, "place", "places")} in ${regionCountText(reach.regionKinds)}`;
  if (reach.named.length === 0 || reach.regions === 1) return `${head}.`;
  const parts = reach.named.map(
    (region) => `${region.places.toLocaleString("en-US")} in ${region.label}`,
  );
  if (reach.elsewhere > 0)
    parts.push(`${reach.elsewhere.toLocaleString("en-US")} elsewhere`);
  // A serial comma here, since the items themselves hold commas ("Bronx,
  // NY").
  const list =
    parts.length > 2
      ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`
      : joinWithAnd(parts);
  return `${head}: ${list}.`;
}
