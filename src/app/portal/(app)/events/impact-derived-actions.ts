"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeEventImpactDerived,
  type AssistanceExpenseRow,
  type CheckinCountRow,
  type DiscountCodeRow,
  type DistributedMovementRow,
  type EventImpactDerived,
  type EventRow,
  type OfferedCodeRow,
  type PersonEventRow,
  type PricedOptionCountRow,
  type RegistrationRow,
} from "@/lib/portal/impact-metrics";
import type { PlaceCountRow } from "@/lib/places/place-breakdown";
import { toMetricCounts } from "@/lib/person-answer-metrics";

type DerivedData = {
  auto_assign_discount_codes: boolean;
  events: EventRow[];
  registrations: RegistrationRow[];
  checkin_counts: CheckinCountRow[];
  event_volunteers: PersonEventRow[];
  volunteer_hour_people: PersonEventRow[];
  discount_codes: DiscountCodeRow[] | null;
  distributions: DistributedMovementRow[];
  assistance_expenses: AssistanceExpenseRow[] | null;
  offered_codes: OfferedCodeRow[] | null;
  option_counts: PricedOptionCountRow[] | null;
  /** #1745. null without event_impact:view. */
  person_answer_metrics: unknown;
};

/**
 * The Results card's Outcomes and the Attendance card's figures -- all of them
 * derived from records, never typed (#1588).
 *
 * Goes through the get_event_impact_derived_data RPC rather than querying the
 * tables directly because the board role holds event_impact:view but events:none
 * and people:none — an RLS-scoped query would silently return zeros for exactly
 * the role that opens this card to report. The RPC is security definer and does
 * its own permission check; it returns null for the discount keys and the
 * profile metric rows when the caller only has events:view.
 *
 * The profile metric rows (#1745) -- Chatter Snow's "Beginner participants"
 * and "First time on snow" since #1746 -- need nothing more: a count is not
 * an answer, so they stay under `event_impact: view` alone, which the RPC
 * applies.
 */
export async function getEventImpactDerivedAction(
  eventId: string,
): Promise<{ data: EventImpactDerived } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, places] = await Promise.all([
    supabase.rpc("get_event_impact_derived_data", { p_event_id: eventId }),
    // #1701. A failure only loses the places-reached figure.
    supabase.rpc("get_event_place_breakdown", { p_event_id: eventId }),
  ]);

  if (error) {
    return { error: "Could not load the computed figures. Please try again." };
  }

  const result = (data ?? {}) as Partial<DerivedData>;

  return {
    data: computeEventImpactDerived({
      events: result.events ?? [],
      registrations: result.registrations ?? [],
      checkinCounts: result.checkin_counts ?? [],
      eventVolunteers: result.event_volunteers ?? [],
      volunteerHourPeople: result.volunteer_hour_people ?? [],
      discountCodes: result.discount_codes ?? null,
      autoAssignDiscountCodes: result.auto_assign_discount_codes ?? false,
      distributions: result.distributions ?? [],
      assistanceExpenses: result.assistance_expenses ?? null,
      offeredCodes: result.offered_codes ?? null,
      optionCounts: result.option_counts ?? null,
      answerMetrics: toMetricCounts(result.person_answer_metrics),
      placeAnswers: places.error
        ? null
        : ((places.data ?? []) as PlaceCountRow[]),
    }),
  };
}
