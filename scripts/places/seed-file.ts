// Reads back the rows of the generated places seed migration (#1699), so the
// overlay generators (#1700) name only places that exist and can check a key
// against the label someone meant. Parses only what `scripts/places-seed.ts`
// writes: one `('key','parent',extra,'kind','name',type,'label',...` tuple
// per line.

import { readFileSync } from "node:fs";

export const SEED_MIGRATION =
  "supabase/migrations/20261023160100_places_seed.sql";

export type SeedPlace = {
  key: string;
  kind: string;
  name: string;
  label: string;
};

const TEXT = "'((?:[^']|'')*)'";
const TEXT_OR_NULL = `(?:${TEXT}|null)`;
const ARRAY = "(?:'\\{\\}'|array\\[[^\\]]*\\])";
const ROW = new RegExp(
  `^\\(${TEXT},${TEXT_OR_NULL},${ARRAY},${TEXT},${TEXT},${TEXT_OR_NULL},${TEXT},`,
);

const unquote = (value: string) => value.replaceAll("''", "'");

export function parseSeedPlaces(sql: string): Map<string, SeedPlace> {
  const places = new Map<string, SeedPlace>();
  for (const line of sql.split("\n")) {
    const match = ROW.exec(line);
    if (!match) continue;
    const [, key, , kind, name, , label] = match;
    places.set(key, {
      key,
      kind,
      name: unquote(name),
      label: unquote(label),
    });
  }
  return places;
}

export function readSeedPlaces(path = SEED_MIGRATION): Map<string, SeedPlace> {
  const places = parseSeedPlaces(readFileSync(path, "utf8"));
  if (places.size === 0) throw new Error(`${path}: no place rows found`);
  return places;
}
