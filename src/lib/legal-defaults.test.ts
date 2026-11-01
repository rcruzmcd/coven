import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  platformLegalDescription,
  platformLegalDocument,
  PLATFORM_LEGAL_SLOT_KEYS,
  type LegalOrgContext,
} from "@/lib/legal-defaults";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import {
  legalPlainText,
  parseLegalBlocks,
  type InlineRun,
} from "@/lib/legal-markup";
import { collectionSurface, type CollectionSurface } from "@/lib/legal-surface";
import { DEFAULT_LEXICON, lexiconFromRows } from "@/lib/lexicon";
import {
  GEAR_AS_IS_SUMMARY,
  gearAsIsSummary,
  gearAsIsText,
} from "@/lib/gear-as-is";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  isValidSlotValue,
  contentSlot,
  LEGAL_DOCUMENT_OUTLINES,
  type LegalDocumentSection,
} from "@/lib/site-content";

/** A tenant that runs everything: what every site used to be told it was. */
const EVERYTHING: CollectionSurface = collectionSurface({}, {});

/** A tenant with nothing but a portal: no public form of any kind. */
const NOTHING: CollectionSurface = {
  contact: false,
  volunteerApplications: false,
  eventRegistrations: false,
  gearRequests: false,
  artworkSubmissions: false,
  constituentAccounts: false,
  volunteerHours: false,
  volunteerScreening: false,
  googleSignIn: false,
  formAnalytics: false,
};

const ORG: LegalOrgContext = {
  name: "Riverside Trails",
  emailGeneral: "hello@riverside.example",
  emailPrivacy: "privacy@riverside.example",
  emailConduct: "conduct@riverside.example",
  surfaces: EVERYTHING,
  lexicon: DEFAULT_LEXICON,
};

const withSurfaces = (surfaces: CollectionSurface): LegalOrgContext => ({
  ...ORG,
  surfaces,
});

/** Everything a reader sees, with the markup markers taken back off. */
function readable(slotKey: string, org: LegalOrgContext = ORG): string {
  const doc = platformLegalDocument(slotKey, org);
  return legalPlainText([
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ]);
}

/** Every on/off combination of the surfaces, for the invariants below. */
function everySurface(): CollectionSurface[] {
  const keys = Object.keys(EVERYTHING) as (keyof CollectionSurface)[];
  return Array.from({ length: 1 << keys.length }, (_, mask) =>
    Object.fromEntries(
      keys.map((key, index) => [key, Boolean(mask & (1 << index))]),
    ),
  ) as CollectionSurface[];
}

/** Every link a document publishes. */
function hrefs(doc: {
  summary: string[];
  sections: { paragraphs: string[] }[];
}) {
  const found: string[] = [];
  const walk = (runs: readonly InlineRun[]) => {
    for (const run of runs) {
      if (run.kind === "link") found.push(run.href);
      if (run.kind !== "text") walk(run.runs);
    }
  };
  for (const block of parseLegalBlocks([
    ...doc.summary,
    ...doc.sections.flatMap((section) => section.paragraphs),
  ])) {
    if (block.kind === "bullets") block.items.forEach(walk);
    else walk(block.runs);
  }
  return found;
}

