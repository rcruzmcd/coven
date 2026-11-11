import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The Gallery's gate (#1655): its own slot, and the Events section's too,
 * since every link on the page leads into it. The page itself 404s while the
 * public event gallery is off or nothing is public.
 */
export default async function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("events");
  await requireVisiblePage("gallery");
  return children;
}
