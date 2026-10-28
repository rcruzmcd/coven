"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlaceCountRow } from "@/lib/places/place-breakdown";

/**
 * Registrations per place question, place and region on one event (#1701),
 * for the "Where registrants come from" card and the Results card's reach.
 *
 * Through get_event_place_breakdown() rather than the answers table, for the
 * reason getEventImpactDerivedAction gives: the board role reads Results on
 * `event_impact: view` without `events: view`, which the answers need. The
 * RPC checks both itself.
 */
export async function getEventPlaceBreakdownAction(
  eventId: string,
): Promise<{ data: PlaceCountRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_place_breakdown", {
    p_event_id: eventId,
  });
  if (error) {
    return { error: "Could not load where registrants come from." };
  }
  return { data: (data ?? []) as PlaceCountRow[] };
}
