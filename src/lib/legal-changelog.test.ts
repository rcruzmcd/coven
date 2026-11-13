import { describe, expect, test } from "bun:test";
import {
  PLATFORM_LEGAL_CHANGELOG,
  platformLegalChangesSince,
  type PlatformLegalChangelogEntry,
} from "./legal-changelog";
import {
  PLATFORM_LEGAL_LAST_UPDATED,
  PLATFORM_LEGAL_SLOT_KEYS,
} from "./legal-defaults";
import { LEGAL_DOCUMENTS } from "./legal-documents";

describe("the platform legal changelog", () => {
  // The rule the ticket exists for: the constant cannot move without saying
  // what moved under it.
  test("its newest entry is the current PLATFORM_LEGAL_LAST_UPDATED", () => {
    expect(
      PLATFORM_LEGAL_CHANGELOG[0]?.version,
      `PLATFORM_LEGAL_LAST_UPDATED is "${PLATFORM_LEGAL_LAST_UPDATED}" but src/lib/legal-changelog.ts has no entry for it at the top. Add one saying what changed, per document.`,
    ).toBe(PLATFORM_LEGAL_LAST_UPDATED);
  });

  test("has one entry per version", () => {
    const versions = PLATFORM_LEGAL_CHANGELOG.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test("every entry names at least one document the platform has text for", () => {
    const withProse = new Set(
      LEGAL_DOCUMENTS.filter((document) =>
        PLATFORM_LEGAL_SLOT_KEYS.includes(document.slotKey),
      ).map((document) => document.key),
    );
    for (const entry of PLATFORM_LEGAL_CHANGELOG) {
      const keys = Object.keys(entry.changes);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(withProse.has(key), `${entry.version}: ${key}`).toBe(true);
        expect(entry.changes[key].trim()).not.toBe("");
      }
    }
  });
});

describe("platformLegalChangesSince", () => {
  const LOG: PlatformLegalChangelogEntry[] = [
    { version: "C", changes: { privacy: "c privacy", terms: "c terms" } },
    { version: "B", changes: { terms: "b terms" } },
    { version: "A", changes: { privacy: "a privacy" } },
  ];

  test("lists this document's changes newer than the confirmed version, newest first", () => {
    expect(platformLegalChangesSince("terms", "A", LOG)).toEqual({
      changes: [
        { version: "C", summary: "c terms" },
        { version: "B", summary: "b terms" },
      ],
      complete: true,
    });
  });

  test("is empty where only other documents changed", () => {
    expect(platformLegalChangesSince("privacy", "B", LOG)).toEqual({
      changes: [{ version: "C", summary: "c privacy" }],
      complete: true,
    });
    expect(platformLegalChangesSince("terms", "C", LOG)).toEqual({
      changes: [],
      complete: true,
    });
  });

  // Order, not dates: a version string that sorts or parses earlier is not
  // thereby older.
  test("decides newer by position, not by parsing the version", () => {
    const log = [
      { version: "January 1, 2020", changes: { privacy: "newest" } },
      { version: "December 31, 2030", changes: { privacy: "oldest" } },
    ];
    expect(
      platformLegalChangesSince("privacy", "December 31, 2030", log).changes,
    ).toEqual([{ version: "January 1, 2020", summary: "newest" }]);
  });

  test("lists everything, marked incomplete, for a version the log does not know", () => {
    expect(platformLegalChangesSince("privacy", "March 1, 2026", LOG)).toEqual({
      changes: [
        { version: "C", summary: "c privacy" },
        { version: "A", summary: "a privacy" },
      ],
      complete: false,
    });
  });
});
