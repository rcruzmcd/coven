// #685: the minors question and the contacts a "yes" collects. Two of the
// cases below are about what this module refuses to do -- read an unanswered
// question as a "no", and keep a guardian's number for a party that has none.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MINOR_CONTACTS_REQUIRED_ERROR,
  MINOR_FORM_ASKS_FOR,
  NO_MINOR_CONTACTS,
  parseMinorContacts,
  parsePartyIncludesMinor,
  partyIncludesMinorLabel,
  partyIncludesMinorValue,
} from "./minors";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const COMPLETE = {
  accompanyingAdultName: "Jane Doe",
  accompanyingAdultPhone: "555-1234",
  emergencyContactName: "Sam Doe",
  emergencyContactPhone: "555-9876",
};

describe("parsePartyIncludesMinor", () => {
  test("reads the two answers the form offers", () => {
    expect(parsePartyIncludesMinor("yes")).toBe(true);
    expect(parsePartyIncludesMinor("no")).toBe(false);
  });

  // The whole point of the column being three-state. A row that nobody
  // answered must not read as "no minors here", because that is precisely the
  // wrong answer to be confident about.
  test("anything else is unanswered, and never a no", () => {
    for (const raw of [null, "", "   ", "false", "0", "maybe", "NO"]) {
      expect(parsePartyIncludesMinor(raw)).toBeNull();
    }
  });

  test("round-trips through the select's value", () => {
    expect(partyIncludesMinorValue(null)).toBe("");
    expect(partyIncludesMinorValue(true)).toBe("yes");
    expect(partyIncludesMinorValue(false)).toBe("no");
  });

  test("the portal has no label for an unanswered question", () => {
    expect(partyIncludesMinorLabel(null)).toBeNull();
    expect(partyIncludesMinorLabel(true)).toBe("Includes a minor");
    expect(partyIncludesMinorLabel(false)).toBe("All 18 or over");
  });
});

describe("parseMinorContacts", () => {
  test("keeps nothing unless the answer was yes", () => {
    for (const answer of [false, null]) {
      expect(parseMinorContacts(answer, formData(COMPLETE))).toEqual({
        data: NO_MINOR_CONTACTS,
      });
    }
  });

  test("a yes needs all four, and trims them", () => {
    expect(
      parseMinorContacts(
        true,
        formData({ ...COMPLETE, accompanyingAdultName: "  Jane Doe  " }),
      ),
    ).toEqual({
      data: {
        accompanying_adult_name: "Jane Doe",
        accompanying_adult_phone: "555-1234",
        emergency_contact_name: "Sam Doe",
        emergency_contact_phone: "555-9876",
      },
    });

    for (const missing of Object.keys(COMPLETE)) {
      expect(
        parseMinorContacts(true, formData({ ...COMPLETE, [missing]: " " })),
      ).toEqual({ error: MINOR_CONTACTS_REQUIRED_ERROR });
    }
  });
});

/**
 * `MINOR_FORM_ASKS_FOR` promises a registrant that this form never asks for a
 * date of birth or an age, and that promise is printed on every tenant whether
 * or not one has written a word of its own. It is a claim about this
 * repository, so it is checked against this repository -- the same shape
 * #690's `FORM_ASKS_FOR` case takes beside the volunteer parser.
 */
/**
 * #1782. An event's age requirement (18, 21) and the requirement a registrant
 * confirmed their party meets: a threshold the organization sets and a yes to
 * it, never the registrant's own age. Named, not pattern-matched, so a new
 * `_age` column still has to argue its way in here.
 */
const EVENT_AGE_REQUIREMENT_COLUMNS = new Set([
  "minimum_age",
  "confirmed_minimum_age",
]);

describe("the promise that no age is collected", () => {
  test("says so, in those words", () => {
    expect(MINOR_FORM_ASKS_FOR).toContain("date of birth");
  });

  test("nothing in the schema stores a registrant's age", () => {
    const migrations = join(import.meta.dir, "..", "..", "supabase/migrations");
    const offenders: string[] = [];
    for (const file of readdirSync(migrations)) {
      if (!file.endsWith(".sql")) continue;
      // Read straight through rather than stat-then-read: the directory holds
      // nothing but migrations, and checking the path before opening it is the
      // time-of-check/time-of-use shape CodeQL flags.
      const sql = readFileSync(join(migrations, file), "utf8");
      // Column definitions only. The words appear in prose and in policy text
      // all over these files, and a comment saying "we never ask a date of
      // birth" must not fail the test that checks we never ask one.
      for (const match of sql.matchAll(
        /add column\s+([a-z_]+)|^\s{2}([a-z_]+)\s+(?:date|integer|smallint|text)\b/gim,
      )) {
        const column = match[1] ?? match[2] ?? "";
        if (EVENT_AGE_REQUIREMENT_COLUMNS.has(column)) continue;
        if (/date_of_birth|\bdob\b|birth_date|^age$|_age$/.test(column)) {
          offenders.push(`${file}: ${column}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