describe("the platform's legal documents", () => {
  test("there is one for each legal.* slot the platform writes", () => {
    expect([...PLATFORM_LEGAL_SLOT_KEYS].sort()).toEqual([
      "legal.accessibility",
      "legal.code_of_conduct",
      "legal.privacy",
      "legal.terms",
    ]);
  });

  // The registry and this module have to agree about which documents have
  // text, or the waiver (#686) either loses its "there is nothing to serve"
  // property or something calls `platformLegalDocument()` on a slot that
  // throws. Asserted as an equality rather than a containment so it fails in
  // both directions: prose added without the flag, and a flag set without
  // prose.
  test("hasPlatformDefault names exactly the slots with prose", () => {
    expect(
      LEGAL_DOCUMENTS.filter((document) => document.hasPlatformDefault)
        .map((document) => document.slotKey)
        .sort(),
    ).toEqual([...PLATFORM_LEGAL_SLOT_KEYS].sort());
  });

  // A document served whatever happens must have something to serve, which is
  // why the privacy policy could never be the one without prose.
  test("a document that is always in force has prose behind it", () => {
    for (const document of LEGAL_DOCUMENTS) {
      if (document.alwaysInForce)
        expect(document.hasPlatformDefault).toBe(true);
    }
  });

  test("the waiver is the one document the platform writes nothing for", () => {
    expect(
      LEGAL_DOCUMENTS.filter((document) => !document.hasPlatformDefault).map(
        (document) => document.key,
      ),
    ).toEqual(["waiver"]);
    expect(PLATFORM_LEGAL_SLOT_KEYS).not.toContain("legal.waiver");
    expect(() => platformLegalDocument("legal.waiver", ORG)).toThrow();
  });

  for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
    describe(key, () => {
      test("is a valid value for its slot", () => {
        const slot = contentSlot(key)!;
        expect(isValidSlotValue(slot, platformLegalDocument(key, ORG))).toBe(
          true,
        );
      });

      test("every section has prose and a title", () => {
        const doc = platformLegalDocument(key, ORG);
        expect(doc.sections.length).toBeGreaterThan(0);
        for (const section of doc.sections) {
          expect(section.title, `${section.id} has no title`).not.toBe("");
          expect(
            section.paragraphs.length,
            `${section.id} has no prose`,
          ).toBeGreaterThan(0);
          for (const paragraph of section.paragraphs) {
            expect(
              paragraph.trim(),
              `${section.id} has a blank paragraph`,
            ).not.toBe("");
          }
        }
      });

      // The whole point of #858: a tenant with no documents of its own must not
      // be served another organization's, and must not be served one that
      // describes activities it does not run.
      test("names no organization but this one, and no snow sports", () => {
        const text = readable(key);
        expect(text).toContain(ORG.name);
        expect(text).not.toMatch(
          /chatter|snowboard|\bski\b|skiing|mountain|ski patrol|New Jersey|501\(c\)\(3\)/i,
        );
      });

      test("its description names the organization", () => {
        expect(platformLegalDescription(key, ORG)).toContain(ORG.name);
      });

      // Every public page but the legal ones can be hidden per tenant, so a
      // link to one is a link that may 404. /privacy is the exception #859
      // keeps served for everyone, and a #fragment stays inside this document.
      //
      // The one external address allowed is the WCAG specification (#1368).
      // An accessibility statement that names a conformance target and does
      // not say where to read it is asking the reader to take the target on
      // trust, which is the opposite of what that document is for; the
      // allowlist is one URL rather than a scheme, so this stays a decision
      // per link rather than an open door to a marketing page.
      test("links only to addresses, to /privacy, to WCAG and within itself", () => {
        const links = hrefs(platformLegalDocument(key, ORG));
        expect(links.length).toBeGreaterThan(0);
        for (const href of links) {
          expect(
            href.startsWith("mailto:") ||
              href.startsWith("#") ||
              href === "/privacy" ||
              href === "https://www.w3.org/TR/WCAG22/",
            `${href} is not an address, a fragment, /privacy or the WCAG spec`,
          ).toBe(true);
        }
      });
    });
  }

  test("the addresses published are the tenant's own", () => {
    expect(readable("legal.privacy")).toContain(ORG.emailPrivacy);
    expect(readable("legal.terms")).toContain(ORG.emailGeneral);
    expect(readable("legal.code_of_conduct")).toContain(ORG.emailConduct);
  });

  // The retention section is generated rather than written, so the published
  // periods and the clocks the purge enforces stay one decision (#602). Since
  // #1291 that is "every period this tenant's forms can produce": the purge
  // still enforces all of them, but a policy has no business publishing a clock
  // for data the site cannot collect.
  test("the privacy policy publishes every retention period it can reach", () => {
    const text = readable("legal.privacy");
    for (const policy of RETENTION_POLICIES) {
      expect(text, `${policy.key} is not published`).toContain(policy.howLong);
      expect(text).toContain(policy.what);
    }
  });

  test("a policy whose surface is off is left out of the table", () => {
    const text = readable("legal.privacy", withSurfaces(NOTHING));
    for (const policy of RETENTION_POLICIES) {
      if (policy.surface === undefined) {
        expect(text, `${policy.key} is not published`).toContain(policy.what);
      } else {
        expect(text, `${policy.key} is published anyway`).not.toContain(
          policy.what,
        );
      }
    }
  });

  test("an unknown slot is an error, not an empty document", () => {
    expect(() => platformLegalDocument("legal.bylaws", ORG)).toThrow();
  });
});

