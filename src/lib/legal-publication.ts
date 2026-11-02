import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PUBLICATION_PREFIX,
  resolveInForce,
  type LegalDocument,
} from "@/lib/legal-documents";
import {
  LEGAL_ACKNOWLEDGEMENT_PREFIX,
  parseLegalAcknowledgement,
  resolveLegalAcknowledgement,
  type LegalAcknowledgement,
  type LegalAcknowledgementRecord,
} from "@/lib/legal-acknowledgement";
import {
  LEGAL_APPROVAL_SETTING_KEY,
  resolveApprovalRequired,
  type LegalPublishState,
} from "@/lib/legal-approval";
import { PLATFORM_LEGAL_LAST_UPDATED } from "@/lib/legal-defaults";
import {
  collectionSurface,
  LEGAL_SURFACE_PREFIX,
  surfaceDrift,
  surfaceKeys,
  type LegalDocumentDrift,
} from "@/lib/legal-surface";
import {
  getTenantAsksProfileQuestions,
  getTenantModules,
  getTenantPageVisibility,
} from "@/lib/page-visibility";
import { siteContentActorNames } from "@/lib/site-content-actors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Which legal documents this tenant serves (#859).
 *
 * The registry and the reasoning are in `@/lib/legal-documents.ts`; this is the
 * read, kept separate because that module reaches the client bundle and this
 * one must not. Same split as `@/lib/page-visibility`, and the same storage:
 * one `app_settings` row per document, exposed to the public site through the
 * `public_legal_publication` view.
 */
export type LegalPublication = Record<string, boolean>;

export const getLegalPublication = cache(
  async (supabase: SupabaseClient): Promise<LegalPublication> => {
    const { data, error } = await supabase
      .from("public_legal_publication")
      .select("document, value");

    // A failed read lands on "not in force", which is where an unreadable flag
    // has to land: serving terms nobody adopted under an organization's name is
    // the failure this gate exists to prevent. The privacy policy is unaffected
    // -- `resolveInForce` serves it whatever comes back -- so a broken read
    // cannot take down the one page that must never 404. Loud, though: a view
    // missing from a database looked exactly like a toggle refusing to save
    // when page visibility hit it.
    if (error) {
      console.error(
        "[legal-publication] could not read public_legal_publication; only the privacy policy is being served",
        error,
      );
    }

    const inForce: LegalPublication = {};
    for (const document of LEGAL_DOCUMENTS) {
      const row = data?.find((setting) => setting.document === document.key);
      inForce[document.key] = resolveInForce(document, row?.value);
    }
    return inForce;
  },
);

/**
 * The same state for the tenant the signed-in admin has selected, for the
 * Legal documents panel. Read straight from `app_settings` -- RLS scopes it to
 * the current tenant -- rather than through `public_legal_publication`, which
 * answers for the *request host*. Same split as `getTenantLayoutValues` and
 * `getSiteLayout`, and for the same reason.
 *
 * Reading the public view here is what made the switch snap back (#859): the
 * write goes to `app_settings` with `tenant_id` defaulting to
 * `default_tenant_id()`, which is the admin's own tenant, while the panel read
 * came back for whichever tenant `public_tenant_id()` resolves `portal.<domain>`
 * to -- a different tenant, or none at all once a second tenant is active and
 * the sole-active-tenant fallback switches off. The row was written, the toast
 * was honest, and the re-render showed the document as never adopted.
 */
