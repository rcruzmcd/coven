/**
 * The public Gallery page (#1655): every event with public media, newest
 * event first, a strip of each one's newest photos. `public_event_gallery()`
 * decides which rows; this decides what of them the page shows. Pure, so it is
 * tested without a database.
 */

/** Events per Gallery page. */
export const PUBLIC_GALLERY_PAGE_SIZE = 12;

/** Newest photo thumbnails per event. */
export const PUBLIC_GALLERY_THUMBS = 6;

/** A row of `public_event_gallery()`: paths to sign, never who sent them. */
export type PublicGalleryRow = {
  event_id: string;
  name: string;
  starts_at: string;
  timezone: string | null;
  photo_count: number;
  video_count: number;
  thumb_paths: string[] | null;
  total_events: number;
};

export type PublicGalleryEvent = {
  id: string;
  name: string;
  startsAt: string;
  timezone: string | null;
  photoCount: number;
  videoCount: number;
  thumbs: string[];
};

export type PublicGalleryPage = {
  events: PublicGalleryEvent[];
  /** Every event with public media, including those on other pages. */
  totalEvents: number;
};

export const EMPTY_PUBLIC_GALLERY: PublicGalleryPage = {
  events: [],
  totalEvents: 0,
};

/** Every path the page's rows ask to have signed. */
export function publicGalleryPathsToSign(rows: PublicGalleryRow[]): string[] {
  return rows.flatMap((row) => row.thumb_paths ?? []);
}

/**
 * The page once signed. A thumbnail that did not sign is left out rather than
 * shown broken; the counts stay what the database says.
 */
export function buildPublicGalleryPage(
  rows: PublicGalleryRow[],
  urls: ReadonlyMap<string, string>,
): PublicGalleryPage {
  return {
    events: rows.map((row) => ({
      id: row.event_id,
      name: row.name,
      startsAt: row.starts_at,
      timezone: row.timezone,
      photoCount: row.photo_count,
      videoCount: row.video_count,
      thumbs: (row.thumb_paths ?? []).flatMap((path) => {
        const url = urls.get(path);
        return url ? [url] : [];
      }),
    })),
    totalEvents: rows[0]?.total_events ?? 0,
  };
}

/** "12 photos · 2 videos", leaving out a kind the event has none of. */
export function publicGalleryCountLabel(
  photoCount: number,
  videoCount: number,
): string {
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;
  return [
    photoCount > 0 && plural(photoCount, "photo"),
    videoCount > 0 && plural(videoCount, "video"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A Gallery page's URL; page one stays off it. */
export function publicGalleryHref(page: number): string {
  return page > 1 ? `/gallery?page=${page}` : "/gallery";
}
