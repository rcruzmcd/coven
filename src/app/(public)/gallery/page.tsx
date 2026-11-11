import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  ListNavigationProvider,
  ListPendingRegion,
} from "@/components/portal/list-navigation";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, totalPagesFor } from "@/lib/pagination";
import {
  PUBLIC_GALLERY_PAGE_SIZE,
  publicGalleryHref,
} from "@/lib/public-gallery";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GalleryList } from "./gallery-list";
import { loadPublicGalleryPage, publicGalleryHasMedia } from "./gallery-data";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: publicTitle(
      await getPublicSite(await createSupabaseServerClient()),
      "Gallery",
    ),
  };
}

/**
 * Every event's public photos (#1655), newest event first, a page of events
 * at a time (`?page=`). 404s while the public event gallery is off or nothing
 * is public -- the menu link is hidden then too, so it never leads here. A
 * page past the end goes back to the first.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!(await publicGalleryHasMedia())) notFound();

  const page = parsePage((await searchParams).page);
  const gallery = await loadPublicGalleryPage(page);
  const totalPages = totalPagesFor(
    gallery.totalEvents,
    PUBLIC_GALLERY_PAGE_SIZE,
  );
  // Past the end the RPC returns no rows, so no total either: start over.
  if (gallery.events.length === 0) {
    if (page > 1) redirect(publicGalleryHref(1));
    notFound();
  }

  return (
    <PageShell>
      <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
        Gallery
      </h1>
      <p className="app-muted mt-4 max-w-3xl">
        Photos and videos from events, newest first.
      </p>
      <ListNavigationProvider className="mt-10">
        <ListPendingRegion>
          <GalleryList events={gallery.events} />
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefFor={publicGalleryHref}
              count={gallery.totalEvents}
              pageSize={PUBLIC_GALLERY_PAGE_SIZE}
            />
          )}
        </ListPendingRegion>
      </ListNavigationProvider>
    </PageShell>
  );
}
