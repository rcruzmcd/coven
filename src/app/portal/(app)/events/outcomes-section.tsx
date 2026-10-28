"use client";

import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import type { EventImpactNote } from "./impact-actions";
import { plural, Section } from "./report-summary";
import { Figure } from "./summary-figures";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  placeReachSummary,
  regionCountText,
} from "@/lib/places/place-breakdown";

/**
 * The figures typed by hand before #1588, on the events that have any. Shown
 * read-only beside the derived ones, never added to them.
 */
export function ArchivedImpactFigures({
  eventId,
  note,
}: {
  eventId: string;
  note: EventImpactNote | null;
}) {
  if (!note) return null;
  const figures = [
    {
      label: "First-time skiers/snowboarders",
      value: note.first_time_riders,
      format: formatNumber,
    },
    {
      label: "Rental subsidies",
      value: note.rental_subsidies_count,
      format: formatNumber,
    },
    {
      label: "Total participant assistance",
      value: note.assistance_total,
      format: formatCurrency,
    },
    {
      label: "Beginners paired with experienced riders",
      value: note.beginner_pairings_count,
      format: formatNumber,
    },
  ].filter((figure) => figure.value !== null && figure.value !== undefined);
  if (figures.length === 0) return null;

  return (
    <Section
      title="Entered by hand (archived)"
      empty={false}
      emptyMessage=""
      note="Typed in before these figures were derived from records. Kept for reference; not added to anything above."
    >
      {figures.map((figure) => (
        <Figure
          key={figure.label}
          eventId={eventId}
          label={figure.label}
          value={figure.format(Number(figure.value))}
        />
      ))}
    </Section>
  );
}

/**
 * The Results card's mission view (#1588): who took part, who was served and
 * what help they were given -- every figure derived from records, from
 * impact-metrics.ts. A figure the reader may not see is null there and not
 * rendered here.
 */
