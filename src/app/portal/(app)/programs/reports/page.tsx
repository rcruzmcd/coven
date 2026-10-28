import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProgramsAction } from "../actions";
import {
  computeProgramImpactRollup,
  type AssistanceExpenseRow,
  type CheckinCountRow,
  type DiscountCodeRow,
  type DistributedMovementRow,
  type EventRow,
  type OfferedCodeRow,
  type PersonEventRow,
  type PricedOptionCountRow,
  type ProgramImpactRollup,
  type RegistrationRow,
  type VolunteerHoursRow,
} from "./impact-rollup";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  placeBreakdown,
  placeReachSummary,
  type PlaceBreakdown,
  type PlaceCountRow,
} from "@/lib/places/place-breakdown";

type RollupData = {
  event_ids: string[];
  events: EventRow[];
  distributed_movements: DistributedMovementRow[];
  volunteer_hours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkin_counts: CheckinCountRow[];
  discount_codes: DiscountCodeRow[];
  event_volunteers: PersonEventRow[];
  volunteer_hour_people: PersonEventRow[];
  beginner_attendees: PersonEventRow[];
  first_time_attendees: PersonEventRow[];
  profiled_attendees: PersonEventRow[];
  assistance_expenses: AssistanceExpenseRow[];
  offered_codes: OfferedCodeRow[];
  option_counts: PricedOptionCountRow[];
};

type ProgramImpactReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Impact Report",
};

