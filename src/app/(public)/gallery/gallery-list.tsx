import Link from "next/link";
import {
  publicGalleryCountLabel,
  type PublicGalleryEvent,
} from "@/lib/public-gallery";
import { publicEventPhotosPath } from "../events/event-path";
import { formatDateTimeInZone } from "@/lib/time";

/**
 * The event's date in its own zone, labelled: "Mar 14, 2026, MDT". Intl
 * renders a date-only format with a zone as "Mar 14, 2026 at MDT", so the
 * zone is formatted on its own and joined.
 */
function eventDateWithZone(iso: string, timeZone: string): string {
  const date = formatDateTimeInZone(
    iso,
    timeZone,
    { year: "numeric", month: "short", day: "numeric" },
    "en-US",
  );
  const zone = formatDateTimeInZone(
    iso,
    timeZone,
    { timeZoneName: "short" },
    "en-US",
  )
    .split(" ")
    .pop();
  return zone ? `${date}, ${zone}` : date;
}

/**
 * The Gallery's events (#1655), each a heading, its date and counts, a strip
 * of its newest photos and a link to its photos page. The strip is decoration
 * beside that link, so it is one link too rather than a grid of buttons:
 * playback and the lightbox are on the event's own photos page.
 */
export function GalleryList({ events }: { events: PublicGalleryEvent[] }) {
  return (
    <ul className="flex flex-col gap-10">
      {events.map((event) => {
        const href = publicEventPhotosPath(event.id);
        const headingId = `gallery-event-${event.id}`;
        return (
          <li key={event.id}>
            <section
              aria-labelledby={headingId}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={headingId} className="text-xl font-semibold">
                  <Link href={href} className="hover:underline">
                    {event.name}
                  </Link>
                </h2>
                <p className="app-muted text-sm">
                  <time dateTime={event.startsAt}>
                    {eventDateWithZone(event.startsAt, event.timezone ?? "UTC")}
                  </time>
                  {" · "}
                  {publicGalleryCountLabel(event.photoCount, event.videoCount)}
                </p>
              </div>
              {event.thumbs.length > 0 && (
                <Link
                  href={href}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="grid grid-cols-3 gap-2 sm:grid-cols-6"
                >
                  {event.thumbs.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL; next/image would cache it past its expiry
                    <img
                      key={url}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-md border border-[var(--line)] object-cover"
                    />
                  ))}
                </Link>
              )}
              <p className="text-sm">
                <Link href={href} className="underline underline-offset-4">
                  {event.photoCount > 0 ? "See all photos" : "See the videos"}
                  <span className="sr-only"> from {event.name}</span>
                </Link>
              </p>
            </section>
          </li>
        );
      })}
    </ul>
  );
}