export const getTenantLegalPublication = cache(
  async (supabase: SupabaseClient): Promise<LegalPublication> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${LEGAL_PUBLICATION_PREFIX}%`);

    // Same reasoning as the read above, and the same refusal to be quiet about
    // it: "not in force" is where an unreadable flag has to land, but a silent
    // fallback is indistinguishable from a toggle that will not save.
    if (error) {
      console.error(
        "[legal-publication] could not read legal_publication.* from app_settings; the panel is showing every document as not in force",
        error,
      );
    }

    const stored = new Map(
      (data ?? []).map((row) => [
        String(row.key).slice(LEGAL_PUBLICATION_PREFIX.length),
        row.value,
      ]),
    );

    const inForce: LegalPublication = {};
    for (const document of LEGAL_DOCUMENTS) {
      inForce[document.key] = resolveInForce(
        document,
        stored.get(document.key),
      );
    }
    return inForce;
  },
);

/**
 * Which of the three the tenant has published text of its own for.
 *
 * A published row is `value not null`; a draft is not being served and does not
 * count. Shared -- and `cache()`d -- because the Legal documents panel and the
 * portal shell's attention list both need it and both run on the same request.
 */
export const getTenantOwnLegalDocuments = cache(
  async (supabase: SupabaseClient): Promise<Set<string>> => {
    const { data } = await supabase
      .from("site_content")
      .select("key, value")
      .like("key", "legal.%")
      .not("value", "is", null);
    return new Set((data ?? []).map((row) => String(row.key)));
  },
);

/** What one published document recorded about the site it was written for. */
export type LegalSurfaceFingerprint = {
  surfaces: string[];
  publishedAt: string | null;
};

/**
 * The fingerprint each of this tenant's published legal documents carries
 * (#1292), or `null` where there is none.
 *
 * `null` is **unknown**, not "collected nothing" -- see `surfaceDrift()`. Only
 * documents published since the fingerprint shipped have one, which on day one
 * is none of them.
 *
 * Read from `app_settings` for the *selected* tenant rather than through a
 * public view, for the same reason `getTenantLegalPublication` above does: the
 * write goes to the admin's own tenant, and reading the request host's would
 * answer for a different organization.
 */
export const getTenantLegalSurfaces = cache(
  async (
    supabase: SupabaseClient,
  ): Promise<Record<string, LegalSurfaceFingerprint | null>> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${LEGAL_SURFACE_PREFIX}%`);

    // Quiet in the UI, loud in the log: an unreadable fingerprint lands on
    // "unknown", which is the honest answer and the one that says nothing
    // alarming -- but it is indistinguishable from a document published before
    // this existed, so nothing else would ever mention it.
    if (error) {
      console.error(
        "[legal-publication] could not read legal_surface.* from app_settings; every document is showing as never fingerprinted",
        error,
      );
    }

    const fingerprints: Record<string, LegalSurfaceFingerprint | null> = {};
    for (const document of LEGAL_DOCUMENTS) fingerprints[document.key] = null;

    for (const row of data ?? []) {
      const key = String(row.key).slice(LEGAL_SURFACE_PREFIX.length);
      if (!(key in fingerprints)) continue;
      const value = row.value as {
        surfaces?: unknown;
        published_at?: unknown;
      } | null;
      if (!value || !Array.isArray(value.surfaces)) continue;
      fingerprints[key] = {
        surfaces: value.surfaces.map(String),
        publishedAt:
          typeof value.published_at === "string" ? value.published_at : null,
      };
    }
    return fingerprints;
  },
);

/**
 * Whether a published legal document still describes what the site collects
 * (#1292).
 *
 * Reported only for a document that is **both** the tenant's own text **and**
 * in force. The platform's own document regenerates from the live
 * configuration on every request and cannot go stale, and text nobody is being
 * served cannot mislead anybody -- so the panel line and the shell's attention
 * item answer to one rule rather than to two that could disagree.
 *
 * Every read it makes is `cache()`d per request, so an administrator whose
 * portal shell asked this question and then opened Legal documents pays for it
 * once.
 */
export async function getLegalDocumentDrift(
  supabase: SupabaseClient,
): Promise<Record<string, LegalDocumentDrift>> {
  const [publication, ownDocuments, fingerprints, visibility, modules, asks] =
    await Promise.all([
      getTenantLegalPublication(supabase),
      getTenantOwnLegalDocuments(supabase),
      getTenantLegalSurfaces(supabase),
      getTenantPageVisibility(supabase),
      getTenantModules(supabase),
      getTenantAsksProfileQuestions(supabase),
    ]);

  const current = surfaceKeys(collectionSurface(visibility, modules, asks));
  const state: Record<string, LegalDocumentDrift> = {};

  for (const document of LEGAL_DOCUMENTS) {
    if (!publication[document.key]) continue;
    if (!ownDocuments.has(document.slotKey)) continue;

    const fingerprint = fingerprints[document.key];
    const drift = surfaceDrift(fingerprint?.surfaces, current);
    state[document.key] = drift
      ? {
          status: "checked",
          publishedAt: fingerprint?.publishedAt ?? null,
          ...drift,
        }
      : { status: "unknown" };
  }

  return state;
}

