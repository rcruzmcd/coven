import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ORG_TIME_ZONE } from "@/lib/org-timezone";
import type { LegalDocumentContent } from "@/lib/site-content";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * The publication history of a tenant's legal documents, as the public site
 * reads it (#601).
 *
 * The read, kept out of `@/lib/legal-documents.ts` for the reason
 * `@/lib/legal-publication.ts` is: that module reaches the client bundle and
 * this must not.
 *
 * Every version stays readable, not only the newest. "Which version did I
 * agree to when I registered" is a question a person asks, and `audit_log`
 * answers it only for somebody with a database and a reason to open it -- so
 * each published version has an address, and the live document says which one
 * it is and links the rest.
 *
 * A tenant serving the platform's default document (#858) has no versions of
 * its own, and that is not a gap to paper over: the default is regenerated
 * from the live configuration on every request, so the honest thing to say is
 * when the *platform's* text last changed, which is `PLATFORM_LEGAL_LAST_UPDATED`
 * in `@/lib/legal-defaults.ts`. See `LegalVersionNotice`.
 */

export type PublishedLegalVersion = {
  version: number;
  effective_at: string;
  /** The organization's zone at publish time, frozen with the text. */
  time_zone: string;
  content: LegalDocumentContent;
};

/** A stored document, checked before it is rendered as one. */
function isLegalDocumentContent(value: unknown): value is LegalDocumentContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as Partial<LegalDocumentContent>;
  return (
    typeof doc.title === "string" &&
    typeof doc.last_updated === "string" &&
    Array.isArray(doc.summary) &&
    Array.isArray(doc.sections) &&
    doc.sections.every(
      (section) =>
        typeof section?.id === "string" &&
        typeof section?.title === "string" &&
        Array.isArray(section?.paragraphs),
    )
  );
}

/**
 * Every published version of one document, newest first.
 *
 * Read through `public_legal_document_versions`, which answers for the
 * **request host's** tenant, so a version number is only ever resolved against
 * the organization whose site the reader is on.
 */
export const getPublishedLegalVersions = cache(
  async (
    supabase: SupabaseClient,
    document: string,
  ): Promise<PublishedLegalVersion[]> => {
    const { data, error } = await supabase
      .from("public_legal_document_versions")
      .select("version, effective_at, time_zone, content")
      .eq("document", document)
      .order("version", { ascending: false });

    // Loud, and empty. A document whose history cannot be read serves no
    // history rather than a partial one -- the live text is unaffected, which
    // matters most for /privacy, the one page that must never fail -- but an
    // unreadable view looks exactly like a tenant that has published nothing,
    // so it says so in the log.
    if (error) {
      reportQueryError(error, {
        source: "legal-versions.public_legal_document_versions",
        message:
          "could not read public_legal_document_versions; serving no version history",
      });
      return [];
    }

    return (data ?? [])
      .filter((row) => isLegalDocumentContent(row.content))
      .map((row) => ({
        version: Number(row.version),
        effective_at: String(row.effective_at),
        // A row whose zone did not survive a round trip renders in UTC rather
        // than in whatever zone the rendering process happens to be in --
        // labelled either way, so the reader is never guessing.
        time_zone: String(row.time_zone || DEFAULT_ORG_TIME_ZONE),
        content: row.content as LegalDocumentContent,
      }));
  },
);

/**
 * The version a `?version=` parameter names, or `undefined` when it names none.
 *
 * Deliberately not "fall back to the newest": an address that quietly serves
 * something other than the version it names is worse than a 404, because the
 * reader has no way to tell. `null`/absent is the caller's own case -- the
 * live document -- and is not this function's business.
 */
export function selectLegalVersion(
  versions: readonly PublishedLegalVersion[],
  requested: string | string[] | undefined,
): PublishedLegalVersion | undefined {
  if (typeof requested !== "string") return undefined;
  // Plain digits only, rather than `Number.isInteger(Number(...))`: that
  // accepts `1e0` and `0x2` as well, which would give one version two more
  // addresses apiece.
  if (!/^[1-9]\d*$/.test(requested)) return undefined;
  const wanted = Number(requested);
  return versions.find((version) => version.version === wanted);
}

/** The permalink for one version of a document served at `route`. */
export function legalVersionPath(route: string, version: number): string {
  return `${route}?version=${version}`;
}
