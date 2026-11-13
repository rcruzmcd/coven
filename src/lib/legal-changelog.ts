/**
 * What changed in the platform's legal text at each `PLATFORM_LEGAL_LAST_UPDATED`
 * value, per document, in plain language (#1886).
 *
 * The platform's documents are generated on every request and never stored,
 * so there is no earlier version to diff a confirmation against: the
 * acknowledgement record keeps only the version string it was made against.
 * This list is what lets a `stale` row in the Legal documents panel say *what*
 * moved since then, instead of asking somebody to re-read the whole document
 * to find out.
 *
 * Rules, held by `legal-changelog.test.ts`:
 *
 *   - **Newest first**, and the first entry is the current
 *     `PLATFORM_LEGAL_LAST_UPDATED`. Bumping the constant without adding an
 *     entry fails a test. "Newer" is position in this list, never date
 *     parsing, for the same reason `resolveLegalAcknowledgement` compares
 *     versions as exact strings.
 *   - **One entry per version string.** Several changes that landed under the
 *     same date share one entry, summarized together.
 *   - **Keys are `LegalDocument.key`** for a document the platform has prose
 *     for. A document that did not change is absent from the entry.
 *   - **Summaries describe the text, for the organization serving it.** Where
 *     a change only reaches a tenant running a given module, say so.
 *     Changes caused by a tenant turning a module on or off are not listed:
 *     the platform's text did not move, the tenant's site did.
 *
 * Free of imports on purpose: the Legal documents panel is a client component.
 * The full reasoning behind each change is the approval log in
 * `docs/legal-basis.md`.
 */

export type PlatformLegalChangelogEntry = {
  /** A `PLATFORM_LEGAL_LAST_UPDATED` value, exactly as it was printed. */
  version: string;
  /** Per `LegalDocument.key`, what changed in that document at this version. */
  changes: Readonly<Record<string, string>>;
};

export const PLATFORM_LEGAL_CHANGELOG: readonly PlatformLegalChangelogEntry[] =
  [
    {
      version: "November 2, 2026",
      changes: {
        privacy:
          "The rider profile (activity, experience level, where you prefer to go) is replaced by the organization's own profile questions. Where the site asks any, a new bullet says the answers are kept, the latest shown again, a copy kept at check-in, visible only to roles that cover them, and deletable on request. The retention table lists profile answers in place of rider profiles, still for 2 years.",
      },
    },
    {
      version: "October 31, 2026",
      changes: {
        privacy:
          "Only where form analytics is on: PostHog is also said to count presses of a donate button, links followed to another website (the website, not the page), pages that could not be found, and which catalog filter was used.",
      },
    },
    {
      version: "October 23, 2026",
      changes: {
        privacy:
          "Only where form analytics is on: names PostHog, which counts how many people start and finish the site's forms in aggregate, with no cookies and no names, contact details or answers sent, and adds it to the list of services that process information.",
      },
    },
    {
      version: "October 6, 2026",
      changes: {
        privacy:
          'The backup sentence now describes the database provider\'s own daily backups, kept for 7 days, so deleted information may persist for up to 7 days. It used to say backups were "taken nightly and deleted after 90 days".',
      },
    },
    {
      version: "September 24, 2026",
      changes: {
        privacy:
          "Photos and recordings are no longer described as a consent answer. The event-registration bullet now says an objection to being photographed is kept, and names the ways to make one: any organizer at the event, email, or (for someone with an account) their registration page.",
        terms:
          'The photos paragraph drops "we rely on the consent process described at registration". The takedown route and the note that images shared onward by others are out of the organization\'s hands stay.',
        code_of_conduct:
          'The photo paragraph drops "we rely on the consent process described at registration".',
      },
    },
    {
      version: "September 23, 2026",
      changes: {
        privacy:
          "The event-registration bullet says that where the organization asks whether somebody is happy to be photographed, the answer is kept with the registration.",
        terms:
          "Only where the site takes item requests: a new section says items given away are given as-is, nothing is inspected, tested, repaired or certified, and having an item checked is the recipient's to arrange.",
        accessibility:
          "New document: says what is tested and how, that no full manual screen-reader pass has been done, and that conformance is therefore partial. Scoped to the public website.",
      },
    },
    {
      version: "September 22, 2026",
      changes: {
        privacy:
          "Event registration: says a participant agreement's acceptance (when, and which version) is kept with the registration, and describes the under-18 question, the accompanying adult and emergency contact it collects, and that no date of birth is asked. Volunteers: says only a screening's outcome (level, date, expiry) is recorded, never the check or its result, behind its own permission, with a matching retention row.",
      },
    },
    {
      version: "September 21, 2026",
      changes: {
        privacy:
          "Names Sentry, used for error reporting, in the list of services that process information. The first version the platform recorded an approval for.",
      },
    },
  ];

export type PlatformLegalChange = { version: string; summary: string };

export type PlatformLegalChangesSince = {
  /** This document's changes newer than the confirmed version, newest first. */
  changes: PlatformLegalChange[];
  /**
   * False where the confirmed version is not in the changelog -- confirmed
   * before the log begins, or a value nobody recognises. `changes` is then
   * every change the log records for the document, and the reader should be
   * told the list may not be complete.
   */
  complete: boolean;
};

/**
 * What changed in one document since a confirmation against `confirmedVersion`.
 *
 * An empty, complete result for a stale confirmation is meaningful: the
 * version moved because another document changed, and this one reads as it
 * did.
 */
export function platformLegalChangesSince(
  documentKey: string,
  confirmedVersion: string,
  changelog: readonly PlatformLegalChangelogEntry[] = PLATFORM_LEGAL_CHANGELOG,
): PlatformLegalChangesSince {
  const confirmedAt = changelog.findIndex(
    (entry) => entry.version === confirmedVersion,
  );
  const newer =
    confirmedAt === -1 ? changelog : changelog.slice(0, confirmedAt);
  return {
    changes: newer.flatMap((entry) => {
      const summary = entry.changes[documentKey];
      return summary ? [{ version: entry.version, summary }] : [];
    }),
    complete: confirmedAt !== -1,
  };
}
