import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isPlaceAnswer } from "@/lib/registration-questions";

/** The county, NYC borough or state a place lies in (#1701). */
export type PlaceRegion = { id: string; label: string };

type WithAnswers = {
  answers: { value: unknown; place_region?: PlaceRegion }[];
};

/**
 * Each place answer with its region, read through `place_regions()` -- the
 * one definition the breakdowns group by -- so the registrants list filters
 * and sorts by place the way the "Where registrants come from" card counts.
 * A failed read leaves the answers as they were: the filter then offers only
 * Not listed, and nothing else is lost.
 */
export async function withPlaceRegions<T extends WithAnswers>(
  supabase: SupabaseClient<Database>,
  registrants: T[],
): Promise<T[]> {
  const ids = new Set<string>();
  for (const registrant of registrants) {
    for (const row of registrant.answers) {
      if (isPlaceAnswer(row.value) && "place_id" in row.value) {
        ids.add(row.value.place_id);
      }
    }
  }
  if (ids.size === 0) return registrants;

  const { data } = await supabase.rpc("place_regions", {
    p_place_ids: [...ids],
  });
  const regions = new Map(
    (data ?? []).map((row) => [
      row.place_id,
      { id: row.region_id, label: row.region_label },
    ]),
  );
  if (regions.size === 0) return registrants;

  return registrants.map((registrant) => ({
    ...registrant,
    answers: registrant.answers.map((row) => {
      const region =
        isPlaceAnswer(row.value) && "place_id" in row.value
          ? regions.get(row.value.place_id)
          : undefined;
      return region ? { ...row, place_region: region } : row;
    }),
  }));
}
