import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Branding } from "@/lib/branding";
import { resolvedTypography } from "@/lib/branding";
import type { Database } from "@/lib/database.types";
import { resolveTenantOrigin } from "@/lib/email/identity";
import {
  relativeDay,
  type EventSponsor,
  type EventPostFormat,
  type EventPostKind,
  type EventPostRecord,
} from "./event-post-frames";
import {
  EVENT_PHOTO_PREFIX,
  EVENT_RECAP,
  NO_PHOTO,
  POST_TEMPLATES,
  RECAP_DEFAULT_PHOTOS,
  RECAP_PHOTO_LIMITS,
  SPONSOR_THANK_YOU,
  eventTemplateValues,
  parsePhotoList,
  type EventTemplateKey,
  type TemplateText,
} from "./post-templates";
import { displayHost } from "./story-frames";

type Client = SupabaseClient<Database>;

/**
 * What an event template (#1926) is drawn from. Read with the service role,
 * filtered by the post's tenant, once the user's own client has returned the
 * post (`story-data.ts`): content_calendar may be granted without events, and
 * the post page already names its event to the same user.
 *
 * Only what the event's public page shows is read -- its name, start, zone,
 * place and whether it takes registrations -- and the photos offered are its
 * flyer and the photos it shows in its public gallery, the ones the event
 * photo agreement covers. A recap (#1927) also reads how many were checked
 * in, and a sponsor thank-you the sponsors credited publicly on the event.
 */

/** A photo a template may show. */
export type EventPhoto = {
  id: string;
  /** The stored thumbnail where there is one, else the original. */
  path: string;
  isFlyer: boolean;
  /** Stored when it was made the flyer (#1926); null before. */
  color: string | null;
};

export type EventTemplateRecord = {
  record: EventPostRecord;
  orgName: string;
  /** The flyer first, then the public gallery's photos, oldest first. */
  photos: EventPhoto[];
  /**
   * A recap's (#1927): active registrations that objected to being
   * photographed, the event Media card's count.
   */
  photoObjections?: number;
};

/** What a template reads beyond the event itself (#1927). */
function extrasFor(key: EventTemplateKey | undefined) {
  return {
    recap: key === EVENT_RECAP.key,
    sponsors: key === SPONSOR_THANK_YOU.key,
  };
}

