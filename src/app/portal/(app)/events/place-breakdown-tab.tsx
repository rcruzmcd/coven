"use client";

import { Fragment } from "react";
import { useTabData } from "@/hooks/use-tab-data";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import { answerColumnLabel } from "@/lib/registration-answer-columns";
import {
  placeBreakdown,
  regionCountText,
  type PlaceBreakdown,
  type PlaceRegionKind,
  type PlaceCountRow,
} from "@/lib/places/place-breakdown";
import { formatNumber } from "@/lib/format";
import { getEventPlaceBreakdownAction } from "./place-breakdown-actions";
import { CardSummary, Figure } from "./summary-figures";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The event's "Where registrants come from" card (#1701): for each place
 * question, registrations by county or borough and then by town or
 * neighborhood, plus Not listed -- counted from the answers of registrations
 * that were not cancelled, never typed. Listed only on an event with a place
 * question. Small counts are shown: this is a staff view.
 */
export function PlaceBreakdownTab({
  eventId,
  questions,
}: {
  eventId: string;
  questions: readonly RegistrationQuestion[];
}) {
  const { data, loadError } = useTabData<PlaceCountRow[]>(
    () => getEventPlaceBreakdownAction(eventId),
    [eventId],
  );
  const placeQuestions = questions.filter(
    (question) => question.kind === "place",
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (data === undefined) return <TabLoadingSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      {placeQuestions.map((question) => (
        <QuestionBreakdown
          key={question.id}
          // The prompt only tells two place questions apart.
          heading={
            placeQuestions.length > 1 ? answerColumnLabel(question) : null
          }
          breakdown={placeBreakdown(data, question.id)}
        />
      ))}
    </div>
  );
}

function regionKinds(
  breakdown: PlaceBreakdown,
): Record<PlaceRegionKind, number> {
  const kinds: Record<PlaceRegionKind, number> = {
    borough: 0,
    county: 0,
    state: 0,
  };
  for (const region of breakdown.regions) kinds[region.kind] += 1;
  return kinds;
}

function QuestionBreakdown({
  heading,
  breakdown,
}: {
  heading: string | null;
  breakdown: PlaceBreakdown;
}) {
  const places = breakdown.regions.reduce(
    (sum, region) => sum + region.places.length,
    0,
  );

  return (
    <section className="flex flex-col gap-4">
      {heading && <h3 className="text-base font-semibold">{heading}</h3>}
      {breakdown.total === 0 ? (
        <EmptyState
          title="No answers yet"
          description="Counts appear here as registrants answer."
        />
      ) : (
        <>
          <CardSummary
            label={heading ? `${heading} at a glance` : "At a glance"}
          >
            <Figure label="Answered" value={formatNumber(breakdown.total)} />
            <Figure
              label="Areas"
              value={formatNumber(breakdown.regions.length)}
              caption={regionCountText(regionKinds(breakdown)) || undefined}
            />
            <Figure
              label="Towns and neighborhoods"
              value={formatNumber(places)}
            />
            <Figure label="Not listed" value={formatNumber(breakdown.other)} />
          </CardSummary>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place</TableHead>
                <TableHead className="text-right">Registrants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.regions.map((region) => (
                <Fragment key={region.id}>
                  <TableRow>
                    <TableCell className="font-semibold whitespace-normal">
                      {region.label}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(region.registrations)}
                    </TableCell>
                  </TableRow>
                  {region.places.map((place) => (
                    <TableRow key={place.id}>
                      <TableCell className="pl-6 whitespace-normal">
                        {place.label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(place.registrations)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {region.regionOnly > 0 && region.places.length > 0 && (
                    <TableRow>
                      <TableCell className="app-muted pl-6 whitespace-normal">
                        {region.label}, nothing more specific
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(region.regionOnly)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {breakdown.other > 0 && (
                <TableRow>
                  <TableCell className="font-semibold">
                    Not listed or other
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(breakdown.other)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  );
}
