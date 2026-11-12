import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePreviewClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type {
  PublicEvent,
  PublicEventProgram,
  PublicEventRow,
} from "./event-card";
import type { PublicEventSponsor } from "./event-sponsors";

/**
 * The columns of `public_events` an event card or an event detail view needs,
 * as a PostgREST select list. Shared so the listing and the two detail
 * presentations cannot drift into reading different shapes of the same row.
 */
export const PUBLIC_EVENT_COLUMNS =
  "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url, minimum_age, carpools_enabled, carpool_cost_notice";

/**
 * One event, with its sponsors and programs, for `/events/e/[id]`.
 *
 * Returns null when there is no such published event; the caller decides
 * whether that is a `notFound()` or something quieter.
 */
export async function loadEventDetail(id: string): Promise<PublicEvent | null> {
  return readEventDetail(await createSupabaseServerClient(), id);
}

/**
 * What `/events/e/[id]` renders (#1764): the public event, or -- for its
 * manager -- a preview of it. A preview is asked for with `?preview`, which
 * also previews a public event, so its registrations are test ones too; and
 * it is what a private or unpublished event shows its manager without asking.
 * Everyone else gets the public event or null, exactly as before; the
 * permission check is the database's (`event_previewed()`), not this file's.
 */
export const loadEventPage = cache(async function loadEventPage(
  id: string,
  wantsPreview: boolean,
): Promise<{ event: PublicEvent; preview: boolean } | null> {
  if (!wantsPreview) {
    const event = await loadEventDetail(id);
    if (event) return { event, preview: false };
  }
  const previewed = await readEventDetail(
    await createSupabasePreviewClient(id),
    id,
  );
  if (previewed) return { event: previewed, preview: true };
  // A `?preview` link opened by someone who may not preview it is still the
  // public page, where there is one.
  const event = wantsPreview ? await loadEventDetail(id) : null;
  return event ? { event, preview: false } : null;
});

async function readEventDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<PublicEvent | null> {
  const { data: event } = await supabase
    .from("public_events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<PublicEventRow>();

  if (!event) return null;

  const [{ data: sponsors }, { data: programs }] = await Promise.all([
    supabase
      .from("public_event_sponsors")
      .select("sponsor_id, name, logo_url, website")
      .eq("event_id", event.id)
      .overrideTypes<PublicEventSponsor[]>(),
    supabase
      .from("public_event_programs")
      .select("program_id, name")
      .eq("event_id", event.id)
      .overrideTypes<PublicEventProgram[]>(),
  ]);

  return { ...event, sponsors: sponsors ?? [], programs: programs ?? [] };
}