export async function loadEventTemplateRecord(
  admin: Client,
  tenantId: string,
  eventId: string,
  templateKey?: EventTemplateKey,
): Promise<EventTemplateRecord | null> {
  const extras = extrasFor(templateKey);
  const [{ data: event }, { data: tenant }, { data: media }, recap, sponsors] =
    await Promise.all([
      admin
        .from("events")
        .select(
          "name, starts_at, timezone, location, registration_enabled, flyer_media_id",
        )
        .eq("id", eventId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      admin
        .from("tenants")
        .select("name, custom_domain")
        .eq("id", tenantId)
        .maybeSingle(),
      admin
        .from("event_media")
        .select("id, storage_path, thumb_path, is_public, dominant_color")
        .eq("event_id", eventId)
        .eq("tenant_id", tenantId)
        .eq("kind", "photo")
        .order("uploaded_at", { ascending: true })
        .order("id", { ascending: true }),
      extras.recap ? loadRecapCounts(admin, tenantId, eventId) : null,
      extras.sponsors ? loadPublicSponsors(admin, tenantId, eventId) : null,
    ]);
  if (!event) return null;

  const rows = media ?? [];
  const toPhoto = (
    row: (typeof rows)[number],
    isFlyer: boolean,
  ): EventPhoto => ({
    id: row.id,
    path: row.thumb_path ?? row.storage_path,
    isFlyer,
    color: row.dominant_color ?? null,
  });
  const flyer = rows.find((row) => row.id === event.flyer_media_id);
  const photos = [
    ...(flyer ? [toPhoto(flyer, true)] : []),
    ...rows
      .filter((row) => row.is_public && row.id !== flyer?.id)
      .map((row) => toPhoto(row, false)),
  ];

  return {
    record: {
      name: event.name,
      starts_at: event.starts_at,
      timezone: event.timezone,
      location: event.location,
      registration_enabled: event.registration_enabled,
      has_flyer: Boolean(flyer),
      host: displayHost(
        resolveTenantOrigin(
          tenant?.custom_domain ?? null,
          process.env.NEXT_PUBLIC_SITE_URL ?? "",
        ),
      ),
      ...(recap ? { attended: recap.attended } : {}),
      ...(sponsors ? { sponsors } : {}),
    },
    orgName: tenant?.name ?? "",
    photos,
    ...(recap ? { photoObjections: recap.objections } : {}),
  };
}

/**
 * How many came, from check-ins with party sizes counted, and how many
 * objected to being photographed -- of active registrations, test ones left
 * out of the head count.
 */
async function loadRecapCounts(
  admin: Client,
  tenantId: string,
  eventId: string,
): Promise<{ attended: number; objections: number }> {
  const [{ data: checkedIn }, { count: objections }] = await Promise.all([
    admin
      .from("event_registrations")
      .select("party_size")
      .eq("event_id", eventId)
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .is("cancelled_at", null)
      .not("checked_in_at", "is", null),
    admin
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("tenant_id", tenantId)
      .eq("photo_consent", false)
      .is("cancelled_at", null),
  ]);
  return {
    attended: (checkedIn ?? []).reduce(
      (sum, row) => sum + Math.max(1, row.party_size ?? 1),
      0,
    ),
    objections: objections ?? 0,
  };
}

/**
 * The event's sponsors marked public, by name: what the event's public page
 * credits. A donation is never read here -- sponsors only, never donors.
 */
async function loadPublicSponsors(
  admin: Client,
  tenantId: string,
  eventId: string,
): Promise<EventSponsor[]> {
  const { data: rows } = await admin
    .from("event_sponsors")
    .select("person_id")
    .eq("event_id", eventId)
    .eq("tenant_id", tenantId)
    .eq("is_public", true);
  const ids = [...new Set((rows ?? []).map((row) => row.person_id))];
  if (ids.length === 0) return [];
  const { data: people } = await admin
    .from("people")
    .select("name, logo_url")
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  return (people ?? []).flatMap((person) => {
    const name = person.name?.trim();
    return name ? [{ name, logo_url: person.logo_url }] : [];
  });
}

/**
 * The photo a post shows: "none", one of the offered photos by its
 * `event_media:<id>`, or -- unset, or naming one no longer offered -- the
 * flyer, else the first public photo.
 */
export function chosenEventPhoto(
  photos: readonly EventPhoto[],
  choice: string | undefined,
): EventPhoto | null {
  if (choice === NO_PHOTO) return null;
  if (choice?.startsWith(EVENT_PHOTO_PREFIX)) {
    const id = choice.slice(EVENT_PHOTO_PREFIX.length);
    const found = photos.find((photo) => photo.id === id);
    if (found) return found;
  }
  return photos[0] ?? null;
}

export const eventPhotoChoice = (photo: EventPhoto) =>
  `${EVENT_PHOTO_PREFIX}${photo.id}`;

/** A recap's photos (#1927): the public gallery's, never the flyer. */
export function recapPhotoOptions(photos: readonly EventPhoto[]) {
  return photos.filter((photo) => !photo.isFlyer);
}

/**
 * The photos a recap shows, in order: those chosen that are still offered,
 * none for "none", or -- unset -- the gallery's first few; never more than
 * the format holds.
 */
export function chosenRecapPhotos(
  photos: readonly EventPhoto[],
  choice: string | undefined,
  format: EventPostFormat,
): EventPhoto[] {
  const offered = recapPhotoOptions(photos);
  const limit = RECAP_PHOTO_LIMITS[format];
  if (choice === NO_PHOTO) return [];
  if (!choice) return offered.slice(0, Math.min(RECAP_DEFAULT_PHOTOS, limit));
  const byChoice = new Map(
    offered.map((photo) => [eventPhotoChoice(photo), photo]),
  );
  return parsePhotoList(choice)
    .flatMap((item) => byChoice.get(item) ?? [])
    .slice(0, limit);
}

type Typography = ReturnType<typeof resolvedTypography>;

export type EventPostSource = {
  templateKey: EventTemplateKey;
  kind: EventPostKind;
  format: EventPostFormat;
  event: EventPostRecord;
  values: ReturnType<typeof eventTemplateValues>;
  /** The photo shown: the flyer gets the flyer layout, any other the brand's. */
  photo: EventPhoto | null;
  /** A recap's photos, in order (#1927); [] for any other template. */
  photos: EventPhoto[];
  /** When the image is made; the reminder's day is worked out from it. */
  now: Date;
  branding: Branding;
  orgName: string;
  typography: Typography;
};

const EVENT_POST_KINDS = {
  event_announcement: "announcement",
  event_reminder: "reminder",
  event_recap: "recap",
  sponsor_thank_you: "sponsors",
} as const satisfies Record<EventTemplateKey, EventPostKind>;

/**
 * The frames an event post has: one, or for a recap post (#1927) a carousel
 * of one per photo -- the first under the recap's words.
 */
export function eventPostFrames(source: EventPostSource): number[] {
  const count =
    source.kind === "recap" && source.format === "post"
      ? Math.max(1, source.photos.length)
      : 1;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function eventPostSource({
  templateKey,
  format,
  loaded,
  text,
  branding,
  now,
}: {
  templateKey: EventTemplateKey;
  format: EventPostFormat;
  loaded: EventTemplateRecord;
  text: TemplateText;
  branding: Branding;
  now: Date;
}): EventPostSource {
  const kind = EVENT_POST_KINDS[templateKey];
  return {
    templateKey,
    kind,
    format,
    event: loaded.record,
    values: eventTemplateValues(
      POST_TEMPLATES[templateKey],
      loaded.record,
      text,
    ),
    photo:
      kind === "announcement" || kind === "reminder"
        ? chosenEventPhoto(loaded.photos, text.photo)
        : null,
    photos:
      kind === "recap"
        ? chosenRecapPhotos(loaded.photos, text.photos, format)
        : [],
    now,
    branding,
    orgName: loaded.orgName,
    typography: resolvedTypography(branding),
  };
}

/**
 * A stable hash of everything the frame is drawn from (#1909). The reminder's
 * day is in it, so a reminder made "Tomorrow" reads Out of date the day after.
 */
export function eventPostFingerprint(source: EventPostSource): string {
  // #1927's options are hashed only by the templates that read them, so an
  // announcement drawn before them isn't Out of date for nothing.
  const { attendance, sponsorLogos, ...values } = source.values;
  return createHash("sha256")
    .update(
      JSON.stringify({
        template: source.templateKey,
        format: source.format,
        event: source.event,
        values,
        ...(source.kind === "recap"
          ? { attendance, photos: source.photos }
          : {}),
        ...(source.kind === "sponsors" ? { sponsorLogos } : {}),
        photo: source.photo,
        when:
          source.kind === "reminder"
            ? relativeDay(
                source.event.starts_at,
                source.event.timezone,
                source.now,
              )
            : null,
        branding: source.branding,
        orgName: source.orgName,
        typography: source.typography,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}