export default async function ProgramImpactReportPage({
  searchParams,
}: ProgramImpactReportPageProps) {
  const supabase = await createSupabaseServerClient();
  const canSeeRider = hasPermission(
    await getCurrentUserPermissions(supabase),
    "rider_profiles",
    "view",
  );
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const programId = raw("programId") ?? "";

  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];

  let rollup: ProgramImpactRollup | null = null;
  let places: PlaceBreakdown | null = null;
  let loadError: string | null = null;

  if (programId) {
    // Intentionally no date-range param: `programs` has no date columns
    // (each season is its own programs row, per
    // 20260825020000_add_programs_reports_resource.sql), so the rollup
    // includes every event ever tied to this program_id.
    const [{ data, error }, placeResult] = await Promise.all([
      supabase.rpc("get_program_impact_rollup_data", {
        p_program_id: programId,
      }),
      // #1701. A failure only loses the place figures.
      supabase.rpc("get_program_place_reach", { p_program_id: programId }),
    ]);
    const placeAnswers = placeResult.error
      ? null
      : ((placeResult.data ?? []) as PlaceCountRow[]);
    places = placeAnswers ? placeBreakdown(placeAnswers) : null;

    if (error) {
      loadError =
        "Could not load this program's impact rollup. Please try again.";
    } else {
      const result = (data ?? {}) as RollupData;
      const eventIds = result.event_ids ?? [];
      rollup = computeProgramImpactRollup({
        eventCount: eventIds.length,
        events: result.events ?? [],
        distributedMovements: result.distributed_movements ?? [],
        volunteerHours: result.volunteer_hours ?? [],
        registrations: result.registrations ?? [],
        checkinCounts: result.checkin_counts ?? [],
        discountCodes: result.discount_codes ?? [],
        eventVolunteers: result.event_volunteers ?? [],
        volunteerHourPeople: result.volunteer_hour_people ?? [],
        beginnerAttendees: result.beginner_attendees ?? [],
        firstTimeAttendees: result.first_time_attendees ?? [],
        profiledAttendees: result.profiled_attendees ?? [],
        assistanceExpenses: result.assistance_expenses ?? [],
        offeredCodes: result.offered_codes ?? [],
        optionCounts: result.option_counts ?? [],
        placeAnswers,
      });
    }
  }

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  const metricRows = rollup
    ? [
        { label: "Events", value: formatNumber(rollup.eventCount) },
        {
          label: "Participants",
          value: formatNumber(rollup.participants),
        },
        {
          label: "First-time participants",
          value: formatNumber(rollup.firstTimeParticipants),
        },
        // The rider_profile module's figure (#1408): absent for a reader
        // without rider_profiles:view, which is everyone on a tenant without
        // the module.
        ...(canSeeRider
          ? [
              {
                label: "Beginner participants",
                // Qualified only while rider-profile coverage is short of the
                // checked-in headcount; at full coverage it is simply the
                // number.
                value:
                  rollup.profiledAttendees < rollup.checkedIn
                    ? `${formatNumber(rollup.beginnerParticipants)} of ${formatNumber(
                        rollup.profiledAttendees,
                      )} with a rider profile`
                    : formatNumber(rollup.beginnerParticipants),
              },
              {
                label: "First time on snow",
                value: formatNumber(rollup.firstTimeOnSnow),
              },
            ]
          : []),
        {
          label: "Participants given a discount code",
          value: formatNumber(rollup.assistedParticipants),
        },
        {
          label: "Rental subsidies",
          value: formatNumber(rollup.rentalSubsidies),
        },
        {
          label: "Equipment distributed",
          value: formatNumber(rollup.equipmentDistributed),
        },
        {
          label: "People who received items",
          value: formatNumber(rollup.distributionRecipients),
        },
        {
          label: "Value of items distributed ($)",
          value: formatCurrency(rollup.distributedValue),
        },
        {
          label: "Volunteers on site",
          value: formatNumber(rollup.volunteerParticipants),
        },
        {
          label: "Volunteer hours",
          value: formatNumber(rollup.volunteerHours),
        },
        {
          label: "Participant assistance ($)",
          value: formatCurrency(rollup.participantAssistance.total),
        },
        {
          label: "Assistance: discount code value ($)",
          value: formatCurrency(rollup.participantAssistance.discountCodes),
        },
        {
          label: "Assistance: items given out ($)",
          value: formatCurrency(rollup.participantAssistance.distributions),
        },
        {
          label: "Assistance: expenses paid for participants ($)",
          value: formatCurrency(rollup.participantAssistance.expenses),
        },
        // #1589: offered, not received, and never part of assistance.
        {
          label: "Discount value offered ($)",
          value: formatCurrency(rollup.discountValueOffered.total),
        },
        {
          label: "Discount value offered: shared codes ($)",
          value: formatCurrency(rollup.discountValueOffered.shared),
        },
        {
          label: "Discount value offered: single-use codes ($)",
          value: formatCurrency(rollup.discountValueOffered.singleUse),
        },
        {
          label: "Repeat participants",
          value: formatNumber(rollup.repeatParticipants),
        },
        ...(rollup.placeReach
          ? [
              {
                label: "Places reached",
                value: placeReachSummary(rollup.placeReach),
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Program Impact Report
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Season/program rollup across every event tagged to the selected program.
        Every figure here is computed live from attendance, check-ins, discount
        codes, {canSeeRider ? "rider profiles, " : ""}distributions, expenses
        and volunteer records — nothing is typed. Figures entered by hand on
        older events are archived on those events and never added in. A few
        caveats worth knowing when quoting these numbers: codes on an event that
        gives one to every registrant don&apos;t count as assistance;
        &ldquo;Discount value offered&rdquo; is what partner codes were worth to
        the people who got them, not what was redeemed, and is never part of
        assistance; internally-granted scholarships and fee waivers aren&apos;t
        modelled anywhere, so assistance undercounts; and &ldquo;Volunteers on
        site&rdquo; counts each person once per event, so someone who
        volunteered three times counts three times. &ldquo;People who received
        items&rdquo; counts the same way, once per event.
      </p>

      <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="programId"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Program
            </label>
            <select
              id="programId"
              name="programId"
              defaultValue={programId}
              className={selectClassName}
            >
              <option value="">Select a program…</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            View
          </Button>
        </form>
      </div>

      {!programId ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            Select a program above to view its impact rollup.
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            {loadError}
          </CardContent>
        </Card>
      ) : rollup && rollup.eventCount === 0 ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            This program has no events yet.
          </CardContent>
        </Card>
      ) : rollup ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-brand">
                  {formatNumber(rollup.eventCount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Participants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-brand">
                  {formatNumber(rollup.participants)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Volunteer hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-brand">
                  {formatNumber(rollup.volunteerHours)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Participant assistance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-brand">
                  {formatCurrency(rollup.participantAssistance.total)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>All metrics</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {/* Not a PortalDataTable: a fixed list of metrics in the order
                  they read in, where sorting would only scramble them and
                  pagination would never appear. It takes the shared sticky
                  header and stays server-rendered. */}
              <Table stickyHeader="page">
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>{row.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {places && places.total > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Where registrants come from</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {/* Staff-only, so small counts are shown; the Places reached
                    line above is the one to quote outside. */}
                <Table stickyHeader="page">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Places</TableHead>
                      <TableHead className="text-right">
                        Registrations
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {places.regions.map((region) => (
                      <TableRow key={region.id}>
                        <TableCell className="whitespace-normal">
                          {region.label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(
                            region.places.length +
                              (region.regionOnly > 0 ? 1 : 0),
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(region.registrations)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {places.other > 0 && (
                      <TableRow>
                        <TableCell>Not listed or other</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(places.other)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </>
  );
}
