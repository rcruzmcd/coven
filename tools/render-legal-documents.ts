#!/usr/bin/env bun
/**
 * Renders the platform's legal documents as Markdown, so they can be read and
 * approved without a developer (#1340).
 *
 * The prose in `src/lib/legal-defaults.ts` is template literals assembled by
 * `platformLegalDocument()`, which makes the served text impossible to review
 * in the source file: the bullets, retention rows and whole sections a tenant
 * actually gets depend on its collection surface (#1291), and the rules the
 * prose was written under are stated at the top of that module rather than
 * anywhere a reader would look. Approving a document nobody can read is how
 * `legal-defaults.ts` came to be serving under every default tenant's name
 * with no approval record at all.
 *
 * It calls the same function the public routes call, so what it prints is what
 * is served and it cannot drift. That is the whole reason this exists rather
 * than a copy of the prose committed under docs/ -- a copy is correct on the
 * day it is written and wrong at the next commit.
 *
 * It lives in tools/ rather than scripts/ because scripts/ is gitignored for
 * local-only helpers, and this one is referenced from docs/legal-basis.md.
 *
 *   bun run docs:legal              # every collection surface on: the maximal form
 *   bun run docs:legal --minimal    # every surface off: the shortest a tenant gets
 *   bun run docs:legal > /tmp/legal.md
 *
 * The approval log, and what approving means, are in docs/legal-basis.md.
 */

import {
  platformLegalDocument,
  PLATFORM_LEGAL_LAST_UPDATED,
  PLATFORM_LEGAL_SLOT_KEYS,
  type LegalOrgContext,
} from "@/lib/legal-defaults";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import type { CollectionSurface } from "@/lib/legal-surface";

/**
 * Every slot the platform has prose for, which is not every legal document
 * any more: the participant waiver (#686) is a tenant's own words or nothing,
 * so there is nothing here to render for it.
 *
 * Derived rather than listed, so this can neither miss a document the platform
 * starts writing nor invent one it does not.
 */
const SLOTS = PLATFORM_LEGAL_SLOT_KEYS;

/**
 * Deliberately obvious placeholders rather than a plausible organization.
 * A rendering that reads like somebody's real privacy policy is one paste away
 * from being published as one, which is the mistake #858 exists to undo.
 */
const PLACEHOLDER: Omit<LegalOrgContext, "surfaces"> = {
  name: "{Organization}",
  emailGeneral: "hello@example.org",
  emailPrivacy: "privacy@example.org",
  emailConduct: "conduct@example.org",
  // The platform's own words rather than a tenant's (#1367). What is approved
  // here is the sentence the platform wrote; an organization that lends tools
  // reads "tools" in place of "items" and has agreed to no different claim.
  lexicon: DEFAULT_LEXICON,
};

const ALL_ON: CollectionSurface = {
  contact: true,
  volunteerApplications: true,
  eventRegistrations: true,
  profileQuestions: true,
  gearRequests: true,
  artworkSubmissions: true,
  constituentAccounts: true,
  volunteerHours: true,
  volunteerScreening: true,
  googleSignIn: true,
  formAnalytics: true,
};

const ALL_OFF: CollectionSurface = {
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

export function renderLegalDocuments(surfaces: CollectionSurface): string {
  const org: LegalOrgContext = { ...PLACEHOLDER, surfaces };
  const out: string[] = [];

  for (const slot of SLOTS) {
    const document = platformLegalDocument(slot, org);
    out.push(`# ${document.title}`);
    out.push(`_Last updated: ${document.last_updated}_`);
    out.push(...document.summary);
    for (const section of document.sections) {
      out.push(`## ${section.title}`);
      out.push(...section.paragraphs);
    }
    out.push("---");
  }

  // The trailing separator belongs between documents, not after the last one.
  out.pop();
  return out.join("\n\n");
}

if (import.meta.main) {
  const minimal = process.argv.includes("--minimal");
  const surfaces = minimal ? ALL_OFF : ALL_ON;

  console.log(
    [
      `<!-- Rendered by \`bun run docs:legal${minimal ? " --minimal" : ""}\` from src/lib/legal-defaults.ts.`,
      `     PLATFORM_LEGAL_LAST_UPDATED = ${PLATFORM_LEGAL_LAST_UPDATED}.`,
      `     Collection surfaces: ${minimal ? "all off — the shortest form a tenant is served" : "all on — the maximal form"}.`,
      `     {Organization} is tenants.name; the addresses are org.email_general, org.email_privacy and org.email_conduct. -->`,
      "",
      renderLegalDocuments(surfaces),
    ].join("\n"),
  );
}

export { ALL_ON, ALL_OFF, PLACEHOLDER, SLOTS };