// #1291. The documents describe the forms this tenant actually has, rather than
// every form in the software followed by a sentence admitting some of them may
// not exist.
describe("the collection surface", () => {
  test("the privacy policy names only the forms this site has", () => {
    const text = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, contact: true }),
    );
    expect(text).toContain("Contact form");
    expect(text).not.toContain("Volunteer application");
    expect(text).not.toContain("Event registration");
    expect(text).not.toContain("Gear requests");
    expect(text).not.toContain("Artwork submissions");
  });

  // The hedge that stood in for this: the list was every form, and one sentence
  // at the end said some of them might collect nothing.
  test("the hedge sentence is gone", () => {
    expect(readable("legal.privacy")).not.toContain(
      "Not every form above is open on every site",
    );
  });

  test("a site with no public forms still describes what it does collect", () => {
    const text = readable("legal.privacy", withSurfaces(NOTHING));
    expect(text).toContain("Portal accounts");
    expect(text).toContain("IP address");
    expect(text).toContain("kept for 7 days");
    expect(text).toContain("Supabase");
  });

  // #1160/#1161 put sign-up on the public site. "Portal accounts -- for the
  // people who run the organization" stopped being true the day a visitor could
  // create one, and nothing described the claim, the self-edits or the hours.
  test("the account bullet says who can hold one", () => {
    expect(readable("legal.privacy", withSurfaces(NOTHING))).toContain(
      "for the people who run the organization",
    );
    const withAccounts = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, constituentAccounts: true }),
    );
    expect(withAccounts).not.toContain(
      "for the people who run the organization",
    );
    expect(withAccounts).toContain("Anyone can create an account on this site");
  });

  test("the constituent area's own collection is described only where it exists", () => {
    const off = readable("legal.privacy", withSurfaces(NOTHING));
    const on = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, constituentAccounts: true }),
    );
    for (const claim of [
      "Matching your account to our records",
      "What you keep up to date yourself",
      "An account on this site shows you your own record and nothing else",
    ]) {
      expect(on, claim).toContain(claim);
      expect(off, claim).not.toContain(claim);
    }
  });

  // Self-logged hours answer to the Volunteers module, which is not the same
  // gate as the public volunteer page -- and, since #1303 moved the only form
  // that logs them into the portal, not the same gate as the constituent area
  // either.
  test("self-logged hours are described wherever the module is on", () => {
    const hours = "Hours you log yourself";
    expect(readable("legal.privacy")).toContain(hours);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerHours: false }),
      ),
    ).not.toContain(hours);
    // Neither the public volunteer page nor the constituent area being off is
    // the same thing: a volunteer logs their own hours in the portal.
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerApplications: false }),
      ),
    ).toContain(hours);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, constituentAccounts: false }),
      ),
    ).toContain(hours);
  });

  // Not a bare "Google": the analytics section says what this site does *not*
  // run, and that sentence is true for everyone.
  test("Google is a subprocessor only where Google sign-in is offered", () => {
    const bullet = "with a Google account";
    expect(readable("legal.privacy")).toContain(bullet);
    expect(readable("legal.privacy", withSurfaces(NOTHING))).not.toContain(
      bullet,
    );
    expect(readable("legal.privacy", withSurfaces(NOTHING))).not.toContain(
      "Signing in with Google",
    );
  });

  // #1480: a tenant's visitors are counted by PostHog only with the module,
  // and the policy names it exactly then.
  test("PostHog is named only where form analytics is on", () => {
    const on = readable("legal.privacy");
    expect(on).toContain("PostHog — counts page views");
    expect(on).toContain("and PostHog to count how many people start");
    // #1714: the clicks and dead ends, each as narrow as its allowlist.
    expect(on).toContain("which website, not which page");
    expect(on).toContain("only the first part of its address");
    const off = readable(
      "legal.privacy",
      withSurfaces({ ...EVERYTHING, formAnalytics: false }),
    );
    expect(off).not.toContain("PostHog");
    expect(off).toContain("We use Vercel Web Analytics to count page views.");
  });

  // The opposite of Google: an error report has no surface behind it, so the
  // bullet is there for a site with every form switched off too (#1340).
  test("Sentry is a subprocessor whatever the site collects", () => {
    for (const surfaces of [EVERYTHING, NOTHING]) {
      const text = readable("legal.privacy", withSurfaces(surfaces));
      expect(text).toContain("Sentry — receives a technical report");
      expect(text).toContain("we don't record your session");
    }
  });

  // Registrations seen by volunteers needs both halves to be true.
  test("volunteers see registrations only where both surfaces are live", () => {
    const staffing =
      "the volunteers staffing it may need to see who registered";
    expect(readable("legal.privacy")).toContain(staffing);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerApplications: false }),
      ),
    ).not.toContain(staffing);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, eventRegistrations: false }),
      ),
    ).not.toContain(staffing);
  });

  test("the terms drop the sections about activities this tenant does not run", () => {
    const ids = (surfaces: CollectionSurface) =>
      platformLegalDocument("legal.terms", withSurfaces(surfaces)).sections.map(
        (section) => section.id,
      );
    expect(ids(EVERYTHING)).toContain("events-and-programs");
    expect(ids(EVERYTHING)).toContain("volunteering");
    expect(ids(NOTHING)).not.toContain("events-and-programs");
    expect(ids(NOTHING)).not.toContain("volunteering");
  });

  // What the outline filter buys over an empty section: the section rail is
  // built from the same list, so a dropped section takes its anchor with it.
  test("no document has an empty section at any surface combination", () => {
    for (const surfaces of everySurface()) {
      const org = withSurfaces(surfaces);
      for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
        const doc = platformLegalDocument(key, org);
        expect(doc.sections.length, key).toBeGreaterThan(0);
        for (const section of doc.sections) {
          expect(
            section.paragraphs.length,
            `${key}/${section.id} is empty`,
          ).toBeGreaterThan(0);
          for (const paragraph of section.paragraphs) {
            expect(
              paragraph.trim(),
              `${key}/${section.id} has a blank paragraph`,
            ).not.toBe("");
          }
        }
      }
    }
  });

  test("a section it keeps is never one the outline does not have", () => {
    for (const surfaces of everySurface()) {
      const org = withSurfaces(surfaces);
      for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
        const outlined = new Set(
          LEGAL_DOCUMENT_OUTLINES[key].sections.map((section) => section.id),
        );
        for (const section of platformLegalDocument(key, org).sections) {
          expect(outlined.has(section.id), `${key}/${section.id}`).toBe(true);
          // `requires` is outline metadata and must not reach the published
          // document, which the editor round-trips as a stored value.
          expect(Object.keys(section).sort()).toEqual([
            "id",
            "paragraphs",
            "title",
          ]);
        }
      }
    }
  });

  test("a document with every surface on is still valid for its slot", () => {
    for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
      const slot = contentSlot(key)!;
      for (const surfaces of [EVERYTHING, NOTHING]) {
        expect(
          isValidSlotValue(
            slot,
            platformLegalDocument(key, withSurfaces(surfaces)),
          ),
          key,
        ).toBe(true);
      }
    }
  });
});

