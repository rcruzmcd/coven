import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { EventDetailContent } from "../../event-detail-content";
import { loadEventPage } from "../../event-detail-data";
import { EventPreviewBanner } from "../../event-preview-banner";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const page = await loadEventPage(id, query.preview !== undefined);

  return {
    title: publicTitle(
      await getPublicSite(supabase),
      page?.event.name ?? "Event",
    ),
    // #1764. A preview is nobody's to find.
    ...(page?.preview ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * The event's own page: what a card on the listing or the home page, a shared
 * link, a refresh and a search result all render (#1427) -- and, for the
 * event's manager, its preview (#1764).
 */
export default async function EventDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = await loadEventPage(id, query.preview !== undefined);

  if (!page) notFound();

  return (
    <PageShell>
      {page.preview && <EventPreviewBanner eventId={page.event.id} />}
      <EventDetailContent event={page.event} preview={page.preview} />
    </PageShell>
  );
}
