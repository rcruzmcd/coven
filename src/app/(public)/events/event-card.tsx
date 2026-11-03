import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import { AdultsOnlyBadge } from "@/components/adults-only-badge";
import { parseMinimumAge } from "@/lib/adults-only";
import { EventFlierTile } from "./event-flier";
import type { PublicEventSponsor } from "./event-sponsors";
import { publicEventPath } from "./event-path";
import type { NonNullColumns, Views } from "@/lib/supabase/types";

/**
 * One row of `public_events`, derived from the generated view row (#813
 * Phase 1). The five narrowed columns are `not null` on `events`; a view drops
 * that, so the generator reports every column nullable and the narrowing has
 * to be stated (see NonNullColumns). Everything else -- which columns exist,
 * and their types -- now comes from the migrations.
 */
export type PublicEventRow = NonNullColumns<
  Views<"public_events">,
  "id" | "name" | "starts_at" | "timezone" | "registration_enabled"
>;

export type PublicEvent = PublicEventRow & {
  /** The programs this event counts toward, from public_event_programs. */
  programs: PublicEventProgram[];
  sponsors: PublicEventSponsor[];
};

export type PublicEventProgram = NonNullColumns<
  Omit<Views<"public_event_programs">, "event_id">,
  "program_id" | "name"
>;

/**
 * The eyebrow above an event's title. Events aren't required to belong to a
 * program, so this falls back to plain "Event" the way the event-type label it
 * replaced did.
 */
export function eventProgramsLabel(programs: PublicEventProgram[]) {
  return programs.length > 0
    ? programs.map((program) => program.name).join(" \u00b7 ")
    : "Event";
}

/**
 * A card is a link to the event's own page, a full navigation from the
 * listing and the home page alike (#1427). It is a real anchor, so the event
 * is shareable, crawlable, and reachable by keyboard without a hand-rolled
 * key handler (#847).
 *
 * The anchor is the title, stretched over the whole card by its ::after: the
 * accessible name stays "Winter Gear Swap" rather than swallowing the flier's
 * alt text and the date line with it.
 */
export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Card className="rainbow-ring-hover relative gap-0 overflow-hidden py-0">
      <EventFlierTile
        flierUrl={event.flier_url}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />
      <CardContent className="space-y-1 px-4 py-3">
        <p className="text-sm font-medium">
          <Link
            href={publicEventPath(event.id)}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {event.name}
          </Link>
          <AdultsOnlyBadge
            minimumAge={parseMinimumAge(event.minimum_age)}
            className="ml-2"
          />
        </p>
        <p className="app-muted text-xs">
          {formatDateTimeInZone(
            event.starts_at,
            event.timezone,
            DATE_TIME_WITH_ZONE,
            "en-US",
          )}
          {event.ends_at &&
            ` – ${formatDateTimeInZone(event.ends_at, event.timezone, DATE_TIME_WITH_ZONE, "en-US")}`}
        </p>
        {event.location && (
          <p className="text-xs text-muted-foreground">{event.location}</p>
        )}
      </CardContent>
    </Card>
  );
}