// #1295. #859 decided adoption for a public site that was a set of one-shot
// forms. Where a tenant offers accounts, the terms have to govern the standing
// relationship those create -- and where it does not, the platform's terms must
// not carry a heading about accounts nobody can hold.
describe("the terms and the constituent area", () => {
  const ACCOUNTS: CollectionSurface = { ...NOTHING, constituentAccounts: true };

  const terms = (surfaces: CollectionSurface) =>
    platformLegalDocument("legal.terms", withSurfaces(surfaces));

  test("the account section appears only where accounts are offered", () => {
    expect(terms(ACCOUNTS).sections.map((s) => s.id)).toContain("your-account");
    expect(terms(NOTHING).sections.map((s) => s.id)).not.toContain(
      "your-account",
    );
  });

  // The whole reason #1295 is a new section rather than `alwaysInForce`: the
  // platform's terms had nothing about accounts in them, so serving them
  // unconditionally would publish a document that reads as though it governs
  // accounts and does not.
  test("it answers what a terms of use has to answer about an account", () => {
    const text = readable("legal.terms", withSurfaces(ACCOUNTS));
    // Who may hold one and what it is not.
    expect(text).toContain("carries no role here");
    // Responsibility for your own credentials.
    expect(text).toContain("keep your password to yourself");
    // A claim is reviewed, and a false one may be refused.
    expect(text).toContain("somebody here reads it before anything is linked");
    // Suspension and closure, and what happens to the records afterwards.
    expect(text).toContain("suspend or close an account");
    expect(text).toContain("Closing an account doesn't erase our records");
    // No fee, no promise of continuity.
    expect(text).toContain("There is no charge for an account");
  });

  // The account section promised that hours you enter yourself stay pending
  // until somebody confirms them, which was a statement about what an account
  // let you do. #1303 took self-logging out of `/my`, so the terms no longer
  // describe it at all -- the privacy policy still does, under the Volunteers
  // module, because the rows are still collected in the portal.
  test("the account section no longer promises anything about hours", () => {
    const pending = "Hours you enter yourself";
    expect(
      readable(
        "legal.terms",
        withSurfaces({ ...ACCOUNTS, volunteerHours: true }),
      ),
    ).not.toContain(pending);
  });

  test("the summary and the description name accounts only where they exist", () => {
    expect(readable("legal.terms", withSurfaces(ACCOUNTS))).toContain(
      "holding an account with us",
    );
    expect(readable("legal.terms", withSurfaces(NOTHING))).not.toContain(
      "holding an account with us",
    );
    expect(
      platformLegalDescription("legal.terms", withSurfaces(ACCOUNTS)),
    ).toContain("hold an account with us");
    expect(
      platformLegalDescription("legal.terms", withSurfaces(NOTHING)),
    ).not.toContain("hold an account with us");
  });
});

