import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLICATION_FILES_BUCKET,
  parseRenditions,
  publicationImage,
  type PublicationFile,
  type PublicationIssue,
  type PublicationSummary,
} from "@/lib/publications";
import { reportQueryError } from "@/lib/observability/query-error";

/**
 * The public site's read of the tenant's publication (#1471), through the two
 * definer views 20260929100000 creates. Both are resolved from the request
 * host and serve published issues only, so nothing here has to know what a
 * draft is.
 */

type IssueRow = {
  id: string;
  slug: string;
  title: string;
  season_label: string | null;
  publish_date: string | null;
  blurb: string | null;
  cover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_renditions: unknown;
  reading_pdf_path: string | null;
  reading_pdf_bytes: number | null;
  print_pdf_path: string | null;
  print_pdf_bytes: number | null;
};

type PageRow = {
  position: number;
  image_path: string;
  width: number;
  height: number;
  image_renditions: unknown;
  alt_text: string | null;
  transcript: string | null;
};

function fileUrl(supabase: SupabaseClient) {
  return (path: string) =>
    supabase.storage.from(PUBLICATION_FILES_BUCKET).getPublicUrl(path).data
      .publicUrl;
}

function toSummary(
  row: IssueRow,
  toUrl: (path: string) => string,
): PublicationSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    seasonLabel: row.season_label,
    publishDate: row.publish_date,
    blurb: row.blurb,
    cover:
      row.cover_path && row.cover_width && row.cover_height
        ? publicationImage(
            row.cover_path,
            row.cover_width,
            row.cover_height,
            parseRenditions(row.cover_renditions),
            toUrl,
          )
        : null,
  };
}

function toFile(
  path: string | null,
  bytes: number | null,
  toUrl: (path: string) => string,
): PublicationFile | null {
  return path && bytes ? { url: toUrl(path), bytes } : null;
}

/**
 * An issue's pages, read from the public view or -- for a preview -- from the
 * table itself, which RLS opens only to the tenant's editors.
 */
async function withPages(
  supabase: SupabaseClient,
  row: IssueRow,
  source: "public_publication_pages" | "publication_pages",
): Promise<PublicationIssue> {
  const pages = await supabase
    .from(source)
    .select(
      "position, image_path, width, height, image_renditions, alt_text, transcript",
    )
    .eq("publication_id", row.id)
    .order("position");

  if (pages.error) {
    reportQueryError(pages.error, {
      source: `public-publications.${source}`,
      message: `could not read ${source}`,
    });
  }

  const toUrl = fileUrl(supabase);
  return {
    ...toSummary(row, toUrl),
    readingPdf: toFile(row.reading_pdf_path, row.reading_pdf_bytes, toUrl),
    printPdf: toFile(row.print_pdf_path, row.print_pdf_bytes, toUrl),
    pages: ((pages.data ?? []) as PageRow[]).map((page) => ({
      position: page.position,
      image: publicationImage(
        page.image_path,
        page.width,
        page.height,
        parseRenditions(page.image_renditions),
        toUrl,
      ),
      altText: page.alt_text ?? `Page ${page.position}`,
      transcript: page.transcript ?? "",
    })),
  };
}

/** Every published issue, newest first. Cached per request. */
export const getPublicPublications = cache(
  async (supabase: SupabaseClient): Promise<PublicationSummary[]> => {
    const { data, error } = await supabase
      .from("public_publications")
      .select("*")
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false });

    if (error) {
      // Same stance as `getPublicArticleCategories`: render none and say so.
      reportQueryError(error, {
        source: "public-publications.public_publications",
        message: "could not read public_publications; rendering none",
      });
      return [];
    }

    const toUrl = fileUrl(supabase);
    return ((data ?? []) as IssueRow[]).map((row) => toSummary(row, toUrl));
  },
);

/** One issue by its `/publications/<slug>` segment, with its pages. */
export const getPublicPublication = cache(
  async (
    supabase: SupabaseClient,
    slug: string,
  ): Promise<PublicationIssue | null> => {
    const { data: row, error } = await supabase
      .from("public_publications")
      .select("*")
      .eq("slug", slug)
      .maybeSingle<IssueRow>();

    if (error) {
      reportQueryError(error, {
        source: "public-publications.public_publications",
        message: "could not read public_publications",
      });
      return null;
    }
    if (!row) return null;

    return withPages(supabase, row, "public_publication_pages");
  },
);

/**
 * Whether the viewer may preview this site's drafts (#1472): signed in, able to
 * view publications, and working in the tenant this host serves. The last
 * check matters because RLS answers for `current_tenant_id()` -- the tenant
 * the account has selected -- and an editor of one organization must not see
 * their own drafts rendered under another organization's site.
 *
 * Only asked when the public read has come up empty or the section is hidden,
 * so an anonymous visitor to a live issue never pays for it.
 */
export const canPreviewPublications = cache(
  async (supabase: SupabaseClient): Promise<boolean> => {
    // The cookie alone, no network: a visitor with no session is answered
    // here. The RPCs below verify the token itself.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;

    const [allowed, current, host] = await Promise.all([
      supabase.rpc("has_permission", {
        p_resource_key: "publications",
        p_min_level: "view",
      }),
      supabase.rpc("current_tenant_id"),
      supabase.rpc("public_tenant_id"),
    ]);
    return (
      allowed.data === true &&
      typeof current.data === "string" &&
      current.data === host.data
    );
  },
);

/**
 * A draft issue, for an editor previewing it at its public address. Null for
 * anyone else, and for a slug that does not exist in this tenant.
 */
export const getPublicationPreview = cache(
  async (
    supabase: SupabaseClient,
    slug: string,
  ): Promise<PublicationIssue | null> => {
    if (!(await canPreviewPublications(supabase))) return null;

    const { data: row, error } = await supabase
      .from("publications")
      .select(
        "id, slug, title, season_label, publish_date, blurb, cover_path, cover_width, cover_height, cover_renditions, reading_pdf_path, reading_pdf_bytes, print_pdf_path, print_pdf_bytes",
      )
      .eq("slug", slug)
      .maybeSingle<IssueRow>();
    if (error) {
      reportQueryError(error, {
        source: "public-publications.publications",
        message: "could not read a draft",
      });
      return null;
    }
    return row ? withPages(supabase, row, "publication_pages") : null;
  },
);
