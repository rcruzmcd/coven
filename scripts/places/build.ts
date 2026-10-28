// The pure half of the places seed (#1699): Census Gazetteer and NYC NTA rows
// in, `places` rows out. No I/O here, so the dedupe and label rules can be
// unit tested; `scripts/places-seed.ts` downloads the sources and writes the
// migration.
//
// The hierarchy is state -> county (or NYC borough) -> locality -> NYC
// neighborhood. Rows are keyed by a short stable key ("place:3451000",
// "nta:BK0101"), from which the migration derives each id with uuid v5, so a
// rebuilt seed gives an unchanged place the same id.

export type PlaceKind =
  "state" | "county" | "borough" | "locality" | "neighborhood";

export type PlaceRow = {
  key: string;
  parentKey: string | null;
  /** Counties beyond the parent, for a place that spans several. */
  extraCountyKeys: string[];
  kind: PlaceKind;
  name: string;
  /** "city", "township", "borough", "CDP"... -- the Census suffix, as a type. */
  placeType: string | null;
  label: string;
  stateCode: string;
  countyName: string | null;
  source: string;
  sourceId: string;
  aliases: string[];
  /** Census 2024 estimate where there is one; ranks "Newark, NJ" first. */
  population: number | null;
};

export type StateRecord = { usps: string; fips: string; name: string };
export type CountyRecord = { usps: string; geoid: string; name: string };
export type CousubRecord = {
  usps: string;
  geoid: string;
  name: string;
  funcstat: string;
};
export type PlaceRecord = {
  usps: string;
  geoid: string;
  name: string;
  funcstat: string;
};
/** Census 2020 place-by-county: which counties a place lies in. */
export type PlaceCountyRecord = { placeGeoid: string; countyGeoid: string };
export type NtaRecord = {
  code: string;
  name: string;
  borough: string;
  ntaType: string;
};

export const SOURCES = {
  state: "census_codes_2020_state",
  county: "census_gazetteer_2025_county",
  cousub: "census_gazetteer_2025_cousub",
  place: "census_gazetteer_2025_place",
  nta: "nyc_planning_nta_2020",
} as const;

/** The five counties that are NYC's boroughs, by county GEOID. */
export const NYC_BOROUGHS: Record<string, { name: string; aliases: string[] }> =
  {
    "36005": { name: "Bronx", aliases: ["The Bronx", "Bronx County"] },
    "36047": { name: "Brooklyn", aliases: ["Kings County", "Kings"] },
    "36061": { name: "Manhattan", aliases: ["New York County"] },
    "36081": { name: "Queens", aliases: ["Queens County"] },
    "36085": {
      name: "Staten Island",
      aliases: ["Richmond County", "Richmond"],
    },
  };

const NYC_CITY_ALIASES = ["New York", "New York City", "NYC"];

const NTA_BOROUGH_GEOID: Record<string, string> = {
  Bronx: "36005",
  Brooklyn: "36047",
  Manhattan: "36061",
  Queens: "36081",
  "Staten Island": "36085",
};

// Longest first, so "charter township" wins over "township".
const TYPE_SUFFIXES = [
  "metropolitan government (balance)",
  "consolidated government (balance)",
  "unified government (balance)",
  "metro government (balance)",
  "city and borough",
  "charter township",
  "zona urbana",
  "comunidad",
  "municipality",
  "plantation",
  "township",
  "borough",
  "village",
  "city",
  "town",
  "CDP",
].map((suffix) => ({ suffix, lower: ` ${suffix.toLowerCase()}` }));

/** What a type adds to a label: only the ones that tell two places apart. */
const TYPE_LABEL: Record<string, string> = {
  township: "Twp",
  "charter township": "Charter Twp",
  borough: "Boro",
  village: "Village",
  plantation: "Plantation",
};

/** "Montclair township" -> ["Montclair", "township"]. */
export function splitCensusName(raw: string): {
  name: string;
  placeType: string | null;
} {
  const lower = raw.toLowerCase();
  for (const { suffix, lower: needle } of TYPE_SUFFIXES) {
    if (lower.endsWith(needle)) {
      const name = raw.slice(0, raw.length - needle.length).trim();
      if (name) {
        // A consolidated city-county's government is, to anyone from there,
        // the city.
        return {
          name,
          placeType: suffix.includes("government") ? "city" : suffix,
        };
      }
    }
  }
  return { name: raw.trim(), placeType: null };
}

