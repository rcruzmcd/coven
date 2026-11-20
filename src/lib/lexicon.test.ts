import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LEXICON,
  LEXICON_SETTING_KEYS,
  LEXICON_TERMS,
  MAX_LEXICON_TERM_LENGTH,
  applyLexicon,
  lexiconFromRows,
  lexiconSettingKey,
} from "./lexicon";
import { NAV_GROUPS, visibleGroups } from "./public-nav";
import { PUBLIC_PAGE_SLOTS, namedSlots } from "./page-visibility";
import { SITE_CONTENT_SLOTS, resolveSiteContent } from "./site-content";
import { NAV_ITEMS, visibleNavItems } from "./portal/nav";
import { CONTACT_TOPICS, contactTopicLabel } from "./contact-topics";
import {
  platformLegalDocument,
  PLATFORM_LEGAL_SLOT_KEYS,
  type LegalOrgContext,
} from "./legal-defaults";
import { collectionSurface } from "./legal-surface";

/** A tenant that lends tools rather than snow gear. */
const TOOLS = lexiconFromRows([
  { term: "collection", value: "Tools" },
  { term: "collection_public", value: "Tool Library" },
  { term: "item", value: "Tool" },
  { term: "item_plural", value: "Tools" },
]);

describe("LEXICON_TERMS", () => {
  // The registry's own rule, and the reason it is worth a test: a lexicon that
  // grows without argument becomes a translation system nobody maintains.
  test("stays small", () => {
    expect(LEXICON_TERMS.length).toBeLessThanOrEqual(6);
  });

  test("every default is within the length the admin action enforces", () => {
    for (const term of LEXICON_TERMS) {
      expect(term.default.length).toBeLessThanOrEqual(MAX_LEXICON_TERM_LENGTH);
    }
  });

  test("keys are the app_settings suffixes under the reserved prefix", () => {
    expect(LEXICON_SETTING_KEYS).toEqual(
      LEXICON_TERMS.map((term) => `lexicon.${term.key}`),
    );
    expect(lexiconSettingKey("collection")).toBe("lexicon.collection");
  });
});

describe("lexiconFromRows", () => {
  test("falls back to the platform's word for a term the tenant has not set", () => {
    const lexicon = lexiconFromRows([{ term: "collection", value: "Pantry" }]);

    expect(lexicon.collection).toBe("Pantry");
    expect(lexicon.item_plural).toBe("Items");
  });

  // The admin panel clears a field by writing "", because app_settings has no
  // delete grant. A cleared term is an unset one, not an empty label.
  test("treats a blank row as unset", () => {
    expect(
      lexiconFromRows([{ term: "collection", value: "   " }]).collection,
    ).toBe("Inventory");
  });

  test("ignores a value that is not a string", () => {
    expect(lexiconFromRows([{ term: "collection", value: 7 }]).collection).toBe(
      "Inventory",
    );
  });

  test("ignores a term no registry entry claims", () => {
    const lexicon = lexiconFromRows([{ term: "made_up", value: "Nope" }]);

    expect(lexicon.made_up).toBeUndefined();
    expect(Object.keys(lexicon)).toEqual(LEXICON_TERMS.map((t) => t.key));
  });
});

describe("applyLexicon", () => {
  test("substitutes a term as the tenant capitalised it", () => {
    expect(applyLexicon("Donate or Request {item_plural}", TOOLS)).toBe(
      "Donate or Request Tools",
    );
  });

  test("lowercases for a word sitting mid-sentence", () => {
    expect(applyLexicon("The {collection_public:lower} is open.", TOOLS)).toBe(
      "The tool library is open.",
    );
  });

  // Visible rather than silent: a typo that blanked part of a sentence would
  // read as deliberate copy.
  test("leaves an unknown placeholder standing", () => {
    expect(applyLexicon("A {colection} of things", TOOLS)).toBe(
      "A {colection} of things",
    );
  });

  test("leaves a string with no placeholder alone", () => {
    expect(applyLexicon("Sizing Guide", TOOLS)).toBe("Sizing Guide");
  });
});

/**
 * The sweep that makes the placeholder syntax safe to use: every template any
 * registry holds has to resolve against the platform's own lexicon, or a typo
 * ships as braces on a real page.
 */