/**
 * What each of this tenant's documents was last confirmed at (#1321), or
 * `null` where nobody has confirmed it.
 *
 * Read from `app_settings` for the *selected* tenant rather than through a
 * public view, for the same reason every read above it does: the write goes to
 * the admin's own tenant, and the request host answers for a different
 * organization. There is no public view to read anyway -- see
 * `LEGAL_ACKNOWLEDGEMENT_PREFIX`.
 */
export const getTenantLegalAcknowledgements = cache(
  async (
    supabase: SupabaseClient,
  ): Promise<Record<string, LegalAcknowledgementRecord | null>> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${LEGAL_ACKNOWLEDGEMENT_PREFIX}%`);

    // Quiet in the UI, loud in the log, exactly as the fingerprint read above
    // is: an unreadable row lands on "nobody has confirmed this", which is the
    // cautious answer and the only one that cannot claim a confirmation that
    // did not happen -- but it is indistinguishable from the genuine article,
    // so an organization being asked to re-read a document it read last week
    // would have nothing to go on.
    if (error) {
      console.error(
        "[legal-publication] could not read legal_acknowledged.* from app_settings; every document is showing as never confirmed",
        error,
      );
    }

    const acknowledgements: Record<string, LegalAcknowledgementRecord | null> =
      {};
    for (const document of LEGAL_DOCUMENTS)
      acknowledgements[document.key] = null;

    for (const row of data ?? []) {
      const key = String(row.key).slice(LEGAL_ACKNOWLEDGEMENT_PREFIX.length);
      if (!(key in acknowledgements)) continue;
      acknowledgements[key] = parseLegalAcknowledgement(row.value);
    }
    return acknowledgements;
  },
);

/**
 * Whether somebody here has read the platform's text for each document this
 * tenant is serving it for (#1321).
 *
 * The exact complement of `getLegalDocumentDrift` above, and deliberately so:
 * a document in force is either the tenant's own text, which can go stale
 * against the site and is that function's business, or the platform's, which
 * cannot go stale but can go unread and is this one's. Every document in force
 * is answered by exactly one of the two, so the panel and the portal shell's
 * attention item never report the same document twice and never leave one
 * unaccounted for.
 *
 * A document the platform has no text for is absent from this one whatever
 * happens, because there is nothing for anybody here to have read: the waiver
 * (#686) is answered by drift alone.
 *
 * A document not in force is absent from both. The terms and the code of
 * conduct serve nothing until an organization adopts them, and asking somebody
 * to confirm they have read a page that 404s is asking for a signature on a
 * blank sheet.
 */
export async function getLegalAcknowledgementState(
  supabase: SupabaseClient,
): Promise<Record<string, LegalAcknowledgement>> {
  const [publication, ownDocuments, acknowledgements] = await Promise.all([
    getTenantLegalPublication(supabase),
    getTenantOwnLegalDocuments(supabase),
    getTenantLegalAcknowledgements(supabase),
  ]);

  const state: Record<string, LegalAcknowledgement> = {};
  for (const document of LEGAL_DOCUMENTS) {
    if (!publication[document.key]) continue;
    // Nothing to have read. A document with no platform prose (#686) is always
    // the tenant's own words, so the line below would already skip it -- but
    // only while the text exists. Saying it here means the in-force-with-no-
    // text state cannot produce a request to confirm somebody read a document
    // the platform never wrote.
    if (!document.hasPlatformDefault) continue;
    if (ownDocuments.has(document.slotKey)) continue;
    state[document.key] = resolveLegalAcknowledgement(
      acknowledgements[document.key],
      PLATFORM_LEGAL_LAST_UPDATED,
    );
  }
  return state;
}

/**
 * Whether this tenant requires a second approver before a legal document
 * publishes (#600).
 *
 * Read from `app_settings` for the *selected* tenant, like every read above
 * it, and off wherever the row is missing or unreadable. Off is the cautious
 * answer in both directions here: the panel would otherwise show a gate nobody
 * set, and the gate that actually decides a publish is the one inside
 * `publish_site_content` rather than this.
 */
export const getTenantLegalApproval = cache(
  async (supabase: SupabaseClient): Promise<boolean> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", LEGAL_APPROVAL_SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.error(
        "[legal-publication] could not read legal_approval.required from app_settings; the second-approver gate is showing as off",
        error,
      );
    }

    return resolveApprovalRequired(data?.value);
  },
);

/**
 * How many people here could publish website content, for the refusal that
 * stops a single-administrator tenant switching the gate on.
 *
 * The count comes from the database rather than from a permissions read in
 * TypeScript because it is a question about *other people's* roles, which no
 * ordinary portal read can answer: `my_permissions()` answers for the caller
 * alone, and `auth.users` is not readable from the browser at all. Nought on a
 * failed read, which refuses the switch -- a gate switched on because a count
 * came back empty would be the lockout the refusal exists to prevent.
 */
export const getSiteContentApproverCount = cache(
  async (supabase: SupabaseClient): Promise<number> => {
    const { data, error } = await supabase.rpc("site_content_approver_count");
    if (error) {
      console.error(
        "[legal-publication] could not count the people who can publish website content; the second-approver gate cannot be switched on",
        error,
      );
      return 0;
    }
    return typeof data === "number" ? data : 0;
  },
);

/**
 * Per document: the draft waiting to be published, and the approval recorded
 * on the text being served now (#600).
 *
 * This is what lets the panel say who is waiting on whom. The viewer's own id
 * is compared here rather than sent to the browser -- the panel is a client
 * component, and whether *you* drafted this is the only part of an account id
 * it has any use for.
 */
export const getTenantLegalPublishState = cache(
  async (
    supabase: SupabaseClient,
  ): Promise<Record<string, LegalPublishState>> => {
    const [{ data }, { data: userData }] = await Promise.all([
      supabase
        .from("site_content")
        .select(
          "key, has_draft, draft_updated_at, draft_updated_by, approved_at, approved_by, approval_reference, review_notes",
        )
        .like("key", "legal.%"),
      supabase.auth.getUser(),
    ]);

    const rows = (data ?? []) as {
      key: string;
      has_draft: boolean;
      draft_updated_at: string | null;
      draft_updated_by: string | null;
      approved_at: string | null;
      approved_by: string | null;
      approval_reference: string | null;
      review_notes: string | null;
    }[];
    const viewerId = userData.user?.id ?? null;
    const names = await siteContentActorNames(
      supabase,
      rows.flatMap((row) => [row.draft_updated_by, row.approved_by]),
    );

    const state: Record<string, LegalPublishState> = {};
    for (const document of LEGAL_DOCUMENTS) {
      const row = rows.find((candidate) => candidate.key === document.slotKey);
      state[document.key] = {
        pending: row?.has_draft
          ? {
              draftedAt: row.draft_updated_at,
              draftedBy: row.draft_updated_by
                ? (names.get(row.draft_updated_by) ?? null)
                : null,
              draftedByViewer: Boolean(
                viewerId && row.draft_updated_by === viewerId,
              ),
            }
          : null,
        // An approval shows only where the reference survives: that is what
        // names the decision, and a row carrying a date without one is a row
        // the gate was off for.
        approval: row?.approval_reference
          ? {
              approvedAt: row.approved_at,
              approvedBy: row.approved_by
                ? (names.get(row.approved_by) ?? null)
                : null,
              reference: row.approval_reference,
              notes: row.review_notes ?? "",
            }
          : null,
      };
    }
    return state;
  },
);

/** The documents this tenant serves, in registry order, for the footer. */
export function documentsInForce(
  publication: LegalPublication,
): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter((document) => publication[document.key]);
}

/**
 * Route gate, called at the top of a document's layout.
 *
 * Dropping the footer link alone would leave text nobody adopted at a guessable
 * URL, which is the outcome the gate exists to prevent, so the route 404s too.
 */
export async function requireLegalDocumentInForce(key: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const publication = await getLegalPublication(supabase);
  if (!publication[key]) notFound();
}