/** "Essex County" -> "Essex Co."; parishes, boroughs and regions as named. */
export function shortCountyName(name: string): string {
  return name.replace(/ County$/, " Co.");
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// A consolidated city's Census name is its government's, which nobody types:
// "Nashville-Davidson" -> "Nashville", "Louisville/Jefferson County" ->
// "Louisville".
function balanceAliases(raw: string, name: string): string[] {
  if (!/\(balance\)$/.test(raw)) return [];
  const first = name.split(/[-/]/)[0]?.trim();
  return first && first !== name ? [first] : [];
}

// Some NTA names join several neighborhoods ("Carroll Gardens-Cobble Hill-
// Gowanus-Red Hook"); each one is an alias, so typing any of them finds it.
function ntaAliases(name: string): string[] {
  const base = name.replace(/\s*\([^)]*\)\s*$/, "");
  const parts = base
    .split("-")
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
  const aliases = parts.length > 1 ? parts : [];
  if (base !== name) aliases.push(base);
  return [...new Set(aliases)].filter((alias) => alias !== name);
}

export type BuildInput = {
  states: StateRecord[];
  counties: CountyRecord[];
  cousubs: CousubRecord[];
  places: PlaceRecord[];
  placeCounties: PlaceCountyRecord[];
  ntas: NtaRecord[];
  /** Population by row key ("place:3451000", "cousub:...", "county:..."). */
  populations: Map<string, number>;
};

// Places and county subdivisions kept, by Census functional status: active
// governments (A), partly or fully inactive ones still named (B, C), and for
// places the statistical CDPs (S), which are the names unincorporated
// communities go by. Cousubs coextensive with an incorporated place (F) are
// kept too, then collapse into that place below; statistical cousubs (CCDs,
// unorganized territories) and nonfunctioning townships are not places anyone
// says they are from.
const PLACE_FUNCSTAT = new Set(["A", "B", "C", "S"]);
const COUSUB_FUNCSTAT = new Set(["A", "B", "C", "F"]);

// Connecticut's 2020 county codes were replaced by planning regions in 2022,
// so the 2020 place-by-county table cannot place its places in a 2025 county.
// Its towns are county subdivisions, which carry the new codes in their GEOID.
const STALE_COUNTY_STATES = new Set(["09"]);

type Locality = {
  key: string;
  raw: string;
  name: string;
  placeType: string | null;
  stateFips: string;
  countyGeoids: string[];
  source: string;
  sourceId: string;
  aliases: string[];
};

