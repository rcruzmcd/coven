import type { Metadata } from "next";
import { detailTitle } from "@/lib/portal/detail-title";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getMyEventGrant } from "@/lib/auth/event-access";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import type { EventRow } from "../event-badges";
import { toEventRegistrationQuestion } from "../registration-questions-draft";
import {
  LEGACY_PHASE_CARDS,
  LEGACY_TAB_VALUES,
  eventGroups,
  isTabValue,
  type TabValue,
} from "../event-tabs-config";
import { eventCardTaskLabels, isPhaseKey } from "../phase-status";
import { listProgramsAction } from "../../programs/actions";
import { deviceClass } from "@/lib/portal/device";
import { EventDetailView } from "./event-detail-view";
import { fillEventPeople } from "@/lib/events/event-people";

/**
 * The row as PostgREST returns it: program links arrive as an embedded array
 * and are flattened to `EventRow["program_ids"]` below, the same normalisation
 * the calendar does for `calendar_item_programs`.
 */
type RawEventRow = Omit<EventRow, "program_ids" | "registration_questions"> & {
  event_programs: { program_id: string }[] | null;
  registration_questions:
    | (Parameters<typeof toEventRegistrationQuestion>[0] & {
        sort_order: number;
        archived_at: string | null;
      })[]
    | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  return {
    title: await detailTitle({
      table: "events",
      column: "name",
      id: eventId,
      fallback: "Event",
    }),
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const supabase = await createSupabaseServerClient();
  const [permissions, grant] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getMyEventGrant(supabase, eventId),
  ]);
  // Deleting an event stays role-only (#1687): a grant edits its cards, not
  // the event's existence.
  const canDelete = hasPermission(permissions, "events", "manage");

  const { data: eventRow, error } = await supabase
    .from("events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, visibility, status, attendance_count, attendance_notes, description, capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, adults_only, confirmation_note, group_chat_enabled, group_chat_label, reminder_enabled, reminder_days_before, reminder_intro, carpools_enabled, carpool_seats_question_id, budget_amount, event_lead_id, event_lead:people!events_event_lead_id_fkey(id, name, preferred_name, email, phone), report_status, report_summary, feedback_notes, content_notes, report_submitted_at, report_submitted_by, flier_url, event_programs(program_id), registration_options_prompt, registration_options:event_registration_options(id, label, cap, price, sort_order), registration_questions:event_registration_questions(id, kind, prompt, help, column_label, required, sort_order, options, min_value, max_value, show_if, shares_contact, place_granularity, place_allow_other, archived_at)",
    )
    .eq("id", eventId)
    .maybeSingle<RawEventRow>();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this event. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!eventRow) notFound();
  // A guest cannot read `people`; the lead comes back through event_people().
  await fillEventPeople(
    supabase,
    eventId,
    [eventRow],
    [["event_lead_id", "event_lead"]],
  );

  const {
    event_programs,
    registration_options,
    registration_questions,
    ...rest
  } = eventRow;
  const event: EventRow = {
    ...rest,
    program_ids: (event_programs ?? []).map((link) => link.program_id),
    registration_options: [...(registration_options ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
    // #1501. Archived questions are kept only for the answers already given.
    registration_questions: (registration_questions ?? [])
      .filter((question) => question.archived_at === null)
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((row) => {
        const question = toEventRegistrationQuestion(row);
        return question ? [question] : [];
      }),
  };

  // Resolved here rather than in the client view, so a card whose section this
  // reader has no access to -- or whose module this tenant was never sold
  // (#903) -- is absent from the payload rather than hidden in it.
  const groups = eventGroups(
    permissions,
    {
      carpoolsEnabled: event.carpools_enabled ?? false,
      hasPlaceQuestion: (event.registration_questions ?? []).some(
        (question) => question.kind === "place",
      ),
    },
    grant,
  );

  // Which section the rail opens on, resolved here so a card this reader has
  // no access to is never the answer. `?tab=` is the parameter the rail keeps
  // and every deep link already writes; `?card=` and `?phase=` are #958's two
  // tab levels, read so a bookmark from before the rail still lands where it
  // meant to (#1008).
  const visible = groups.flatMap((group) => group.tabs);
  const named = (raw: string | undefined): TabValue | undefined => {
    // A card merged into another (#1588) lands on the one it became.
    const value = raw ? (LEGACY_TAB_VALUES[raw] ?? raw) : raw;
    if (!value || !isTabValue(value)) return undefined;
    return visible.some((section) => section.value === value)
      ? value
      : undefined;
  };
  const legacyPhase = one(query.phase);
  const initialCard: TabValue =
    named(one(query.tab)) ??
    named(one(query.card)) ??
    (legacyPhase && isPhaseKey(legacyPhase)
      ? named(LEGACY_PHASE_CARDS[legacyPhase])
      : undefined) ??
    visible[0]?.value ??
    "overview";

  const [
    programsResult,
    { data: deleteBlockers },
    { data: openChecklistItems },
    { data: retroItems },
  ] = await Promise.all([
    listProgramsAction(),
    // What, if anything, stops this event from being deleted -- so the delete
    // dialog can name it instead of only failing on submit. Only managers see
    // the affordance, so only they need the check.
    canDelete
      ? supabase.rpc("event_delete_blockers", { p_id: eventId })
      : Promise.resolve({ data: null }),
    // The two phase-strip signals that don't live on the event row. Both are
    // small indexed lookups, and they let the strip count outstanding work
    // across a whole phase instead of checking three columns.
    supabase
      .from("event_checklist_items")
      .select("title")
      .eq("event_id", eventId)
      .eq("is_done", false),
    // The retro's two phase tasks (#1578): none written yet, and how many of
    // its action items are still open.
    supabase
      .from("event_retro_items")
      .select("kind, status")
      .eq("event_id", eventId),
  ]);

  // Which shape the section rail takes, decided here rather than measured in
  // the browser: `useIsMobile()` answers `false` on the server, so a phone
  // would paint the full column and swap it after hydration (#1093).
  const device = await deviceClass();
  const programs = "data" in programsResult ? programsResult.data : [];
  const cardTasks = eventCardTaskLabels(event, {
    retroItemCount: retroItems?.length ?? 0,
    openActionItemCount: (retroItems ?? []).filter(
      (item) => item.kind === "action" && item.status === "open",
    ).length,
    openChecklistTitles: (openChecklistItems ?? []).map((row) => row.title),
  });

  return (
    <>
      <PortalBreadcrumbs current={event.name} />

      <EventDetailView
        device={device}
        event={event}
        programs={programs}
        canDelete={canDelete}
        deleteBlockers={deleteBlockers ?? []}
        groups={groups}
        initialCard={initialCard}
        cardTasks={cardTasks}
        nowIso={new Date().toISOString()}
      />
    </>
  );
}