export function OutcomesSection({
  eventId,
  derived,
}: {
  eventId: string;
  derived: EventImpactDerived;
}) {
  const served = derived.peopleServed;
  const assistance = derived.assistance;
  const riderCoverageShort =
    derived.beginnerParticipants !== null &&
    (derived.profiledAttendees ?? 0) < derived.checkedIn;

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-base font-semibold">Outcomes</h3>

      <Section
        title="Participation"
        empty={derived.participants === 0 && derived.checkedIn === 0}
        emptyMessage="No attendance recorded for this event."
        note={
          <>
            Participants is the headcount from the Attendance card; checked in
            counts registrants marked in at the door.
            {/* Only true while coverage is short: at full coverage the rider
                figures are the whole picture, and hedging them would just
                make staff distrust them. */}
            {riderCoverageShort &&
              ` Rider levels come from the ${formatNumber(derived.profiledAttendees ?? 0)} checked-in attendees with a rider profile on file — add the missing ones from the Registrants card.`}
          </>
        }
      >
        <Figure
          eventId={eventId}
          card="attendance"
          label="Participants"
          value={formatNumber(derived.participants)}
        />
        <Figure
          eventId={eventId}
          card="registrants"
          label="Checked in"
          value={formatNumber(derived.checkedIn)}
        />
        <Figure
          eventId={eventId}
          card="registrants"
          label="First-time participants"
          value={formatNumber(derived.firstTimeParticipants)}
          caption="First event they checked in to"
        />
        <Figure
          eventId={eventId}
          card="registrants"
          label="Recurring participants"
          value={formatNumber(derived.recurringParticipants)}
        />
        {derived.beginnerParticipants !== null && (
          <Figure
            eventId={eventId}
            card="registrants"
            label="Beginners"
            value={formatNumber(derived.beginnerParticipants)}
          />
        )}
        {derived.firstTimeOnSnow !== null && (
          <Figure
            eventId={eventId}
            card="registrants"
            label="First time on snow"
            value={formatNumber(derived.firstTimeOnSnow)}
          />
        )}
      </Section>

      {/* #1701. Only on an event whose place questions someone answered. The
          sentence is the one to quote: totals, naming only an area more than
          one registrant came from. */}
      {derived.placeReach && (
        <Section
          title="Reach"
          empty={false}
          emptyMessage=""
          note={placeReachSummary(derived.placeReach)}
        >
          <Figure
            eventId={eventId}
            card="places"
            label="Places reached"
            value={formatNumber(derived.placeReach.places)}
            caption={`In ${regionCountText(derived.placeReach.regionKinds)}`}
          />
        </Section>
      )}

      <Section
        title="People served"
        empty={served.distributed === 0}
        emptyMessage="No distributions recorded for this event."
        note="A distribution recorded without a recipient counts as items given out but not as a person served."
      >
        <Figure
          eventId={eventId}
          card="distributions"
          label="Items distributed"
          value={formatNumber(served.distributed)}
        />
        <Figure
          eventId={eventId}
          card="distributions"
          label="People who received items"
          value={formatNumber(served.recipients)}
        />
        <Figure
          eventId={eventId}
          card="distributions"
          label="Value given out"
          value={formatCurrency(served.value)}
          caption="Face value of the items"
        />
      </Section>

      {assistance && derived.rentalSubsidies !== null && (
        <Section
          title="Assistance given"
          empty={false}
          emptyMessage=""
          note={
            derived.autoAssignDiscountCodes
              ? "This event gives a code to every registrant, so its codes are not counted as subsidy or assistance."
              : "Rental subsidies are rental codes given to registrants who did not cancel."
          }
        >
          <Figure
            eventId={eventId}
            card="discount-codes"
            label="Rental subsidies"
            value={formatNumber(derived.rentalSubsidies)}
          />
          <Figure
            eventId={eventId}
            card="discount-codes"
            label="Discount codes given"
            value={formatCurrency(assistance.discountCodes)}
            caption="Value of the codes assigned"
          />
          <Figure
            eventId={eventId}
            card="expenses"
            label="Paid for participants"
            value={formatCurrency(assistance.expenses)}
            caption="Paid expenses marked participant assistance"
          />
          {/* Its third part is People served's value given out, which is
              named rather than shown again so no figure appears twice. */}
          <Figure
            eventId={eventId}
            label="Participant assistance"
            value={formatCurrency(assistance.total)}
            caption="Codes given + value given out (People served) + paid for participants"
          />
        </Section>
      )}

      {derived.discountCodesAssigned !== null && (
        <Section
          title="Discount codes"
          empty={false}
          emptyMessage=""
          note={
            derived.autoAssignDiscountCodes
              ? "This event auto-assigns a code to every registrant, so this count is not evidence of subsidy."
              : undefined
          }
        >
          <Figure
            eventId={eventId}
            card="discount-codes"
            label="Codes assigned"
            value={plural(derived.discountCodesAssigned, "code")}
            caption="Held by a registrant who did not cancel"
          />
          {/* #1589: offered, not received -- redemption happens on the
              partner's site -- so it is shown here and never in assistance.
              Shared and single-use on their own lines so it can be traced. */}
          {derived.discountValueOffered && (
            <>
              <Figure
                eventId={eventId}
                card="discount-codes"
                label="Discount value offered: shared code"
                value={formatCurrency(derived.discountValueOffered.shared)}
                caption="Every registration that did not cancel"
              />
              <Figure
                eventId={eventId}
                card="discount-codes"
                label="Discount value offered: single-use codes"
                value={formatCurrency(derived.discountValueOffered.singleUse)}
                caption="Each code for the registrant holding it"
              />
              <Figure
                eventId={eventId}
                card="discount-codes"
                label="Discount value offered"
                value={formatCurrency(derived.discountValueOffered.total)}
                caption="What the codes were worth, not whether they were used"
              />
            </>
          )}
        </Section>
      )}
    </div>
  );
}
