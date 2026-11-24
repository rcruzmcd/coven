import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Branding } from "@/lib/branding";
import { resolvedTypography } from "@/lib/branding";
import type { Database } from "@/lib/database.types";
import { resolveTenantOrigin } from "@/lib/email/identity";
import {
  relativeDay,
  type EventPostFormat,
  type EventPostKind,
  type EventPostRecord,
} from "./event-post-frames";
import {
  EVENT_ANNOUNCEMENT,
  EVENT_PHOTO_PREFIX,
  NO_PHOTO,
  POST_TEMPLATES,
  eventTemplateValues,
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
 * photo agreement covers.
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
};

export async function loadEventTemplateRecord(
  admin: Client,
  tenantId: string,
  eventId: string,
): Promise<EventTemplateRecord | null> {
  const [{ data: event }, { data: tenant }, { data: media }] =
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
    },
    orgName: tenant?.name ?? "",
    photos,
  };
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

type Typography = ReturnType<typeof resolvedTypography>;

export type EventPostSource = {
  templateKey: EventTemplateKey;
  kind: EventPostKind;
  format: EventPostFormat;
  event: EventPostRecord;
  values: ReturnType<typeof eventTemplateValues>;
  /** The photo shown: the flyer gets the flyer layout, any other the brand's. */
  photo: EventPhoto | null;
  /** When the image is made; the reminder's day is worked out from it. */
  now: Date;
  branding: Branding;
  orgName: string;
  typography: Typography;
};

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
  return {
    templateKey,
    kind: templateKey === EVENT_ANNOUNCEMENT.key ? "announcement" : "reminder",
    format,
    event: loaded.record,
    values: eventTemplateValues(
      POST_TEMPLATES[templateKey],
      loaded.record,
      text,
    ),
    photo: chosenEventPhoto(loaded.photos, text.photo),
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
  return createHash("sha256")
    .update(
      JSON.stringify({
        template: source.templateKey,
        format: source.format,
        event: source.event,
        values: source.values,
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
