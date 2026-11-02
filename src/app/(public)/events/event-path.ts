/**
 * Where an event lives on the public site.
 *
 * The extra `e` segment was load-bearing, and the reason was #847's
 * intercepting sheet, which #1427 removed; the segment stays because the URLs
 * are out in the world. While the detail page sat at `/events/[id]`, the slot
 * that intercepted it -- `@modal/(.)[id]` -- matched *every* single segment
 * under /events, and it was matched ahead of both `[...catchAll]` and the children slot's own
 * static routes. So a client-side navigation from the listing to
 * `/events/community` ran the sheet with id="community", found no such event
 * and `notFound()`, which bubbles to the /events layout and buries both slots
 * under the not-found page. It only bit on a soft navigation that started
 * inside /events, so a hard load, a crawler and a link from anywhere else all
 * looked fine -- which is how it reached production.
 *
 * Neither a uuid guard in the slot nor a static `@modal/community` stub fixes
 * that: the guard leaves the interception matched, so the listing stays on
 * screen under the calendar's URL, and the stub loses to the interception
 * route outright. Moving the events themselves one segment down is what
 * actually separates them, and it settles the whole class -- no static page
 * added under /events can collide with an event id again.
 *
 * The URL events used to live at, `/events/<uuid>`, is kept alive by a 308 --
 * it went out in confirmation emails and was pasted into bios, so it has to
 * keep working. That 308 is issued in `src/proxy.ts`, and it is host-aware for
 * a reason: it started out in next.config.ts, where redirects cannot see the
 * host, and it caught the *portal's* event URL as well, which on a `portal.`
 * host is also `/events/<uuid>` once the proxy strips the prefix (#1145).
 *
 * Use this rather than writing the path out, so the listing, the home page and
 * the revalidation call cannot drift apart.
 */
export function publicEventPath(id: string): string {
  return `/events/e/${id}`;
}

/** The event's public photos and videos, as one shareable page (#1654). */
/**
 * The event's staff preview (#1764): its own page with `?preview`, which a
 * manager sees whatever the event's visibility and registers on as a test.
 */
export function publicEventPreviewPath(id: string): string {
  return `${publicEventPath(id)}?preview`;
}

export function publicEventPhotosPath(id: string): string {
  return `${publicEventPath(id)}/photos`;
}

/**
 * Where an emailed request for missing registration answers lands (#1502).
 * The token rides in the query string because the link has to work from a
 * mailbox; the page renders it into its form and sends no referrer, so it
 * goes no further than this one request.
 */
export function publicEventAnswersPath(id: string, token: string): string {
  return `${publicEventPath(id)}/answers?t=${encodeURIComponent(token)}`;
}
