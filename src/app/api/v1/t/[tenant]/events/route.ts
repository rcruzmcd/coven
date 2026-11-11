import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * Every published event, soonest first, each with the programs it counts
 * toward and the sponsors it credits.
 *
 * Three queries rather than one embed: `public_events` is a view, and
 * PostgREST cannot follow a relationship out of one. The site's own listing
 * does exactly this and stitches the three together the same way.
 */
const route = publicRead(async ({ supabase }) => {
  const [events, sponsors, programs] = await Promise.all([
    supabase
      .from("public_events")
      .select(
        "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url, minimum_age",
      )
      .order("starts_at", { ascending: true }),
    supabase
      .from("public_event_sponsors")
      .select("event_id, sponsor_id, name, logo_url, website"),
    supabase.from("public_event_programs").select("event_id, program_id, name"),
  ]);

  const sponsorRows = unwrap(sponsors) ?? [];
  const programRows = unwrap(programs) ?? [];

  return {
    events: (unwrap(events) ?? []).map((event) => ({
      ...event,
      // Deprecated in favour of minimum_age; kept as public API contract (#1784).
      adults_only: event.minimum_age !== null,
      sponsors: sponsorRows
        .filter((row) => row.event_id === event.id)
        .map(({ event_id: _event_id, ...sponsor }) => sponsor),
      programs: programRows
        .filter((row) => row.event_id === event.id)
        .map(({ event_id: _event_id, ...program }) => program),
    })),
  };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