// #1367. Two places say what taking a donated item means: the summary above
// the box somebody ticks when they ask for one, and the section of the terms
// of use that governs it. Two places saying *nearly* the same thing about
// liability is the failure mode worth spending a test on, so there is one
// constant and this holds the document to it.
describe("the items we give away", () => {
  const GEAR: CollectionSurface = { ...NOTHING, gearRequests: true };

  const section = (
    surfaces: CollectionSurface,
    lexicon = DEFAULT_LEXICON,
  ): LegalDocumentSection | undefined =>
    platformLegalDocument("legal.terms", {
      ...withSurfaces(surfaces),
      lexicon,
    }).sections.find((entry) => entry.id === "items-we-give-away");

  test("appears only where this tenant takes requests", () => {
    expect(section(GEAR)).toBeDefined();
    expect(section(NOTHING)).toBeUndefined();
  });

  // Where the ticket's argument lives: the section opens with the component's
  // own words, verbatim and in order. Anything else drifts.
  test("opens with exactly the summary the requester was shown", () => {
    const paragraphs = section(GEAR)!.paragraphs;

    expect(paragraphs.slice(0, GEAR_AS_IS_SUMMARY.length)).toEqual(
      gearAsIsSummary(DEFAULT_LEXICON),
    );
    expect(paragraphs.length).toBeGreaterThan(GEAR_AS_IS_SUMMARY.length);
  });

  // The snapshot stored on the row and the document a reader can go and read
  // are resolved from one constant against one lexicon, so a tenant that
  // renames what it lends cannot end up with two different claims.
  test("is named in this organization's own noun", () => {
    const tools = lexiconFromRows([
      { term: "item_plural", value: "Tools" },
      { term: "collection_public", value: "Tool Library" },
    ]);
    const named = section(GEAR, tools)!;

    expect(named.title).toBe("Tools we give away");
    expect(named.paragraphs[0]).toContain("We give away tools exactly as");
    expect(gearAsIsText(tools)).toContain("We give away tools exactly as");
  });

  // Rule 1 of docs/legal-basis.md, and the reason the platform may write this
  // section at all: every claim is about what is *not* done. The snow-sports
  // vocabulary a first tenant needs belongs to that tenant's own text.
  test("says nothing a snow-sports tenant would have to own", () => {
    const text = legalPlainText(section(GEAR)!.paragraphs).toLowerCase();

    for (const word of ["din", "binding", "boot fitting", "mount"]) {
      expect(text, word).not.toContain(word);
    }
  });
});