export function buildPlaces(input: BuildInput): PlaceRow[] {
  type Row = Omit<PlaceRow, "population">;
  const stateByFips = new Map(input.states.map((s) => [s.fips, s]));
  const countyByGeoid = new Map(input.counties.map((c) => [c.geoid, c]));
  const rows: Row[] = [];

  for (const state of input.states) {
    if (!input.counties.some((c) => c.geoid.startsWith(state.fips))) continue;
    rows.push({
      key: `state:${state.fips}`,
      parentKey: null,
      extraCountyKeys: [],
      kind: "state",
      name: state.name,
      placeType: null,
      label: state.name,
      stateCode: state.usps,
      countyName: null,
      source: SOURCES.state,
      sourceId: state.fips,
      aliases: [state.usps],
    });
  }

  for (const county of input.counties) {
    const fips = county.geoid.slice(0, 2);
    const borough = NYC_BOROUGHS[county.geoid];
    rows.push({
      key: `county:${county.geoid}`,
      parentKey: `state:${fips}`,
      extraCountyKeys: [],
      kind: borough ? "borough" : "county",
      name: borough ? borough.name : county.name,
      placeType: null,
      label: borough
        ? `${borough.name}, ${county.usps}`
        : `${county.name}, ${county.usps}`,
      stateCode: county.usps,
      countyName: county.name,
      source: SOURCES.county,
      sourceId: county.geoid,
      aliases: borough ? [...borough.aliases, ...NYC_CITY_ALIASES] : [],
    });
  }

  // Localities: places first, so a cousub that is the same municipality
  // collapses into the place rather than the other way round.
  const countiesByPlace = new Map<string, string[]>();
  for (const { placeGeoid, countyGeoid } of input.placeCounties) {
    if (STALE_COUNTY_STATES.has(placeGeoid.slice(0, 2))) continue;
    if (!countyByGeoid.has(countyGeoid)) continue;
    const list = countiesByPlace.get(placeGeoid) ?? [];
    if (!list.includes(countyGeoid)) list.push(countyGeoid);
    countiesByPlace.set(placeGeoid, list);
  }

  const localities: Locality[] = [];
  for (const place of input.places) {
    // A consolidated city's balance (Nashville, Louisville, Indianapolis) is
    // filed as fictitious (F), but it is the city everyone means.
    if (
      !PLACE_FUNCSTAT.has(place.funcstat) &&
      !/\(balance\)$/.test(place.name)
    ) {
      continue;
    }
    const countyGeoids = (countiesByPlace.get(place.geoid) ?? []).sort();
    // NYC itself is its five boroughs.
    if (countyGeoids.some((geoid) => NYC_BOROUGHS[geoid])) continue;
    const { name, placeType } = splitCensusName(place.name);
    localities.push({
      key: `place:${place.geoid}`,
      raw: place.name,
      name,
      placeType,
      stateFips: place.geoid.slice(0, 2),
      countyGeoids,
      source: SOURCES.place,
      sourceId: place.geoid,
      aliases: balanceAliases(place.name, name),
    });
  }

  const sameMunicipality = (a: Locality, b: Locality) =>
    normalize(a.name) === normalize(b.name) &&
    (a.placeType ?? "") === (b.placeType ?? "");

  const byCountyName = new Map<string, Locality[]>();
  const indexKey = (county: string, name: string) =>
    `${county}|${normalize(name)}`;
  const index = (locality: Locality) => {
    for (const county of locality.countyGeoids) {
      const k = indexKey(county, locality.name);
      byCountyName.set(k, [...(byCountyName.get(k) ?? []), locality]);
    }
  };
  localities.forEach(index);

  for (const cousub of input.cousubs) {
    if (!COUSUB_FUNCSTAT.has(cousub.funcstat)) continue;
    if (/not defined/i.test(cousub.name)) continue;
    const countyGeoid = cousub.geoid.slice(0, 5);
    if (NYC_BOROUGHS[countyGeoid] || !countyByGeoid.has(countyGeoid)) continue;
    const { name, placeType } = splitCensusName(cousub.name);
    const candidate: Locality = {
      key: `cousub:${cousub.geoid}`,
      raw: cousub.name,
      name,
      placeType,
      stateFips: cousub.geoid.slice(0, 2),
      countyGeoids: [countyGeoid],
      source: SOURCES.cousub,
      sourceId: cousub.geoid,
      aliases: [],
    };
    const existing = byCountyName.get(indexKey(countyGeoid, name)) ?? [];
    if (existing.some((other) => sameMunicipality(other, candidate))) continue;
    localities.push(candidate);
    index(candidate);
  }

  // A CDP named exactly like a municipality in the same county is that
  // municipality's settled core ("Toms River CDP" in Toms River township);
  // two answers for one place would split every count.
  const kept = localities.filter(
    (locality) =>
      locality.placeType !== "CDP" ||
      !locality.countyGeoids.some((county) =>
        (byCountyName.get(indexKey(county, locality.name)) ?? []).some(
          (other) => other !== locality && other.placeType !== "CDP",
        ),
      ),
  );

  rows.push(...labelLocalities(kept, stateByFips, countyByGeoid));

  for (const nta of input.ntas) {
    // Residential NTAs only: 0. Parks, airports, cemeteries and other
    // special-use areas (5-9) are not where anyone lives.
    if (nta.ntaType !== "0") continue;
    const countyGeoid = NTA_BOROUGH_GEOID[nta.borough];
    if (!countyGeoid) continue;
    rows.push({
      key: `nta:${nta.code}`,
      parentKey: `county:${countyGeoid}`,
      extraCountyKeys: [],
      kind: "neighborhood",
      name: nta.name,
      placeType: null,
      label: `${nta.name}, ${nta.borough}`,
      stateCode: "NY",
      countyName: countyByGeoid.get(countyGeoid)?.name ?? null,
      source: SOURCES.nta,
      sourceId: nta.code,
      aliases: ntaAliases(nta.name),
    });
  }

  // NTAs have no Census estimate here; each gets its borough's average, so
  // "Williamsburg, Brooklyn" ranks like the 50,000-person place it is rather
  // than behind every small town of the name.
  const ntasPerBorough = new Map<string, number>();
  for (const row of rows) {
    if (row.kind === "neighborhood" && row.parentKey) {
      ntasPerBorough.set(
        row.parentKey,
        (ntasPerBorough.get(row.parentKey) ?? 0) + 1,
      );
    }
  }
  return rows.map((row) => {
    const own = input.populations.get(row.key);
    const borough =
      row.kind === "neighborhood" && row.parentKey
        ? input.populations.get(row.parentKey)
        : undefined;
    return {
      ...row,
      population:
        own ??
        (borough !== undefined && row.parentKey
          ? Math.round(borough / (ntasPerBorough.get(row.parentKey) ?? 1))
          : null),
    };
  });
}