describe("every registry template resolves", () => {
  const unresolved = (value: string) => /\{[a-z_]+(:lower)?\}/.test(value);

  test("public nav labels", () => {
    for (const group of visibleGroups([])) {
      expect(unresolved(group.label), group.label).toBe(false);
      for (const link of group.links ?? []) {
        expect(unresolved(link.label), link.label).toBe(false);
      }
    }
  });

  test("portal nav labels", () => {
    const everything = new Proxy({}, { get: () => "manage" }) as Parameters<
      typeof visibleNavItems
    >[0];

    for (const item of visibleNavItems(everything)) {
      expect(unresolved(item.label), item.label).toBe(false);
      for (const sub of item.subItems ?? []) {
        expect(unresolved(sub.label), sub.label).toBe(false);
      }
    }
  });

  test("page visibility labels and descriptions", () => {
    for (const slot of namedSlots(DEFAULT_LEXICON)) {
      expect(unresolved(slot.label), slot.key).toBe(false);
      expect(unresolved(slot.description), slot.key).toBe(false);
    }
  });

  test("contact topics", () => {
    for (const topic of CONTACT_TOPICS) {
      expect(unresolved(contactTopicLabel(topic.value)), topic.value).toBe(
        false,
      );
    }
  });

  // #1367 put a placeholder in a legal document's heading, so the same sweep
  // has to cover the three documents the platform serves. A brace on a
  // published privacy policy is worse than one in the nav: it is text an
  // organization is publishing under its own name.
  test("the platform's legal documents", () => {
    const org: LegalOrgContext = {
      name: "Riverside Trails",
      emailGeneral: "hello@riverside.example",
      emailPrivacy: "privacy@riverside.example",
      emailConduct: "conduct@riverside.example",
      surfaces: collectionSurface({}, {}),
      lexicon: DEFAULT_LEXICON,
    };

    for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
      const document = platformLegalDocument(key, org);
      expect(unresolved(document.title), key).toBe(false);
      for (const paragraph of document.summary) {
        expect(unresolved(paragraph), key).toBe(false);
      }
      for (const section of document.sections) {
        expect(unresolved(section.title), `${key}/${section.id}`).toBe(false);
        for (const paragraph of section.paragraphs) {
          expect(unresolved(paragraph), `${key}/${section.id}`).toBe(false);
        }
      }
    }
  });

  test("site content defaults", () => {
    const content = resolveSiteContent([]);
    for (const slot of SITE_CONTENT_SLOTS) {
      // A placeholder the slot's reader fills is declared on the slot, so only
      // those are exempt -- anything else in braces is still a typo.
      const unresolvedHere = (value: string) =>
        unresolved(
          (slot.placeholders ?? []).reduce(
            (text, placeholder) => text.replaceAll(placeholder, ""),
            value,
          ),
        );
      if (slot.type === "text") {
        expect(unresolvedHere(content.text(slot.key)), slot.key).toBe(false);
      }
      if (slot.type === "paragraphs") {
        for (const paragraph of content.paragraphs(slot.key)) {
          expect(unresolvedHere(paragraph), slot.key).toBe(false);
        }
      }
      if (slot.type === "list") {
        for (const item of content.list(slot.key)) {
          for (const value of Object.values(item)) {
            // Booleans carry no copy, so there is nothing in one to resolve.
            if (typeof value === "boolean") continue;
            const values = Array.isArray(value) ? value : [value];
            for (const entry of values) {
              expect(unresolvedHere(entry), slot.key).toBe(false);
            }
          }
        }
      }
    }
  });
});

/**
 * What the ticket was actually about: renaming the heading used to leave the
 * nav item directly above it saying "Gear".
 */
describe("a tenant's word reaches every surface that named the concept", () => {
  test("the public nav", () => {
    const gear = visibleGroups([], TOOLS).find(
      (group) => group.href === "/inventory",
    );

    expect(gear?.label).toBe("Tools");
    expect(gear?.links?.map((link) => link.label)).toEqual([
      "Tool Library",
      "Sizing Guide",
      "Donate or Request Tools",
    ]);
  });

  test("the portal sidebar", () => {
    const everything = new Proxy({}, { get: () => "manage" }) as Parameters<
      typeof visibleNavItems
    >[0];
    const inventory = visibleNavItems(everything, TOOLS).find(
      (item) => item.value === "inventory",
    );

    expect(inventory?.label).toBe("Tools");
    expect(inventory?.subItems?.map((sub) => sub.label)).toContain(
      "Tools Categories",
    );
  });

  test("the page visibility panel", () => {
    const slot = namedSlots(TOOLS).find((entry) => entry.key === "gears");

    expect(slot?.label).toBe("Tools");
    expect(slot?.description).toBe(
      "The tool library and the tools donation pages.",
    );
  });

  test("the contact form's topic", () => {
    expect(contactTopicLabel("gear", TOOLS)).toBe("Tools");
  });

  test("the unwritten site copy", () => {
    expect(resolveSiteContent([], TOOLS).text("gears.library_heading")).toBe(
      "Tool Library",
    );
  });

  // The internal identifiers the ticket deliberately left alone. Renaming one
  // is a data migration; a contributor reading `gears` as a product name and
  // "fixing" it is the mistake this test is here to catch.
  test("but no internal key is renamed", () => {
    expect(PUBLIC_PAGE_SLOTS.some((slot) => slot.key === "gears")).toBe(true);
    expect(NAV_ITEMS.some((item) => item.value === "inventory")).toBe(true);
    expect(NAV_GROUPS.some((group) => group.href === "/inventory")).toBe(true);
    expect(CONTACT_TOPICS.some((topic) => topic.value === "gear")).toBe(true);
    expect(
      SITE_CONTENT_SLOTS.some((slot) => slot.key === "gears.library_heading"),
    ).toBe(true);
  });
});

/** A tenant's own copy is their writing, braces and all. */
describe("stored values are never templated", () => {
  test("a brace in a tenant's own copy survives", () => {
    const content = resolveSiteContent(
      [{ key: "gears.library_heading", value: "The {item_plural} Room" }],
      TOOLS,
    );

    expect(content.text("gears.library_heading")).toBe(
      "The {item_plural} Room",
    );
  });
});