/**
 * The accessibility statement's two checkable sentences (#1368).
 *
 * Most of what a legal document here asserts is checked by a person reading it.
 * These two are not: they are claims about the state of `e2e/a11y-baseline.json`
 * on the day they were written, published under an organization's name, to a
 * reader who cannot verify them. "Every failure we know about is in the staff
 * area" and "the staff area has known problems this website does not" both stop
 * being true the moment a public route joins that file -- silently, since
 * nothing else reads the baseline for prose.
 *
 * The baseline is keyed `role|viewport|theme|pattern`, so the fourth field is
 * the route. A new entry outside `/portal` means the sentences have to change,
 * or the finding has to be fixed before the release; either is the right answer
 * and neither should be reached by somebody noticing.
 */
describe("the accessibility statement's claim about the baseline", () => {
  const baseline = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "e2e", "a11y-baseline.json"),
      "utf8",
    ),
  ) as Record<string, string[]>;

  test("every known violation is on a portal route", () => {
    const publicRoutes = Object.keys(baseline)
      .map((key) => key.split("|")[3])
      .filter((pattern) => !pattern?.startsWith("/portal"));

    expect(
      publicRoutes,
      `the accessibility statement says every known failure is in the staff area; ${publicRoutes.join(", ")} is not. Fix the finding, or rewrite "how-we-test" and "what-we-aim-for" in legal-defaults.ts and bump PLATFORM_LEGAL_LAST_UPDATED.`,
    ).toEqual([]);
  });

  test("and the document actually makes the claim this guards", () => {
    const text = readable("legal.accessibility");
    expect(text).toContain(
      "Every accessibility failure we currently know about is in the staff area",
    );
    expect(text).toContain("it has known problems this website does not");
  });

  // The partial claim, and the thing it rests on. A future edit that drops
  // either is the overclaim docs/legal-basis.md exists to refuse.
  test("the conformance claim stays partial, and says why", () => {
    const text = readable("legal.accessibility");
    expect(text).toContain("We are not claiming we have met it");
    expect(text).toContain("No full screen-reader pass has been done");
    expect(text).toContain("partial rather than complete");
  });

  // No response time, no reviewer count, nothing a tenant has not agreed to
  // (docs/legal-basis.md rule 2). The three things only an organization can
  // answer are named as replaceable in the Site Content slot description, not
  // guessed at here.
  test("it commits the organization to no timescale", () => {
    expect(readable("legal.accessibility")).not.toMatch(
      /within \d|\d+ (business |working )?days|\d+ hours/i,
    );
  });
});