// Labels say as little as tells places apart. NJ always names the county,
// because its municipal names repeat so often (several Washington and
// Franklin Townships); elsewhere the county appears only where the name
// repeats within the state.
function labelLocalities(
  localities: Locality[],
  stateByFips: Map<string, StateRecord>,
  countyByGeoid: Map<string, CountyRecord>,
): Omit<PlaceRow, "population">[] {
  const base = (l: Locality) => {
    const suffix = l.placeType ? TYPE_LABEL[l.placeType] : undefined;
    return suffix ? `${l.name} ${suffix}` : l.name;
  };
  const countyPart = (l: Locality) => {
    const names = l.countyGeoids
      .map((geoid) => countyByGeoid.get(geoid)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return null;
    if (names.length === 1) return shortCountyName(names[0]);
    if (names.every((name) => name.endsWith(" County"))) {
      return `${names
        .slice(0, 2)
        .map((name) => name.replace(/ County$/, ""))
        .join("/")}${names.length > 2 ? "/…" : ""} Co.`;
    }
    return names.slice(0, 2).join("/");
  };

  const baseCount = new Map<string, number>();
  for (const l of localities) {
    const k = `${l.stateFips}|${normalize(base(l))}`;
    baseCount.set(k, (baseCount.get(k) ?? 0) + 1);
  }

  const labelled = localities.map((l) => {
    const state = stateByFips.get(l.stateFips);
    const usps = state?.usps ?? "";
    const withCounty =
      usps === "NJ" ||
      (baseCount.get(`${l.stateFips}|${normalize(base(l))}`) ?? 0) > 1;
    const county = withCounty ? countyPart(l) : null;
    const label = [base(l), county, usps].filter(Boolean).join(", ");
    return { l, usps, label };
  });

  // Still the same words twice (a town and a village of one name in one
  // county): the type goes in brackets on each.
  const labelCount = new Map<string, number>();
  for (const { label } of labelled) {
    labelCount.set(
      normalize(label),
      (labelCount.get(normalize(label)) ?? 0) + 1,
    );
  }

  return labelled.map(({ l, usps, label }) => {
    const finalLabel =
      (labelCount.get(normalize(label)) ?? 0) > 1 && l.placeType
        ? label.replace(base(l), `${base(l)} (${l.placeType})`)
        : label;
    const [first, ...rest] = l.countyGeoids;
    return {
      key: l.key,
      parentKey: first ? `county:${first}` : `state:${l.stateFips}`,
      extraCountyKeys: rest.map((geoid) => `county:${geoid}`),
      kind: "locality" as const,
      name: l.name,
      placeType: l.placeType,
      label: finalLabel,
      stateCode: usps,
      countyName:
        l.countyGeoids.length === 1
          ? (countyByGeoid.get(first)?.name ?? null)
          : null,
      source: l.source,
      sourceId: l.sourceId,
      aliases: l.aliases,
    };
  });
}
