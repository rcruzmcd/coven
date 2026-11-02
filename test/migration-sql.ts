/**
 * Reading the catalogs that live in SQL, for the tests that check them.
 *
 * `module-catalog.test.ts` grew these scanners first, because a regex cannot
 * do the job: a resource's `description` is prose, and prose contains commas,
 * brackets and doubled apostrophes. `permission-docs.test.ts` (#1324) needs the
 * same readers over the same statements, so they live here rather than in a
 * second copy -- the repository's own rule about not writing a third answer to
 * a question already answered once.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const MIGRATIONS_DIR = join(import.meta.dir, "../supabase/migrations");

export function migrationFileNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/** The text of one `insert`/`update` statement, from its header to its `;`. */
export function statementsAfter(sql: string, header: RegExp): string[] {
  const out: string[] = [];
  for (const match of sql.matchAll(header)) {
    const from = match.index + match[0].length;
    const to = sql.indexOf(";", from);
    out.push(sql.slice(from, to === -1 ? undefined : to));
  }
  return out;
}

/**
 * The `(...)` rows of a values list, split on parens that are not inside a
 * string literal. Scanning for the quote state costs a dozen lines and is
 * right for every row, including the next one somebody writes.
 */
export function valueRows(body: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      // '' is an escaped quote inside a literal, not the end of one.
      if (char === "'") {
        if (body[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) rows.push(body.slice(start, i));
    }
  }

  return rows;
}

/** One row's values, split on top-level commas, in column order. */
export function valueFields(row: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (inString) {
      if (char === "'") {
        if (row[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      fields.push(row.slice(start, i));
      start = i + 1;
    }
  }
  fields.push(row.slice(start));

  return fields.map((field) => field.trim());
}

/** A quoted literal's contents, or null for anything else (a number, null). */
export function literal(field: string | undefined): string | null {
  if (!field) return null;
  const match = /^'((?:[^']|'')*)'$/.exec(field);
  return match ? match[1].replace(/''/g, "'") : null;
}

export type SeededResource = {
  key: string;
  section: string | null;
  label: string | null;
  description: string | null;
  moduleKey: string | null;
  /** The migration that seeded it, for a failure message that names a file. */
  migration: string;
};

/**
 * Every row the migrations leave in `public.resources`, in the order they
 * run: inserted by one, less any a later one deletes. First insert wins, which
 * is what a fresh database ends up with for `key`; later migrations amend
 * other columns.
 */
export function seededResources(): Map<string, SeededResource> {
  const resources = new Map<string, SeededResource>();

  for (const name of migrationFileNames()) {
    const sql = readMigration(name);
    for (const match of sql.matchAll(
      /insert into public\.resources \(([^)]*)\) values/g,
    )) {
      const columns = match[1].split(",").map((column) => column.trim());
      const at = (column: string) => columns.indexOf(column);
      const from = match.index + match[0].length;
      const to = sql.indexOf(";", from);

      for (const row of valueRows(
        sql.slice(from, to === -1 ? undefined : to),
      )) {
        const fields = valueFields(row);
        const key = literal(fields[at("key")]);
        if (!key || resources.has(key)) continue;
        resources.set(key, {
          key,
          section: literal(fields[at("section")]),
          label: literal(fields[at("label")]),
          description: literal(fields[at("description")]),
          moduleKey:
            at("module_key") === -1 ? null : literal(fields[at("module_key")]),
          migration: name,
        });
      }
    }
    // A resource a later migration retires is no longer in the catalog
    // (20260918000000's content_calendar_reports, #1746's rider_profiles).
    for (const match of sql.matchAll(
      /delete from public\.resources\s+where key = '([a-z0-9_]+)'/g,
    )) {
      resources.delete(match[1]);
    }
  }

  return resources;
}
