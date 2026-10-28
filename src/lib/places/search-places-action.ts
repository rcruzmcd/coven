"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlaceOption = {
  id: string;
  kind: string;
  label: string;
  /** The alias that found it, where its label did not: "Ironbound" (#1700). */
  matched?: string;
};

export type PlaceSearchGranularity = "locality" | "neighborhood" | "area";

/**
 * The place autocomplete (#1699), for both registration forms, the portal's
 * registrant dialogs and the service area picker. Five digits are a ZIP, and
 * find the places it covers (#1700).
 *
 * On the server rather than straight from the browser so the tenant's service
 * area is read where the request host resolves it -- the browser's own
 * Supabase requests carry no tenant host -- and so the ranking is the same
 * whichever form asks. `area` lists states, counties and boroughs and is not
 * ranked by the service area it is choosing.
 */
export async function searchPlacesAction(
  query: string,
  granularity: PlaceSearchGranularity,
): Promise<PlaceOption[]> {
  const trimmed = typeof query === "string" ? query.trim() : "";
  if (
    trimmed.length < 2 ||
    trimmed.length > 100 ||
    !["locality", "neighborhood", "area"].includes(granularity)
  ) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  let area: string[] | undefined;
  if (granularity !== "area") {
    const { data } = await supabase
      .from("public_registration_settings")
      .select("service_area")
      .maybeSingle();
    area = data?.service_area?.length ? data.service_area : undefined;
  }

  const { data, error } = await supabase.rpc("search_places", {
    p_query: trimmed,
    p_granularity: granularity,
    p_area: area,
  });
  if (error || !data) return [];
  return data.map(({ id, kind, label, matched }) =>
    matched ? { id, kind, label, matched } : { id, kind, label },
  );
}
