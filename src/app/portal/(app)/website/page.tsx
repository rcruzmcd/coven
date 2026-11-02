import type { Metadata } from "next";
import Link from "next/link";
import {
  getCurrentUserPermissions,
  hasPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import {
  getPageVisibility,
  getTenantAsksProfileQuestions,
  getTenantModules,
  getTenantPageVisibility,
  platformOnlySlotKeys,
} from "@/lib/page-visibility";
import { collectionSurface } from "@/lib/legal-surface";
import {
  getTenantLayoutValues,
  PROGRAMS_SOURCE_SLOT,
  TEAM_SOURCE_SLOT,
} from "@/lib/site-layout";
import {
  platformLegalDocument,
  type LegalOrgContext,
} from "@/lib/legal-defaults";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONTENT_PAGES,
  readSlot,
  sectionsForPage,
  slotsForPage,
} from "@/lib/site-content";
import { deviceClass } from "@/lib/portal/device";
import { siteContentActorNames } from "@/lib/site-content-actors";
import { getTenantLegalApproval } from "@/lib/legal-publication";
import { legalDocumentBySlot } from "@/lib/legal-documents";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { ContentEditor } from "./content-editor";
import {
  buildOutline,
  resolveDraftAndPublished,
  type EditorSlot,
  type SiteContentDraftRow,
} from "./content-shared";

export const metadata: Metadata = {
  title: "Site Content",
};

