import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { LegalDocument } from "@/components/legal-document";
import {
  platformLegalDocument,
  PLATFORM_LEGAL_SLOT_KEYS,
  type LegalOrgContext,
} from "@/lib/legal-defaults";
import { collectionSurface, type CollectionSurface } from "@/lib/legal-surface";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import { LEGAL_DOCUMENT_OUTLINES } from "@/lib/site-content";

// The section nav beside each legal document is driven by that document's
// sections, while the anchors it points at live on <section> elements in the
// body. Nothing links the two, so a renamed or dropped section leaves a nav
// entry that scrolls nowhere -- silently, since a bad fragment is not an
// error. These pages are long enough that nobody would notice by scrolling.
//
// Since #858 the platform's own documents are data too, built from the same
// outline the Site Content editor offers a tenant as a starting point, so this
// also guards that outline against drifting from the published page.
const ORG: LegalOrgContext = {
  name: "Example Nonprofit",
  emailGeneral: "hello@example.org",
  emailPrivacy: "privacy@example.org",
  emailConduct: "conduct@example.org",
  surfaces: collectionSurface({}, {}),
  lexicon: DEFAULT_LEXICON,
};

/** A tenant with no public forms: the surface #1291 drops whole sections on. */
const NO_FORMS: CollectionSurface = {
  contact: false,
  volunteerApplications: false,
  eventRegistrations: false,
  profileQuestions: false,
  gearRequests: false,
  artworkSubmissions: false,
  constituentAccounts: false,
  volunteerHours: false,
  volunteerScreening: false,
  googleSignIn: false,
  formAnalytics: false,
};

const PAGES = [
  ...PLATFORM_LEGAL_SLOT_KEYS.map((key) => ({
    name: LEGAL_DOCUMENT_OUTLINES[key].title.toLowerCase(),
    Page: () => <LegalDocument doc={platformLegalDocument(key, ORG)} />,
  })),
  // Since #1291 a document can be served with sections filtered out of it, and
  // the rail is built from the same list -- so it is worth proving the filtered
  // document has no dead anchor either, not just the full one.
  ...PLATFORM_LEGAL_SLOT_KEYS.map((key) => ({
    name: `${LEGAL_DOCUMENT_OUTLINES[key].title.toLowerCase()} with no forms`,
    Page: () => (
      <LegalDocument
        doc={platformLegalDocument(key, { ...ORG, surfaces: NO_FORMS })}
      />
    ),
  })),
  // A tenant-published document goes through the same component, so the same
  // invariants hold for it.
  {
    name: "tenant-published document",
    Page: () => (
      <LegalDocument
        doc={{
          title: "House Rules",
          last_updated: "January 1, 2030",
          summary: ["The short version."],
          sections: [
            { id: "one", title: "One", paragraphs: ["First."] },
            { id: "two", title: "Two", paragraphs: ["Second.", "Third."] },
          ],
        }}
      />
    ),
  },
];

describe("legal page section navs", () => {
  for (const { name, Page } of PAGES) {
    test(`every ${name} nav link points at a section that exists`, () => {
      const { container } = render(<Page />);

      const nav = container.querySelector('nav[aria-label="On this page"]');
      expect(nav, "section nav is rendered").not.toBeNull();

      const targets = [...nav!.querySelectorAll("a")].map((a) =>
        a.getAttribute("href")!.replace(/^#/, ""),
      );
      expect(targets.length).toBeGreaterThan(0);

      for (const id of targets) {
        expect(
          container.querySelector(`section#${id}`),
          `#${id} is linked from the nav but no section has that id`,
        ).not.toBeNull();
      }
    });

    test(`every ${name} section is listed in the nav`, () => {
      const { container } = render(<Page />);

      const listed = new Set(
        [...container.querySelectorAll('nav[aria-label="On this page"] a')].map(
          (a) => a.getAttribute("href")!.replace(/^#/, ""),
        ),
      );

      for (const section of container.querySelectorAll("section[id]")) {
        // The lead section carrying the <h1> and the "last updated" line is
        // deliberately not listed -- it is where the reader already is, and
        // it is the target of the "Back to top" link.
        if (section.id === "top") continue;

        expect(
          listed.has(section.id),
          `section #${section.id} exists but is missing from the nav`,
        ).toBe(true);
      }
    });

    // Below `lg` the rail is swapped for a collapsed <details>. It is a second
    // hand-rendered copy of the same list, so it can drift out of step with
    // the rail on its own.
    test(`the ${name} mobile section list matches the rail`, () => {
      const { container } = render(<Page />);

      const hrefs = (selector: string) =>
        [...container.querySelectorAll(`${selector} a`)].map((a) =>
          a.getAttribute("href"),
        );

      const rail = hrefs('nav[aria-label="On this page"]');
      const collapsed = hrefs("details");

      expect(collapsed.length).toBeGreaterThan(0);
      expect(collapsed).toEqual(rail);
    });
  }
});