export default async function SiteContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = typeof params.page === "string" ? params.page : "";
  const supabase = await createSupabaseServerClient();
  // The section gate above became a union when #990 moved three settings
  // panels here, so it no longer proves `site_content:view` on its own. Say it
  // here, or a board member -- admitted to the section on
  // `system_settings:manage` for Page visibility -- would land in the page
  // editor, which is exactly the CMS access widening the gate was meant to
  // avoid granting them.
  await requirePermission(supabase, "site_content", "view", "Pages");
  const [
    permissions,
    { data },
    visibility,
    tenants,
    layoutValues,
    tenantVisibility,
    tenantModules,
    tenantAsksProfileQuestions,
    approvalRequired,
    tenantLexicon,
    { data: userData },
  ] = await Promise.all([
    getCurrentUserPermissions(supabase),
    supabase
      .from("site_content")
      .select(
        "key, value, draft_value, has_draft, draft_updated_at, draft_updated_by, published_at, published_by",
      ),
    getPageVisibility(supabase),
    getTenantContext(supabase),
    getTenantLayoutValues(supabase),
    // The *selected* tenant's configuration, not the request host's, for the
    // starter document below (#1291) -- the same split the org context on the
    // next screenful already observes. An administrator editing their privacy
    // policy has to start from one that matches the site they are editing.
    getTenantPageVisibility(supabase),
    getTenantModules(supabase),
    getTenantAsksProfileQuestions(supabase),
    // Whether a legal document needs a second pair of eyes before it publishes
    // (#600). The publish dialog asks for an approval only while this is on,
    // and refuses outright on a draft the reader wrote themselves.
    getTenantLegalApproval(supabase),
    // The *selected* tenant's own words, for the same reason the visibility
    // and module reads above are the selected tenant's (#1367): the starter
    // document names what this organization gives away.
    getTenantLexicon(supabase),
    supabase.auth.getUser(),
  ]);
  // The platform's own marketing pages are written only on the platform
  // tenant; nobody else can publish them, so their copy is left out entirely.
  const platformOnly = platformOnlySlotKeys(currentTenant(tenants));
  const pages = CONTENT_PAGES.filter(
    (candidate) =>
      !candidate.visibilityKey || !platformOnly.has(candidate.visibilityKey),
  );
  const pageKeys = new Set(pages.map((candidate) => candidate.key));
  const page =
    pages.find((candidate) => candidate.key === requested) ?? pages[0];

  const rows = (data ?? []) as SiteContentDraftRow[];
  const { published, draft } = resolveDraftAndPublished(rows);
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const draftKeys = new Set(
    rows.filter((row) => row.has_draft).map((row) => row.key),
  );
  const canEdit = hasPermission(permissions, "site_content", "manage");
  // Which shape the rail takes, decided here rather than measured in the
  // browser: `useIsMobile()` answers `false` on the server, so a phone would
  // paint the full column and swap it after hydration (#1093).
  const device = await deviceClass();
  const actors = await siteContentActorNames(
    supabase,
    rows.flatMap((row) => [row.draft_updated_by, row.published_by]),
  );
  const viewerId = userData.user?.id ?? null;

  // Who the platform's own legal documents are about, read the way the public
  // site reads them: from what is published, not from a pending draft, so the
  // starter matches the document a visitor is being served right now (#858).
  const org: LegalOrgContext = {
    name: currentTenant(tenants)?.name ?? published.text("org.short_name"),
    emailGeneral: published.text("org.email_general"),
    emailPrivacy: published.text("org.email_privacy"),
    emailConduct: published.text("org.email_conduct"),
    surfaces: collectionSurface(
      tenantVisibility,
      tenantModules,
      tenantAsksProfileQuestions,
    ),
    lexicon: tenantLexicon,
  };

  // The editor gets, for every slot on the page, the copy it edits (the draft
  // where there is one) and the copy the public site is serving, so it can
  // show what is about to change and offer "back to default" only where it
  // means something.
  const slots: EditorSlot[] = slotsForPage(page.key).map((slot) => {
    const row = rowsByKey.get(slot.key);
    return {
      slot,
      value: readSlot(slot, draft),
      published: readSlot(slot, published),
      overridden: published.overrides.has(slot.key),
      hasDraft: row?.has_draft ?? false,
      draftUpdatedAt: row?.draft_updated_at ?? null,
      draftUpdatedBy: row?.draft_updated_by
        ? (actors.get(row.draft_updated_by) ?? null)
        : null,
      draftedByViewer: Boolean(
        viewerId && row?.has_draft && row.draft_updated_by === viewerId,
      ),
      publishedAt: row?.published_at ?? null,
      publishedBy: row?.published_by
        ? (actors.get(row.published_by) ?? null)
        : null,
      // Only for a document the platform has prose for. The participant
      // waiver has none (#686), and `platformLegalDocument()` throws on a slot
      // whose outline sections have no text behind them -- which would 500
      // this page for every tenant rather than leaving one starter empty. The
      // editor offers its outline instead.
      starter:
        slot.type === "document" &&
        legalDocumentBySlot(slot.key)?.hasPlatformDefault
          ? platformLegalDocument(slot.key, org)
          : null,
    };
  });

  // Writing copy for a page nobody can reach is possible and used to give no
  // hint of it; page visibility lives one page over in System Settings (#792).
  //
  // Since #902 this covers modules too, without a second read: getPageVisibility
  // already resolves a slot whose module is off to `false`, so a section this
  // organization has not been sold is marked here the same way one the board
  // has switched off is. The difference -- that one of them is not theirs to
  // switch back on -- is explained where the switch is, in System Settings.
  const hiddenPages = pages
    .filter(
      (candidate) =>
        candidate.visibilityKey &&
        visibility[candidate.visibilityKey] === false,
    )
    .map((candidate) => candidate.key);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Site Content
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The words and photos on the public website, page by page. Saving keeps a
        draft; nothing reaches the public site until you publish it.
      </p>

      {/* Articles are a collection rather than a slot -- a tenant creates as
          many as it likes -- so they have their own surface instead of a page
          in the switcher below (#894). */}
      <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
        The guides in the Learn section are written{" "}
        <Link
          href="/portal/website/articles"
          className="underline underline-offset-4"
        >
          under Articles
        </Link>
        , where categories and articles are added rather than filled in.
      </p>

      {/* The page switcher lives inside the editor because leaving it here
          navigated away from unsaved edits without asking (#791). */}
      <div className="mt-6">
        <ContentEditor
          key={page.key}
          device={device}
          page={page}
          pages={pages}
          sections={sectionsForPage(page.key)}
          slots={slots}
          // Every page's copy, so the rail can answer "where does this
          // sentence live?" without thirteen round trips.
          outline={buildOutline(draft, published, draftKeys).filter((entry) =>
            pageKeys.has(entry.page),
          )}
          hiddenPages={hiddenPages}
          programsFromModule={layoutValues[PROGRAMS_SOURCE_SLOT] === "module"}
          teamFromPeople={layoutValues[TEAM_SOURCE_SLOT] === "people"}
          canEdit={canEdit}
          approvalRequired={approvalRequired}
        />
      </div>
    </>
  );
}
